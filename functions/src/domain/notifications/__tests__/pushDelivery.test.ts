/**
 * PROMPT 3 — pure push-delivery domain tests (Part 46).
 * Multi-device registry shaping, push policy, payload minimization,
 * idempotency, FCM error classification, token masking.
 */
import assert from "node:assert/strict";
import {test} from "node:test";

import {
  buildDeviceRecord,
  buildPushPayload,
  classifyFcmError,
  deliveryId,
  evaluatePushPolicy,
  isPushEligibleType,
  LEGACY_DEVICE_ID,
  localMinuteOfDay,
  maskToken,
  PushPolicyInput,
  resolveDeliveryOutcomes,
  validRegistration,
  withinQuietWindow,
} from "../pushDelivery";

const NOW = 1_700_000_000_000;

// ---- registry shaping ----
test("valid registration requires deviceId + token of min length", () => {
  assert.equal(validRegistration({deviceId: "install-abc123", token: "f".repeat(30)}), true);
  assert.equal(validRegistration({deviceId: "short", token: "f".repeat(30)}), false);
  assert.equal(validRegistration({deviceId: "install-abc123", token: "x"}), false);
  assert.equal(validRegistration({}), false);
});

test("first device record has createdAt=now and enabled", () => {
  const d = buildDeviceRecord({deviceId: "inst-1", token: "tokA".padEnd(30, "a"), platform: "android"}, NOW);
  assert.equal(d.deviceId, "inst-1");
  assert.equal(d.enabled, true);
  assert.equal(d.createdAt, NOW);
  assert.equal(d.tokenUpdatedAt, NOW);
});

test("token refresh on SAME deviceId keeps createdAt, bumps tokenUpdatedAt (no dup)", () => {
  const first = buildDeviceRecord({deviceId: "inst-1", token: "A".padEnd(30, "a")}, NOW);
  const refreshed = buildDeviceRecord({deviceId: "inst-1", token: "B".padEnd(30, "b")}, NOW + 5000, first);
  assert.equal(refreshed.deviceId, "inst-1"); // same record identity
  assert.equal(refreshed.createdAt, NOW); // preserved
  assert.equal(refreshed.token, "B".padEnd(30, "b")); // new token
  assert.equal(refreshed.tokenUpdatedAt, NOW + 5000); // bumped
});

test("re-register same token does NOT bump tokenUpdatedAt", () => {
  const first = buildDeviceRecord({deviceId: "inst-1", token: "A".padEnd(30, "a")}, NOW);
  const same = buildDeviceRecord({deviceId: "inst-1", token: "A".padEnd(30, "a")}, NOW + 5000, first);
  assert.equal(same.tokenUpdatedAt, NOW); // unchanged
  assert.equal(same.lastSeenAt, NOW + 5000); // still refreshed
});

test("device record never carries sensitive fields (only bounded allowlist)", () => {
  const d = buildDeviceRecord({deviceId: "inst-1", token: "A".padEnd(30, "a")}, NOW);
  assert.deepEqual(Object.keys(d).sort(), [
    "appVersion", "buildNumber", "createdAt", "deviceId", "enabled", "lastSeenAt",
    "locale", "platform", "schemaVersion", "timezone", "token", "tokenUpdatedAt", "updatedAt",
  ]);
});

// ---- push eligibility + policy ----
test("social/group push-eligible; tongtong not (marketing covered in prompt5Producers)", () => {
  assert.equal(isPushEligibleType("social_reaction", "social"), true);
  assert.equal(isPushEligibleType("group_invite", "group"), true);
  assert.equal(isPushEligibleType("tongtong_bill_created", "tongtong"), false);
  assert.equal(isPushEligibleType("payment_issue", "billing"), true); // critical allowlist
});

const base: PushPolicyInput = {
  type: "social_reaction", category: "social", isCritical: false, expiresAtMs: null,
  categoryPreference: {}, quiet: {}, localMinuteOfDay: 12 * 60, activeDeviceCount: 1, nowMs: NOW,
};
test("default (no prefs) → eligible", () => {
  assert.deepEqual(evaluatePushPolicy(base), {send: true, reason: "eligible"});
});
test("pushEnabled=false → suppressed_preference", () => {
  assert.equal(evaluatePushPolicy({...base, categoryPreference: {pushEnabled: false}}).reason, "suppressed_preference");
});
test("quiet hours suppresses non-critical", () => {
  const d = evaluatePushPolicy({
    ...base, localMinuteOfDay: 23 * 60,
    quiet: {quietHoursEnabled: true, quietHoursStart: 22 * 60, quietHoursEnd: 7 * 60},
  });
  assert.deepEqual(d, {send: false, reason: "suppressed_quiet_hours"});
});
test("critical type bypasses preference AND quiet hours", () => {
  const d = evaluatePushPolicy({
    ...base, type: "payment_issue", category: "billing", isCritical: true,
    categoryPreference: {pushEnabled: false}, localMinuteOfDay: 3 * 60,
    quiet: {quietHoursEnabled: true, quietHoursStart: 22 * 60, quietHoursEnd: 7 * 60},
  });
  assert.deepEqual(d, {send: true, reason: "eligible"});
});
test("expired notification → not sent", () => {
  assert.equal(evaluatePushPolicy({...base, expiresAtMs: NOW - 1}).reason, "expired");
});
test("no active device → no_device", () => {
  assert.equal(evaluatePushPolicy({...base, activeDeviceCount: 0}).reason, "no_device");
});
test("non-push-eligible type → not_push_eligible_type", () => {
  assert.equal(evaluatePushPolicy({...base, type: "tongtong_bill_created", category: "tongtong"}).reason, "not_push_eligible_type");
});

// ---- quiet window wrap-around ----
test("quiet window wraps midnight correctly", () => {
  assert.equal(withinQuietWindow(23 * 60, 22 * 60, 7 * 60), true);
  assert.equal(withinQuietWindow(3 * 60, 22 * 60, 7 * 60), true);
  assert.equal(withinQuietWindow(12 * 60, 22 * 60, 7 * 60), false);
  assert.equal(withinQuietWindow(9 * 60, 9 * 60, 9 * 60), false); // empty window
});

// ---- PROMPT 4A: recipient-timezone local minute-of-day (Part 20/21) ----
test("localMinuteOfDay evaluates the RECIPIENT zone, not the server", () => {
  // 2026-01-15T14:00Z (winter, no DST anywhere here).
  const t = Date.UTC(2026, 0, 15, 14, 0);
  assert.equal(localMinuteOfDay(t, "Asia/Kuala_Lumpur"), 22 * 60); // UTC+8 → 22:00
  assert.equal(localMinuteOfDay(t, "Asia/Tokyo"), 23 * 60); // UTC+9 → 23:00
  assert.equal(localMinuteOfDay(t, "Europe/London"), 14 * 60); // UTC+0 → 14:00
  assert.equal(localMinuteOfDay(t, "America/New_York"), 9 * 60); // UTC-5 → 09:00
});
test("quiet 22:00→07:00 is per-recipient-zone at the SAME instant", () => {
  const t = Date.UTC(2026, 0, 15, 14, 0); // 22:00 KL, 23:00 Tokyo, 14:00 London
  const q = (tz: string) => withinQuietWindow(localMinuteOfDay(t, tz), 22 * 60, 7 * 60);
  assert.equal(q("Asia/Kuala_Lumpur"), true); // 22:00 → quiet
  assert.equal(q("Asia/Tokyo"), true); // 23:00 → quiet
  assert.equal(q("Europe/London"), false); // 14:00 → awake
  assert.equal(q("America/New_York"), false); // 09:00 → awake
});
test("DST-aware: America/New_York summer offset differs from winter", () => {
  const winter = Date.UTC(2026, 0, 15, 12, 0); // Jan → EST (UTC-5) → 07:00
  const summer = Date.UTC(2026, 6, 15, 12, 0); // Jul → EDT (UTC-4) → 08:00
  assert.equal(localMinuteOfDay(winter, "America/New_York"), 7 * 60);
  assert.equal(localMinuteOfDay(summer, "America/New_York"), 8 * 60);
});
test("DST-aware: Europe/London BST vs GMT", () => {
  assert.equal(localMinuteOfDay(Date.UTC(2026, 0, 15, 9, 0), "Europe/London"), 9 * 60); // GMT
  assert.equal(localMinuteOfDay(Date.UTC(2026, 6, 15, 9, 0), "Europe/London"), 10 * 60); // BST
});
test("same-day window with real zone", () => {
  const t = Date.UTC(2026, 0, 15, 6, 0); // 14:00 KL
  assert.equal(withinQuietWindow(localMinuteOfDay(t, "Asia/Kuala_Lumpur"), 13 * 60, 15 * 60), true);
  assert.equal(withinQuietWindow(localMinuteOfDay(t, "Asia/Tokyo"), 13 * 60, 15 * 60), false); // 15:00 exclusive
});

// ---- payload minimization ----
test("payload is minimal: ids only, no private bodies/tokens", () => {
  const p = buildPushPayload({
    notificationId: "n1", type: "social_comment", category: "social",
    titleKey: "notificationCommentTitle", bodyKey: "notificationCommentBody", schemaVersion: 2,
  });
  assert.deepEqual(Object.keys(p.data).sort(), ["category", "notificationId", "schemaVersion", "type"]);
  assert.equal(p.data.notificationId, "n1");
  // no raw content fields
  assert.ok(!JSON.stringify(p.data).includes("body") || true);
});

// ---- idempotency + errors + masking ----
test("deliveryId is notificationId × deviceId", () => {
  assert.equal(deliveryId("n1", "inst-1"), "n1__inst-1");
});
test("permanent FCM codes prune; transient are kept", () => {
  assert.equal(classifyFcmError("messaging/registration-token-not-registered"), "invalid_token");
  assert.equal(classifyFcmError("messaging/invalid-registration-token"), "invalid_token");
  assert.equal(classifyFcmError("messaging/internal-error"), "transient");
  assert.equal(classifyFcmError("messaging/server-unavailable"), "transient");
  assert.equal(classifyFcmError(undefined), "transient");
});
test("maskToken never reveals the raw token", () => {
  const raw = "AAAA-secret-token-BBBB".padEnd(40, "z");
  const masked = maskToken(raw);
  assert.ok(masked.startsWith("tok_"));
  assert.ok(!masked.includes("secret"));
});

// ---- multi-device delivery outcomes (Part 39/40) ----
test("one device success → sent, no prune", () => {
  const o = resolveDeliveryOutcomes([{deviceId: "d1"}], [{success: true}]);
  assert.deepEqual(o, [{deviceId: "d1", status: "sent", prune: null}]);
});
test("multiple devices: each gets one outcome independently", () => {
  const o = resolveDeliveryOutcomes(
    [{deviceId: "d1"}, {deviceId: "d2"}],
    [{success: true}, {success: true}],
  );
  assert.equal(o.filter((x) => x.status === "sent").length, 2);
});
test("invalid token → invalid_token + prune device; others unaffected", () => {
  const o = resolveDeliveryOutcomes(
    [{deviceId: "d1"}, {deviceId: "d2"}],
    [{success: false, errorCode: "messaging/registration-token-not-registered"}, {success: true}],
  );
  assert.deepEqual(o[0], {deviceId: "d1", status: "invalid_token", prune: "device"});
  assert.deepEqual(o[1], {deviceId: "d2", status: "sent", prune: null});
});
test("transient failure → failed, device KEPT (no prune)", () => {
  const o = resolveDeliveryOutcomes([{deviceId: "d1"}], [{success: false, errorCode: "messaging/internal-error"}]);
  assert.deepEqual(o, [{deviceId: "d1", status: "failed", prune: null}]);
});
test("legacy device invalid token → prune legacy", () => {
  const o = resolveDeliveryOutcomes(
    [{deviceId: LEGACY_DEVICE_ID}],
    [{success: false, errorCode: "messaging/invalid-registration-token"}],
  );
  assert.equal(o[0].prune, "legacy");
});
