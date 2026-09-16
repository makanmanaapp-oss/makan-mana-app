/**
 * B5 — CMS banner analytics: ingestion and drift repair.
 *
 * Two layers, the same shape Wave 6 uses for merchant analytics:
 *
 *  1. A TRIGGER keeps the numbers fresh. It folds exactly one client event into
 *     exactly one day bucket, inside a transaction, and marks the source event
 *     applied so a retry cannot count it twice.
 *  2. A DAILY RECONCILE recomputes whole days from the event stream and
 *     OVERWRITES. Because `aggregateCmsEvents` is a pure function of the
 *     events, this genuinely repairs drift instead of adding a second guess on
 *     top of the first.
 *
 * HISTORY OUTLIVES THE BANNER. Nothing here reads, or depends on, the CMS
 * content document. An archived or deleted banner keeps every day it earned —
 * an operator asking "how did the Raya campaign do" must still get an answer
 * after the campaign is taken down.
 */
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";

import {db, FieldValue} from "../config/firebase";
import {
  BUSINESS_TIMEZONE,
  businessDayKey,
  businessDayStartMs,
} from "../domain/analytics/analyticsAggregation";
import {
  CMS_ANALYTICS_DAILY_COLLECTION,
  aggregateCmsEventsWithMembership,
  cmsAnalyticsDailyDocId,
  emptyCmsCounters,
  toCountableCmsEvent,
  type CmsDailyBucketMembership,
  type CmsDailyCounters,
  type RawCmsEvent,
} from "../domain/cms/cmsAnalytics";

const REGION = "asia-southeast1";
const EVENTS_COLLECTION = "events";
const DEDUPE_SUBCOLLECTION = "dedupe";

/** One page of the reconcile scan. Bounded so a day cannot exhaust memory. */
const RECONCILE_PAGE = 500;
/**
 * A hard stop so a runaway day cannot loop forever. Reaching it is REPORTED,
 * never silent: a truncated reconcile that looked successful would leave an
 * operator trusting a number the job knew was incomplete.
 */
const RECONCILE_MAX_PAGES = 200;
/** Firestore caps a batch at 500 writes; leave headroom. */
const MARKER_BATCH = 400;

/**
 * Fold one unit of one metric into a day bucket.
 *
 * The dedupe marker is created inside the same transaction as the increment, so
 * the counter and the record of who was counted can never disagree. It holds
 * the uid only in its document id, which no client can read.
 */
async function applyCmsMetric(params: {
  contentId: string;
  placement: string;
  dayKey: string;
  metric: keyof CmsDailyCounters;
  userId: string;
  sourceEventRef?: FirebaseFirestore.DocumentReference;
}): Promise<"applied" | "duplicate"> {
  const dailyRef = db.collection(CMS_ANALYTICS_DAILY_COLLECTION)
    .doc(cmsAnalyticsDailyDocId(params.contentId, params.placement, params.dayKey));
  const dedupe = dailyRef.collection(DEDUPE_SUBCOLLECTION);

  const other: keyof CmsDailyCounters =
    params.metric === "impressions" ? "ctaTaps" : "impressions";
  const selfRef = dedupe.doc(`${params.metric}__${params.userId}`);
  const otherRef = dedupe.doc(`${other}__${params.userId}`);
  // Marks that this person has already been counted as ENGAGED here, so the
  // intersection is incremented exactly once no matter which event completes it.
  const engagedRef = dedupe.doc(`engaged__${params.userId}`);
  const presentRef = dedupe.doc(`present__${params.userId}`);

  return db.runTransaction(async (tx) => {
    // Every read before any write — Firestore requires it, and it also means a
    // concurrent retry sees a consistent picture.
    const sourceSnap = params.sourceEventRef ? await tx.get(params.sourceEventRef) : null;
    if (sourceSnap?.exists && sourceSnap.data()?.cmsAnalyticsAppliedAtMs) {
      return "duplicate" as const;
    }
    const selfSnap = await tx.get(selfRef);
    const otherSnap = await tx.get(otherRef);
    const engagedSnap = await tx.get(engagedRef);
    const presentSnap = await tx.get(presentRef);
    const dailySnap = await tx.get(dailyRef);

    const alreadyCounted = selfSnap.exists;
    const now = Date.now();

    if (!dailySnap.exists) {
      tx.set(dailyRef, {
        contentId: params.contentId,
        placement: params.placement,
        dayKey: params.dayKey,
        counters: emptyCmsCounters(),
        distinctUserCount: 0,
        createdAtMs: now,
        updatedAtMs: now,
      });
    }

    if (!alreadyCounted) {
      tx.set(dailyRef, {
        counters: {[params.metric]: FieldValue.increment(1)},
        updatedAtMs: now,
      }, {merge: true});
      tx.set(selfRef, {metric: params.metric, createdAtMs: now});
    }

    // THE INTERSECTION, maintained incrementally.
    //
    // A person is engaged once BOTH their qualifying impression and their tap
    // exist in this bucket. Either event can complete the pair, and they
    // routinely arrive out of order — a tap can reach the backend before the
    // impression that preceded it. Whichever lands second closes the pair here,
    // so `engagedUsers` stays a true subset of `impressions` without depending
    // on delivery order.
    // After this transaction this user definitely has `params.metric` recorded
    // — either it was already there or it was just written — so the pair is
    // complete exactly when the OTHER metric is also present.
    if (otherSnap.exists && !engagedSnap.exists) {
      tx.set(dailyRef, {
        counters: {engagedUsers: FieldValue.increment(1)},
        updatedAtMs: now,
      }, {merge: true});
      tx.set(engagedRef, {createdAtMs: now});
    }

    // Counted on a person's FIRST appearance in this bucket by EITHER metric.
    // Keying it to impressions alone would miss someone whose impression was
    // lost but whose tap arrived, and then distinctUserCount would understate
    // the sample the rate is judged against.
    if (!presentSnap.exists) {
      // `updatedAtMs` moves here too. It is the reconcile guard's only signal
      // that this document changed after a scan began, and a distinct-count
      // increment is as much a change as a counter one.
      tx.set(dailyRef, {
        distinctUserCount: FieldValue.increment(1),
        updatedAtMs: now,
      }, {merge: true});
      tx.set(presentRef, {createdAtMs: now});
    }

    if (params.sourceEventRef) {
      tx.set(params.sourceEventRef, {cmsAnalyticsAppliedAtMs: now}, {merge: true});
    }
    return alreadyCounted ? "duplicate" as const : "applied" as const;
  });
}

/**
 * Fold one CMS event as it arrives.
 *
 * Separate from the merchant aggregator on the same collection: that one keys
 * by canonical restaurant and ignores events with no resolvable place, which is
 * every CMS event. Two listeners on `events/` is the honest arrangement — one
 * per identity space — rather than one function that has to know about both.
 */
export const aggregateCmsAnalyticsEventOnCreate = onDocumentCreated(
  {document: `${EVENTS_COLLECTION}/{eventId}`, region: REGION, maxInstances: 10},
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const raw = snap.data() ?? {};
    const now = Date.now();

    const candidate: RawCmsEvent = {
      eventId: event.params.eventId,
      eventType: raw.eventType,
      userId: raw.userId,
      clientTimestampMs: raw.clientTimestampMs,
      serverTimestampMs: typeof raw.serverTimestampMs === "number"
        ? raw.serverTimestampMs : now,
      metadata: raw.metadata,
    };

    const countable = toCountableCmsEvent(candidate, now);
    if (!countable) return;

    await applyCmsMetric({
      contentId: countable.contentId,
      placement: countable.placement,
      dayKey: businessDayKey(countable.occurredAtMs),
      metric: countable.metric,
      userId: countable.userId,
      sourceEventRef: snap.ref,
    });
  },
);

// ── DRIFT REPAIR ───────────────────────────────────────────────────────────

export interface CmsReconcileResult {
  dayKey: string;
  scanned: number;
  repaired: number;
  /** True when the page cap stopped the scan before the day was exhausted. */
  truncated: boolean;
  /**
   * Buckets the live trigger touched after this scan began. Their repair is
   * DEFERRED rather than applied, because overwriting would discard an
   * increment that landed after we read the events.
   */
  deferred: number;
  /** Dedupe markers written so a late trigger cannot count a user twice. */
  markersWritten: number;
}

/**
 * Write the same per-user dedupe markers the live trigger uses.
 *
 * WHY RECONCILE MUST DO THIS. After recomputing a day, the aggregate says user
 * U was counted — but if U's marker is missing, a trigger that runs afterwards
 * (for an event this scan already included, or a later one from U) sees no
 * marker and increments on top of the recomputed figure. The counters and the
 * markers have to agree or the two writers fight.
 *
 * Written BEFORE the counters, deliberately. A marker with no counter update is
 * safe: a pending trigger becomes a no-op and the next reconcile recomputes the
 * truth from the events, which markers never influence. A counter update with
 * no marker is the double-count this exists to prevent.
 *
 * Batched rather than transactional: markers are idempotent `set`s, so a
 * partial batch is simply resumed by the next run.
 */
async function writeDedupeMarkers(
  bucket: CmsDailyBucketMembership,
  nowMs: number,
): Promise<number> {
  const dailyRef = db.collection(CMS_ANALYTICS_DAILY_COLLECTION)
    .doc(cmsAnalyticsDailyDocId(bucket.contentId, bucket.placement, bucket.dayKey));
  const dedupe = dailyRef.collection(DEDUPE_SUBCOLLECTION);

  const markers: Array<{id: string; data: Record<string, unknown>}> = [];
  for (const uid of bucket.impressionUsers) {
    markers.push({id: `impressions__${uid}`, data: {metric: "impressions", createdAtMs: nowMs}});
  }
  for (const uid of bucket.tapUsers) {
    markers.push({id: `ctaTaps__${uid}`, data: {metric: "ctaTaps", createdAtMs: nowMs}});
  }
  for (const uid of bucket.engagedUserIds) {
    markers.push({id: `engaged__${uid}`, data: {createdAtMs: nowMs}});
  }
  for (const uid of bucket.presentUsers) {
    markers.push({id: `present__${uid}`, data: {createdAtMs: nowMs}});
  }

  let written = 0;
  for (let i = 0; i < markers.length; i += MARKER_BATCH) {
    const batch = db.batch();
    for (const marker of markers.slice(i, i + MARKER_BATCH)) {
      batch.set(dedupe.doc(marker.id), marker.data, {merge: true});
    }
    await batch.commit();
    written += Math.min(MARKER_BATCH, markers.length - i);
  }
  return written;
}

/**
 * Recompute one business day from the event stream and overwrite.
 *
 * Paginated by document cursor rather than a single `limit()`: a fixed limit
 * silently drops the rest of a busy day and reports success, which would make
 * the repair itself the source of the drift. If the page cap is reached the
 * result says so, and the caller logs it.
 */
export async function reconcileCmsAnalyticsDay(
  dayKey: string,
  nowMs: number,
): Promise<CmsReconcileResult> {
  return runReconcile({dayKey, nowMs});
}

/**
 * Test seam. Supplies the scan watermark and the paging limits that the
 * production entry point takes from the clock and from constants.
 *
 * Exists because the two trigger-versus-reconcile interleavings cannot be
 * reproduced reliably from outside without controlling exactly when the scan is
 * considered to have started. The LOGIC is not duplicated — this and
 * `reconcileCmsAnalyticsDay` call the same function.
 */
export async function __reconcileForTest(options: {
  dayKey: string;
  nowMs: number;
  scanStartedAtMs?: number;
  maxPages?: number;
  pageSize?: number;
  afterScan?: () => Promise<void>;
}): Promise<CmsReconcileResult> {
  return runReconcile(options);
}

async function runReconcile(options: {
  dayKey: string;
  nowMs: number;
  scanStartedAtMs?: number;
  maxPages?: number;
  pageSize?: number;
  /**
   * Test-only hook fired between the scan and the writes — the exact window the
   * dropped-increment race lives in. Without it that interleaving cannot be
   * reproduced from outside, and a test that merely calls reconcile with a
   * stale watermark passes whether or not the guard exists.
   */
  afterScan?: () => Promise<void>;
}): Promise<CmsReconcileResult> {
  const {dayKey, nowMs} = options;
  const maxPages = options.maxPages ?? RECONCILE_MAX_PAGES;
  const pageSize = options.pageSize ?? RECONCILE_PAGE;
  const start = businessDayStartMs(dayKey);
  const end = start + 86_400_000;

  // Taken BEFORE the first page is read. Anything the live trigger writes after
  // this instant is newer than our view of the events, and must not be
  // overwritten by it.
  const scanStartedAtMs = options.scanStartedAtMs ?? Date.now();

  const rawEvents: RawCmsEvent[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let pages = 0;
  let truncated = false;

  for (;;) {
    if (pages >= maxPages) {
      truncated = true;
      break;
    }
    let query = db.collection(EVENTS_COLLECTION)
      .where("serverTimestampMs", ">=", start)
      .where("serverTimestampMs", "<", end)
      .orderBy("serverTimestampMs")
      .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);

    const snap = await query.get();
    if (snap.empty) break;
    pages += 1;

    for (const doc of snap.docs) {
      const raw = doc.data() ?? {};
      rawEvents.push({
        eventId: doc.id,
        eventType: raw.eventType,
        userId: raw.userId,
        clientTimestampMs: raw.clientTimestampMs,
        serverTimestampMs: raw.serverTimestampMs,
        metadata: raw.metadata,
      });
    }
    if (snap.size < pageSize) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  // FAIL CLOSED ON AN INCOMPLETE SCAN.
  //
  // A truncated scan has only SOME of the day's events, so its totals are an
  // undercount. Writing them would replace correct figures with partial ones
  // and call it a repair — logging the truncation afterwards cannot undo that.
  // Nothing is written, existing aggregates and markers are left exactly as
  // they were, and the caller raises an error.
  if (truncated) {
    return {
      dayKey,
      scanned: rawEvents.length,
      repaired: 0,
      truncated: true,
      deferred: 0,
      markersWritten: 0,
    };
  }

  if (options.afterScan) await options.afterScan();

  const buckets = aggregateCmsEventsWithMembership({events: rawEvents, nowMs});
  let repaired = 0;
  let deferred = 0;
  let markersWritten = 0;

  for (const bucket of buckets) {
    if (bucket.dayKey !== dayKey) continue;
    const ref = db.collection(CMS_ANALYTICS_DAILY_COLLECTION)
      .doc(cmsAnalyticsDailyDocId(bucket.contentId, bucket.placement, bucket.dayKey));

    // Markers first. A pending trigger for an event this scan already counted
    // then finds the user marked and becomes a no-op, so it cannot increment
    // on top of the figure written below.
    markersWritten += await writeDedupeMarkers(bucket, nowMs);

    const outcome = await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      const data = existing.exists ? existing.data() ?? {} : {};

      // THE GUARD. If the live trigger wrote after this scan began, its
      // increment describes an event this scan never saw. Replacing the
      // counters would silently drop it, so the repair is deferred to the next
      // run — which will scan the newer event too.
      const touchedAtMs = typeof data.updatedAtMs === "number" ? data.updatedAtMs : 0;
      if (existing.exists && touchedAtMs > scanStartedAtMs) return "deferred" as const;

      const current = (data.counters ?? {}) as Partial<CmsDailyCounters>;
      const drifted =
        (current.impressions ?? 0) !== bucket.counters.impressions ||
        (current.ctaTaps ?? 0) !== bucket.counters.ctaTaps ||
        (current.engagedUsers ?? 0) !== bucket.counters.engagedUsers ||
        // Included so a distinct-count-only drift can actually be repaired.
        // Without it the sample size the console reports could stay wrong
        // forever while the three counters looked healthy.
        (typeof data.distinctUserCount === "number" ? data.distinctUserCount : 0)
          !== bucket.distinctUsers;
      if (!drifted && existing.exists) return "clean" as const;

      // REPLACES the counters rather than incrementing them. The recomputation
      // is the whole truth for this day, so adding to what is already there
      // would double every repair.
      tx.set(ref, {
        contentId: bucket.contentId,
        placement: bucket.placement,
        dayKey: bucket.dayKey,
        counters: bucket.counters,
        distinctUserCount: bucket.distinctUsers,
        reconciledAtMs: nowMs,
        updatedAtMs: nowMs,
      }, {merge: true});
      return "repaired" as const;
    });

    if (outcome === "repaired") repaired += 1;
    else if (outcome === "deferred") deferred += 1;
  }

  return {dayKey, scanned: rawEvents.length, repaired, truncated, deferred, markersWritten};
}

export const reconcileCmsAnalyticsDaily = onSchedule(
  {
    schedule: "41 3 * * *",
    timeZone: BUSINESS_TIMEZONE,
    region: REGION,
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async () => {
    const now = Date.now();
    // Yesterday first: it is complete, so its repair is final.
    const yesterday = await reconcileCmsAnalyticsDay(businessDayKey(now - 86_400_000), now);
    const today = await reconcileCmsAnalyticsDay(businessDayKey(now), now);
    console.log("cms analytics reconcile", {yesterday, today});

    if (yesterday.deferred || today.deferred) {
      // Not a failure. The live trigger was writing while we scanned, so those
      // buckets keep their live figures and the next run repairs them.
      console.warn("cms analytics reconcile deferred buckets to the next run", {
        yesterday: yesterday.deferred, today: today.deferred,
      });
    }

    const truncated = [yesterday, today].filter((r) => r.truncated).map((r) => r.dayKey);
    if (truncated.length > 0) {
      // THROWN, not logged. Nothing was written for these days — the aggregates
      // and markers are untouched — but a day the repairer could not finish is
      // an operational fault, and a job that reported success would hide it
      // until somebody happened to read the logs.
      throw new Error(
        `cms analytics reconcile could not scan ${truncated.join(", ")} completely; ` +
        "no aggregate was written for those days",
      );
    }
  },
);
