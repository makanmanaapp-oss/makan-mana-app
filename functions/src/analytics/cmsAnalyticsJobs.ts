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
  aggregateCmsEvents,
  cmsAnalyticsDailyDocId,
  emptyCmsCounters,
  toCountableCmsEvent,
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
      tx.set(dailyRef, {distinctUserCount: FieldValue.increment(1)}, {merge: true});
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
  const start = businessDayStartMs(dayKey);
  const end = start + 86_400_000;

  const rawEvents: RawCmsEvent[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let pages = 0;
  let truncated = false;

  for (;;) {
    if (pages >= RECONCILE_MAX_PAGES) {
      truncated = true;
      break;
    }
    let query = db.collection(EVENTS_COLLECTION)
      .where("serverTimestampMs", ">=", start)
      .where("serverTimestampMs", "<", end)
      .orderBy("serverTimestampMs")
      .limit(RECONCILE_PAGE);
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
    if (snap.size < RECONCILE_PAGE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  const buckets = aggregateCmsEvents({events: rawEvents, nowMs});
  let repaired = 0;

  for (const bucket of buckets) {
    if (bucket.dayKey !== dayKey) continue;
    const ref = db.collection(CMS_ANALYTICS_DAILY_COLLECTION)
      .doc(cmsAnalyticsDailyDocId(bucket.contentId, bucket.placement, bucket.dayKey));
    const existing = await ref.get();
    const current = (existing.exists ? existing.data()?.counters : null) ?? {};

    const drifted = (current.impressions ?? 0) !== bucket.counters.impressions ||
      (current.ctaTaps ?? 0) !== bucket.counters.ctaTaps ||
      (current.engagedUsers ?? 0) !== bucket.counters.engagedUsers;
    if (!drifted && existing.exists) continue;

    // REPLACES the counters rather than incrementing them. The recomputation is
    // the whole truth for this day, so adding to what is already there would
    // double every repair.
    await ref.set({
      contentId: bucket.contentId,
      placement: bucket.placement,
      dayKey: bucket.dayKey,
      counters: bucket.counters,
      distinctUserCount: bucket.distinctUsers,
      reconciledAtMs: nowMs,
      updatedAtMs: nowMs,
    }, {merge: true});
    repaired += 1;
  }

  return {dayKey, scanned: rawEvents.length, repaired, truncated};
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
    if (yesterday.truncated || today.truncated) {
      console.error("cms analytics reconcile TRUNCATED — counts may be incomplete", {
        yesterday: yesterday.truncated,
        today: today.truncated,
      });
    }
  },
);
