import test from "node:test";
import assert from "node:assert/strict";

import {normalizeClaimedBroadcastRun} from "../broadcastControlPlane";

function baseRun() {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    campaign_id: "22222222-2222-2222-2222-222222222222",
    campaign_version: 7,
    run_key: "22222222-2222-2222-2222-222222222222:v7",
    status: "queued",
    notification_type: "system_announcement",
    audience_snapshot: {id: "test_recipients"},
    content_snapshot: {
      title: {bm: "Ujian"},
      body: {bm: "Mesej QA"},
      fallbackLang: "bm",
    },
    destination_id: "notification_center",
    scheduled_at: "2026-08-20T00:00:00.000Z",
    firebase_run_id: null,
    delivery_purpose: "qa" as const,
  };
}

test("test_recipients normalizes to QA and Notification Center", () => {
  const run = normalizeClaimedBroadcastRun(baseRun());
  assert.equal(run.deliveryPurpose, "qa");
  assert.equal(run.audienceId, "test_recipients");
  assert.equal(run.destinationRoute, null);
  assert.equal(run.runId, baseRun().run_key);
});

test("QA purpose cannot be used with a production audience", () => {
  const input = baseRun();
  input.audience_snapshot = {id: "all_eligible_users"};
  assert.throws(() => normalizeClaimedBroadcastRun(input), /invalid_delivery_purpose/);
});

test("production purpose is required for non-QA audience", () => {
  const input = {...baseRun(), delivery_purpose: "production" as const};
  input.audience_snapshot = {id: "locale_en"};
  const run = normalizeClaimedBroadcastRun(input);
  assert.equal(run.deliveryPurpose, "production");
  assert.equal(run.audienceId, "locale_en");
});

test("run key must match campaign and version exactly", () => {
  assert.throws(
    () => normalizeClaimedBroadcastRun({...baseRun(), run_key: "wrong:v7"}),
    /invalid_run_key/,
  );
});

test("unknown destination is rejected", () => {
  assert.throws(
    () => normalizeClaimedBroadcastRun({...baseRun(), destination_id: "https://example.com"}),
    /invalid_destination/,
  );
});

test("fallback copy is mandatory", () => {
  const input = baseRun();
  input.content_snapshot = {title: {en: "Only EN"}, body: {en: "Only EN"}, fallbackLang: "bm"};
  assert.throws(() => normalizeClaimedBroadcastRun(input), /missing_fallback_copy/);
});
