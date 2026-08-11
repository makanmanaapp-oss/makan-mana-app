/**
 * Algorithm 2 / Phase 2.1 — kalkulator corong calon (TULEN, TEST-ONLY).
 *
 * FORENSIK SAHAJA. Modul ini TIDAK diimport oleh mana-mana callable produksi —
 * ia mengira corong calon secara deterministik untuk audit + ujian garis dasar.
 * Ia mencerminkan penapis scoreAndRank sebenar (isOpen && !exclude) tanpa
 * mengubah pemeringkatan.
 */
import { PlaceCandidate } from "../../types/place";
import { ScoringContext, scoreAndRank } from "../../services/scoringService";

export interface CandidateFunnel {
  rawCandidateCount: number;
  uniqueCandidateCount: number;
  duplicateRemovedCount: number;
  closedRemovedCount: number;
  excludeRemovedCount: number;
  eligibleCandidateCount: number;
  rankedCandidateCount: number;
  homeReturnedCount: number;
  spinPrimaryCount: number;
  spinAlternativesCount: number;
  /** Gap skor antara #1 dan #2 (0 jika <2). Kecil = seri rapat. */
  topScoreGap: number;
  /** Bilangan cuisine unik dalam set ternilai. */
  uniqueCuisineCount: number;
  /** Taburan cuisine bagi output Home (kunci→kiraan). */
  homeCuisineDistribution: Record<string, number>;
  /** ID (mentah — pemanggil topeng bila perlu) untuk sampel deterministik. */
  rankedPlaceIds: string[];
}

const HOME_SLICE = 12;
const SPIN_SLICE = 5;

export function computeCandidateFunnel(
  candidates: readonly PlaceCandidate[],
  ctx: ScoringContext = {},
  opts: { homeSlice?: number; spinSlice?: number } = {},
): CandidateFunnel {
  const homeSlice = opts.homeSlice ?? HOME_SLICE;
  const spinSlice = opts.spinSlice ?? SPIN_SLICE;

  const raw = candidates.length;

  // Dedupe mengikut placeId (mendedahkan pertindihan alias/ID pembekal).
  const byId = new Map<string, PlaceCandidate>();
  for (const c of candidates) if (!byId.has(c.placeId)) byId.set(c.placeId, c);
  const unique = [...byId.values()];
  const duplicateRemoved = raw - unique.length;

  const exclude = new Set(ctx.excludePlaceIds ?? []);
  const closedRemoved = unique.filter((p) => !p.isOpen).length;
  const excludeRemoved = unique.filter((p) => p.isOpen && exclude.has(p.placeId)).length;
  const eligible = unique.filter((p) => p.isOpen && !exclude.has(p.placeId));

  // Pemeringkatan sebenar (tidak diubah). scoreAndRank menapis isOpen+exclude
  // sendiri, jadi kiraan output = eligible.
  const ranked = scoreAndRank([...candidates], ctx);

  const topScoreGap =
    ranked.length >= 2 ? ranked[0].matchScore - ranked[1].matchScore : 0;

  const cuisines = new Set(eligible.map((p) => p.cuisine.toLowerCase()));
  const home = ranked.slice(0, homeSlice);
  const homeCuisineDistribution: Record<string, number> = {};
  for (const p of home) {
    const k = p.cuisine.toLowerCase();
    homeCuisineDistribution[k] = (homeCuisineDistribution[k] ?? 0) + 1;
  }

  return {
    rawCandidateCount: raw,
    uniqueCandidateCount: unique.length,
    duplicateRemovedCount: duplicateRemoved,
    closedRemovedCount: closedRemoved,
    excludeRemovedCount: excludeRemoved,
    eligibleCandidateCount: eligible.length,
    rankedCandidateCount: ranked.length,
    homeReturnedCount: Math.min(ranked.length, homeSlice),
    spinPrimaryCount: ranked.length > 0 ? 1 : 0,
    spinAlternativesCount: Math.max(0, Math.min(ranked.length, spinSlice) - 1),
    topScoreGap,
    uniqueCuisineCount: cuisines.size,
    homeCuisineDistribution,
    rankedPlaceIds: ranked.map((p) => p.placeId),
  };
}
