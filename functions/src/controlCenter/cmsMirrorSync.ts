import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";

import {db} from "../config/firebase";
import {CMS_COLLECTION} from "../domain/cms/cmsTypes";
import {
  CMS_MIRROR_ENTITY_TYPE,
  cmsMirrorEventId,
  toCmsMirrorRecord,
  type CmsMirrorRecord,
} from "../domain/cms/cmsDocument";
import {CONTROL_CENTER_SYNC_SECRET, pushMirrorBatch} from "./mirrorEventPush";

/**
 * WAVE 5 — narrow Firebase → Control Center CMS mirror.
 *
 * Reuses the existing transport verbatim (CONTROL_CENTER_SYNC_SECRET, the one
 * /api/internal/sync/mirror endpoint, idempotent eventId batches), exactly as
 * the Wave 3C engagement and Wave 4 promotion mirrors do. No new secret, no new
 * endpoint.
 *
 * Trigger for freshness, scheduled reconciler for drift repair. A mirror
 * failure never fails the authoritative write.
 *
 * NOT DEPLOYED.
 */

const RECONCILE_LIMIT = 400;

async function push(records: CmsMirrorRecord[], secret: string, eventId: string) {
  if (records.length === 0) return;
  await pushMirrorBatch({
    entityType: CMS_MIRROR_ENTITY_TYPE,
    records,
    secret,
    eventId,
  });
}

export const mirrorCmsContentOnWrite = onDocumentWritten(
  {
    document: `${CMS_COLLECTION}/{contentId}`,
    secrets: [CONTROL_CENTER_SYNC_SECRET],
    maxInstances: 5,
  },
  async (event) => {
    const secret = CONTROL_CENTER_SYNC_SECRET.value();
    if (!secret) return; // not configured yet — the reconciler catches up

    const after = event.data?.after;
    // Nothing hard-deletes CMS rows; a missing document is not mirrored as a
    // delete, because operational history must outlive the content.
    if (!after?.exists) return;

    const contentId = event.params.contentId;
    const data = after.data() ?? null;
    const record = toCmsMirrorRecord(contentId, data, Date.now());
    if (!record) return;

    const eventId = cmsMirrorEventId(
      contentId,
      typeof data?.updatedAtMs === "number" ? data.updatedAtMs : null,
    );
    if (!eventId) return;

    try {
      await push([record], secret, eventId);
    } catch (error) {
      console.error("cms mirror push failed", {
        contentId: contentId.slice(0, 120),
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });
    }
  },
);

export const reconcileCmsMirrorDaily = onSchedule(
  {
    schedule: "32 4 * * *",
    timeZone: "Asia/Kuala_Lumpur",
    secrets: [CONTROL_CENTER_SYNC_SECRET],
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 1,
  },
  async () => {
    const secret = CONTROL_CENTER_SYNC_SECRET.value();
    if (!secret) throw new Error("CONTROL_CENTER_SYNC_SECRET is unavailable.");

    const snap = await db.collection(CMS_COLLECTION)
      .orderBy("updatedAtMs", "desc")
      .limit(RECONCILE_LIMIT)
      .get();

    const nowMs = Date.now();
    const records: CmsMirrorRecord[] = [];
    let latestStamp = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      const record = toCmsMirrorRecord(doc.id, data, nowMs);
      if (!record) continue;
      records.push(record);
      const stamp = typeof data.updatedAtMs === "number" ? data.updatedAtMs : 0;
      if (stamp > latestStamp) latestStamp = stamp;
    }
    if (records.length === 0) return;

    await push(records, secret, `cms-reconcile:${latestStamp}:${records.length}`);
  },
);
