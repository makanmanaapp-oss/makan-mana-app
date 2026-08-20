/**
 * PROMPT 7 — production broadcast fanout (pure logic).
 */
import assert from "node:assert/strict";
import {test} from "node:test";

import {
  audienceMatches,
  broadcastSourceEventId,
  canDeliverRun,
  classifyFailure,
  emptyMetrics,
  foldOutcome,
  isActive,
  isBroadcastableType,
  isClaimable,
  nextRunState,
} from "../broadcast";

// ── run state machine ────────────────────────────────────────────────────────
test("only queued is claimable; queued+delivering are active", () => {
  assert.equal(isClaimable("queued"), true);
  for (const s of ["delivering", "completed", "failed", "cancelled"] as const) assert.equal(isClaimable(s), false);
  assert.equal(isActive("queued"), true);
  assert.equal(isActive("delivering"), true);
  for (const s of ["completed", "failed", "cancelled"] as const) assert.equal(isActive(s), false);
});

// ── exactly-once identity per campaign VERSION ───────────────────────────────
test("sourceEventId is per campaign version; v and v+1 differ", () => {
  assert.equal(broadcastSourceEventId("c1", 3), "admin_broadcast:c1:v3");
  assert.equal(broadcastSourceEventId("c1", 3), broadcastSourceEventId("c1", 3));
  assert.notEqual(broadcastSourceEventId("c1", 3), broadcastSourceEventId("c1", 4));
  assert.notEqual(broadcastSourceEventId("c1", 3), broadcastSourceEventId("c2", 3));
});

// ── delivery gating (independent of global flags) ────────────────────────────
test("QA run requires qa gate AND the test_recipients audience", () => {
  assert.deepEqual(canDeliverRun("qa", "test_recipients", {productionEnabled: false, qaEnabled: true}), {allowed: true, reason: "qa"});
  assert.equal(canDeliverRun("qa", "test_recipients", {productionEnabled: true, qaEnabled: false}).allowed, false);
  assert.equal(canDeliverRun("qa", "all_eligible_users", {productionEnabled: true, qaEnabled: true}).allowed, false);
});
test("production run requires the production gate; qa gate is irrelevant", () => {
  assert.equal(canDeliverRun("production", "all_eligible_users", {productionEnabled: true, qaEnabled: false}).allowed, true);
  assert.equal(canDeliverRun("production", "all_eligible_users", {productionEnabled: false, qaEnabled: true}).allowed, false);
});

// ── admin type allowlist ─────────────────────────────────────────────────────
test("only the four admin types are broadcastable", () => {
  for (const t of ["system_announcement", "system_maintenance", "system_feature_update", "marketing_campaign"]) {
    assert.equal(isBroadcastableType(t), true, t);
  }
  for (const t of ["payment_issue", "account_security", "social_reaction", "meal_reminder", "group_invite", "x"]) {
    assert.equal(isBroadcastableType(t), false, t);
  }
});

// ── audience predicate ───────────────────────────────────────────────────────
test("audience: locale, terminal accounts, unavailable plan → null", () => {
  assert.equal(audienceMatches("all_eligible_users", {}), true);
  assert.equal(audienceMatches("locale_en", {language: "en"}), true);
  assert.equal(audienceMatches("locale_bm", {language: "ms"}), true);
  assert.equal(audienceMatches("locale_zh", {language: "en"}), false);
  // deleted/disabled never targeted regardless of audience
  assert.equal(audienceMatches("all_eligible_users", {deletedAt: 1}), false);
  assert.equal(audienceMatches("all_eligible_users", {disabled: true}), false);
  // plan without an authoritative source → null (worker refuses, UI shows N/A)
  assert.equal(audienceMatches("plan_pro", {}), null);
  assert.equal(audienceMatches("plan_pro", {plan: "pro"}), true);
  assert.equal(audienceMatches("plan_pro", {plan: "free"}), false);
  // app version
  assert.equal(audienceMatches("app_version", {appVersion: "5.2.0"}, {appVersionMin: "5.1.0"}), true);
  assert.equal(audienceMatches("app_version", {appVersion: "5.0.9"}, {appVersionMin: "5.1.0"}), false);
  assert.equal(audienceMatches("app_version", {}, {appVersionMin: "5.1.0"}), null);
});

// ── failure classification ───────────────────────────────────────────────────
test("terminal vs transient failure classification", () => {
  for (const m of ["recipient_ineligible", "user not found", "account deleted", "forbidden_admin_type", "invalid destination"]) {
    assert.equal(classifyFailure(m), "terminal", m);
  }
  for (const m of ["ECONNRESET", "deadline exceeded", "temporary quota", "aborted transaction"]) {
    assert.equal(classifyFailure(m), "transient", m);
  }
});

// ── metric folding (honest analytics; order-free) ────────────────────────────
test("foldOutcome aggregates canonical/push metrics correctly", () => {
  let m = emptyMetrics();
  m = foldOutcome(m, {recordStatus: "created", inAppVisible: true, push: {sent: 1, reason: "eligible"}});
  m = foldOutcome(m, {recordStatus: "created", inAppVisible: false, push: {sent: 0, reason: "suppressed_preference"}});
  m = foldOutcome(m, {recordStatus: "created", inAppVisible: true, push: {sent: 0, reason: "suppressed_quiet_hours"}});
  m = foldOutcome(m, {recordStatus: "duplicate"});
  m = foldOutcome(m, {recordStatus: "failed"});
  m = foldOutcome(m, {recordStatus: "created", inAppVisible: true, push: {sent: 0, reason: "no_device"}});
  assert.equal(m.processed, 6);
  assert.equal(m.canonicalCreated, 4);
  assert.equal(m.duplicateSkipped, 1);
  assert.equal(m.recipientFailed, 1);
  assert.equal(m.inAppHidden, 1);
  assert.equal(m.pushSent, 1);
  assert.equal(m.pushSuppressedPreference, 1);
  assert.equal(m.pushSuppressedQuietHours, 1);
  assert.equal(m.pushNotApplicable, 1);
});

test("nextRunState: exhausted → completed; per-recipient failure never fails the run", () => {
  assert.equal(nextRunState(true, false), "completed");
  assert.equal(nextRunState(false, false), "delivering");
  assert.equal(nextRunState(false, true), "delivering");
  assert.equal(nextRunState(true, true), "delivering"); // fatal recipient keeps run going, not failed
});
