/**
 * Algorithm 2 / Phase 2.6B — ujian kelayakan LIVE + matriks entitlement.
 * Sahkan expanded pool / pagination / early alt-reuse / unified scoring ikut
 * kelayakan LIVE (owner + beta), bukan owner-only; diagnostik kekal owner-only;
 * shadow read-only; legasi/kecemasan legasi.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

// algorithm2FlagActive membaca process.env.ALGO2_FLAGS (produksi = "all").
process.env.ALGO2_FLAGS = "all";

import { resolveRollout, RolloutConfig } from "../rolloutResolver";
import { algorithm2LiveEligible, ownerDiagnosticsAllowed } from "../liveEligibility";
import { algorithm2FlagActive } from "../../../config/algorithm2Flags";

function cfg(over: Partial<RolloutConfig> = {}): RolloutConfig {
  return {
    valid: true, emergencyLegacy: false, scoringEmergencyLegacy: false,
    livePercent: 0, shadowPercent: 0, salt: "s1", rolloutVersion: "r1",
    moduleSwitches: {}, enabledFlags: new Set(["expandedPool", "explorePagination",
      "alternativeReuse", "sessionSuppression", "rejectMemory", "sessionRotation",
      "unifiedScoring"]),
    providerCapPerRequest: 3, providerCapPerSession: 8, ...over,
  };
}
const now = 1_000_000;
const betaMember = { cohort: "beta_allowlist", enabled: true, expiresAt: null };
const shadowMember = { cohort: "beta_shadow", enabled: true, expiresAt: null };

// Simulasi gate execution seperti dalam getSuggestions/getNearbyPlaces.
function entitlements(d: ReturnType<typeof resolveRollout>) {
  const live = algorithm2LiveEligible(d);
  return {
    live,
    diagnostics: ownerDiagnosticsAllowed(d),
    expandedPool: algorithm2FlagActive("expandedPool", live),
    explorePagination: algorithm2FlagActive("explorePagination", live),
    alternativeReuse: algorithm2FlagActive("alternativeReuse", live),
    unifiedScoring: algorithm2FlagActive("unifiedScoring", live),
  };
}

test("A: owner_internal → full LIVE entitlements + diagnostics", () => {
  const d = resolveRollout({ uid: "owner", isOwner: true, allowlistMember: null, now, config: cfg() });
  const e = entitlements(d);
  assert.equal(d.mode, "owner_internal");
  assert.equal(e.live, true);
  assert.equal(e.expandedPool, true);
  assert.equal(e.explorePagination, true);
  assert.equal(e.alternativeReuse, true);
  assert.equal(e.unifiedScoring, true);
  assert.equal(e.diagnostics, true);
});

test("B: beta_allowlist → full LIVE entitlements, diagnostics FALSE", () => {
  const d = resolveRollout({ uid: "beta", isOwner: false, allowlistMember: betaMember, now, config: cfg() });
  const e = entitlements(d);
  assert.equal(d.mode, "beta_allowlist");
  assert.equal(e.live, true);
  assert.equal(e.expandedPool, true, "beta MUST get expanded pool (2.6B fix)");
  assert.equal(e.explorePagination, true, "beta MUST get Explore pagination (2.6B fix)");
  assert.equal(e.alternativeReuse, true, "beta MUST get early alt-reuse (2.6B fix)");
  assert.equal(e.unifiedScoring, true);
  assert.equal(e.diagnostics, false, "beta MUST NOT get owner diagnostics");
});

test("C: public legacy → NO live entitlements, no diagnostics", () => {
  const d = resolveRollout({ uid: "pub", isOwner: false, allowlistMember: null, now, config: cfg() });
  const e = entitlements(d);
  assert.equal(d.mode, "legacy");
  assert.equal(e.live, false);
  assert.equal(e.expandedPool, false);
  assert.equal(e.explorePagination, false);
  assert.equal(e.alternativeReuse, false);
  assert.equal(e.unifiedScoring, false);
  assert.equal(e.diagnostics, false);
});

test("D: percentage_shadow → live FALSE (read-only), no live pool/pagination", () => {
  const d = resolveRollout({ uid: "sh", isOwner: false, allowlistMember: shadowMember, now, config: cfg() });
  const e = entitlements(d);
  assert.equal(d.mode, "percentage_shadow");
  assert.equal(d.shadowEnabled, true);
  assert.equal(e.live, false, "shadow is NOT live-eligible (visible output legacy)");
  assert.equal(e.expandedPool, false);
  assert.equal(e.explorePagination, false);
  assert.equal(e.alternativeReuse, false);
  assert.equal(e.diagnostics, false);
});

test("E: emergency legacy → live FALSE even for owner + beta", () => {
  const owner = resolveRollout({ uid: "owner", isOwner: true, allowlistMember: null, now, config: cfg({ emergencyLegacy: true }) });
  const beta = resolveRollout({ uid: "beta", isOwner: false, allowlistMember: betaMember, now, config: cfg({ emergencyLegacy: true }) });
  for (const d of [owner, beta]) {
    const e = entitlements(d);
    assert.equal(d.mode, "emergency_legacy");
    assert.equal(e.live, false);
    assert.equal(e.expandedPool, false);
    assert.equal(e.explorePagination, false);
    assert.equal(e.alternativeReuse, false);
    assert.equal(e.diagnostics, false);
  }
});

test("F: invalid config → fail-closed, live FALSE", () => {
  const d = resolveRollout({ uid: "beta", isOwner: false, allowlistMember: betaMember, now, config: cfg({ valid: false }) });
  assert.equal(algorithm2LiveEligible(d), false);
});

test("G: expired beta membership → live FALSE (legacy)", () => {
  const d = resolveRollout({ uid: "beta", isOwner: false,
    allowlistMember: { cohort: "beta_allowlist", enabled: true, expiresAt: now - 1 }, now, config: cfg() });
  assert.equal(d.mode, "legacy");
  assert.equal(algorithm2LiveEligible(d), false);
});

test("H: module kill switch (expandedPool off via env) removes only that entitlement for beta", () => {
  const prev = process.env.ALGO2_FLAGS;
  process.env.ALGO2_FLAGS = "explorePagination,alternativeReuse,sessionSuppression,unifiedScoring";
  try {
    const d = resolveRollout({ uid: "beta", isOwner: false, allowlistMember: betaMember, now, config: cfg() });
    const e = entitlements(d);
    assert.equal(e.live, true);
    assert.equal(e.expandedPool, false, "expandedPool flag off -> entitlement off");
    assert.equal(e.explorePagination, true);
    assert.equal(e.unifiedScoring, true);
  } finally {
    process.env.ALGO2_FLAGS = prev;
  }
});
