/**
 * WAVE 4 — Commercial Tools: promotion vocabulary.
 *
 * A promotion is a RESTAURANT offer, authored by an authorized merchant and
 * addressed by `canonicalPlaceId`. It is deliberately NOT the existing coupon
 * primitive: coupons are user-redeemable codes that grant a MakanMana plan
 * trial (`createCoupon` / `redeemCoupon`), a billing concept with no restaurant
 * identity. Nothing here touches that domain.
 *
 * Every constant lives in one place so rules, callables, mirror payloads and
 * the client cannot drift apart the way status strings did in Wave 3.
 */

export const PROMOTION_COLLECTION = "restaurant_promotions";

/**
 * STORED status — what a merchant/admin last asked for.
 *
 * The status a reader should act on is NOT this value: it is
 * `effectivePromotionStatus(stored, startsAt, endsAt, now)`, because time
 * alone can retire an offer. Storing the intent and deriving the truth keeps
 * expiry deterministic without a cron being on the critical path.
 */
export const PROMOTION_STATUS_DRAFT = "draft";
export const PROMOTION_STATUS_SCHEDULED = "scheduled";
export const PROMOTION_STATUS_ACTIVE = "active";
export const PROMOTION_STATUS_PAUSED = "paused";
export const PROMOTION_STATUS_EXPIRED = "expired";
export const PROMOTION_STATUS_ARCHIVED = "archived";

export const PROMOTION_STATUSES = [
  PROMOTION_STATUS_DRAFT,
  PROMOTION_STATUS_SCHEDULED,
  PROMOTION_STATUS_ACTIVE,
  PROMOTION_STATUS_PAUSED,
  PROMOTION_STATUS_EXPIRED,
  PROMOTION_STATUS_ARCHIVED,
] as const;

export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

export function isPromotionStatus(value: unknown): value is PromotionStatus {
  return typeof value === "string" &&
    (PROMOTION_STATUSES as readonly string[]).includes(value);
}

/** Statuses a merchant may request directly. Expiry is derived, never set. */
export const MERCHANT_SETTABLE_STATUSES = [
  PROMOTION_STATUS_DRAFT,
  PROMOTION_STATUS_SCHEDULED,
  PROMOTION_STATUS_ACTIVE,
  PROMOTION_STATUS_PAUSED,
  PROMOTION_STATUS_ARCHIVED,
] as const;

/** Terminal states: nothing may leave them. */
export const TERMINAL_STATUSES = [
  PROMOTION_STATUS_ARCHIVED,
] as const;

// ── OFFER SHAPE ────────────────────────────────────────────────────────────

/**
 * Offer types are descriptive only. MakanMana does NOT process payment or
 * redemption for restaurant offers in Wave 4 — no existing contract requires
 * it — so an offer carries a human-readable value, never a money movement.
 */
export const OFFER_TYPE_PERCENT = "percent_off";
export const OFFER_TYPE_AMOUNT = "amount_off";
export const OFFER_TYPE_BUNDLE = "bundle";
export const OFFER_TYPE_FREE_ITEM = "free_item";
export const OFFER_TYPE_OTHER = "other";

export const OFFER_TYPES = [
  OFFER_TYPE_PERCENT,
  OFFER_TYPE_AMOUNT,
  OFFER_TYPE_BUNDLE,
  OFFER_TYPE_FREE_ITEM,
  OFFER_TYPE_OTHER,
] as const;

export type OfferType = (typeof OFFER_TYPES)[number];

export function isOfferType(value: unknown): value is OfferType {
  return typeof value === "string" &&
    (OFFER_TYPES as readonly string[]).includes(value);
}

// ── ELIGIBILITY ────────────────────────────────────────────────────────────

/**
 * Eligibility is an EXPLICIT allowlist, never inferred behaviour.
 *
 * `all` is the baseline. `plan` reuses the already-authoritative entitlement
 * vocabulary (free/plus/pro) and nothing else — no location history, no taste
 * profile, no inferred demographics. Sensitive profiling is out of scope by
 * construction rather than by policy.
 */
export const ELIGIBILITY_ALL = "all";
export const ELIGIBILITY_PLAN = "plan";

export const ELIGIBILITY_AUDIENCES = [ELIGIBILITY_ALL, ELIGIBILITY_PLAN] as const;
export type EligibilityAudience = (typeof ELIGIBILITY_AUDIENCES)[number];

export const ELIGIBLE_PLANS = ["free", "plus", "pro"] as const;
export type EligiblePlan = (typeof ELIGIBLE_PLANS)[number];

export interface PromotionEligibility {
  audience: EligibilityAudience;
  /** Only meaningful when audience === 'plan'. Always sorted + deduped. */
  plans: EligiblePlan[];
}

export const DEFAULT_ELIGIBILITY: PromotionEligibility = {
  audience: ELIGIBILITY_ALL,
  plans: [],
};

// ── FIELD LIMITS ───────────────────────────────────────────────────────────

export const PROMOTION_TITLE_MAX = 80;
export const PROMOTION_DESCRIPTION_MAX = 240;
export const PROMOTION_TERMS_MAX = 500;
export const PROMOTION_OFFER_LABEL_MAX = 40;

/** Hard ceiling on how far ahead an offer may be scheduled (2 years). */
export const PROMOTION_MAX_WINDOW_MS = 2 * 365 * 24 * 60 * 60 * 1000;

/** Most active offers one restaurant may show publicly at once. */
export const PUBLIC_PROMOTIONS_LIMIT = 3;
