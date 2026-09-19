import {defineSecret} from "firebase-functions/params";
import type {AnalyticsMirrorRecord} from "../domain/analytics/analyticsDocument";

import type {MenuCommentMirrorRecord, SocialPostMirrorRecord} from "../domain/restaurantEngagement/mirrorPayload";
import type {MirrorEntityType} from "../domain/restaurantEngagement/mirrorEvents";
import type {PromotionMirrorRecord} from "../domain/promotions/promotionMirrorPayload";
import type {CmsMirrorRecord} from "../domain/cms/cmsDocument";
import type {CmsAnalyticsMirrorRecord} from "../domain/cms/cmsAnalytics";
import type {CollectionMirrorRecord} from "../domain/cms/collectionDocument";

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
const PRODUCTION_CONTROL_CENTER_MIRROR =
  "https://makanmana-control-center.vercel.app/api/internal/sync/mirror";

/**
 * Where a mirror batch is pushed.
 *
 * Deployed functions ALWAYS push to production. The override exists so that a
 * function running inside the Firebase emulator - during isolated device QA -
 * cannot reach the production console, and it is fenced twice over:
 *
 *   - `FUNCTIONS_EMULATOR` is set by the emulator itself and is absent in every
 *     deployed environment, so production cannot be redirected by configuration;
 *   - the override must be loopback, so an isolated run cannot be pointed at
 *     some other host either.
 *
 * Anything that fails those checks falls back to production, which is the safe
 * direction for a deployed function and is unreachable for an isolated one,
 * because the emulator run has no route to production in the first place.
 */
export function resolveControlCenterMirrorUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env.CONTROL_CENTER_MIRROR_URL_OVERRIDE ?? "";
  const inEmulator = env.FUNCTIONS_EMULATOR === "true";
  if (inEmulator && override.startsWith("http://127.0.0.1:")) return override;
  return PRODUCTION_CONTROL_CENTER_MIRROR;
}

export const CONTROL_CENTER_MIRROR_URL = resolveControlCenterMirrorUrl();

export type MirrorRecord =
  | SocialPostMirrorRecord
  | MenuCommentMirrorRecord
  | PromotionMirrorRecord
  | CmsMirrorRecord
  | CollectionMirrorRecord
  | AnalyticsMirrorRecord
  | CmsAnalyticsMirrorRecord;

/**
 * POST one idempotent mirror batch. `eventId` is the idempotency key enforced by
 * the migration 0038 receipt contract: the same id with an identical payload is a
 * safe duplicate, while the same id with a conflicting payload is REJECTED
 * server-side rather than silently overwriting an unrelated event.
 */
export async function pushMirrorBatch(params: {
  entityType: MirrorEntityType | "restaurant_promotion" | "cms_content" | "cms_collection"
    | "merchant_analytics_daily" | "cms_analytics_daily";
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
