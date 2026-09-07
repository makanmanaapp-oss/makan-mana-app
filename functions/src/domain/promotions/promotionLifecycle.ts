/**
 * WAVE 4 — Commercial Tools: PURE promotion lifecycle.
 *
 * No Firestore, no clock, no I/O: every function takes `now` explicitly. That
 * is what makes expiry testable and, more importantly, what keeps the mobile
 * clock out of the security answer — the server passes its own `now`, and the
 * client only ever renders what the server already decided.
 *
 * Two ideas do the work:
 *
 *  1. STORED status is intent. EFFECTIVE status is truth. An offer whose
 *     window has closed is expired even if nobody wrote 'expired' to it, so an
 *     offer can never outlive `endsAt` because a scheduled job did not run.
 *  2. Transitions are validated against the EFFECTIVE status, so a merchant
 *     cannot resurrect a window that has already closed by asking for 'active'.
 */
import {
  DEFAULT_ELIGIBILITY,
  ELIGIBILITY_ALL,
  ELIGIBILITY_PLAN,
  ELIGIBLE_PLANS,
  MERCHANT_SETTABLE_STATUSES,
  PROMOTION_DESCRIPTION_MAX,
  PROMOTION_MAX_WINDOW_MS,
  PROMOTION_OFFER_LABEL_MAX,
  PROMOTION_STATUS_ACTIVE,
  PROMOTION_STATUS_ARCHIVED,
  PROMOTION_STATUS_DRAFT,
  PROMOTION_STATUS_EXPIRED,
  PROMOTION_STATUS_PAUSED,
  PROMOTION_STATUS_SCHEDULED,
  PROMOTION_TERMS_MAX,
  PROMOTION_TITLE_MAX,
  isOfferType,
  isPromotionStatus,
  type EligiblePlan,
  type OfferType,
  type PromotionEligibility,
  type PromotionStatus,
} from "./promotionTypes";

// ── EFFECTIVE STATUS ───────────────────────────────────────────────────────

/**
 * The status a reader must act on.
 *
 * `draft` and `archived` ignore time entirely — a draft is not "expired", it
 * was simply never scheduled, and an archived record is history. Everything
 * else is judged against the window.
 */
export function effectivePromotionStatus(
  stored: PromotionStatus,
  startsAtMs: number | null,
  endsAtMs: number | null,
  nowMs: number,
): PromotionStatus {
  if (stored === PROMOTION_STATUS_DRAFT) return PROMOTION_STATUS_DRAFT;
  if (stored === PROMOTION_STATUS_ARCHIVED) return PROMOTION_STATUS_ARCHIVED;
  if (stored === PROMOTION_STATUS_EXPIRED) return PROMOTION_STATUS_EXPIRED;

  // A window that has closed retires the offer regardless of stored intent.
  if (endsAtMs !== null && nowMs >= endsAtMs) return PROMOTION_STATUS_EXPIRED;

  if (stored === PROMOTION_STATUS_PAUSED) return PROMOTION_STATUS_PAUSED;

  // Both 'scheduled' and 'active' mean "should run in its window"; before the
  // window opens the honest answer is 'scheduled', inside it 'active'.
  if (startsAtMs !== null && nowMs < startsAtMs) return PROMOTION_STATUS_SCHEDULED;
  return PROMOTION_STATUS_ACTIVE;
}

/** Public visibility is exactly one effective status. Nothing else renders. */
export function isPubliclyVisible(
  stored: PromotionStatus,
  startsAtMs: number | null,
  endsAtMs: number | null,
  nowMs: number,
): boolean {
  return effectivePromotionStatus(stored, startsAtMs, endsAtMs, nowMs) ===
    PROMOTION_STATUS_ACTIVE;
}

// ── TRANSITIONS ────────────────────────────────────────────────────────────

/**
 * Allowed transitions keyed by the EFFECTIVE current status.
 *
 * `expired` may only be archived: an offer whose window closed is never
 * resurrected in place. Re-running it is a NEW promotion (clone), which keeps
 * the audit trail of what was actually shown to users intact.
 */
const TRANSITIONS: Record<PromotionStatus, readonly PromotionStatus[]> = {
  [PROMOTION_STATUS_DRAFT]: [
    PROMOTION_STATUS_SCHEDULED,
    PROMOTION_STATUS_ACTIVE,
    PROMOTION_STATUS_ARCHIVED,
  ],
  [PROMOTION_STATUS_SCHEDULED]: [
    PROMOTION_STATUS_ACTIVE,
    PROMOTION_STATUS_PAUSED,
    PROMOTION_STATUS_DRAFT,
    PROMOTION_STATUS_ARCHIVED,
  ],
  [PROMOTION_STATUS_ACTIVE]: [
    PROMOTION_STATUS_PAUSED,
    PROMOTION_STATUS_ARCHIVED,
  ],
  [PROMOTION_STATUS_PAUSED]: [
    PROMOTION_STATUS_ACTIVE,
    PROMOTION_STATUS_ARCHIVED,
  ],
  [PROMOTION_STATUS_EXPIRED]: [
    PROMOTION_STATUS_ARCHIVED,
  ],
  [PROMOTION_STATUS_ARCHIVED]: [],
};

export interface TransitionDecision {
  ok: boolean;
  /** Status to persist when ok. */
  next: PromotionStatus | null;
  reason: string;
}

function denyTransition(reason: string): TransitionDecision {
  return {ok: false, next: null, reason};
}

/**
 * Decide whether a requested status change is allowed RIGHT NOW.
 *
 * Judged against the effective status, so "resume a paused offer whose window
 * already closed" is rejected as a transition out of `expired`, which is the
 * honest description of what the caller is actually asking for.
 */
export function decidePromotionTransition(input: {
  stored: PromotionStatus;
  startsAtMs: number | null;
  endsAtMs: number | null;
  requested: PromotionStatus;
  nowMs: number;
}): TransitionDecision {
  if (!isPromotionStatus(input.requested)) return denyTransition("status_invalid");
  if (!(MERCHANT_SETTABLE_STATUSES as readonly string[]).includes(input.requested)) {
    // 'expired' is derived from the clock and may never be written directly.
    return denyTransition("status_not_settable");
  }

  const current = effectivePromotionStatus(
    input.stored, input.startsAtMs, input.endsAtMs, input.nowMs);

  if (current === input.requested) return denyTransition("status_unchanged");

  const allowed = TRANSITIONS[current] ?? [];
  if (!allowed.includes(input.requested)) {
    return denyTransition(`transition_not_allowed_${current}_to_${input.requested}`);
  }

  // Going live requires a window that is actually open.
  if (input.requested === PROMOTION_STATUS_ACTIVE) {
    if (input.endsAtMs !== null && input.nowMs >= input.endsAtMs) {
      return denyTransition("window_already_closed");
    }
  }

  return {ok: true, next: input.requested, reason: "ok"};
}

// ── FIELD VALIDATION ───────────────────────────────────────────────────────

export interface Validated<T> {
  ok: boolean;
  value: T | null;
  error: string;
}

function fail<T>(error: string): Validated<T> {
  return {ok: false, value: null, error};
}

function text(value: unknown, max: number, field: string, required: boolean): Validated<string> {
  if (value === undefined || value === null) {
    return required ? fail(`${field}_required`) : {ok: true, value: "", error: ""};
  }
  if (typeof value !== "string") return fail(`${field}_invalid`);
  const clean = value.trim();
  if (!clean) {
    return required ? fail(`${field}_required`) : {ok: true, value: "", error: ""};
  }
  if (clean.length > max) return fail(`${field}_too_long`);
  return {ok: true, value: clean, error: ""};
}

export function validateTitle(value: unknown): Validated<string> {
  return text(value, PROMOTION_TITLE_MAX, "title", true);
}

export function validateDescription(value: unknown): Validated<string> {
  return text(value, PROMOTION_DESCRIPTION_MAX, "description", false);
}

export function validateTerms(value: unknown): Validated<string> {
  return text(value, PROMOTION_TERMS_MAX, "terms", false);
}

export function validateOfferLabel(value: unknown): Validated<string> {
  return text(value, PROMOTION_OFFER_LABEL_MAX, "offer_label", false);
}

export function validateOfferType(value: unknown): Validated<OfferType> {
  if (!isOfferType(value)) return fail("offer_type_invalid");
  return {ok: true, value, error: ""};
}

/** Minimum spend in sen. Absent is valid; negative and non-integer are not. */
export function validateMinSpend(value: unknown): Validated<number | null> {
  if (value === undefined || value === null) return {ok: true, value: null, error: ""};
  if (typeof value !== "number" || !Number.isFinite(value)) return fail("min_spend_invalid");
  if (!Number.isInteger(value)) return fail("min_spend_invalid");
  if (value < 0) return fail("min_spend_invalid");
  if (value > 100_000_00) return fail("min_spend_too_large");
  return {ok: true, value, error: ""};
}

export interface Window {
  startsAtMs: number;
  endsAtMs: number;
}

/**
 * A promotion always carries a bounded window. Open-ended offers are refused
 * because "never expires" is exactly the state B4 forbids.
 */
export function validateWindow(
  startsAt: unknown,
  endsAt: unknown,
  nowMs: number,
): Validated<Window> {
  const start = toMillis(startsAt);
  const end = toMillis(endsAt);
  if (start === null) return fail("starts_at_required");
  if (end === null) return fail("ends_at_required");
  if (end <= start) return fail("window_invalid");
  if (end - start > PROMOTION_MAX_WINDOW_MS) return fail("window_too_long");
  // The end may not already be in the past: creating a dead offer is a mistake,
  // not a state worth persisting.
  if (end <= nowMs) return fail("window_already_closed");
  return {ok: true, value: {startsAtMs: start, endsAtMs: end}, error: ""};
}

/** Accepts epoch millis or an ISO-8601 string; rejects everything else. */
export function toMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function validateEligibility(value: unknown): Validated<PromotionEligibility> {
  if (value === undefined || value === null) {
    return {ok: true, value: DEFAULT_ELIGIBILITY, error: ""};
  }
  if (typeof value !== "object" || Array.isArray(value)) return fail("eligibility_invalid");
  const raw = value as Record<string, unknown>;
  const audience = raw.audience;

  if (audience === ELIGIBILITY_ALL || audience === undefined) {
    return {ok: true, value: DEFAULT_ELIGIBILITY, error: ""};
  }
  if (audience !== ELIGIBILITY_PLAN) return fail("eligibility_audience_invalid");

  const plans = raw.plans;
  if (!Array.isArray(plans) || plans.length === 0) return fail("eligibility_plans_required");
  const clean: EligiblePlan[] = [];
  for (const plan of plans) {
    if (typeof plan !== "string") return fail("eligibility_plans_invalid");
    if (!(ELIGIBLE_PLANS as readonly string[]).includes(plan)) {
      return fail("eligibility_plans_invalid");
    }
    if (!clean.includes(plan as EligiblePlan)) clean.push(plan as EligiblePlan);
  }
  clean.sort();
  // 'plan' covering every plan IS 'all'; storing it as 'all' keeps one
  // representation for one meaning.
  if (clean.length === ELIGIBLE_PLANS.length) {
    return {ok: true, value: DEFAULT_ELIGIBILITY, error: ""};
  }
  return {ok: true, value: {audience: ELIGIBILITY_PLAN, plans: clean}, error: ""};
}

/** Viewer-side eligibility check. Unknown viewer plan is treated as 'free'. */
export function viewerIsEligible(
  eligibility: PromotionEligibility | null | undefined,
  viewerPlan: unknown,
): boolean {
  if (!eligibility || eligibility.audience === ELIGIBILITY_ALL) return true;
  const plan = typeof viewerPlan === "string" && viewerPlan ? viewerPlan : "free";
  return eligibility.plans.includes(plan as EligiblePlan);
}
