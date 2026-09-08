/**
 * WAVE 6 — Merchant Analytics: ingestion and drift repair.
 *
 * Two layers, on purpose:
 *
 *  1. TRIGGERS keep the numbers fresh. Each folds exactly one signal into one
 *     daily bucket, inside a transaction, and marks its source as applied so a
 *     retry cannot count it twice.
 *  2. A DAILY RECONCILE recomputes whole days from the authoritative sources
 *     and overwrites. Because the aggregation is a pure function of the events,
 *     the reconcile can genuinely REPAIR drift rather than guess a second time.
 *
 * Follows and menu comments are NOT taken from client events. They already have
 * server-authoritative collections, and a signal the server wrote is worth more
 * than one a client asserted — so those triggers watch the real documents. That
 * also means no Wave 3 code path had to be edited to add analytics.
 *
 * IDENTITY. A client event's `placeId` is whatever the app was holding — very
 * often a Google/provider id (`ChIJ...`), not a canonical `PLC-...`. It is
 * resolved here through the EXISTING proven resolver before anything is
 * aggregated, and an event that cannot be resolved is not counted at all. Two
 * consequences worth stating: a provider id can never become the key of an
 * analytics document, and a merchant reading by canonical identity sees the
 * same rows the aggregation wrote. Before this, the two key spaces could never
 * meet and every event-derived metric would have read as a permanent zero.
 */
import {onDocumentCreated, onDocumentDeleted} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";

import {db, FieldValue} from "../config/firebase";
import {
  BUSINESS_TIMEZONE,
  aggregateEvents,
  businessDayKey,
  businessDayStartMs,
  applyCanonicalResolution,
  eventOccurredAtMs,
  isCountableEvent,
  type RawAnalyticsEvent,
} from "../domain/analytics/analyticsAggregation";
import {
  ANALYTICS_DAILY_COLLECTION,
  analyticsDailyDocId,
} from "../domain/analytics/analyticsDocument";
import {resolveProvenCanonicalRestaurantPlaceId} from "../services/restaurantProfileV2ReadService";
import {
  DEDUPED_PER_USER_PER_DAY,
  EVENT_TO_METRIC,
  emptyCounters,
  type TrackedMetric,
} from "../domain/analytics/analyticsTypes";

const REGION = "asia-southeast1";
const EVENTS_COLLECTION = "events";
const DEDUPE_SUBCOLLECTION = "dedupe";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Fold one unit of one metric into a day bucket.
 *
 * `dedupeKey` is set for view-class metrics: the same person opening the same
 * page all afternoon is one visit, not twenty. The marker doc is created inside
 * the same transaction as the increment, so the two can never disagree.
 */
async function applyMetric(params: {
  canonicalPlaceId: string;
  dayKey: string;
  metric: TrackedMetric;
  delta: number;
  dedupeKey?: string;
  userId?: string;
  /** Marked applied inside the transaction; absent for document-sourced signals. */
  sourceEventRef?: FirebaseFirestore.DocumentReference;
  /** Stamped alongside the applied marker, for operator visibility. */
  resolutionState?: "resolved";
}): Promise<"applied" | "duplicate"> {
  const dailyRef = db.collection(ANALYTICS_DAILY_COLLECTION)
    .doc(analyticsDailyDocId(params.canonicalPlaceId, params.dayKey));
  const dedupeRef = params.dedupeKey
    ? dailyRef.collection(DEDUPE_SUBCOLLECTION).doc(params.dedupeKey)
    : null;

  return db.runTransaction(async (tx) => {
    // Reads first, all of them, before any write.
    const sourceSnap = params.sourceEventRef ? await tx.get(params.sourceEventRef) : null;
    if (sourceSnap && sourceSnap.exists && sourceSnap.data()?.analyticsAppliedAtMs) {
      return "duplicate" as const;
    }
    const dedupeSnap = dedupeRef ? await tx.get(dedupeRef) : null;
    const alreadyCounted = !!dedupeSnap?.exists;
    const dailySnap = await tx.get(dailyRef);

    const now = Date.now();
    if (!dailySnap.exists) {
      tx.set(dailyRef, {
        canonicalPlaceId: params.canonicalPlaceId,
        dayKey: params.dayKey,
        counters: emptyCounters(),
        distinctUserCount: 0,
        createdAtMs: now,
        updatedAtMs: now,
      });
    }

    if (!alreadyCounted) {
      tx.set(dailyRef, {
        counters: {[params.metric]: FieldValue.increment(params.delta)},
        updatedAtMs: now,
      }, {merge: true});
      if (dedupeRef) {
        // Holds no personal data beyond the fact that SOMEBODY was counted:
        // the uid lives in the document id, which only the server can read.
        tx.set(dedupeRef, {metric: params.metric, createdAtMs: now});
        tx.set(dailyRef, {distinctUserCount: FieldValue.increment(1)}, {merge: true});
      }
    }

    if (params.sourceEventRef) {
      tx.set(params.sourceEventRef, {
        analyticsAppliedAtMs: now,
        ...(params.resolutionState ? {analyticsResolution: params.resolutionState} : {}),
      }, {merge: true});
    }
    return alreadyCounted ? "duplicate" as const : "applied" as const;
  });
}

/**
 * Resolve an event's place to a PROVEN canonical identity.
 *
 * Delegates to the Wave 3 resolver used by the public Follow surface — the
 * strict one that returns null rather than handing back the caller's own id.
 * No second resolver, no name matching, no guessing.
 */
async function resolveEventCanonicalId(rawPlaceId: string): Promise<string | null> {
  if (!rawPlaceId) return null;
  try {
    return await resolveProvenCanonicalRestaurantPlaceId(rawPlaceId);
  } catch {
    // A lookup failure must not become an aggregate under an unproven id.
    return null;
  }
}

// ── CLIENT EVENT INGESTION ─────────────────────────────────────────────────

/**
 * Stamp a server time on every event, and fold the ones that carry a metric.
 *
 * The server stamp matters beyond analytics: it is what lets the reconcile
 * range-query a day without trusting a device clock.
 */
export const aggregateAnalyticsEventOnCreate = onDocumentCreated(
  {document: `${EVENTS_COLLECTION}/{eventId}`, region: REGION, maxInstances: 10},
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const raw = snap.data() ?? {};
    const now = Date.now();

    // Always stamp, even for events with no metric — a consistent server clock
    // on every event is cheaper than deciding later that we wish we had one.
    if (typeof raw.serverTimestampMs !== "number") {
      await snap.ref.set({serverTimestampMs: now}, {merge: true});
    }

    const candidate: RawAnalyticsEvent = {
      eventId: event.params.eventId,
      eventType: raw.eventType,
      userId: raw.userId,
      placeId: raw.placeId,
      isSample: raw.isSample,
      isPreview: raw.isPreview,
      sourceMode: raw.sourceMode,
      clientTimestamp: raw.clientTimestamp,
      serverTimestampMs: typeof raw.serverTimestampMs === "number" ? raw.serverTimestampMs : now,
      metadata: raw.metadata,
    };
    if (!isCountableEvent(candidate)) return;

    const metric = EVENT_TO_METRIC[text(candidate.eventType)];
    const rawPlaceId = text(candidate.placeId);
    const dayKey = businessDayKey(eventOccurredAtMs(candidate, now));
    const userId = text(candidate.userId);

    // Identity first. Nothing is aggregated under an id we cannot prove.
    const canonicalPlaceId = await resolveEventCanonicalId(rawPlaceId);
    if (!canonicalPlaceId) {
      // Recorded so an operator can see the volume of unattributable events
      // instead of wondering why a restaurant looks quiet. Carries no new
      // personal data: the event already held this placeId.
      await snap.ref.set({
        analyticsResolution: "unresolved",
        analyticsResolvedAtMs: now,
      }, {merge: true});
      return;
    }

    await applyMetric({
      canonicalPlaceId,
      dayKey,
      metric,
      delta: 1,
      userId,
      dedupeKey: DEDUPED_PER_USER_PER_DAY.includes(metric) && userId
        ? `${metric}__${userId}` : undefined,
      sourceEventRef: snap.ref,
      resolutionState: "resolved",
    });
  },
);

// ── SERVER-AUTHORITATIVE SIGNALS ───────────────────────────────────────────

/** A follow document exists only because the server callable created it. */
export const aggregateRestaurantFollowOnCreate = onDocumentCreated(
  {document: "restaurant_follows/{followId}", region: REGION, maxInstances: 10},
  async (event) => {
    const data = event.data?.data() ?? {};
    // Already canonical: the server wrote this document, so no resolution is
    // needed. Named for what it holds, not for the field it came through.
    const canonicalPlaceId = text(data.canonicalPlaceId);
    if (!canonicalPlaceId) return;
    await applyMetric({
      canonicalPlaceId,
      dayKey: businessDayKey(Date.now()),
      metric: "newFollows",
      delta: 1,
    });
  },
);

export const aggregateRestaurantUnfollowOnDelete = onDocumentDeleted(
  {document: "restaurant_follows/{followId}", region: REGION, maxInstances: 10},
  async (event) => {
    const data = event.data?.data() ?? {};
    // Already canonical: the server wrote this document, so no resolution is
    // needed. Named for what it holds, not for the field it came through.
    const canonicalPlaceId = text(data.canonicalPlaceId);
    if (!canonicalPlaceId) return;
    await applyMetric({
      canonicalPlaceId,
      dayKey: businessDayKey(Date.now()),
      metric: "unfollows",
      delta: 1,
    });
  },
);

/** Menu comments are created by a callable, so the document is authoritative. */
export const aggregateMenuCommentOnCreate = onDocumentCreated(
  {document: "menu_comments/{commentId}", region: REGION, maxInstances: 10},
  async (event) => {
    const data = event.data?.data() ?? {};
    const canonicalPlaceId = text(data.canonicalPlaceId) || text(data.placeId);
    if (!canonicalPlaceId) return;
    await applyMetric({
      canonicalPlaceId,
      dayKey: businessDayKey(Date.now()),
      metric: "menuComments",
      delta: 1,
    });
  },
);

// ── DRIFT REPAIR ───────────────────────────────────────────────────────────

const RECONCILE_BATCH = 2000;

/**
 * Recompute yesterday and today from the authoritative event stream.
 *
 * Deterministic: the same events produce the same counters, so this OVERWRITES
 * the client-event-derived counters with the recomputed truth. Follow and
 * comment counters are left alone — they come from documents, not events, and
 * recomputing them here would double-count against their own triggers.
 */
export async function reconcileAnalyticsDay(dayKey: string, nowMs: number): Promise<number> {
  const start = businessDayStartMs(dayKey);
  const end = start + 86_400_000;

  const snap = await db.collection(EVENTS_COLLECTION)
    .where("serverTimestampMs", ">=", start)
    .where("serverTimestampMs", "<", end)
    .limit(RECONCILE_BATCH)
    .get();

  const rawEvents: RawAnalyticsEvent[] = snap.docs.map((doc) => {
    const raw = doc.data() ?? {};
    return {
      eventId: doc.id,
      eventType: raw.eventType,
      userId: raw.userId,
      placeId: raw.placeId,
      isSample: raw.isSample,
      isPreview: raw.isPreview,
      sourceMode: raw.sourceMode,
      clientTimestamp: raw.clientTimestamp,
      serverTimestampMs: raw.serverTimestampMs,
      metadata: raw.metadata,
    };
  });

  // Resolve identity here too, or the nightly repair would happily rewrite a
  // day's counters back under provider ids and undo the trigger's work. One
  // lookup per DISTINCT place, cached, rather than one per event.
  const resolution = new Map<string, string | null>();
  for (const event of rawEvents) {
    const placeId = text(event.placeId);
    if (!placeId || resolution.has(placeId)) continue;
    resolution.set(placeId, await resolveEventCanonicalId(placeId));
  }
  const events = applyCanonicalResolution(rawEvents, resolution);

  const buckets = aggregateEvents({events, nowMs});
  let repaired = 0;

  for (const bucket of buckets) {
    if (bucket.dayKey !== dayKey) continue;
    const ref = db.collection(ANALYTICS_DAILY_COLLECTION)
      .doc(analyticsDailyDocId(bucket.canonicalPlaceId, bucket.dayKey));
    const existing = await ref.get();
    const current = (existing.exists ? existing.data()?.counters : null) ?? {};

    // Only the event-derived metrics are rewritten. Document-derived ones keep
    // whatever their own triggers recorded.
    const rewritten: Record<string, number> = {};
    for (const [metric, value] of Object.entries(bucket.counters)) {
      if (metric === "newFollows" || metric === "unfollows" || metric === "menuComments") continue;
      rewritten[metric] = value;
    }
    const drifted = Object.entries(rewritten)
      .some(([metric, value]) => (current[metric] ?? 0) !== value);
    if (!drifted && existing.exists) continue;

    await ref.set({
      canonicalPlaceId: bucket.canonicalPlaceId,
      dayKey: bucket.dayKey,
      counters: rewritten,
      distinctUserCount: bucket.distinctUsers,
      reconciledAtMs: nowMs,
      updatedAtMs: nowMs,
    }, {merge: true});
    repaired += 1;
  }
  return repaired;
}

export const reconcileAnalyticsDaily = onSchedule(
  {
    schedule: "23 3 * * *",
    timeZone: BUSINESS_TIMEZONE,
    region: REGION,
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async () => {
    const now = Date.now();
    // Yesterday first: it is complete, so its repair is final.
    const yesterday = businessDayKey(now - 86_400_000);
    const today = businessDayKey(now);
    const repairedYesterday = await reconcileAnalyticsDay(yesterday, now);
    const repairedToday = await reconcileAnalyticsDay(today, now);
    console.log("analytics reconcile", {yesterday, repairedYesterday, today, repairedToday});
  },
);
