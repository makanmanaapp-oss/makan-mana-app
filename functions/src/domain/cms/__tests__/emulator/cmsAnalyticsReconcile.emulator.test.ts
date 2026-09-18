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
  reconcileCmsAnalyticsDaily,
  reconcileCmsAnalyticsDay,
} from "../../../../analytics/cmsAnalyticsJobs";
import {aggregateAnalyticsEventOnCreate} from "../../../../analytics/analyticsJobs";
import {ensureEventServerTimestampMs} from "../../../../analytics/eventServerStamp";
import {businessDayKey, businessDayStartMs} from "../../../analytics/analyticsAggregation";
import {
  RECONCILE_RECEIPT_COLLECTION,
  RECOVERY_LOOKBACK_DAYS,
  reconcileReceiptId,
} from "../../cmsAnalyticsRecovery";
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
  /**
   * Omit `serverTimestampMs` entirely — which is what a REAL event looks like
   * when it is created.
   *
   * The client never writes this field (`event_repository.dart` writes
   * `timestamp`, not `serverTimestampMs`); it is stamped afterwards by
   * `aggregateAnalyticsEventOnCreate`, a different listener on this same
   * collection. Every fixture below supplies it, which is exactly why this
   * suite could not fail on a divergence between the day a count lands in and
   * the day the reconcile scan selects it into.
   */
  omitServerStamp?: boolean;
}): Promise<string> {
  const eventId = nextId();
  await db.collection("events").doc(eventId).set({
    eventType: params.metric === "impressions" ? CMS_IMPRESSION_EVENT : CMS_CTA_TAPPED_EVENT,
    userId: params.userId,
    ...(params.omitServerStamp ? {} : {serverTimestampMs: params.at ?? AT}),
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

// ── THE DAY A COUNT LANDS IN vs THE DAY RECONCILE SEARCHES BY ──────────────
//
// The live trigger chooses a bucket from ITS OWN wall clock, because the
// creation snapshot it is handed never carries `serverTimestampMs` — the client
// does not write it, and the listener that does (`aggregateAnalyticsEventOnCreate`)
// cannot change a snapshot that was already materialised.
//
// `runReconcile` then SELECTS the day's events with a range filter on that same
// `serverTimestampMs`. A Firestore range filter returns nothing for a document
// that lacks the field, so an event can be counted by one writer and be
// invisible to the other — and the repair REPLACES counters rather than adding
// to them. These tests pin the invariant that makes the two agree.

test("8. an event counted without a server stamp is not erased by the repair",
  {skip}, async () => {
    const today = businessDayKey(Date.now());
    const contentId = `stamp_missing_${seq++}`;

    // A second, ordinary event in the SAME bucket. Without it the bucket would
    // not appear in the scan at all, reconcile would write nothing, and the
    // erasure would be invisible — the defect needs a surviving bucket to
    // overwrite.
    const stamped = await storeEvent(
      {contentId, userId: "u1", metric: "impressions", at: Date.now()});
    await runTrigger(stamped);

    // The production shape: no server stamp at creation time.
    const unstamped = await storeEvent(
      {contentId, userId: "u2", metric: "impressions", omitServerStamp: true});
    await runTrigger(unstamped);

    const counted = await readDailyOn(contentId, today);
    assert.equal(counted.impressions, 2, "the trigger counted both users");

    await reconcileCmsAnalyticsDay(today, Date.now());

    assert.equal((await readDailyOn(contentId, today)).impressions, 2,
      "reconcile must not erase a user the trigger legitimately counted");
  });

test("9. the bucket the trigger chose is the day the STORED stamp resolves to",
  {skip}, async () => {
    const contentId = `stamp_agrees_${seq++}`;
    const eventId = await storeEvent(
      {contentId, userId: "u1", metric: "impressions", omitServerStamp: true});
    await runTrigger(eventId);

    const stored = (await db.collection("events").doc(eventId).get()).data() ?? {};
    assert.equal(typeof stored.serverTimestampMs, "number",
      "the event must carry the stamp the reconcile range-query selects on");

    // This is the whole contract in one line: the day the count was written
    // into must be the day a scan of the stored stamp would put it in.
    const bucketDay = businessDayKey(stored.serverTimestampMs as number);
    assert.equal((await readDailyOn(contentId, bucketDay)).impressions, 1,
      "the counted day and the stamped day must be the same day");
  });

test("10. the server stamp is written once and never moved", {skip}, async () => {
  const contentId = `stamp_write_once_${seq++}`;
  const eventId = await storeEvent(
    {contentId, userId: "u1", metric: "impressions", omitServerStamp: true});
  const ref = db.collection("events").doc(eventId);

  const first = await ensureEventServerTimestampMs(ref, 1_700_000_000_000);
  const second = await ensureEventServerTimestampMs(ref, 1_900_000_000_000);

  assert.equal(second, first,
    "a second stamper must be handed the value already stored, not its own clock");
  const stored = (await ref.get()).data() ?? {};
  assert.equal(stored.serverTimestampMs, first, "the stored value must not move");
});

test("13. a DELAYED second stamper cannot move the day a count landed in",
  {skip}, async () => {
    const contentId = `stamp_delayed_${seq++}`;

    // The production shape, counted by the CMS listener first.
    const late = await storeEvent(
      {contentId, userId: "u2", metric: "impressions", omitServerStamp: true});
    await runTrigger(late);
    const counted = (await db.collection("events").doc(late).get()).data() ?? {};
    const countedAt = counted.serverTimestampMs as number;
    assert.equal(typeof countedAt, "number", "the CMS listener stamped what it counted by");
    const day = businessDayKey(countedAt);

    // Another user in the same bucket, so the repair has a bucket to overwrite.
    const other = await storeEvent({contentId, userId: "u1", metric: "impressions", at: countedAt});
    await runTrigger(other);
    assert.equal((await readDailyOn(contentId, day)).impressions, 2);

    // NOW the merchant listener runs — late, with a strictly later clock, and
    // handed the same stampless creation snapshot it always gets. Before the
    // fix its guard was always true and it overwrote the stamp; at a Malaysia
    // midnight that moved the event into the next day's scan.
    await new Promise((resolve) => setTimeout(resolve, 25));
    await runMerchantTrigger(late);

    const after = (await db.collection("events").doc(late).get()).data() ?? {};
    assert.equal(after.serverTimestampMs, countedAt,
      "a late stamper must not move the value the count was bucketed by");

    await reconcileCmsAnalyticsDay(day, Date.now());
    assert.equal((await readDailyOn(contentId, day)).impressions, 2,
      "the repair must still find the late-stamped event in the day it was counted");
  });

/** Run the REAL merchant listener for a stored event, with its creation snapshot. */
async function runMerchantTrigger(eventId: string) {
  const ref = db.collection("events").doc(eventId);
  const stored = await ref.get();
  const {serverTimestampMs: _ignored, ...creation} = stored.data() ?? {};
  return (aggregateAnalyticsEventOnCreate as unknown as Trigger).run({
    params: {eventId},
    // The creation snapshot never carries the stamp, whatever has since been
    // written to the document. That is the whole mechanism under test.
    data: {ref, exists: stored.exists, data: () => creation},
  });
}

// ── THE SCHEDULED ENTRYPOINT ───────────────────────────────────────────────
//
// These drive `reconcileCmsAnalyticsDaily` THROUGH ITS WRAPPER, not by calling
// `reconcileCmsAnalyticsDay`. What the wrapper adds is the day selection and
// the error contract, and only invoking it proves those. It does NOT prove that
// Cloud Scheduler delivers at 03:41 — nothing local can.

test("11. the scheduled run repairs yesterday AND today in one invocation",
  {skip}, async () => {
    const now = Date.now();
    const today = businessDayKey(now);
    const yesterday = businessDayKey(now - 86_400_000);
    const contentId = `sched_days_${seq++}`;

    for (const [day, at] of [[today, now], [yesterday, now - 86_400_000]] as const) {
      const id = await storeEvent({contentId, userId: "u1", metric: "impressions", at});
      await runTrigger(id);
      // Drift the stored figure away from the truth so a repair is observable.
      await db.collection(CMS_ANALYTICS_DAILY_COLLECTION)
        .doc(cmsAnalyticsDailyDocId(contentId, PLACEMENT, day))
        .set({counters: {impressions: 99, ctaTaps: 0, engagedUsers: 0}}, {merge: true});
    }

    await runScheduled();

    assert.equal((await readDailyOn(contentId, today)).impressions, 1,
      "today was selected and repaired");
    assert.equal((await readDailyOn(contentId, yesterday)).impressions, 1,
      "yesterday was selected and repaired");
  });

test("12. running the scheduled job again does not double count", {skip}, async () => {
  const now = Date.now();
  const today = businessDayKey(now);
  const contentId = `sched_retry_${seq++}`;
  const id = await storeEvent({contentId, userId: "u1", metric: "impressions", at: now});
  await runTrigger(id);

  await runScheduled();
  const first = await readDailyOn(contentId, today);
  await runScheduled();
  const second = await readDailyOn(contentId, today);

  assert.equal(first.impressions, 1);
  assert.equal(second.impressions, 1, "a retry must not add the same user again");
  assert.equal(second.distinctUserCount, 1);
});

/** Read a daily bucket for an explicit day rather than the fixture's fixed one. */
async function readDailyOn(contentId: string, dayKey: string) {
  const snap = await db.collection(CMS_ANALYTICS_DAILY_COLLECTION)
    .doc(cmsAnalyticsDailyDocId(contentId, PLACEMENT, dayKey)).get();
  const d = snap.data() ?? {};
  return {
    exists: snap.exists,
    impressions: d.counters?.impressions ?? 0,
    ctaTaps: d.counters?.ctaTaps ?? 0,
    engagedUsers: d.counters?.engagedUsers ?? 0,
    distinctUserCount: d.distinctUserCount ?? 0,
  };
}

/** Invoke the SCHEDULED function through its wrapper. */
async function runScheduled() {
  return (reconcileCmsAnalyticsDaily as unknown as {run: (e: unknown) => Promise<unknown>})
    .run({scheduleTime: new Date().toISOString(), jobName: "reconcileCmsAnalyticsDaily"});
}

// ── CATCHING UP AFTER A NIGHT THAT NEVER RAN ───────────────────────────────
//
// Under yesterday-and-today, a single missed invocation left that day
// unrepaired forever: the next night's "yesterday" is a different day, and
// nothing ever looked back. These drive the WRAPPER and pin both halves of the
// fix — that a missed day is picked up, and that the catch-up stays bounded.

/** Put a day into the state a missed night leaves behind: real events, wrong counters, no receipt. */
async function seedDriftedDay(contentId: string, dayKey: string, userIds: string[]) {
  // Earlier tests in this file drive the same scheduler, and the emulator keeps
  // what they settled. A missed night means NO receipt, so say so rather than
  // inheriting one.
  await clearReceipt("aggregate", dayKey);
  const noon = businessDayStartMs(dayKey) + 12 * 3_600_000;
  for (const userId of userIds) {
    const id = await storeEvent({contentId, userId, metric: "impressions", at: noon});
    await runTrigger(id);
  }
  // Drift, with a stamp old enough that the deferral guard cannot be what
  // protects it — only a day the run never looks at stays wrong.
  await db.collection(CMS_ANALYTICS_DAILY_COLLECTION)
    .doc(cmsAnalyticsDailyDocId(contentId, PLACEMENT, dayKey))
    .set({
      contentId, placement: PLACEMENT, dayKey,
      counters: {impressions: 99, ctaTaps: 0, engagedUsers: 0},
      distinctUserCount: 99,
      updatedAtMs: noon,
    }, {merge: true});
}

async function readReceipt(scope: "aggregate" | "mirror", dayKey: string) {
  const snap = await db.collection(RECONCILE_RECEIPT_COLLECTION)
    .doc(reconcileReceiptId(scope, dayKey)).get();
  return snap.exists ? (snap.data()?.completedAtMs as number | undefined) ?? null : null;
}

async function clearReceipt(scope: "aggregate" | "mirror", dayKey: string) {
  await db.collection(RECONCILE_RECEIPT_COLLECTION).doc(reconcileReceiptId(scope, dayKey)).delete();
}

async function writeReceipt(scope: "aggregate" | "mirror", dayKey: string, completedAtMs: number) {
  await db.collection(RECONCILE_RECEIPT_COLLECTION)
    .doc(reconcileReceiptId(scope, dayKey))
    .set({scope, dayKey, completedAtMs}, {merge: true});
}

const daysAgo = (n: number) => businessDayKey(Date.now() - n * 86_400_000);

test("14. a day a missed night skipped is repaired by the next run", {skip}, async () => {
  const contentId = `recovery_missed_${seq++}`;
  const missed = daysAgo(3);
  await seedDriftedDay(contentId, missed, ["u1", "u2"]);
  assert.equal((await readDailyOn(contentId, missed)).impressions, 99, "drift is in place");
  assert.equal(await readReceipt("aggregate", missed), null, "the night that should have run did not");

  await runScheduled();

  assert.equal((await readDailyOn(contentId, missed)).impressions, 2,
    "the skipped day must be repaired, not stranded");
  const receipt = await readReceipt("aggregate", missed);
  assert.ok(receipt !== null && receipt > businessDayStartMs(missed) + 86_400_000,
    "a completed repair records the day as settled, after that day closed");
});

test("15. a day already settled is skipped, so the catch-up stays cheap", {skip}, async () => {
  const contentId = `recovery_settled_${seq++}`;
  const settled = daysAgo(4);
  await seedDriftedDay(contentId, settled, ["u1"]);
  // A completed repair from an earlier night.
  await writeReceipt("aggregate", settled, businessDayStartMs(settled) + 86_400_000 + 60_000);

  await runScheduled();

  assert.equal((await readDailyOn(contentId, settled)).impressions, 99,
    "a settled day must not be rescanned every night");
});

test("16. the lookback is a real ceiling: an older day is never touched", {skip}, async () => {
  const contentId = `recovery_horizon_${seq++}`;
  const tooOld = daysAgo(RECOVERY_LOOKBACK_DAYS + 2);
  await seedDriftedDay(contentId, tooOld, ["u1"]);

  await runScheduled();

  assert.equal((await readDailyOn(contentId, tooOld)).impressions, 99,
    "a day beyond the horizon is out of reach and must not be silently scanned");
  assert.equal(await readReceipt("aggregate", tooOld), null,
    "and it must not be claimed as done either");
});

test("17. a deferred day earns no receipt and stays due", {skip}, async () => {
  const contentId = `recovery_deferred_${seq++}`;
  const day = daysAgo(2);
  await clearReceipt("aggregate", day);
  const noon = businessDayStartMs(day) + 12 * 3_600_000;
  const id = await storeEvent({contentId, userId: "u1", metric: "impressions", at: noon});
  await runTrigger(id);
  // A live write that lands AFTER this run's scan began: the reconcile must
  // keep the live figure and defer, which is not a completed day.
  await db.collection(CMS_ANALYTICS_DAILY_COLLECTION)
    .doc(cmsAnalyticsDailyDocId(contentId, PLACEMENT, day))
    .set({counters: {impressions: 7, ctaTaps: 0, engagedUsers: 0}, updatedAtMs: Date.now() + 600_000},
      {merge: true});

  await runScheduled();

  assert.equal((await readDailyOn(contentId, day)).impressions, 7,
    "a deferred bucket keeps the live figure rather than being overwritten");
  assert.equal(await readReceipt("aggregate", day), null,
    "and the day stays unsettled so the next run repairs it");
});

test("18. a second run settles nothing twice and counts nothing twice", {skip}, async () => {
  const contentId = `recovery_idempotent_${seq++}`;
  const day = daysAgo(2);
  await seedDriftedDay(contentId, day, ["u1", "u2", "u3"]);

  await runScheduled();
  const first = await readDailyOn(contentId, day);
  const firstReceipt = await readReceipt("aggregate", day);

  await runScheduled();
  const second = await readDailyOn(contentId, day);

  assert.equal(first.impressions, 3);
  assert.equal(second.impressions, 3, "a repeated run must not add the same users again");
  assert.equal(second.distinctUserCount, 3);
  assert.equal(await readReceipt("aggregate", day), firstReceipt,
    "a settled day is skipped on the second run, so its receipt does not move");
});
