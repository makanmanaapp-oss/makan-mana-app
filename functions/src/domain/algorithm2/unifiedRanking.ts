/**
 * Algorithm 2 / Phase 2.3 — Orkestrasi pemarkahan BERSATU (tulen).
 *
 * Alir: sub-bendera degradasi konteks → penapis KESELAMATAN KERAS → markah V2 →
 * susun. Penindasan sesi / putaran / kepelbagaian / overlay kanonikal berlaku
 * SELEPAS ini dalam perkhidmatan sesi. Modul TULEN (tiada I/O).
 */
import { PlaceCandidate } from "../../types/place";
import { RecommendationUserContext } from "./recommendationContext";
import { applyHardSafety, HardSafetyResult, SafetyFilterReason } from "./safetyFilter";
import { rankCandidatesV2, ScoredCandidate, SCORING_VERSION } from "./scoringModel";

export interface ScoringSubFlags {
  mood: boolean;
  budget: boolean;
  foodMemory: boolean;
  fit: boolean;
  explain: boolean;
}

export const ALL_SUBFLAGS_ON: ScoringSubFlags = {
  mood: true, budget: true, foodMemory: true, fit: true, explain: true,
};

export interface UnifiedRankOptions {
  suppressedIds?: Set<string>;
  rejectMemoryIds?: Set<string>;
  subFlags?: ScoringSubFlags;
  excludeClosed?: boolean;
}

export interface UnifiedRankDiagnostics {
  scoringVersion: string;
  candidateCount: number;
  eligibleCount: number;
  safetyFilteredCount: number;
  safetyCounts: Record<SafetyFilterReason, number>;
  topScore: number | null;
  secondScore: number | null;
  scoreGap: number | null;
  moodApplied: boolean;
  budgetApplied: boolean;
  foodMemoryApplied: boolean;
  fitApplied: boolean;
  sportApplied: boolean;
  diversityApplied: boolean;
  topReasonKeys: string[];
  negativeSignalKeys: string[];
  // Part C/D/E — bukti Fit/Sport + wallet dipercayai (owner-only).
  fitEvidenceLevel: number;
  sportEvidenceLevel: number;
  nutritionVerified: boolean;
  walletDataAvailable: boolean;
  spendingContextApplied: boolean;
  // Phase 2.4A — top calon PRA-PUTARAN untuk bukti event→brain→ranking (owner-only).
  topCandidates: Array<{
    rank: number;
    placeIdMasked: string;
    cuisine: string;
    total: number;
    foodMemory: number;
    cuisinePref: number;
  }>;
}

export interface UnifiedRankResult {
  ranked: PlaceCandidate[];
  scored: ScoredCandidate[];
  safety: HardSafetyResult;
  diagnostics: UnifiedRankDiagnostics;
}

/** Degradasi konteks mengikut sub-bendera (rollback berbutir tanpa dakwaan palsu). */
export function applySubFlags(
  ctx: RecommendationUserContext,
  flags: ScoringSubFlags,
): RecommendationUserContext {
  const c = { ...ctx };
  if (!flags.mood) c.selectedMood = null;
  if (!flags.budget) {
    c.budgetMin = null; c.budgetMax = null; c.preferredPriceLevel = null;
    c.budgetLeftToday = null; c.budgetLeftWeek = null; c.overspendState = "unknown";
  }
  if (!flags.foodMemory) {
    c.topAcceptedCuisines = []; c.recentCuisines = []; c.recentMealPlaceIds = [];
    c.commonRejectReasons = [];
  }
  if (!flags.fit) {
    c.fitGoal = null; c.sportMood = null; c.trainingDay = false;
    c.calorieTarget = null; c.proteinTarget = null; c.recoveryContext = false;
  }
  return c;
}

/** Susun calon melalui keselamatan keras + model V2 bersatu. */
export function rankUnified(
  candidates: PlaceCandidate[],
  recCtx: RecommendationUserContext,
  opts: UnifiedRankOptions = {},
): UnifiedRankResult {
  const subFlags = opts.subFlags ?? ALL_SUBFLAGS_ON;
  const ctx = applySubFlags(recCtx, subFlags);

  const safety = applyHardSafety(candidates, ctx, {
    suppressedIds: opts.suppressedIds,
    rejectMemoryIds: opts.rejectMemoryIds,
    excludeClosed: opts.excludeClosed,
  });

  const { ranked, scored } = rankCandidatesV2(safety.eligible, ctx);

  // Explainability OFF → jangan pulangkan sebab/isyarat (rollback berbutir).
  const outRanked = subFlags.explain
    ? ranked
    : ranked.map((p) => ({ ...p, matchReasonKeys: [], negativeSignals: [] }));

  const top = scored[0]?.score ?? null;
  const second = scored[1]?.score ?? null;
  const diagnostics: UnifiedRankDiagnostics = {
    scoringVersion: SCORING_VERSION,
    candidateCount: candidates.length,
    eligibleCount: safety.eligible.length,
    safetyFilteredCount: safety.filtered.length,
    safetyCounts: safety.counts,
    topScore: top != null ? Number(top.toFixed(4)) : null,
    secondScore: second != null ? Number(second.toFixed(4)) : null,
    scoreGap: top != null && second != null ? Number((top - second).toFixed(4)) : null,
    moodApplied: subFlags.mood && ctx.selectedMood != null,
    budgetApplied: subFlags.budget && (ctx.budgetMax != null || ctx.preferredPriceLevel != null),
    foodMemoryApplied: subFlags.foodMemory &&
      (ctx.topAcceptedCuisines.length > 0 || ctx.recentCuisines.length > 0 || ctx.favouriteCuisines.length > 0),
    fitApplied: subFlags.fit && ctx.fitGoal != null,
    sportApplied: subFlags.fit && (ctx.sportMood != null || ctx.trainingDay),
    diversityApplied: false, // diisi oleh perkhidmatan sesi selepas kepelbagaian
    topReasonKeys: scored[0]?.reasons ?? [],
    negativeSignalKeys: scored[0]?.negativeSignals ?? [],
    fitEvidenceLevel: scored[0]?.fitEvidenceLevel ?? 0,
    sportEvidenceLevel: scored[0]?.sportEvidenceLevel ?? 0,
    nutritionVerified: scored[0]?.nutritionVerified ?? false,
    walletDataAvailable: ctx.walletDataAvailable,
    spendingContextApplied: subFlags.budget && ctx.walletDataAvailable && ctx.overspendState === "over",
    topCandidates: scored.slice(0, 8).map((s, i) => ({
      rank: i + 1,
      placeIdMasked: s.place.placeId.length > 10
        ? `${s.place.placeId.slice(0, 6)}…${s.place.placeId.slice(-3)}` : s.place.placeId,
      cuisine: s.place.cuisine,
      total: Number(s.score.toFixed(4)),
      foodMemory: Number(s.components.foodMemory.toFixed(3)),
      cuisinePref: Number(s.components.cuisinePreference.toFixed(3)),
    })),
  };

  return { ranked: outRanked, scored, safety, diagnostics };
}
