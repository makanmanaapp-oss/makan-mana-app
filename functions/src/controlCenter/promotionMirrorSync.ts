import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";

import {db} from "../config/firebase";
import {PROMOTION_COLLECTION} from "../domain/promotions/promotionTypes";
import {
  PROMOTION_MIRROR_ENTITY_TYPE,
  promotionMirrorEventId,
  toPromotionMirrorRecord,
  type PromotionMirrorRecord,
} from "../domain/promotions/promotionMirrorPayload";
import {CONTROL_CENTER_SYNC_SECRET, pushMirrorBatch} from "./mirrorEventPush";

/**
 * WAVE 4 — narrow, read-only Firebase → Control Center promotion mirror.
 *
 * Reuses the EXISTING transport verbatim: CONTROL_CENTER_SYNC_SECRET, the one
 * /api/internal/sync/mirror endpoint, and idempotent eventId batches. No second
 * secret, no second endpoint.
 *
 * Two paths, same as the Wave 3C engagement mirror:
 *  - a document trigger for freshness, so an operator sees a change immediately;
 *  - a scheduled reconciler for drift repair, because a trigger that fails once
 *    must not leave the console permanently wrong.
 *
 * Firestore stays authoritative. The mirror can never write back, and it never
 * carries a merchant or admin identifier — the record builder does not read
 * those fields at all.
 *
 * A mirror failure must NEVER fail the authoritative write, so the trigger
 * swallows and logs its own errors: the reconciler is the safety net.
 *
 * NOT DEPLOYED.
 */

const RECONCILE_LIMIT = 400;

async function push(records: PromotionMirrorRecord[], secret: string, eventId: string) {
  if (records.length === 0) return;
  await pushMirrorBatch({
    entityType: PROMOTION_MIRROR_ENTITY_TYPE,
    records,
    secret,
    eventId,
  });
}

/**
 * Freshness path. Fires on every authoritative promotion write — merchant
 * callable or admin bridge alike, because both end at the same document, which
 * is exactly why the mirror cannot miss one plane.
 */
export const mirrorPromotionOnWrite = onDocumentWritten(
  {
    document: `${PROMOTION_COLLECTION}/{promotionId}`,
    secrets: [CONTROL_CENTER_SYNC_SECRET],
    maxInstances: 5,
  },
  async (event) => {
    const secret = CONTROL_CENTER_SYNC_SECRET.value();
    if (!secret) return; // not configured yet — the reconciler will catch up

    const after = event.data?.after;
    // A deleted promotion is not mirrored as a delete: nothing hard-deletes
    // promotions, and the mirror must keep operational history either way.
    if (!after?.exists) return;

    const promotionId = event.params.promotionId;
    const data = after.data() ?? null;
    const record = toPromotionMirrorRecord(promotionId, data, Date.now());
    if (!record) return;

    const eventId = promotionMirrorEventId(
      promotionId,
      typeof data?.updatedAtMs === "number" ? data.updatedAtMs : null,
    );
    if (!eventId) return;

    try {
      await push([record], secret, eventId);
    } catch (error) {
      // Never fail the authoritative write because the console is unreachable.
      console.error("promotion mirror push failed", {
        promotionId: promotionId.slice(0, 120),
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });
    }
  },
);

/**
 * Drift repair. Re-sends the most recently updated promotions on a schedule so
 * a transient transport failure is self-healing rather than permanent.
 *
 * Idempotency makes this safe: an unchanged promotion produces the same
 * eventId and the same payload, which the receipt contract records as a
 * duplicate rather than applying twice.
 */
export const reconcilePromotionMirrorDaily = onSchedule(
  {
    schedule: "17 4 * * *",
    timeZone: "Asia/Kuala_Lumpur",
    secrets: [CONTROL_CENTER_SYNC_SECRET],
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 1,
  },
  async () => {
    const secret = CONTROL_CENTER_SYNC_SECRET.value();
    if (!secret) throw new Error("CONTROL_CENTER_SYNC_SECRET is unavailable.");

    const snap = await db.collection(PROMOTION_COLLECTION)
      .orderBy("updatedAtMs", "desc")
      .limit(RECONCILE_LIMIT)
      .get();

    const nowMs = Date.now();
    const records: PromotionMirrorRecord[] = [];
    let latestStamp = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      const record = toPromotionMirrorRecord(doc.id, data, nowMs);
      if (!record) continue;
      records.push(record);
      const stamp = typeof data.updatedAtMs === "number" ? data.updatedAtMs : 0;
      if (stamp > latestStamp) latestStamp = stamp;
    }

    if (records.length === 0) return;

    // One batch id derived from the newest member: a run over an unchanged set
    // repeats the same id, so the receipt contract treats it as a duplicate.
    await push(records, secret, `promotion-reconcile:${latestStamp}:${records.length}`);
  },
);
