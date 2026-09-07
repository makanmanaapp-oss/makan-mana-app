import {defineSecret} from "firebase-functions/params";

import type {MenuCommentMirrorRecord, SocialPostMirrorRecord} from "../domain/restaurantEngagement/mirrorPayload";
import type {MirrorEntityType} from "../domain/restaurantEngagement/mirrorEvents";
import type {PromotionMirrorRecord} from "../domain/promotions/promotionMirrorPayload";

/**
 * Wave 3C corrective — the ONE shared Firebase → Control Center mirror transport.
 *
 * Reuses the EXISTING sync secret and the EXISTING /api/internal/sync/mirror
 * endpoint (no second endpoint, no second sync secret). Used by both the
 * event-driven triggers (primary freshness) and the manual/scheduled reconciler
 * (drift repair). Secrets are only ever an Authorization header — never logged,
 * never stored in an event record.
 */

export const CONTROL_CENTER_SYNC_SECRET = defineSecret("CONTROL_CENTER_SYNC_SECRET");
export const CONTROL_CENTER_MIRROR_URL =
  "https://makanmana-control-center.vercel.app/api/internal/sync/mirror";

export type MirrorRecord =
  | SocialPostMirrorRecord
  | MenuCommentMirrorRecord
  | PromotionMirrorRecord;

/**
 * POST one idempotent mirror batch. `eventId` is the idempotency key enforced by
 * the migration 0038 receipt contract: the same id with an identical payload is a
 * safe duplicate, while the same id with a conflicting payload is REJECTED
 * server-side rather than silently overwriting an unrelated event.
 */
export async function pushMirrorBatch(params: {
  entityType: MirrorEntityType | "restaurant_promotion";
  records: MirrorRecord[];
  secret: string;
  eventId: string;
}): Promise<void> {
  if (params.records.length === 0) return;
  const response = await fetch(CONTROL_CENTER_MIRROR_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${params.secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sourceSystem: "firebase",
      eventId: params.eventId,
      entityType: params.entityType,
      records: params.records,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Control Center engagement mirror rejected (${response.status}): ${detail}`);
  }
}
