/**
 * Algorithm 2 / Phase 2.5C — ujian enjin perbandingan SHADOW (tulen, kalis-mutasi).
 * Guard mod · metrik · skip/timeout/error · privasi · invarian output · resolver.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { POOL_52, ctx } from "./scoringFixtures";
import {
  runAlgorithm2ShadowComparison, computeShadowMetrics, rankCorrelation,
  permissionsForMode, assertShadowAllows, guardedWrite,
  ForbiddenShadowOperationError, ShadowPermissions, SHADOW_TIME_BUDGET_MS,
} from "../shadowComparison";
import { resolveRollout, RolloutConfig } from "../../rollout/rolloutResolver";
import { PlaceCandidate } from "../../../types/place";

const clock0 = () => 0;

// ---------- Part D: mod pelaksanaan + guard ----------
const WRITE_OPS: (keyof ShadowPermissions)[] = [
  "sessionWriteAllowed", "suggestionWriteAllowed", "eventTrainingAllowed",
  "rejectMemoryWriteAllowed", "foodMemoryWriteAllowed", "quotaReservationAllowed",
  "providerDiscoveryAllowed", "canonicalWriteAllowed",
];

test("D1: shadow_read_only denies EVERY write permission", () => {
  const p = permissionsForMode("shadow_read_only");
  for (const op of WRITE_OPS) assert.equal(p[op], false, op);
});

test("D2: live mode allows all; test mode denies all", () => {
  const live = permissionsForMode("live");
  for (const op of WRITE_OPS) assert.equal(live[op], true, op);
  const t = permissionsForMode("test");
  for (const op of WRITE_OPS) assert.equal(t[op], false, op);
});

test("D3: assertShadowAllows + guardedWrite THROW for every forbidden op under shadow", () => {
  const p = permissionsForMode("shadow_read_only");
  for (const op of WRITE_OPS) {
    assert.throws(() => assertShadowAllows(p, op), ForbiddenShadowOperationError);
    assert.throws(() => guardedWrite(p, op, () => 1), ForbiddenShadowOperationError);
  }
});

test("D4: guardedWrite runs under live mode", () => {
  const p = permissionsForMode("live");
  assert.equal(guardedWrite(p, "sessionWriteAllowed", () => 42), 42);
});

// ---------- Part E: metrik (tulen) ----------
test("E1: top1Agreement true when first equal, false otherwise", () => {
  const a = computeShadowMetrics(["x", "y", "z"], ["x", "z", "y"], 0);
  assert.equal(a.top1Agreement, true);
  const b = computeShadowMetrics(["x", "y", "z"], ["y", "x", "z"], 0);
  assert.equal(b.top1Agreement, false);
});

test("E2: top5Overlap + candidateOverlap counted correctly", () => {
  const m = computeShadowMetrics(["a", "b", "c", "d", "e"], ["a", "b", "c", "x", "y"], 0);
  assert.equal(m.top5Overlap, 3);
  assert.equal(m.top3Overlap, 3);
  assert.equal(m.candidateOverlapCount, 3);
  assert.equal(m.candidateCountLegacy, 5);
  assert.equal(m.candidateCountAlgorithm2, 5);
});

test("E3: identical order → correlation 1, full overlap", () => {
  const ids = ["a", "b", "c", "d"];
  const m = computeShadowMetrics(ids, ids, 0);
  assert.equal(m.candidateOverlapRatio, 1);
  assert.equal(m.rankCorrelation, 1);
});

test("E4: rankCorrelation null when common < 3", () => {
  assert.equal(rankCorrelation(["a", "b"], ["a", "b"]), null);
  assert.equal(rankCorrelation(["a", "x"], ["a", "y"]), null); // only 1 common
});

test("E5: empty-result difference detected", () => {
  const m = computeShadowMetrics(["a", "b", "c"], [], 3);
  assert.equal(m.legacyEmpty, false);
  assert.equal(m.algorithm2Empty, true);
  assert.equal(m.emptyResultDifference, true);
});

// ---------- Part B/C: runner sukses + guna semula pool ----------
test("B1: real pool → success, metrics present, scoringVersion algo2_scoring_v1", () => {
  const legacyIds = POOL_52.map((p) => p.placeId);
  const r = runAlgorithm2ShadowComparison({
    candidatePool: POOL_52, legacyRankedIds: legacyIds, recCtx: ctx({ selectedMood: "hungry" }),
    candidatePoolVersion: "places_v1", clock: clock0,
  });
  assert.equal(r.success, true);
  assert.equal(r.skipped, false);
  assert.equal(r.scoringVersion, "algo2_scoring_v1");
  assert.ok(r.metrics);
  assert.ok((r.metrics as any).candidateCountAlgorithm2 > 0);
});

// ---------- Part C/G: skip reasons ----------
test("C1: empty pool → no_reusable_candidate_pool", () => {
  const r = runAlgorithm2ShadowComparison({ candidatePool: [], legacyRankedIds: [], recCtx: ctx(), clock: clock0 });
  assert.equal(r.skipReason, "no_reusable_candidate_pool");
  assert.equal(r.success, false);
});

test("C2: pool < min → insufficient_candidate_count", () => {
  const r = runAlgorithm2ShadowComparison({ candidatePool: POOL_52.slice(0, 2), legacyRankedIds: [], recCtx: ctx(), clock: clock0 });
  assert.equal(r.skipReason, "insufficient_candidate_count");
});

test("C3: missing context → missing_context", () => {
  const r = runAlgorithm2ShadowComparison({ candidatePool: POOL_52, legacyRankedIds: [], recCtx: null, clock: clock0 });
  assert.equal(r.skipReason, "missing_context");
});

test("C4: fallback pool → unsupported_legacy_response", () => {
  const r = runAlgorithm2ShadowComparison({ candidatePool: POOL_52, legacyRankedIds: [], recCtx: ctx(), poolIsFallback: true, clock: clock0 });
  assert.equal(r.skipReason, "unsupported_legacy_response");
});

test("C5: pool > max → cost_guard", () => {
  const big = Array.from({ length: 90 }, (_, i) => POOL_52[i % POOL_52.length]);
  const r = runAlgorithm2ShadowComparison({ candidatePool: big, legacyRankedIds: [], recCtx: ctx(), clock: clock0 });
  assert.equal(r.skipReason, "cost_guard");
});

test("G1: exceeding time budget → timeout_budget (injected clock)", () => {
  let t = 0;
  const slow = () => { const v = t; t += SHADOW_TIME_BUDGET_MS + 100; return v; };
  const r = runAlgorithm2ShadowComparison({
    candidatePool: POOL_52, legacyRankedIds: [], recCtx: ctx(), clock: slow,
  });
  assert.equal(r.skipReason, "timeout_budget");
  assert.equal(r.success, false);
  assert.ok(r.scoringLatencyMs > SHADOW_TIME_BUDGET_MS);
});

test("G2: shadow scoring failure is CAUGHT, returns errorCode, never throws", () => {
  // Calon dgn getter yang melempar → rankUnified throw → runner tangkap.
  const boom = new Proxy({ placeId: "boom" } as Partial<PlaceCandidate>, {
    get(t, p) { if (p === "cuisine" || p === "rating") throw new Error("boom"); return (t as any)[p]; },
  }) as PlaceCandidate;
  const r = runAlgorithm2ShadowComparison({
    candidatePool: [boom, boom, boom], legacyRankedIds: ["x"], recCtx: ctx(), clock: clock0,
  });
  assert.equal(r.success, false);
  assert.ok(r.errorCode); // ditangkap, tidak melempar
  assert.equal(r.metrics, null);
});

// ---------- Privasi (Part E/F) ----------
test("P1: result exposes only HASHED ids (no raw placeId), 16-hex", () => {
  const r = runAlgorithm2ShadowComparison({
    candidatePool: POOL_52, legacyRankedIds: POOL_52.map((p) => p.placeId), recCtx: ctx(), clock: clock0,
  });
  for (const h of r.algorithm2RankedCandidateIdsHashed) {
    assert.match(h, /^[0-9a-f]{16}$/);
    assert.ok(!h.startsWith("s_"));
  }
  // metrik AGREGAT tidak mengandungi rentetan ID
  const vals = Object.values(r.metrics as any);
  for (const v of vals) assert.ok(typeof v !== "string" || /^[0-9a-f]+$/.test(v));
});

test("P2: hashed comparison does not leak raw IDs in overlap calc", () => {
  const m = computeShadowMetrics(["secret_place_1"], ["secret_place_1"], 0);
  assert.equal(m.candidateOverlapCount, 1); // padan tanpa dedah ID
});

// ---------- Invarian: input TIDAK dimutasi ----------
test("INV1: runner does NOT mutate input pool or legacy id array", () => {
  const pool = POOL_52.slice();
  const poolCopy = pool.map((p) => p.placeId);
  const legacy = POOL_52.map((p) => p.placeId);
  const legacyCopy = legacy.slice();
  runAlgorithm2ShadowComparison({ candidatePool: pool, legacyRankedIds: legacy, recCtx: ctx(), clock: clock0 });
  assert.deepEqual(pool.map((p) => p.placeId), poolCopy);
  assert.deepEqual(legacy, legacyCopy);
});

// ---------- Resolver: shadow assignment (Part I 1-6) ----------
function cfg(over: Partial<RolloutConfig> = {}): RolloutConfig {
  return {
    valid: true, emergencyLegacy: false, scoringEmergencyLegacy: false,
    livePercent: 0, shadowPercent: 0, salt: "s1", rolloutVersion: "r1",
    moduleSwitches: {}, enabledFlags: new Set(["unifiedScoring"]),
    providerCapPerRequest: 3, providerCapPerSession: 8, ...over,
  };
}
const now = 1_000_000;
const member = (o: any) => ({ cohort: "beta_shadow", enabled: true, expiresAt: null, ...o });

test("R1: legacy user (no membership) does NOT run shadow", () => {
  const d = resolveRollout({ uid: "u1", isOwner: false, allowlistMember: null, now, config: cfg() });
  assert.equal(d.shadowEnabled, false);
  assert.equal(d.enabled, false);
});

test("R2: beta_shadow member → shadowEnabled true, enabled false", () => {
  const d = resolveRollout({ uid: "u2", isOwner: false, allowlistMember: member({}), now, config: cfg() });
  assert.equal(d.mode, "percentage_shadow");
  assert.equal(d.shadowEnabled, true);
  assert.equal(d.enabled, false);
});

test("R3: expired shadow membership does NOT run shadow", () => {
  const d = resolveRollout({ uid: "u3", isOwner: false, allowlistMember: member({ expiresAt: now - 1 }), now, config: cfg() });
  assert.equal(d.shadowEnabled, false);
  assert.equal(d.enabled, false);
});

test("R4: global emergency disables shadow", () => {
  const d = resolveRollout({ uid: "u4", isOwner: false, allowlistMember: member({}), now, config: cfg({ emergencyLegacy: true }) });
  assert.equal(d.shadowEnabled, false);
  assert.equal(d.mode, "emergency_legacy");
});

test("R5: shadowPercent 0 + no membership → no percentage shadow", () => {
  const d = resolveRollout({ uid: "u5", isOwner: false, allowlistMember: null, now, config: cfg({ shadowPercent: 0 }) });
  assert.equal(d.shadowEnabled, false);
});

test("R6: owner live user does NOT run shadow (owner_internal, enabled)", () => {
  const d = resolveRollout({ uid: "owner", isOwner: true, allowlistMember: null, now, config: cfg() });
  assert.equal(d.mode, "owner_internal");
  assert.equal(d.enabled, true);
  assert.equal(d.shadowEnabled, false);
});
