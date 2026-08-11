/**
 * Algorithm 2 / Phase 2.5 — ujian resolver rollout (tulen, fail-closed).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveRollout, RolloutConfig, RolloutInput, stableBucket, cohortIdFor,
} from "../rolloutResolver";

function cfg(over: Partial<RolloutConfig> = {}): RolloutConfig {
  return {
    valid: true, emergencyLegacy: false, scoringEmergencyLegacy: false,
    livePercent: 0, shadowPercent: 0, salt: "s1", rolloutVersion: "r1",
    moduleSwitches: {}, enabledFlags: new Set(["unifiedScoring", "expandedPool", "explorePagination", "sessionSuppression", "rejectMemory", "alternativeReuse", "sessionRotation", "explainability"]),
    providerCapPerRequest: 3, providerCapPerSession: 8, ...over,
  };
}
const inp = (over: Partial<RolloutInput> = {}): RolloutInput => ({
  uid: "u_normal", isOwner: false, allowlistMember: null, now: 1000, config: cfg(), ...over,
});

test("P1: owner -> owner_internal enabled + diagnostics", () => {
  const d = resolveRollout(inp({ isOwner: true }));
  assert.equal(d.mode, "owner_internal");
  assert.equal(d.enabled, true);
  assert.equal(d.diagnosticsAllowed, true);
});

test("P2: allow-listed beta_live -> beta_allowlist enabled", () => {
  const d = resolveRollout(inp({ allowlistMember: { cohort: "beta_live", enabled: true, expiresAt: null } }));
  assert.equal(d.mode, "beta_allowlist");
  assert.equal(d.enabled, true);
  assert.equal(d.diagnosticsAllowed, false); // bukan owner
});

test("P3: normal user -> legacy (not enabled)", () => {
  const d = resolveRollout(inp());
  assert.equal(d.mode, "legacy");
  assert.equal(d.enabled, false);
});

test("P4: expired allow-list -> legacy", () => {
  const d = resolveRollout(inp({ allowlistMember: { cohort: "beta_live", enabled: true, expiresAt: 500 }, now: 1000 }));
  assert.equal(d.enabled, false);
  assert.equal(d.assignmentReason, "allowlist_expired");
});

test("P5: percentage assignment deterministic", () => {
  const b1 = stableBucket("u_x", "s1");
  const b2 = stableBucket("u_x", "s1");
  assert.equal(b1, b2);
  assert.ok(b1 >= 0 && b1 < 100);
  assert.notEqual(stableBucket("u_x", "s1"), stableBucket("u_x", "s2")); // salt matters (usually)
});

test("P6: live 0 -> no public gets live", () => {
  // Untuk banyak uid, tiada satu pun percentage_live bila live=0.
  for (let i = 0; i < 50; i++) {
    const d = resolveRollout(inp({ uid: `pub_${i}`, config: cfg({ livePercent: 0, shadowPercent: 0 }) }));
    assert.equal(d.enabled, false);
    assert.notEqual(d.mode, "percentage_live");
  }
});

test("P7: invalid config -> fail-closed legacy (even owner)", () => {
  const d = resolveRollout(inp({ isOwner: true, config: cfg({ valid: false }) }));
  assert.equal(d.enabled, false);
  assert.equal(d.mode, "emergency_legacy");
  assert.equal(d.assignmentReason, "invalid_config");
});

test("P8: global emergency overrides all (owner too)", () => {
  const d = resolveRollout(inp({ isOwner: true, config: cfg({ emergencyLegacy: true }) }));
  assert.equal(d.enabled, false);
  assert.equal(d.emergencyLegacy, true);
  assert.equal(d.mode, "emergency_legacy");
  for (const v of Object.values(d.modules)) assert.equal(v, false); // semua modul mati
});

test("P9: module kill switch disables that module only", () => {
  const d = resolveRollout(inp({ isOwner: true, config: cfg({ moduleSwitches: { unifiedScoring: false } }) }));
  assert.equal(d.enabled, true);
  assert.equal(d.modules.unifiedScoring, false); // dimatikan
  assert.equal(d.modules.expandedPool, true); // lain kekal
});

test("P10: client cannot override (resolver only takes server isOwner + server allowlist)", () => {
  // Tiada medan klien dalam RolloutInput; enabled ditentukan server sahaja.
  const d = resolveRollout(inp({ isOwner: false, allowlistMember: null }));
  assert.equal(d.enabled, false);
});

test("shadow: beta_shadow -> percentage_shadow, NOT enabled, shadow on", () => {
  const d = resolveRollout(inp({ allowlistMember: { cohort: "beta_shadow", enabled: true, expiresAt: null } }));
  assert.equal(d.mode, "percentage_shadow");
  assert.equal(d.enabled, false); // pengguna nampak LEGASI
  assert.equal(d.shadowEnabled, true);
});

test("percentage live: bucket < live -> percentage_live", () => {
  // Cari uid dengan bucket rendah untuk live=100.
  const d = resolveRollout(inp({ uid: "u_any", config: cfg({ livePercent: 100 }) }));
  assert.equal(d.mode, "percentage_live");
  assert.equal(d.enabled, true);
});

test("percentage shadow band: live<=bucket<live+shadow", () => {
  const d = resolveRollout(inp({ uid: "u_any", config: cfg({ livePercent: 0, shadowPercent: 100 }) }));
  assert.equal(d.mode, "percentage_shadow");
  assert.equal(d.shadowEnabled, true);
  assert.equal(d.enabled, false);
});

test("cohortId is anon (not the uid)", () => {
  const id = cohortIdFor("blp6g37BUVPFLsDrSGuVqHrne153", "s1");
  assert.notEqual(id, "blp6g37BUVPFLsDrSGuVqHrne153");
  assert.ok(!id.includes("blp6"));
  assert.equal(id.length, 10);
});

test("decisionHash deterministic + no uid", () => {
  const a = resolveRollout(inp({ isOwner: true }));
  const b = resolveRollout(inp({ isOwner: true }));
  assert.equal(a.decisionHash, b.decisionHash);
  assert.ok(!a.decisionHash.includes("u_normal"));
});

test("salt missing + percentage>0 already invalid at config layer -> here valid:false path", () => {
  const d = resolveRollout(inp({ config: cfg({ valid: false, livePercent: 10, salt: "" }) }));
  assert.equal(d.enabled, false);
  assert.equal(d.mode, "emergency_legacy");
});
