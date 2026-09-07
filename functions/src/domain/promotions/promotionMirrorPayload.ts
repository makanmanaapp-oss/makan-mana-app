/**
 * WAVE 4 — PURE promotion mirror record.
 *
 * The Control Center needs enough to search, oversee and audit; it does not
 * need to know which person pressed a button. The acting merchant uid and the
 * acting admin id are therefore absent BY CONSTRUCTION, not stripped: the
 * builder never reads them, so a future field added to the stored document
 * cannot leak into a mirror batch by being forgotten.
 *
 * `effectiveStatus` is carried alongside the stored status so the console can
 * show the truth immediately, and re-derive it anyway at read time — a mirror
 * that lags must never make an expired offer look live.
 */
import {effectivePromotionStatus} from "./promotionLifecycle";
import {
  PROMOTION_STATUS_DRAFT,
  type PromotionStatus,
} from "./promotionTypes";

export const PROMOTION_MIRROR_ENTITY_TYPE = "restaurant_promotion";

export interface PromotionMirrorRecord {
  promotion_id: string;
  canonical_place_id: string;
  restaurant_display_name: string | null;
  title: string;
  description: string | null;
  terms: string | null;
  offer_type: string | null;
  offer_label: string | null;
  min_spend_sen: number | null;
  eligibility_audience: string;
  eligibility_plans: string[];
  status: PromotionStatus;
  effective_status: PromotionStatus;
  starts_at_ms: number | null;
  ends_at_ms: number | null;
  published_at_ms: number | null;
  archived_at_ms: number | null;
  last_request_id: string | null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullable(value: unknown): string | null {
  const text = str(value).trim();
  return text ? text : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Build one mirror record, or null when the document cannot be mirrored
 * truthfully. Migration 0039 refuses rows missing any of these four, so a
 * record that would be silently dropped there is never sent.
 */
export function toPromotionMirrorRecord(
  promotionId: string,
  data: Record<string, unknown> | null | undefined,
  nowMs: number,
): PromotionMirrorRecord | null {
  if (!data) return null;
  const id = promotionId.trim();
  const canonicalPlaceId = str(data.canonicalPlaceId).trim();
  const title = str(data.title).trim();
  const stored = str(data.status).trim() as PromotionStatus;
  if (!id || !canonicalPlaceId || !title || !stored) return null;

  const startsAtMs = num(data.startsAtMs);
  const endsAtMs = num(data.endsAtMs);

  const eligibility = data.eligibility;
  const audience = eligibility && typeof eligibility === "object" && !Array.isArray(eligibility)
    ? str((eligibility as Record<string, unknown>).audience) || "all"
    : "all";
  const plansRaw = eligibility && typeof eligibility === "object" && !Array.isArray(eligibility)
    ? (eligibility as Record<string, unknown>).plans
    : null;
  const plans = Array.isArray(plansRaw)
    ? plansRaw.filter((p): p is string => typeof p === "string")
    : [];

  return {
    promotion_id: id,
    canonical_place_id: canonicalPlaceId,
    restaurant_display_name: nullable(data.restaurantDisplayName),
    title,
    description: nullable(data.description),
    terms: nullable(data.terms),
    offer_type: nullable(data.offerType),
    offer_label: nullable(data.offerLabel),
    min_spend_sen: num(data.minSpendSen),
    eligibility_audience: audience === "plan" && plans.length > 0 ? "plan" : "all",
    eligibility_plans: plans,
    status: stored,
    effective_status: effectivePromotionStatus(
      stored || PROMOTION_STATUS_DRAFT, startsAtMs, endsAtMs, nowMs),
    starts_at_ms: startsAtMs,
    ends_at_ms: endsAtMs,
    published_at_ms: num(data.publishedAtMs),
    archived_at_ms: num(data.archivedAtMs),
    // Correlates a console command with its Firebase event WITHOUT naming a
    // person. The who lives in the Firebase event log and merchant_admin_audit.
    last_request_id: nullable(data.updatedByRequestId),
  };
}

/**
 * Deterministic mirror event id.
 *
 * The id is the idempotency key on the Supabase side, so it must be stable for
 * the same state and different for a new one: replaying the same change is a
 * safe duplicate, while a genuine later change is a new event.
 */
export function promotionMirrorEventId(
  promotionId: string,
  updatedAtMs: unknown,
): string | null {
  const id = promotionId.trim();
  if (!id) return null;
  const stamp = typeof updatedAtMs === "number" && Number.isFinite(updatedAtMs)
    ? Math.trunc(updatedAtMs)
    : null;
  if (stamp === null) return null;
  return `promotion:${id}:${stamp}`;
}
