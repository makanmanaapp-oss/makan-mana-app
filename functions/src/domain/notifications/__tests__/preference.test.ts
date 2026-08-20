/**
 * PROMPT 4 — canonical preference resolver + write validation.
 * Covers the master/category/marketing/critical matrix (Part 34/38) and the
 * server-trust write validation (Part 37).
 */
import assert from "node:assert/strict";
import {test} from "node:test";

import {
  resolveNotificationPersistence,
  resolvePreference,
} from "../notificationContract";
import {
  isServerUsableTimezone,
  validatePreferenceUpdate,
} from "../preferenceValidation";

// Channel-matrix helper: resolve prefs then the persistence decision.
function decide(
  prefs: Record<string, unknown>,
  category: Parameters<typeof resolvePreference>[1],
  isCritical: boolean,
  pushEligible: boolean,
) {
  return resolveNotificationPersistence(
    resolvePreference(prefs, category, isCritical), pushEligible);
}

// ---- resolver: default (opt-out) ----
test("missing preferences => everything enabled (production default preserved)", () => {
  assert.deepEqual(resolvePreference(undefined, "social", false), {inAppEnabled: true, pushEnabled: true});
  assert.deepEqual(resolvePreference({}, "group", false), {inAppEnabled: true, pushEnabled: true});
});

// ---- resolver: per-category ----
test("social inApp ON + push OFF", () => {
  const p = {social: {inAppEnabled: true, pushEnabled: false}};
  assert.deepEqual(resolvePreference(p, "social", false), {inAppEnabled: true, pushEnabled: false});
});
test("social inApp OFF + push ON", () => {
  const p = {social: {inAppEnabled: false, pushEnabled: true}};
  assert.deepEqual(resolvePreference(p, "social", false), {inAppEnabled: false, pushEnabled: true});
});
test("group both OFF => no non-critical notification", () => {
  const p = {group: {inAppEnabled: false, pushEnabled: false}};
  assert.deepEqual(resolvePreference(p, "group", false), {inAppEnabled: false, pushEnabled: false});
});

// ---- resolver: master overrides ----
test("master push OFF suppresses push for every category, keeps in-app", () => {
  const p = {master: {pushEnabled: false}, social: {inAppEnabled: true, pushEnabled: true}};
  assert.deepEqual(resolvePreference(p, "social", false), {inAppEnabled: true, pushEnabled: false});
});
test("master in-app OFF suppresses in-app for every category, keeps push", () => {
  const p = {master: {inAppEnabled: false}, group: {inAppEnabled: true, pushEnabled: true}};
  assert.deepEqual(resolvePreference(p, "group", false), {inAppEnabled: false, pushEnabled: true});
});
test("master OFF does NOT erase stored category values (child preserved on read)", () => {
  // Social OFF, Groups ON, master push OFF => effective all-off, but stored
  // child values still resolve independently once master returns.
  const off = {master: {pushEnabled: false}, social: {pushEnabled: false}, group: {pushEnabled: true}};
  assert.equal(resolvePreference(off, "group", false).pushEnabled, false); // master wins
  const on = {master: {pushEnabled: true}, social: {pushEnabled: false}, group: {pushEnabled: true}};
  assert.equal(resolvePreference(on, "group", false).pushEnabled, true); // child restored
  assert.equal(resolvePreference(on, "social", false).pushEnabled, false);
});

// ---- resolver: marketing conservative opt-in ----
test("marketing defaults OFF (opt-in) when unset — no generic true-fallback", () => {
  assert.deepEqual(resolvePreference({}, "marketing", false), {inAppEnabled: false, pushEnabled: false});
});
test("marketing enabled only when explicitly true", () => {
  const p = {marketing: {inAppEnabled: true, pushEnabled: true}};
  assert.deepEqual(resolvePreference(p, "marketing", false), {inAppEnabled: true, pushEnabled: true});
});

// ---- resolver: critical bypass ----
test("critical (payment_issue/account_security) bypasses ALL prefs", () => {
  const p = {master: {inAppEnabled: false, pushEnabled: false}, billing: {pushEnabled: false}, security: {pushEnabled: false}};
  assert.deepEqual(resolvePreference(p, "billing", true), {inAppEnabled: true, pushEnabled: true});
  assert.deepEqual(resolvePreference(p, "security", true), {inAppEnabled: true, pushEnabled: true});
});

// ---- resolver: legacy / partial hydration ----
test("legacy partial doc hydrates missing category with defaults", () => {
  const p = {social: {pushEnabled: false}}; // inAppEnabled missing
  assert.deepEqual(resolvePreference(p, "social", false), {inAppEnabled: true, pushEnabled: false});
  assert.deepEqual(resolvePreference(p, "food", false), {inAppEnabled: true, pushEnabled: true});
});

// ---- validation: happy path ----
test("valid update accepted + sanitized", () => {
  const r = validatePreferenceUpdate({
    master: {inAppEnabled: true, pushEnabled: false},
    social: {inAppEnabled: true, pushEnabled: false},
    quietHours: {quietHoursEnabled: true, quietHoursStart: 1320, quietHoursEnd: 420, timezone: "Asia/Kuala_Lumpur"},
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.update?.social, {inAppEnabled: true, pushEnabled: false});
});

// ---- validation: rejections (Part 37) ----
test("unknown category rejected", () => {
  assert.equal(validatePreferenceUpdate({hacker: {pushEnabled: true}}).ok, false);
  assert.equal(validatePreferenceUpdate({tongtong: {pushEnabled: true}}).ok, false); // frozen, not user-controllable
});
test("unexpected field / admin+critical injection rejected", () => {
  assert.equal(validatePreferenceUpdate({social: {pushEnabled: true, isCritical: true}}).ok, false);
  assert.equal(validatePreferenceUpdate({isAdmin: true}).ok, false);
  assert.equal(validatePreferenceUpdate({master: {pushEnabled: true, critical: true}}).ok, false);
});
test("non-boolean toggle rejected", () => {
  assert.equal(validatePreferenceUpdate({social: {pushEnabled: "yes"}}).ok, false);
});
test("invalid quiet-hour minutes rejected", () => {
  assert.equal(validatePreferenceUpdate({quietHours: {quietHoursStart: 1440}}).ok, false);
  assert.equal(validatePreferenceUpdate({quietHours: {quietHoursStart: -1}}).ok, false);
  assert.equal(validatePreferenceUpdate({quietHours: {quietHoursStart: 12.5}}).ok, false);
});
test("invalid timezone rejected", () => {
  assert.equal(validatePreferenceUpdate({quietHours: {timezone: ""}}).ok, false);
  assert.equal(validatePreferenceUpdate({quietHours: {timezone: "x".repeat(65)}}).ok, false);
});
test("empty / non-object payload rejected", () => {
  assert.equal(validatePreferenceUpdate({}).ok, false);
  assert.equal(validatePreferenceUpdate(null).ok, false);
  assert.equal(validatePreferenceUpdate([{social: {}}]).ok, false);
});
test("schemaVersion/updatedAt in payload are ignored, not written by client", () => {
  const r = validatePreferenceUpdate({schemaVersion: 99, updatedAt: 1, social: {pushEnabled: false}});
  assert.equal(r.ok, true);
  assert.equal((r.update as Record<string, unknown>).schemaVersion, undefined);
});

// ---- PROMPT 4A: independent channel matrix (Part 25) ----
for (const cat of ["social", "group"] as const) {
  test(`${cat} A: inApp ON + push ON → visible record`, () => {
    assert.deepEqual(decide({[cat]: {inAppEnabled: true, pushEnabled: true}}, cat, false, true),
      {persist: true, inAppVisible: true});
  });
  test(`${cat} B: inApp ON + push OFF → visible record (push suppressed later)`, () => {
    assert.deepEqual(decide({[cat]: {inAppEnabled: true, pushEnabled: false}}, cat, false, true),
      {persist: true, inAppVisible: true});
  });
  test(`${cat} C: inApp OFF + push ON → push-only record (inAppVisible false)`, () => {
    assert.deepEqual(decide({[cat]: {inAppEnabled: false, pushEnabled: true}}, cat, false, true),
      {persist: true, inAppVisible: false});
  });
  test(`${cat} D: both OFF → no record`, () => {
    assert.deepEqual(decide({[cat]: {inAppEnabled: false, pushEnabled: false}}, cat, false, true),
      {persist: false, inAppVisible: false});
  });
}
test("E: critical bypass (masters OFF) → visible record", () => {
  const prefs = {master: {inAppEnabled: false, pushEnabled: false}, security: {inAppEnabled: false, pushEnabled: false}};
  assert.deepEqual(decide(prefs, "security", true, true), {persist: true, inAppVisible: true});
});
test("non-push-eligible type + inApp OFF + push ON → NO dead record", () => {
  assert.deepEqual(decide({food: {inAppEnabled: false, pushEnabled: true}}, "food", false, false),
    {persist: false, inAppVisible: false});
});
test("master push OFF + inApp OFF (push-eligible) → no record (nothing to deliver)", () => {
  assert.deepEqual(decide({master: {pushEnabled: false}, social: {inAppEnabled: false}}, "social", false, true),
    {persist: false, inAppVisible: false});
});

// ---- PROMPT 4A: IANA timezone hardening (Part 24) ----
test("server-usable IANA zones accepted", () => {
  for (const tz of ["Asia/Kuala_Lumpur", "Asia/Tokyo", "Europe/London", "America/New_York", "UTC"]) {
    assert.equal(isServerUsableTimezone(tz), true, tz);
    assert.equal(validatePreferenceUpdate({quietHours: {timezone: tz}}).ok, true, tz);
  }
});
test("abbreviations / offsets / junk rejected (never masquerade as IANA)", () => {
  for (const tz of ["MYT", "+08", "GMT+8", "PST", "Mars/Phobos", "", "x".repeat(65)]) {
    assert.equal(isServerUsableTimezone(tz), false, tz);
    assert.equal(validatePreferenceUpdate({quietHours: {timezone: tz}}).ok, false, tz);
  }
});
