/**
 * B5 INTEGRATION GATE — the live trigger and the nightly reconcile, racing.
 *
 * The pure set-based tests prove the aggregation is deterministic. They cannot
 * prove anything about the two WRITERS, because in those tests there is only
 * one. These run the real `aggregateCmsAnalyticsEventOnCreate` handler and the
 * real `reconcileCmsAnalyticsDay` against the Firestore emulator, and interleave
 * them by hand.
 *
 * Two interleavings were reported and both are covered:
 *
 *   DOUBLE COUNT — an event is already stored and appears in the reconcile
 *     query, but its onCreate handler has not run yet. Reconcile counts it and
 *     writes 1. The handler then runs, finds no dedupe marker, and increments
 *     to 2.
 *
 *   DROPPED INCREMENT — the reconcile scan reads the events, then a new event
 *     arrives and its handler increments the counter, and only then does
 *     reconcile overwrite with the figure from its older scan.
 *
 * Plus distinct-count-only drift, and the fail-closed truncation contract.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {getFirestore} from "firebase-admin/firestore";

import {
  aggregateCmsAnalyticsEventOnCreate,
  reconcileCmsAnalyticsDay,
} from "../../../../analytics/cmsAnalyticsJobs";
import {
  CMS_ANALYTICS_DAILY_COLLECTION,
  CMS_CTA_TAPPED_EVENT,
  CMS_IMPRESSION_EVENT,
  cmsAnalyticsDailyDocId,
} from "../../cmsAnalytics";

const host = process.env.FIRESTORE_EMULATOR_HOST;
const skip = host ? false : "FIRESTORE_EMULATOR_HOST unset (npm run test:emulator:cmsAnalytics)";
const db = getFirestore();

/** 2026-09-16 12:00 MYT. */
const AT = Date.UTC(2026, 8, 16, 4, 0, 0);
const DAY = "2026-09-16";
const PLACEMENT = "home_top";

let seq = 0;
const nextId = () => `b5evt_${Date.now()}_${seq++}`;

type Trigger = {run: (event: unknown) => Promise<unknown>};

/**
 * Run the real onCreate handler for an already-stored event.
 *
 * The document is fetched FIRST so `data()` can be synchronous: the handler
 * calls `snap.data()` directly, and an async one hands it a Promise whose
 * fields are all undefined — the event then looks uncountable and the handler
 * silently does nothing, which is indistinguishable from a passing test.
 */
async function runTrigger(eventId: string) {
  const ref = db.collection("events").doc(eventId);
  const stored = await ref.get();
  return (aggregateCmsAnalyticsEventOnCreate as unknown as Trigger).run({
    params: {eventId},
    data: {ref, exists: stored.exists, data: () => stored.data()},
  });
}

/** Write an event WITHOUT running its trigger — the pending-handler state. */
async function storeEvent(params: {
  contentId: string; userId: string; metric: "impressions" | "ctaTaps"; at?: number;
}): Promise<string> {
  const eventId = nextId();
  await db.collection("events").doc(eventId).set({
    eventType: params.metric === "impressions" ? CMS_IMPRESSION_EVENT : CMS_CTA_TAPPED_EVENT,
    userId: params.userId,
    serverTimestampMs: params.at ?? AT,
    metadata: {
      contentId: params.contentId,
      placement: PLACEMENT,
      ...(params.metric === "impressions" ? {visible: true} : {}),
    },
  });
  return eventId;
}

async function readDaily(contentId: string) {
  const snap = await db.collection(CMS_ANALYTICS_DAILY_COLLECTION)
    .doc(cmsAnalyticsDailyDocId(contentId, PLACEMENT, DAY)).get();
  const d = snap.data() ?? {};
  return {
    exists: snap.exists,
    impressions: d.counters?.impressions ?? 0,
    ctaTaps: d.counters?.ctaTaps ?? 0,
    engagedUsers: d.counters?.engagedUsers ?? 0,
    distinctUserCount: d.distinctUserCount ?? 0,
    updatedAtMs: d.updatedAtMs ?? 0,
  };
}

async function markerExists(contentId: string, id: string) {
  const snap = await db.collection(CMS_ANALYTICS_DAILY_COLLECTION)
    .doc(cmsAnalyticsDailyDocId(contentId, PLACEMENT, DAY))
    .collection("dedupe").doc(id).get();
  return snap.exists;
}

// ── INTERLEAVING 1: RECONCILE FIRST, TRIGGER AFTERWARDS ────────────────────

test("1. a pending trigger cannot re-count an event reconcile already counted",
  {skip}, async () => {
    const contentId = `race_double_${seq++}`;
    // Event is stored and visible to the reconcile query; its handler has NOT run.
    const eventId = await storeEvent({contentId, userId: "u1", metric: "impressions"});

    const result = await reconcileCmsAnalyticsDay(DAY, Date.now());
    assert.equal(result.truncated, false);

    const afterReconcile = await readDaily(contentId);
    assert.equal(afterReconcile.impressions, 1, "reconcile counted the stored event");

    // Reconcile must have written the marker, or the handler below double-counts.
    assert.ok(await markerExists(contentId, "impressions__u1"),
      "reconcile must leave the same dedupe marker the trigger would have");

    // NOW the handler finally runs.
    await runTrigger(eventId);

    const afterTrigger = await readDaily(contentId);
    assert.equal(afterTrigger.impressions, 1,
      "the late handler must NOT increment a user reconcile already counted");
    assert.equal(afterTrigger.distinctUserCount, 1);
  });

test("2. the same holds for a tap, and for the engaged intersection",
  {skip}, async () => {
    const contentId = `race_double_pair_${seq++}`;
    const impEvent = await storeEvent({contentId, userId: "u1", metric: "impressions"});
    const tapEvent = await storeEvent({contentId, userId: "u1", metric: "ctaTaps"});

    await reconcileCmsAnalyticsDay(DAY, Date.now());
    const afterReconcile = await readDaily(contentId);
    assert.equal(afterReconcile.impressions, 1);
    assert.equal(afterReconcile.ctaTaps, 1);
    assert.equal(afterReconcile.engagedUsers, 1);

    await runTrigger(impEvent);
    await runTrigger(tapEvent);

    const afterTriggers = await readDaily(contentId);
    assert.deepEqual(
      {
        impressions: afterTriggers.impressions,
        ctaTaps: afterTriggers.ctaTaps,
        engagedUsers: afterTriggers.engagedUsers,
        distinctUserCount: afterTriggers.distinctUserCount,
      },
      {impressions: 1, ctaTaps: 1, engagedUsers: 1, distinctUserCount: 1},
      "no counter may move when both handlers run after reconciliation",
    );
  });

// ── INTERLEAVING 2: TRIGGER BETWEEN THE SCAN AND THE WRITE ─────────────────

test("3. an increment that lands after the scan is not overwritten",
  {skip}, async () => {
    const contentId = `race_drop_${seq++}`;
    // One user, already counted live.
    const firstEvent = await storeEvent({contentId, userId: "u1", metric: "impressions"});
    await runTrigger(firstEvent);
    assert.equal((await readDaily(contentId)).impressions, 1);

    // Reconcile scans and sees ONLY u1. While it is between the scan and the
    // write, a second user arrives and is counted live. A reconcile that then
    // wrote its own figure would replace 2 with 1 and destroy that increment.
    let injected = false;
    const result = await reconcileCmsAnalyticsDayForTest({
      dayKey: DAY,
      nowMs: Date.now(),
      async afterScan() {
        const secondEvent = await storeEvent({
          contentId, userId: "u2", metric: "impressions",
        });
        await runTrigger(secondEvent);
        injected = true;
      },
    });

    assert.ok(injected, "the hook must have run inside the race window");
    const after = await readDaily(contentId);
    assert.equal(after.impressions, 2,
      "the increment that landed after the scan must survive");
    assert.equal(result.deferred, 1, "and the bucket must be reported as deferred");
    assert.equal(result.repaired, 0, "nothing may be repaired over a live write");
  });

test("4. a reconcile whose scan is current still repairs drift", {skip}, async () => {
  const contentId = `race_repair_${seq++}`;
  const eventId = await storeEvent({contentId, userId: "u1", metric: "impressions"});
  await runTrigger(eventId);

  // Corrupt the stored counters, as drift would.
  const ref = db.collection(CMS_ANALYTICS_DAILY_COLLECTION)
    .doc(cmsAnalyticsDailyDocId(contentId, PLACEMENT, DAY));
  await ref.set({counters: {impressions: 99}, updatedAtMs: 1}, {merge: true});

  const result = await reconcileCmsAnalyticsDay(DAY, Date.now());
  assert.ok(result.repaired >= 1);
  assert.equal((await readDaily(contentId)).impressions, 1, "drift repaired to the truth");
});

// ── DISTINCT-COUNT-ONLY DRIFT ──────────────────────────────────────────────

test("5. drift in distinctUserCount alone is detected and repaired",
  {skip}, async () => {
    const contentId = `race_distinct_${seq++}`;
    const eventId = await storeEvent({contentId, userId: "u1", metric: "impressions"});
    await runTrigger(eventId);

    const ref = db.collection(CMS_ANALYTICS_DAILY_COLLECTION)
      .doc(cmsAnalyticsDailyDocId(contentId, PLACEMENT, DAY));
    // Counters correct, sample size wrong — the case the old `drifted` check
    // could not see, so it could never be repaired.
    await ref.set({distinctUserCount: 77, updatedAtMs: 1}, {merge: true});
    assert.equal((await readDaily(contentId)).distinctUserCount, 77);

    const result = await reconcileCmsAnalyticsDay(DAY, Date.now());
    assert.ok(result.repaired >= 1, "distinct-count-only drift must count as drift");
    assert.equal((await readDaily(contentId)).distinctUserCount, 1);
  });

// ── FAIL CLOSED ON AN INCOMPLETE SCAN ──────────────────────────────────────

test("6. a truncated scan writes NOTHING and leaves existing totals intact",
  {skip}, async () => {
    const contentId = `race_trunc_${seq++}`;
    const eventId = await storeEvent({contentId, userId: "u1", metric: "impressions"});
    await runTrigger(eventId);
    const before = await readDaily(contentId);
    assert.equal(before.impressions, 1);

    // Force truncation by allowing only ONE page of ONE event: the scan sees a
    // real but partial view. The watermark is CURRENT so the deferral guard
    // cannot be what blocks the write — fail-closed has to be.
    const result = await reconcileCmsAnalyticsDayForTest({
      dayKey: DAY, nowMs: Date.now(), scanStartedAtMs: Date.now(),
      maxPages: 1, pageSize: 1,
    });
    assert.equal(result.truncated, true);
    assert.equal(result.repaired, 0, "a partial scan must repair nothing");
    assert.equal(result.markersWritten, 0, "and must not write markers either");

    const after = await readDaily(contentId);
    assert.deepEqual(
      {impressions: after.impressions, updatedAtMs: after.updatedAtMs},
      {impressions: before.impressions, updatedAtMs: before.updatedAtMs},
      "the existing aggregate must be byte-for-byte untouched",
    );
  });

test("7. a truncated scan cannot undercount a multi-page day", {skip}, async () => {
  const contentId = `race_trunc_multi_${seq++}`;
  // Three users, all counted live.
  for (const uid of ["u1", "u2", "u3"]) {
    const id = await storeEvent({contentId, userId: uid, metric: "impressions"});
    await runTrigger(id);
  }
  assert.equal((await readDaily(contentId)).impressions, 3);

  // A scan that can read only one page of one event computes 1. The watermark
  // is CURRENT, so the deferral guard would let the write through — only the
  // fail-closed truncation contract stops it replacing 3 with 1.
  const result = await reconcileCmsAnalyticsDayForTest({
    dayKey: DAY, nowMs: Date.now(), scanStartedAtMs: Date.now(),
    maxPages: 1, pageSize: 1,
  });
  assert.equal(result.truncated, true);
  assert.equal((await readDaily(contentId)).impressions, 3,
    "a partial recomputation must never replace a complete total");
});

// ── TEST SEAM ──────────────────────────────────────────────────────────────

/**
 * `reconcileCmsAnalyticsDay` with its scan watermark and paging limits injected.
 *
 * The production entry point takes its own `Date.now()` and fixed page sizes,
 * which makes the two interleavings above impossible to reproduce reliably from
 * outside. This seam only supplies those values; the logic under test is the
 * same function.
 */
async function reconcileCmsAnalyticsDayForTest(options: {
  dayKey: string;
  nowMs: number;
  scanStartedAtMs?: number;
  maxPages?: number;
  pageSize?: number;
  afterScan?: () => Promise<void>;
}) {
  const {__reconcileForTest} = await import("../../../../analytics/cmsAnalyticsJobs");
  return __reconcileForTest(options);
}
