/**
 * Algorithm 2 / Phase 2.5C — Enjin perbandingan SHADOW (tulen, kalis-mutasi).
 *
 * Menjalankan pemarkahan Algorithm 2 (algo2_scoring_v1) DALAM-MEMORI ke atas pool
 * calon legasi yang SUDAH diambil, TANPA sebarang kesan sampingan:
 * tiada panggilan provider, tiada tempahan kuota, tiada sesi/suggestion/reject/
 * brain/Food Memory/kanonikal. Hanya metrik AGREGAT (tiada nama/ID mentah/UID/GPS).
 *
 * INVARIAN: output PENGGUNA tidak berubah — modul ini HANYA membaca dan mengira.
 */
import { createHash } from "crypto";
import { PlaceCandidate } from "../../types/place";
import { RecommendationUserContext } from "./recommendationContext";
import { rankUnified, ScoringSubFlags, ALL_SUBFLAGS_ON } from "./unifiedRanking";

/** Mod pelaksanaan Algorithm 2 — shadow MESTI read-only. */
export type Algorithm2ExecutionMode = "live" | "shadow_read_only" | "test";

/** Kebenaran operasi mengikut mod (Part D). shadow_read_only → SEMUA false. */
export interface ShadowPermissions {
  sessionWriteAllowed: boolean;
  suggestionWriteAllowed: boolean;
  eventTrainingAllowed: boolean;
  rejectMemoryWriteAllowed: boolean;
  foodMemoryWriteAllowed: boolean;
  quotaReservationAllowed: boolean;
  providerDiscoveryAllowed: boolean;
  canonicalWriteAllowed: boolean;
}

export function permissionsForMode(mode: Algorithm2ExecutionMode): ShadowPermissions {
  const live = mode === "live";
  return {
    sessionWriteAllowed: live,
    suggestionWriteAllowed: live,
    eventTrainingAllowed: live,
    rejectMemoryWriteAllowed: live,
    foodMemoryWriteAllowed: live,
    quotaReservationAllowed: live,
    providerDiscoveryAllowed: live,
    canonicalWriteAllowed: live,
  };
}

/** Ralat bila laluan shadow cuba operasi terlarang (guard masa-jalan, bukan disiplin). */
export class ForbiddenShadowOperationError extends Error {
  constructor(public op: keyof ShadowPermissions) {
    super(`Forbidden shadow operation: ${op}`);
    this.name = "ForbiddenShadowOperationError";
  }
}

/** Guard: throw jika operasi tidak dibenarkan bawah mod semasa. */
export function assertShadowAllows(perms: ShadowPermissions, op: keyof ShadowPermissions): void {
  if (!perms[op]) throw new ForbiddenShadowOperationError(op);
}

/** Bungkus penulisan supaya bawah shadow_read_only ia GAGAL (tidak boleh mutasi). */
export function guardedWrite<T>(perms: ShadowPermissions, op: keyof ShadowPermissions, fn: () => T): T {
  assertShadowAllows(perms, op);
  return fn();
}

export type ShadowSkipReason =
  | "no_reusable_candidate_pool"
  | "insufficient_candidate_count"
  | "missing_context"
  | "cost_guard"
  | "timeout_budget"
  | "unsupported_legacy_response"
  | "shadow_disabled";

/** Metrik AGREGAT sahaja — tiada nama/ID mentah/UID/GPS. */
export interface ShadowComparisonMetrics {
  candidateCountLegacy: number;
  candidateCountAlgorithm2: number;
  candidateOverlapCount: number;
  candidateOverlapRatio: number;
  top1Agreement: boolean;
  top3Overlap: number;
  top5Overlap: number;
  rankCorrelation: number | null;
  legacyEmpty: boolean;
  algorithm2Empty: boolean;
  emptyResultDifference: boolean;
  safetyFilteredCountAlgorithm2: number;
}

export interface ShadowRunInput {
  /** Pool calon legasi yang SUDAH diambil (guna semula; TIADA panggilan provider). */
  candidatePool: PlaceCandidate[];
  /** ID calon legasi yang telah disusun (output legasi yang dilihat pengguna). */
  legacyRankedIds: string[];
  recCtx: RecommendationUserContext | null;
  subFlags?: ScoringSubFlags;
  /** True jika pool = dummy/fallback (perbandingan tak bermakna → skip). */
  poolIsFallback?: boolean;
  candidatePoolVersion?: string;
  rolloutVersion?: string;
  minPoolSize?: number;
  maxPoolSize?: number;
  timeBudgetMs?: number;
  /** Jam disuntik (ms) untuk ukur latensi + uji timeout secara deterministik. */
  clock: () => number;
  legacyLatencyMs?: number;
}

export interface ShadowRunResult {
  success: boolean;
  skipped: boolean;
  skipReason: ShadowSkipReason | null;
  errorCode: string | null;
  algorithm2RankedCandidateIdsHashed: string[];
  algorithm2TopScore: number | null;
  scoringVersion: string;
  scoringLatencyMs: number;
  totalLatencyDeltaMs: number | null;
  candidatePoolVersion: string | null;
  metrics: ShadowComparisonMetrics | null;
}

const DEFAULT_MIN_POOL = 3;
const DEFAULT_MAX_POOL = 80; // guard kos/CPU (Part G)
export const SHADOW_TIME_BUDGET_MS = 500;

/** Hash pendek ID (untuk pengiraan pertindihan SAHAJA; TIADA ID mentah keluar). */
function hashId(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 16);
}

/** Spearman rank correlation atas calon sepunya (bila cukup pertindihan). */
export function rankCorrelation(legacyIds: string[], algo2Ids: string[]): number | null {
  const rankA = new Map<string, number>();
  legacyIds.forEach((id, i) => rankA.set(id, i));
  const rankB = new Map<string, number>();
  algo2Ids.forEach((id, i) => rankB.set(id, i));
  const common: string[] = [];
  for (const id of rankA.keys()) if (rankB.has(id)) common.push(id);
  const n = common.length;
  if (n < 3) return null;
  let d2 = 0;
  for (const id of common) {
    const d = (rankA.get(id) as number) - (rankB.get(id) as number);
    d2 += d * d;
  }
  const denom = n * (n * n - 1);
  if (denom === 0) return null;
  return Number((1 - (6 * d2) / denom).toFixed(4));
}

/** Kira metrik perbandingan (tulen) dari dua senarai ID (di-hash). */
export function computeShadowMetrics(
  legacyIds: string[],
  algo2Ids: string[],
  safetyFilteredCountAlgorithm2: number,
): ShadowComparisonMetrics {
  const lh = legacyIds.map(hashId);
  const ah = algo2Ids.map(hashId);
  const lset = new Set(lh);
  const aset = new Set(ah);
  let overlap = 0;
  for (const h of aset) if (lset.has(h)) overlap++;
  const topK = (arr: string[], k: number) => new Set(arr.slice(0, k));
  const overlapK = (k: number) => {
    const l = topK(lh, k); const a = topK(ah, k);
    let c = 0; for (const h of a) if (l.has(h)) c++; return c;
  };
  const denom = Math.max(lset.size, aset.size, 1);
  const legacyEmpty = lh.length === 0;
  const algorithm2Empty = ah.length === 0;
  return {
    candidateCountLegacy: lh.length,
    candidateCountAlgorithm2: ah.length,
    candidateOverlapCount: overlap,
    candidateOverlapRatio: Number((overlap / denom).toFixed(4)),
    top1Agreement: lh.length > 0 && ah.length > 0 && lh[0] === ah[0],
    top3Overlap: overlapK(3),
    top5Overlap: overlapK(5),
    rankCorrelation: rankCorrelation(lh, ah),
    legacyEmpty,
    algorithm2Empty,
    emptyResultDifference: legacyEmpty !== algorithm2Empty,
    safetyFilteredCountAlgorithm2,
  };
}

const fail = (reason: ShadowSkipReason, poolVersion: string | null): ShadowRunResult => ({
  success: false, skipped: true, skipReason: reason, errorCode: null,
  algorithm2RankedCandidateIdsHashed: [], algorithm2TopScore: null,
  scoringVersion: "algo2_scoring_v1", scoringLatencyMs: 0, totalLatencyDeltaMs: null,
  candidatePoolVersion: poolVersion, metrics: null,
});

/**
 * Jalankan perbandingan shadow Algorithm 2 (TULEN, read-only). Tidak pernah
 * melempar ke pemanggil untuk kes normal — pulangkan skip/error dengan selamat.
 * SATU-SATUNYA pengiraan: rankUnified (tulen) + metrik. Tiada I/O.
 */
export function runAlgorithm2ShadowComparison(input: ShadowRunInput): ShadowRunResult {
  const poolVersion = input.candidatePoolVersion ?? null;
  const minPool = input.minPoolSize ?? DEFAULT_MIN_POOL;
  const maxPool = input.maxPoolSize ?? DEFAULT_MAX_POOL;
  const budget = input.timeBudgetMs ?? SHADOW_TIME_BUDGET_MS;

  try {
    if (!input.recCtx) return fail("missing_context", poolVersion);
    if (input.poolIsFallback) return fail("unsupported_legacy_response", poolVersion);
    if (!input.candidatePool || input.candidatePool.length === 0) {
      return fail("no_reusable_candidate_pool", poolVersion);
    }
    if (input.candidatePool.length < minPool) return fail("insufficient_candidate_count", poolVersion);
    if (input.candidatePool.length > maxPool) return fail("cost_guard", poolVersion);

    const start = input.clock();
    const unified = rankUnified(input.candidatePool, input.recCtx, {
      subFlags: input.subFlags ?? ALL_SUBFLAGS_ON,
      excludeClosed: true,
    });
    const end = input.clock();
    const scoringLatencyMs = Math.max(0, end - start);
    if (scoringLatencyMs > budget) {
      const r = fail("timeout_budget", poolVersion);
      r.scoringLatencyMs = scoringLatencyMs;
      return r;
    }

    const algo2Ids = unified.ranked.map((p) => p.placeId);
    const metrics = computeShadowMetrics(
      input.legacyRankedIds, algo2Ids, unified.diagnostics.safetyFilteredCount,
    );
    return {
      success: true, skipped: false, skipReason: null, errorCode: null,
      algorithm2RankedCandidateIdsHashed: algo2Ids.map(hashId),
      algorithm2TopScore: unified.diagnostics.topScore,
      scoringVersion: unified.diagnostics.scoringVersion,
      scoringLatencyMs,
      totalLatencyDeltaMs: input.legacyLatencyMs != null
        ? Number((scoringLatencyMs - input.legacyLatencyMs).toFixed(3)) : null,
      candidatePoolVersion: poolVersion,
      metrics,
    };
  } catch (e) {
    // Shadow GAGAL → selamat: skip, tidak pernah jejas respons legasi.
    return {
      success: false, skipped: false, skipReason: null,
      errorCode: e instanceof Error ? e.name : "shadow_error",
      algorithm2RankedCandidateIdsHashed: [], algorithm2TopScore: null,
      scoringVersion: "algo2_scoring_v1", scoringLatencyMs: 0, totalLatencyDeltaMs: null,
      candidatePoolVersion: poolVersion, metrics: null,
    };
  }
}
