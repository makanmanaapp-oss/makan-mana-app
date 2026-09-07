/**
 * WAVE 6 — Firebase → Control Center analytics mirror.
 *
 * Reuses the Wave 3 transport verbatim: the same CONTROL_CENTER_SYNC_SECRET,
 * the same /api/internal/sync/mirror endpoint, the same sync_receipts
 * idempotency contract. Nothing new was invented for this, which is why replay
 * protection and failure accounting behave exactly as they do for every other
 * family.
 *
 * What crosses the boundary is AGGREGATE ROWS ONLY — counts per restaurant per
 * business day. The dedupe subcollection, which is the only place a user id
 * appears anywhere in this feature, never leaves Firebase.
 */
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";

import {db} from "../config/firebase";
import {CONTROL_CENTER_SYNC_SECRET, pushMirrorBatch} from "./mirrorEventPush";
import {BUSINESS_TIMEZONE, businessDayKey} from "../domain/analytics/analyticsAggregation";
import {
  ANALYTICS_DAILY_COLLECTION,
  readCounters,
  toAnalyticsMirrorRecord,
  type AnalyticsDailyDocument,
} from "../domain/analytics/analyticsDocument";

const REGION = "asia-southeast1";
const RECONCILE_LIMIT = 400;

function toDocument(id: string, raw: Record<string, unknown>): AnalyticsDailyDocument | null {
  const canonicalPlaceId = typeof raw.canonicalPlaceId === "string" ? raw.canonicalPlaceId : "";
  const dayKey = typeof raw.dayKey === "string" ? raw.dayKey : "";
  if (!canonicalPlaceId || !dayKey) return null;
  return {
    canonicalPlaceId,
    dayKey,
    counters: readCounters(raw.counters),
    distinctUserCount: typeof raw.distinctUserCount === "number" ? raw.distinctUserCount : 0,
    // Never mirrored; present only to satisfy the shape.
    appliedEventIds: [],
    updatedAtMs: typeof raw.updatedAtMs === "number" ? raw.updatedAtMs : Date.now(),
  };
}

/** Push one day's aggregate as it changes. */
export const mirrorAnalyticsDailyOnWrite = onDocumentWritten(
  {
    document: `${ANALYTICS_DAILY_COLLECTION}/{docId}`,
    region: REGION,
    secrets: [CONTROL_CENTER_SYNC_SECRET],
    maxInstances: 10,
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const secret = CONTROL_CENTER_SYNC_SECRET.value();
    if (!secret) throw new Error("CONTROL_CENTER_SYNC_SECRET is unavailable.");

    const doc = toDocument(after.id, after.data() ?? {});
    if (!doc) return;

    await pushMirrorBatch({
      entityType: "merchant_analytics_daily",
      records: [toAnalyticsMirrorRecord(doc)],
      secret,
      // Version the event id by the write time so a genuine later change is a
      // new event, while a retry of the SAME write is recognised as a duplicate.
      eventId: `analytics-${after.id}-${doc.updatedAtMs}`,
    });
  },
);

/**
 * Nightly catch-up for days whose push failed or never fired.
 *
 * Runs after the aggregation reconcile so it mirrors repaired numbers rather
 * than the ones the repair was about to replace.
 */
export const reconcileAnalyticsMirrorDaily = onSchedule(
  {
    schedule: "51 3 * * *",
    timeZone: BUSINESS_TIMEZONE,
    region: REGION,
    secrets: [CONTROL_CENTER_SYNC_SECRET],
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async () => {
    const secret = CONTROL_CENTER_SYNC_SECRET.value();
    if (!secret) throw new Error("CONTROL_CENTER_SYNC_SECRET is unavailable.");

    const now = Date.now();
    const days = [businessDayKey(now - 86_400_000), businessDayKey(now)];

    for (const dayKey of days) {
      const snap = await db.collection(ANALYTICS_DAILY_COLLECTION)
        .where("dayKey", "==", dayKey)
        .limit(RECONCILE_LIMIT)
        .get();
      if (snap.empty) continue;

      const records = snap.docs
        .map((doc) => toDocument(doc.id, doc.data() ?? {}))
        .filter((doc): doc is AnalyticsDailyDocument => doc !== null)
        .map(toAnalyticsMirrorRecord);
      if (records.length === 0) continue;

      // Batched in chunks the receipt contract accepts.
      for (let index = 0; index < records.length; index += 200) {
        const chunk = records.slice(index, index + 200);
        await pushMirrorBatch({
          entityType: "merchant_analytics_daily",
          records: chunk,
          secret,
          eventId: `analytics-reconcile-${dayKey}-${index}-${businessDayKey(now)}`,
        });
      }
      console.log("analytics mirror reconcile", {dayKey, records: records.length});
    }
  },
);
