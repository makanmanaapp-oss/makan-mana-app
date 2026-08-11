/**
 * Master pre-launch fix — kontrak kelayakan Algorithm 2 BERSATU.
 *
 * Membuktikan getSuggestions dan nextSuggestion menyelesaikan kelayakan yang SAMA
 * dari keputusan rollout yang SAMA: owner + beta + percentage_live LAYAK untuk
 * operasi sesi (alternativeReuse/rejectMemory/sessionRotation) — bukan owner-sahaja.
 * Ini menutup defek nextSuggestion→legacy_local untuk beta.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.ALGO2_FLAGS = "all";

import { resolveRollout, RolloutConfig, stableBucket } from "../rolloutResolver";
import { algorithm2LiveEligible } from "../liveEligibility";
import { resolveAlgorithm2Eligibility } from "../algorithm2Eligibility";
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

/** Gate seperti getSuggestions (expandedPool/unifiedScoring) vs nextSuggestion (alternativeReuse/rejectMemory). */
function gates(e: ReturnType<typeof resolveAlgorithm2Eligibility>) {
  return {
    getSuggestions_expandedPool: algorithm2FlagActive("expandedPool", e.eligible),
    getSuggestions_unifiedScoring: algorithm2FlagActive("unifiedScoring", e.eligible),
    nextSuggestion_alternativeReuse: algorithm2FlagActive("alternativeReuse", e.eligible),
    nextSuggestion_rejectMemory: algorithm2FlagActive("rejectMemory", e.eligible),
    nextSuggestion_sessionRotation: algorithm2FlagActive("sessionRotation", e.eligible),
  };
}

test("OWNER: eligible + nextSuggestion authoritative gates ON", () => {
  const d = resolveRollout({ uid: "owner", isOwner: true, allowlistMember: null, now, config: cfg() });
  const e = resolveAlgorithm2Eligibility(d);
  assert.equal(e.eligible, true);
  assert.equal(e.mode, "owner_internal");
  const g = gates(e);
  assert.equal(g.nextSuggestion_alternativeReuse, true);
  assert.equal(g.nextSuggestion_rejectMemory, true);
  assert.equal(g.nextSuggestion_sessionRotation, true);
});

test("BETA_ALLOWLIST: eligible + nextSuggestion authoritative gates ON (THE FIX)", () => {
  const d = resolveRollout({ uid: "beta", isOwner: false, allowlistMember: betaMember, now, config: cfg() });
  const e = resolveAlgorithm2Eligibility(d);
  assert.equal(e.eligible, true);
  assert.equal(e.mode, "beta_allowlist");
  assert.equal(e.diagnosticsAllowed, false, "beta is NOT owner-diagnostics");
  const g = gates(e);
  assert.equal(g.nextSuggestion_alternativeReuse, true, "beta MUST get authoritative Reject (fix)");
  assert.equal(g.nextSuggestion_rejectMemory, true);
  assert.equal(g.nextSuggestion_sessionRotation, true);
});

test("CONSISTENCY: getSuggestions and nextSuggestion gates match for the SAME identity", () => {
  for (const who of [
    { uid: "owner", isOwner: true, allowlistMember: null },
    { uid: "beta", isOwner: false, allowlistMember: betaMember },
    { uid: "pub", isOwner: false, allowlistMember: null },
  ]) {
    const d = resolveRollout({ ...who, now, config: cfg() });
    const e = resolveAlgorithm2Eligibility(d);
    const g = gates(e);
    // getSuggestions live-runtime and nextSuggestion authoritative Reject must agree.
    assert.equal(g.getSuggestions_expandedPool, g.nextSuggestion_alternativeReuse,
      `expandedPool must equal alternativeReuse for ${who.uid}`);
    assert.equal(e.eligible, algorithm2LiveEligible(d));
  }
});

test("EXPIRED_BETA: legacy, not eligible, authoritative OFF", () => {
  const d = resolveRollout({ uid: "beta", isOwner: false,
    allowlistMember: { cohort: "beta_allowlist", enabled: true, expiresAt: now - 1 }, now, config: cfg() });
  const e = resolveAlgorithm2Eligibility(d);
  assert.equal(e.eligible, false);
  assert.equal(e.mode, "legacy");
  assert.equal(gates(e).nextSuggestion_alternativeReuse, false);
});

test("PUBLIC_LIVE0: public stays legacy, authoritative OFF", () => {
  const d = resolveRollout({ uid: "pub", isOwner: false, allowlistMember: null, now, config: cfg() });
  const e = resolveAlgorithm2Eligibility(d);
  assert.equal(e.eligible, false);
  assert.equal(e.mode, "legacy");
  assert.equal(gates(e).nextSuggestion_alternativeReuse, false);
});

test("PERCENTAGE_ELIGIBLE: bucket<live → percentage_live eligible + authoritative ON", () => {
  const d = resolveRollout({ uid: "pct", isOwner: false, allowlistMember: null, now,
    config: cfg({ livePercent: 100, salt: "psalt" }) });
  const e = resolveAlgorithm2Eligibility(d);
  assert.equal(e.mode, "percentage_live");
  assert.equal(e.eligible, true);
  assert.equal(gates(e).nextSuggestion_alternativeReuse, true, "future percentage_live gets authoritative Reject");
});

test("PERCENTAGE_INELIGIBLE: shadow-only bucket → NOT live, authoritative OFF", () => {
  const d = resolveRollout({ uid: "pct2", isOwner: false, allowlistMember: null, now,
    config: cfg({ livePercent: 0, shadowPercent: 100, salt: "psalt" }) });
  const e = resolveAlgorithm2Eligibility(d);
  assert.equal(e.mode, "percentage_shadow");
  assert.equal(e.eligible, false, "shadow visible output is legacy");
  assert.equal(gates(e).nextSuggestion_alternativeReuse, false);
});

test("EMERGENCY_LEGACY: owner + beta + percentage all forced legacy, authoritative OFF", () => {
  const inputs = [
    { uid: "owner", isOwner: true, allowlistMember: null },
    { uid: "beta", isOwner: false, allowlistMember: betaMember },
    { uid: "pct", isOwner: false, allowlistMember: null },
  ];
  for (const who of inputs) {
    const d = resolveRollout({ ...who, now, config: cfg({ emergencyLegacy: true, livePercent: 100, salt: "psalt" }) });
    const e = resolveAlgorithm2Eligibility(d);
    assert.equal(e.emergencyLegacy, true);
    assert.equal(e.eligible, false, `${who.uid} must be legacy under emergency`);
    assert.equal(gates(e).nextSuggestion_alternativeReuse, false);
  }
});

test("COHORT_DETERMINISM: same identity → same cohortId + eligibility across two resolves (two functions)", () => {
  const mk = () => resolveAlgorithm2Eligibility(
    resolveRollout({ uid: "beta", isOwner: false, allowlistMember: betaMember, now, config: cfg() }));
  const a = mk(); const b = mk();
  assert.equal(a.cohortId, b.cohortId);
  assert.equal(a.eligible, b.eligible);
  assert.equal(a.mode, b.mode);
  assert.equal(a.decisionHash, b.decisionHash);
  assert.notEqual(a.cohortId, "beta", "cohortId is anon hash, NOT the uid");
});

test("PLAN_TIER_ONLY: eligibility is rollout-based, not tier — non-owner/non-beta stays legacy at live0", () => {
  // Resolver has no plan input: a 'Pro' user with no owner/beta/percentage is legacy.
  const d = resolveRollout({ uid: "proUserNoRollout", isOwner: false, allowlistMember: null, now, config: cfg() });
  const e = resolveAlgorithm2Eligibility(d);
  assert.equal(e.eligible, false, "Pro alone must NOT enable Algorithm 2 while live%=0");
  assert.equal(e.mode, "legacy");
});

test("INVALID_CONFIG: fail-closed → not eligible even for beta", () => {
  const d = resolveRollout({ uid: "beta", isOwner: false, allowlistMember: betaMember, now, config: cfg({ valid: false }) });
  const e = resolveAlgorithm2Eligibility(d);
  assert.equal(e.eligible, false);
  assert.equal(gates(e).nextSuggestion_alternativeReuse, false);
});

test("stableBucket determinism (sanity for percentage cohorts)", () => {
  assert.equal(stableBucket("x", "s"), stableBucket("x", "s"));
});
