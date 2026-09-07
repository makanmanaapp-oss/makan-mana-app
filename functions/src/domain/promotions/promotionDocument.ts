/**
 * WAVE 4 — Commercial Tools: PURE document shaping.
 *
 * Two projections, and the difference between them is the whole point:
 *
 *  - the STORED document keeps the acting merchant uid, the request id and the
 *    admin reason, because that is what an audit needs;
 *  - the PUBLIC projection is built by an explicit allowlist, so a field added
 *    to storage later cannot leak to mobile by being forgotten. Wave 3 proved
 *    the opposite approach (strip-the-bad-fields) fails silently.
 */
import {
  DEFAULT_ELIGIBILITY,
  PROMOTION_STATUS_DRAFT,
  type OfferType,
  type PromotionEligibility,
  type PromotionStatus,
} from "./promotionTypes";
import {effectivePromotionStatus} from "./promotionLifecycle";

export interface PromotionInput {
  canonicalPlaceId: string;
  restaurantDisplayName: string;
  title: string;
  description: string;
  terms: string;
  offerType: OfferType;
  offerLabel: string;
  minSpendSen: number | null;
  eligibility: PromotionEligibility;
  startsAtMs: number;
  endsAtMs: number;
  status: PromotionStatus;
  /** Internal audit only — NEVER part of the public projection. */
  actorUid: string;
  requestId: string;
}

/**
 * The stored document, minus server timestamps which the caller adds with
 * FieldValue so time is never client-controlled.
 */
export function buildPromotionDocument(input: PromotionInput): Record<string, unknown> {
  return {
    schemaVersion: 1,
    canonicalPlaceId: input.canonicalPlaceId,
    restaurantDisplayName: input.restaurantDisplayName,
    title: input.title,
    description: input.description,
    terms: input.terms,
    offerType: input.offerType,
    offerLabel: input.offerLabel,
    minSpendSen: input.minSpendSen,
    eligibility: {
      audience: input.eligibility.audience,
      plans: input.eligibility.plans,
    },
    startsAtMs: input.startsAtMs,
    endsAtMs: input.endsAtMs,
    status: input.status,
    // Audit block — internal plane only.
    createdByUid: input.actorUid,
    updatedByUid: input.actorUid,
    createdByRequestId: input.requestId,
    updatedByRequestId: input.requestId,
    publishedAtMs: input.status === PROMOTION_STATUS_DRAFT ? null : input.startsAtMs,
    expiredAtMs: null,
    archivedAtMs: null,
  };
}

/** Fields a merchant edit may change. Anything else is ignored by construction. */
export const MERCHANT_EDITABLE_FIELDS = [
  "title",
  "description",
  "terms",
  "offerType",
  "offerLabel",
  "minSpendSen",
  "eligibility",
  "startsAtMs",
  "endsAtMs",
] as const;

// ── PUBLIC PROJECTION ──────────────────────────────────────────────────────

export interface PublicPromotion {
  promotionId: string;
  canonicalPlaceId: string;
  title: string;
  description: string;
  terms: string;
  offerType: string;
  offerLabel: string;
  minSpendSen: number | null;
  eligibility: PromotionEligibility;
  startsAtMs: number;
  endsAtMs: number;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function eligibilityOf(value: unknown): PromotionEligibility {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_ELIGIBILITY;
  const raw = value as Record<string, unknown>;
  const plans = Array.isArray(raw.plans)
    ? raw.plans.filter((p): p is string => typeof p === "string")
    : [];
  return raw.audience === "plan" && plans.length > 0
    ? {audience: "plan", plans: plans as PromotionEligibility["plans"]}
    : DEFAULT_ELIGIBILITY;
}

/**
 * Build the mobile-facing projection by ALLOWLIST.
 *
 * Returns null when the document is not fit to show: no id, no window, or a
 * missing/invalid canonical identity. A caller must not have to remember to
 * check — an unshowable offer simply has no public form.
 */
export function toPublicPromotion(
  promotionId: string,
  data: Record<string, unknown> | null | undefined,
): PublicPromotion | null {
  if (!data) return null;
  const id = promotionId.trim();
  if (!id) return null;
  const canonicalPlaceId = str(data.canonicalPlaceId).trim();
  if (!canonicalPlaceId) return null;
  const title = str(data.title).trim();
  if (!title) return null;
  const startsAtMs = num(data.startsAtMs);
  const endsAtMs = num(data.endsAtMs);
  if (startsAtMs === null || endsAtMs === null) return null;

  return {
    promotionId: id,
    canonicalPlaceId,
    title,
    description: str(data.description),
    terms: str(data.terms),
    offerType: str(data.offerType),
    offerLabel: str(data.offerLabel),
    minSpendSen: num(data.minSpendSen),
    eligibility: eligibilityOf(data.eligibility),
    startsAtMs,
    endsAtMs,
  };
}

/**
 * The merchant-facing projection: everything public PLUS the truthful status
 * the merchant must act on, and still WITHOUT any actor uid. A merchant does
 * not need to know which of their colleagues last edited a row, and exposing
 * it would put a real person's uid on a screen.
 */
export interface MerchantPromotion extends PublicPromotion {
  status: PromotionStatus;
  storedStatus: PromotionStatus;
  createdAtMs: number | null;
  updatedAtMs: number | null;
}

export function toMerchantPromotion(
  promotionId: string,
  data: Record<string, unknown> | null | undefined,
  nowMs: number,
): MerchantPromotion | null {
  const base = toPublicPromotion(promotionId, data);
  if (!base || !data) return null;
  const stored = str(data.status) as PromotionStatus;
  return {
    ...base,
    storedStatus: stored,
    status: effectivePromotionStatus(stored, base.startsAtMs, base.endsAtMs, nowMs),
    createdAtMs: num(data.createdAtMs),
    updatedAtMs: num(data.updatedAtMs),
  };
}
