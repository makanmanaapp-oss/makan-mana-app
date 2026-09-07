/**
 * WAVE 4 — promotion lifecycle contract.
 *
 * The security-relevant claims live here rather than in the callable, because
 * these are the decisions: what is publicly visible, what may transition to
 * what, and whether time alone can retire an offer.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  decidePromotionTransition,
  effectivePromotionStatus,
  isPubliclyVisible,
  toMillis,
  validateEligibility,
  validateMinSpend,
  validateOfferType,
  validateTitle,
  validateWindow,
  viewerIsEligible,
} from "../promotionLifecycle";
import {
  DEFAULT_ELIGIBILITY,
  PROMOTION_STATUS_ACTIVE,
  PROMOTION_STATUS_ARCHIVED,
  PROMOTION_STATUS_DRAFT,
  PROMOTION_STATUS_EXPIRED,
  PROMOTION_STATUS_PAUSED,
  PROMOTION_STATUS_SCHEDULED,
} from "../promotionTypes";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);

test("effective status: an open window with active intent is active", () => {
  assert.equal(
    effectivePromotionStatus(PROMOTION_STATUS_ACTIVE, NOW - HOUR, NOW + HOUR, NOW),
    PROMOTION_STATUS_ACTIVE,
  );
});

test("effective status: time alone expires an offer, no writer needed", () => {
  // The stored intent still says 'active'; the window closed an hour ago.
  assert.equal(
    effectivePromotionStatus(PROMOTION_STATUS_ACTIVE, NOW - 3 * HOUR, NOW - HOUR, NOW),
    PROMOTION_STATUS_EXPIRED,
  );
  // A paused offer whose window closed is expired, not paused.
  assert.equal(
    effectivePromotionStatus(PROMOTION_STATUS_PAUSED, NOW - 3 * HOUR, NOW - HOUR, NOW),
    PROMOTION_STATUS_EXPIRED,
  );
});

test("effective status: before the window opens the honest answer is scheduled", () => {
  assert.equal(
    effectivePromotionStatus(PROMOTION_STATUS_ACTIVE, NOW + HOUR, NOW + 2 * HOUR, NOW),
    PROMOTION_STATUS_SCHEDULED,
  );
});

test("effective status: draft and archived ignore the clock entirely", () => {
  assert.equal(
    effectivePromotionStatus(PROMOTION_STATUS_DRAFT, NOW - 3 * HOUR, NOW - HOUR, NOW),
    PROMOTION_STATUS_DRAFT,
    "a draft was never scheduled, so it is not 'expired'",
  );
  assert.equal(
    effectivePromotionStatus(PROMOTION_STATUS_ARCHIVED, NOW - HOUR, NOW + HOUR, NOW),
    PROMOTION_STATUS_ARCHIVED,
  );
});

test("public visibility is exactly active — nothing else renders", () => {
  assert.equal(isPubliclyVisible(PROMOTION_STATUS_ACTIVE, NOW - HOUR, NOW + HOUR, NOW), true);
  assert.equal(isPubliclyVisible(PROMOTION_STATUS_DRAFT, NOW - HOUR, NOW + HOUR, NOW), false);
  assert.equal(isPubliclyVisible(PROMOTION_STATUS_PAUSED, NOW - HOUR, NOW + HOUR, NOW), false);
  assert.equal(isPubliclyVisible(PROMOTION_STATUS_SCHEDULED, NOW + HOUR, NOW + 2 * HOUR, NOW), false);
  assert.equal(isPubliclyVisible(PROMOTION_STATUS_ACTIVE, NOW - 3 * HOUR, NOW - HOUR, NOW), false);
  assert.equal(isPubliclyVisible(PROMOTION_STATUS_ARCHIVED, NOW - HOUR, NOW + HOUR, NOW), false);
});

test("visibility flips exactly AT endsAt, not a millisecond later", () => {
  const ends = NOW + HOUR;
  assert.equal(isPubliclyVisible(PROMOTION_STATUS_ACTIVE, NOW, ends, ends - 1), true);
  assert.equal(isPubliclyVisible(PROMOTION_STATUS_ACTIVE, NOW, ends, ends), false);
});

// ── TRANSITIONS ────────────────────────────────────────────────────────────

test("draft may be scheduled, activated or archived", () => {
  for (const requested of [PROMOTION_STATUS_SCHEDULED, PROMOTION_STATUS_ACTIVE, PROMOTION_STATUS_ARCHIVED] as const) {
    const d = decidePromotionTransition({
      stored: PROMOTION_STATUS_DRAFT, startsAtMs: NOW, endsAtMs: NOW + HOUR,
      requested, nowMs: NOW,
    });
    assert.equal(d.ok, true, `draft -> ${requested} must be allowed: ${d.reason}`);
  }
});

test("pause and resume are both allowed while the window is still open", () => {
  const pause = decidePromotionTransition({
    stored: PROMOTION_STATUS_ACTIVE, startsAtMs: NOW - HOUR, endsAtMs: NOW + HOUR,
    requested: PROMOTION_STATUS_PAUSED, nowMs: NOW,
  });
  assert.equal(pause.ok, true, pause.reason);
  const resume = decidePromotionTransition({
    stored: PROMOTION_STATUS_PAUSED, startsAtMs: NOW - HOUR, endsAtMs: NOW + HOUR,
    requested: PROMOTION_STATUS_ACTIVE, nowMs: NOW,
  });
  assert.equal(resume.ok, true, resume.reason);
});

test("resume is refused once the window has closed", () => {
  const d = decidePromotionTransition({
    stored: PROMOTION_STATUS_PAUSED, startsAtMs: NOW - 3 * HOUR, endsAtMs: NOW - HOUR,
    requested: PROMOTION_STATUS_ACTIVE, nowMs: NOW,
  });
  assert.equal(d.ok, false);
  // Judged from the EFFECTIVE state, so the reason names 'expired' honestly.
  assert.match(d.reason, /expired/);
});

test("an expired offer can never be resurrected in place", () => {
  for (const requested of [PROMOTION_STATUS_ACTIVE, PROMOTION_STATUS_SCHEDULED, PROMOTION_STATUS_PAUSED, PROMOTION_STATUS_DRAFT] as const) {
    const d = decidePromotionTransition({
      stored: PROMOTION_STATUS_ACTIVE, startsAtMs: NOW - 3 * HOUR, endsAtMs: NOW - HOUR,
      requested, nowMs: NOW,
    });
    assert.equal(d.ok, false, `expired -> ${requested} must be refused`);
  }
  // Archiving history is the one allowed move.
  const archive = decidePromotionTransition({
    stored: PROMOTION_STATUS_ACTIVE, startsAtMs: NOW - 3 * HOUR, endsAtMs: NOW - HOUR,
    requested: PROMOTION_STATUS_ARCHIVED, nowMs: NOW,
  });
  assert.equal(archive.ok, true, archive.reason);
});

test("archived is terminal", () => {
  for (const requested of [PROMOTION_STATUS_ACTIVE, PROMOTION_STATUS_DRAFT, PROMOTION_STATUS_PAUSED] as const) {
    const d = decidePromotionTransition({
      stored: PROMOTION_STATUS_ARCHIVED, startsAtMs: NOW - HOUR, endsAtMs: NOW + HOUR,
      requested, nowMs: NOW,
    });
    assert.equal(d.ok, false, `archived -> ${requested} must be refused`);
  }
});

test("'expired' may never be written directly — it is derived", () => {
  const d = decidePromotionTransition({
    stored: PROMOTION_STATUS_ACTIVE, startsAtMs: NOW - HOUR, endsAtMs: NOW + HOUR,
    requested: PROMOTION_STATUS_EXPIRED, nowMs: NOW,
  });
  assert.equal(d.ok, false);
  assert.equal(d.reason, "status_not_settable");
});

test("a no-op transition is refused rather than silently written", () => {
  const d = decidePromotionTransition({
    stored: PROMOTION_STATUS_ACTIVE, startsAtMs: NOW - HOUR, endsAtMs: NOW + HOUR,
    requested: PROMOTION_STATUS_ACTIVE, nowMs: NOW,
  });
  assert.equal(d.ok, false);
  assert.equal(d.reason, "status_unchanged");
});

// ── VALIDATION ─────────────────────────────────────────────────────────────

test("window must be bounded, ordered and not already closed", () => {
  assert.equal(validateWindow(NOW, NOW + HOUR, NOW).ok, true);
  assert.equal(validateWindow(undefined, NOW + HOUR, NOW).error, "starts_at_required");
  assert.equal(validateWindow(NOW, undefined, NOW).error, "ends_at_required");
  assert.equal(validateWindow(NOW + HOUR, NOW, NOW).error, "window_invalid");
  assert.equal(validateWindow(NOW, NOW, NOW).error, "window_invalid");
  assert.equal(validateWindow(NOW - 3 * HOUR, NOW - HOUR, NOW).error, "window_already_closed");
  assert.equal(validateWindow(NOW, NOW + 3 * 365 * 24 * HOUR, NOW).error, "window_too_long");
});

test("window accepts ISO strings and epoch millis, rejects junk", () => {
  assert.equal(toMillis(1757332800000), 1757332800000);
  assert.equal(toMillis("2026-09-08T12:00:00.000Z"), Date.UTC(2026, 8, 8, 12));
  assert.equal(toMillis("not a date"), null);
  assert.equal(toMillis(1.5), null);
  assert.equal(toMillis(null), null);
  assert.equal(toMillis({}), null);
});

test("title is required and bounded", () => {
  assert.equal(validateTitle("Set lunch RM12").ok, true);
  assert.equal(validateTitle("   ").error, "title_required");
  assert.equal(validateTitle(undefined).error, "title_required");
  assert.equal(validateTitle("x".repeat(81)).error, "title_too_long");
  assert.equal(validateTitle(42).error, "title_invalid");
});

test("offer type is an allowlist", () => {
  assert.equal(validateOfferType("percent_off").ok, true);
  assert.equal(validateOfferType("free_money").error, "offer_type_invalid");
});

test("minimum spend is a non-negative integer in sen, or absent", () => {
  assert.equal(validateMinSpend(undefined).value, null);
  assert.equal(validateMinSpend(1200).value, 1200);
  assert.equal(validateMinSpend(-1).error, "min_spend_invalid");
  assert.equal(validateMinSpend(12.5).error, "min_spend_invalid");
  assert.equal(validateMinSpend("1200").error, "min_spend_invalid");
});

// ── ELIGIBILITY ────────────────────────────────────────────────────────────

test("eligibility defaults to everyone", () => {
  assert.deepEqual(validateEligibility(undefined).value, DEFAULT_ELIGIBILITY);
  assert.deepEqual(validateEligibility({audience: "all"}).value, DEFAULT_ELIGIBILITY);
});

test("plan eligibility is an allowlist, deduped and sorted", () => {
  const v = validateEligibility({audience: "plan", plans: ["pro", "plus", "pro"]});
  assert.equal(v.ok, true);
  assert.deepEqual(v.value, {audience: "plan", plans: ["plus", "pro"]});
});

test("plan eligibility covering every plan collapses back to 'all'", () => {
  const v = validateEligibility({audience: "plan", plans: ["free", "plus", "pro"]});
  assert.deepEqual(v.value, DEFAULT_ELIGIBILITY,
    "one meaning must have one representation");
});

test("unknown audiences and plans are refused, never ignored", () => {
  assert.equal(validateEligibility({audience: "nearby_users"}).error, "eligibility_audience_invalid");
  assert.equal(validateEligibility({audience: "plan", plans: []}).error, "eligibility_plans_required");
  assert.equal(validateEligibility({audience: "plan", plans: ["vip"]}).error, "eligibility_plans_invalid");
});

test("viewer eligibility: 'all' always passes, plan gate is exact", () => {
  assert.equal(viewerIsEligible(DEFAULT_ELIGIBILITY, "free"), true);
  assert.equal(viewerIsEligible({audience: "plan", plans: ["pro"]}, "pro"), true);
  assert.equal(viewerIsEligible({audience: "plan", plans: ["pro"]}, "free"), false);
  // An unknown viewer plan is treated as free, so a paid-only offer stays hidden.
  assert.equal(viewerIsEligible({audience: "plan", plans: ["pro"]}, null), false);
  assert.equal(viewerIsEligible({audience: "plan", plans: ["pro"]}, ""), false);
});
