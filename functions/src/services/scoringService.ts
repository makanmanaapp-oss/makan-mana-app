import {DEFAULT_WEIGHTS} from "../config/constants";
import {PlaceCandidate} from "../types/place";

/**
 * Skor pemberat penuh Milestone 4 (rujuk seksyen 20 spec):
 * finalScore = jumlah(komponen * pemberat) - penalti sejarah.
 * Setiap komponen dinormalkan 0..1.
 */

export interface ScoringContext {
  budgetMax?: number | null;
  favoriteCuisines?: string[];
  lastCuisines?: string[];
  recentPlaceIds?: string[];
  mood?: string | null;
  radiusKm?: number;
  excludePlaceIds?: string[];
  /** Matlamat diet Pro: sihat | jimat | seimbang (null = tiada). */
  dietGoal?: string | null;
}

export const HEALTHY_CUISINES = ["vegetarian", "vegan", "salad", "healthy",
  "juice", "poke", "grill"];

/** Skor matlamat diet (Pro): pengaruh berterusan tanpa kira mood. */
function goalScore(place: PlaceCandidate, goal?: string | null): number {
  if (!goal) return 0.6;
  const cuisine = place.cuisine.toLowerCase();
  switch (goal) {
    case "sihat":
      return HEALTHY_CUISINES.some((c) => cuisine.includes(c)) ? 1 : 0.35;
    case "jimat":
      return place.priceLevel <= 1 ? 1 : place.priceLevel === 2 ? 0.5 : 0.15;
    case "seimbang":
    default:
      return 0.6;
  }
}

interface Scored {
  place: PlaceCandidate;
  score: number;
  reasons: string[];
}

function allowedPriceLevel(budgetMax?: number | null): number {
  if (budgetMax == null || budgetMax <= 0) return 2;
  if (budgetMax <= 15) return 1;
  if (budgetMax <= 30) return 2;
  if (budgetMax <= 60) return 3;
  return 4;
}

const SPICY_CUISINES = ["thai", "melayu", "malay", "mamak", "indonesia",
  "india", "korean", "szechuan", "sichuan"];

function moodScore(place: PlaceCandidate, mood?: string | null): number {
  if (!mood) return 0.6;
  const cuisine = place.cuisine.toLowerCase();
  switch (mood) {
    case "moodJimat":
      return place.priceLevel <= 1 ? 1 : place.priceLevel === 2 ? 0.5 : 0.1;
    case "moodPedas":
      return SPICY_CUISINES.some((c) => cuisine.includes(c)) ? 1 : 0.35;
    case "moodCafe":
      return cuisine.includes("cafe") || cuisine.includes("kafe") ||
        cuisine.includes("coffee") ? 1 : 0.3;
    case "moodHujan":
      // Hari hujan: makanan panas berkuah / selesa.
      return cuisine.includes("thai") || cuisine.includes("soup") ||
        cuisine.includes("mamak") || cuisine.includes("noodle") ||
        cuisine.includes("ramen") ? 1 : 0.45;
    case "moodSupper":
      return cuisine.includes("mamak") || cuisine.includes("fast") ||
        cuisine.includes("burger") || cuisine.includes("street") ? 1 : 0.5;
    case "moodHighRating":
      return place.rating >= 4.5 ? 1 : place.rating >= 4.0 ? 0.6 : 0.2;
    case "moodNearby":
      return place.distanceKm <= 1.5 ? 1 : place.distanceKm <= 3 ? 0.5 : 0.2;
    case "moodHealthy":
      return cuisine.includes("vegetarian") || cuisine.includes("vegan") ||
        cuisine.includes("salad") || cuisine.includes("healthy") ? 1 : 0.3;
    case "moodLapar":
    case "moodSurprise":
    default:
      return 0.7;
  }
}

/** Skor + susun calon. Pulangkan senarai tersusun dengan matchScore terisi. */
export function scoreAndRank(
  candidates: PlaceCandidate[],
  ctx: ScoringContext = {},
): PlaceCandidate[] {
  const w = DEFAULT_WEIGHTS;
  const exclude = new Set(ctx.excludePlaceIds ?? []);
  const lastCuisines = (ctx.lastCuisines ?? []).map((c) => c.toLowerCase());
  const favorites = (ctx.favoriteCuisines ?? []).map((c) => c.toLowerCase());
  const recent = new Set(ctx.recentPlaceIds ?? []);
  const radiusKm = ctx.radiusKm && ctx.radiusKm > 0 ? ctx.radiusKm : 5;
  const allowedPrice = allowedPriceLevel(ctx.budgetMax);

  const scored: Scored[] = candidates
    .filter((p) => p.isOpen && !exclude.has(p.placeId))
    .map((p) => {
      const cuisine = p.cuisine.toLowerCase();
      const reasons: string[] = [];

      const budget = p.priceLevel <= allowedPrice ?
        1 :
        Math.max(0, 1 - 0.45 * (p.priceLevel - allowedPrice));
      if (budget >= 1) reasons.push("withinBudget");

      const distance = Math.max(0, 1 - p.distanceKm / radiusKm);
      if (p.distanceKm <= radiusKm * 0.4) reasons.push("nearLocation");

      const confidence = Math.min(1, Math.log10(p.userRatingCount + 1) / 3);
      const rating = (p.rating / 5) * confidence;
      if (p.rating >= 4.5 && p.userRatingCount >= 100) {
        reasons.push("highRating");
      }

      const variety = lastCuisines.some((c) => cuisine.includes(c)) ? 0.3 : 1;

      const mood = moodScore(p, ctx.mood);
      if (mood >= 0.9) reasons.push("fitsMood");

      const userPref = favorites.some((c) => cuisine.includes(c)) ? 1 : 0.5;

      const historyPenalty = recent.has(p.placeId) ? 0.5 : 0;

      const goal = goalScore(p, ctx.dietGoal);
      const goalWeight = ctx.dietGoal ? 0.9 : 0;

      const total =
        budget * w.budget +
        distance * w.distance +
        rating * w.rating +
        variety * w.variety +
        mood * w.mood +
        userPref * w.userPreference +
        goal * goalWeight -
        historyPenalty;
      const maxTotal =
        w.budget + w.distance + w.rating + w.variety + w.mood +
        w.userPreference + goalWeight;

      return {place: p, score: total / maxTotal, reasons};
    })
    .sort((a, b) => b.score - a.score);

  return scored.map((s) => ({
    ...s.place,
    matchScore: Math.min(99, Math.max(40, Math.round(s.score * 100))),
    matchReasonKeys: s.reasons.slice(0, 3),
  }));
}
