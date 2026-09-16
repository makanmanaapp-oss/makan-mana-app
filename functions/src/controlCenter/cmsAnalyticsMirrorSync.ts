/**
 * B5 — narrow Firebase → Control Center CMS analytics mirror.
 *
 * Reuses the EXISTING transport verbatim: the same sync secret, the same
 * /api/internal/sync/mirror endpoint, the same idempotent eventId batches that
 * Wave 3C engagement, Wave 4 promotions, Wave 5 CMS and Wave 6 merchant
 * analytics already use. No new secret, no new endpoint.
 *
 * Trigger for freshness, scheduled reconciler for drift repair. A mirror
 * failure never fails the authoritative write — the aggregate in Firestore is
 * the record; the mirror is a read model for the console.
 *
 * AGGREGATES ONLY. What crosses is counts and the identifiers needed to key
 * them. The `dedupe` subcollection — the only place a uid appears — is never
 * read here, so it cannot travel even by accident.
 *
 * NOT DEPLOYED.
 */
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";

import {db} from "../config/firebase";
import {BUSINESS_TIMEZONE, businessDayKey} from "../domain/analytics/analyticsAggregation";
import {
  CMS_ANALYTICS_DAILY_COLLECTION,
  CMS_ANALYTICS_MIRROR_ENTITY_TYPE,
  cmsAnalyticsMirrorEventId,
  emptyCmsCounters,
  toCmsAnalyticsMirrorRecord,
  type CmsAnalyticsDailyDocument,
  type CmsAnalyticsMirrorRecord,
} from "../domain/cms/cmsAnalytics";
import {CONTROL_CENTER_SYNC_SECRET, pushMirrorBatch} from "./mirrorEventPush";

/** One page of the reconcile scan. Paged by cursor, not capped in total. */
const RECONCILE_PAGE = 200;
/** Runaway stop. Reaching it is reported as a fault, never as a clean run. */
const RECONCILE_MAX_PAGES = 250;

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Read one stored aggregate into the shape the mirror record is built from. */
export function readCmsAnalyticsDocument(
  raw: Record<string, unknown> | undefined | null,
): CmsAnalyticsDailyDocument | null {
  if (!raw) return null;
  const contentId = typeof raw.contentId === "string" ? raw.contentId.trim() : "";
  const placement = typeof raw.placement === "string" ? raw.placement.trim() : "";
  const dayKey = typeof raw.dayKey === "string" ? raw.dayKey.trim() : "";
  if (!contentId || !placement || !dayKey) return null;

  const counters = emptyCmsCounters();
  const stored = (raw.counters && typeof raw.counters === "object")
    ? raw.counters as Record<string, unknown> : {};
  counters.impressions = num(stored.impressions);
  counters.ctaTaps = num(stored.ctaTaps);
  counters.engagedUsers = num(stored.engagedUsers);

  return {
    contentId,
    placement,
    dayKey,
    counters,
    distinctUserCount: num(raw.distinctUserCount),
    updatedAtMs: num(raw.updatedAtMs),
  };
}

/**
 * Notice an impossible snapshot before it leaves.
 *
 * `engagedUsers` is an intersection, so it cannot exceed `impressions` unless
 * the aggregation itself has regressed. Storage clamps such a row with
 * `least()` so one bad record does not fail a whole batch — but a clamp alone
 * would make the defect INVISIBLE, which is the opposite of what a clamp is
 * for. This is where it becomes visible: the row still goes (losing real data
 * is worse), and an operator reading the logs can see that it happened.
 */
export function reportInconsistentSnapshot(doc: CmsAnalyticsDailyDocument): boolean {
  if (doc.counters.engagedUsers <= doc.counters.impressions) return false;
  console.error("cms analytics snapshot is impossible — aggregation defect", {
    contentId: doc.contentId.slice(0, 120),
    placement: doc.placement,
    dayKey: doc.dayKey,
    impressions: doc.counters.impressions,
    engagedUsers: doc.counters.engagedUsers,
  });
  return true;
}

async function push(
  records: CmsAnalyticsMirrorRecord[],
  secret: string,
  eventId: string,
) {
  if (records.length === 0) return;
  await pushMirrorBatch({
    entityType: CMS_ANALYTICS_MIRROR_ENTITY_TYPE,
    records,
    secret,
    eventId,
  });
}

export const mirrorCmsAnalyticsOnWrite = onDocumentWritten(
  {
    document: `${CMS_ANALYTICS_DAILY_COLLECTION}/{docId}`,
    secrets: [CONTROL_CENTER_SYNC_SECRET],
    maxInstances: 5,
  },
  async (event) => {
    const secret = CONTROL_CENTER_SYNC_SECRET.value();
    if (!secret) return; // not configured yet — the reconciler catches up

    const after = event.data?.after;
    // Aggregates are never hard-deleted, and a missing document is not mirrored
    // as a delete: operational history must outlive the banner it describes.
    if (!after?.exists) return;

    const doc = readCmsAnalyticsDocument(after.data() as Record<string, unknown>);
    if (!doc) return;

    const eventId = cmsAnalyticsMirrorEventId(
      doc.contentId, doc.placement, doc.dayKey, doc.updatedAtMs,
    );
    if (!eventId) return;
    reportInconsistentSnapshot(doc);

    try {
      await push([toCmsAnalyticsMirrorRecord(doc)], secret, eventId);
    } catch (error) {
      console.error("cms analytics mirror push failed", {
        docId: event.params.docId.slice(0, 120),
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });
    }
  },
);

export const reconcileCmsAnalyticsMirrorDaily = onSchedule(
  {
    schedule: "47 4 * * *",
    timeZone: BUSINESS_TIMEZONE,
    secrets: [CONTROL_CENTER_SYNC_SECRET],
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 1,
  },
  async () => {
    const secret = CONTROL_CENTER_SYNC_SECRET.value();
    if (!secret) {
      console.warn("cms analytics mirror reconcile skipped: sync secret not configured");
      return;
    }

    // Yesterday and today only. Older days are already settled, and re-pushing
    // the whole table nightly would be a lot of traffic to say nothing new.
    const now = Date.now();
    const days = [businessDayKey(now - 86_400_000), businessDayKey(now)];
    let pushed = 0;

    const incomplete: string[] = [];
    let failedPushes = 0;

    for (const dayKey of days) {
      // CURSOR PAGINATION, not a single capped page. A flat `.limit(400)` meant
      // that the 401st aggregate of a busy day was never repaired and the job
      // still reported success — the rows most in need of repair are exactly
      // the ones a silent cap drops.
      let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      let pages = 0;

      for (;;) {
        if (pages >= RECONCILE_MAX_PAGES) {
          incomplete.push(dayKey);
          break;
        }
        let query = db.collection(CMS_ANALYTICS_DAILY_COLLECTION)
          .where("dayKey", "==", dayKey)
          // Ordered by document id so the cursor is stable and total: every row
          // is visited exactly once across pages.
          .orderBy("__name__")
          .limit(RECONCILE_PAGE);
        if (cursor) query = query.startAfter(cursor);

        const snap = await query.get();
        if (snap.empty) break;
        pages += 1;

        for (const rowDoc of snap.docs) {
          const doc = readCmsAnalyticsDocument(rowDoc.data() as Record<string, unknown>);
          if (!doc) continue;
          const eventId = cmsAnalyticsMirrorEventId(
            doc.contentId, doc.placement, doc.dayKey, doc.updatedAtMs,
          );
          if (!eventId) continue;
          reportInconsistentSnapshot(doc);
          try {
            await push([toCmsAnalyticsMirrorRecord(doc)], secret, eventId);
            pushed += 1;
          } catch (error) {
            failedPushes += 1;
            console.error("cms analytics mirror reconcile push failed", {
              docId: rowDoc.id.slice(0, 120),
              message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
            });
          }
        }

        if (snap.size < RECONCILE_PAGE) break;
        cursor = snap.docs[snap.docs.length - 1];
      }
    }

    console.log("cms analytics mirror reconcile", {days, pushed, failedPushes});

    if (incomplete.length > 0 || failedPushes > 0) {
      // Raised rather than logged. Unlike the aggregate reconciler this one
      // writes nothing locally — an unrepaired mirror row is stale, not
      // corrupt — but a run that could not finish must not report success.
      throw new Error(
        `cms analytics mirror reconcile incomplete: ` +
        `${incomplete.length > 0 ? `unscanned days ${incomplete.join(", ")}; ` : ""}` +
        `${failedPushes} push failure(s)`,
      );
    }
  },
);
