/**
 * PROMPT 6A — trusted admin broadcast adapter security (pure logic).
 */
import assert from "node:assert/strict";
import {test} from "node:test";

import {
  ADMIN_BROADCAST_TYPES,
  adminBroadcastSourceEventId,
  assertNoForbiddenOverride,
  emitAdminNotification,
  isAdminBroadcastType,
  resolveLocalizedCopy,
} from "../adminNotifications";

// ---- type allowlist (Part 26) ----
test("only the four admin types are generatable", () => {
  for (const t of ["system_announcement", "system_maintenance", "system_feature_update", "marketing_campaign"]) {
    assert.equal(isAdminBroadcastType(t), true, t);
  }
  assert.deepEqual([...ADMIN_BROADCAST_TYPES].sort(), [
    "marketing_campaign", "system_announcement", "system_feature_update", "system_maintenance",
  ]);
});
test("forbidden domain / critical types are denied", () => {
  for (const t of [
    "payment_issue", "account_security", "subscription_started", "subscription_renewed",
    "subscription_cancelled", "social_reaction", "social_comment", "social_follow",
    "social_repost", "social_quote", "group_invite", "group_invite_accepted",
    "meal_reminder", "fit_reminder", "weekly_report_ready", "tongtong_bill_created",
    "unknown_type", "", null, undefined, 123,
  ]) {
    assert.equal(isAdminBroadcastType(t as unknown), false, String(t));
  }
});

// ---- forbidden override fields (Part 15/28) ----
test("clean payload passes the override guard", () => {
  assert.doesNotThrow(() => assertNoForbiddenOverride({
    notificationType: "system_announcement", recipientUid: "u1", title: {}, body: {},
    deliveryPurpose: "test", destinationRoute: "/home",
  }));
});
test("critical / bypass / forcePush fields are rejected outright", () => {
  for (const field of ["critical", "isCritical", "bypassPreference", "bypassQuietHours", "forcePush", "ignoreMarketingConsent", "priority", "source"]) {
    assert.throws(() => assertNoForbiddenOverride({[field]: true}), new RegExp(`forbidden_override_field:${field}`), field);
  }
});

// ---- dedup source id (Part 16) ----
test("source id is stable per requestId (retry-safe) and unique per request", () => {
  assert.equal(adminBroadcastSourceEventId("req-1"), "admin_broadcast:req-1");
  assert.equal(adminBroadcastSourceEventId("req-1"), adminBroadcastSourceEventId("req-1"));
  assert.notEqual(adminBroadcastSourceEventId("req-1"), adminBroadcastSourceEventId("req-2"));
});

// ---- localized copy resolution (fallback model) ----
test("copy resolves recipient language then falls back", () => {
  const title = {bm: "Selamat", en: "Hello", zh: "你好", ta: "வணக்கம்"};
  assert.equal(resolveLocalizedCopy(title, "en"), "Hello");
  assert.equal(resolveLocalizedCopy(title, "zh"), "你好");
  assert.equal(resolveLocalizedCopy(title, "fr"), "Selamat"); // unknown → fallback bm
  assert.equal(resolveLocalizedCopy({bm: "Only BM"}, "en"), "Only BM"); // missing → fallback
  assert.equal(resolveLocalizedCopy({}, "en"), ""); // nothing → empty (bridge rejects)
});

// ---- emitAdminNotification validation throws BEFORE any delivery ----
test("emitAdminNotification rejects forbidden type / empty / oversized copy before notifySafely", async () => {
  await assert.rejects(emitAdminNotification({
    recipientUid: "u1", type: "payment_issue" as never, requestId: "r", title: "x", body: "y",
  }), /forbidden_admin_type/);
  await assert.rejects(emitAdminNotification({
    recipientUid: "u1", type: "system_announcement", requestId: "r", title: "  ", body: "y",
  }), /empty_admin_copy/);
  await assert.rejects(emitAdminNotification({
    recipientUid: "u1", type: "system_announcement", requestId: "r", title: "x".repeat(81), body: "y",
  }), /admin_title_too_long/);
  await assert.rejects(emitAdminNotification({
    recipientUid: "u1", type: "marketing_campaign", requestId: "r", title: "x", body: "y".repeat(241),
  }), /admin_body_too_long/);
});
