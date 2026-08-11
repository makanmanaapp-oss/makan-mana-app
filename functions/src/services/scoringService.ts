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
  // Prompt 6: isyarat keselamatan + peribadi (best-effort, bukan jaminan).
  allergies?: string[];
  dietType?: string | null;
  halalPreference?: boolean;
  spicyPreference?: number | null;
  topCuisines?: string[];
  avoidedCuisines?: string[];
  commonRejectReasons?: string[];
  fitGoal?: string | null;
}

export const HEALTHY_CUISINES = ["vegetarian", "vegan", "salad", "healthy",
  "juice", "poke", "grill"];

/**
 * Petunjuk konflik alahan (best-effort ikut nama/cuisine sahaja).
 * PENTING: ini BUKAN sistem alahan terjamin. Bila data tidak jelas kami
 * TIDAK mendakwa selamat — kami tandakan negativeSignal sahaja.
 */
const ALLERGY_CONFLICT: Record<string, string[]> = {
  seafood: ["seafood", "shellfish", "prawn", "udang", "ketam", "crab",
    "fish", "ikan", "tomyam", "sushi", "sashimi"],
  kacang: ["satay", "sate", "rojak", "kacang", "peanut", "gado", "pecal"],
  telur: ["telur", "egg"],
  susu: ["dairy", "cheese", "keju", "milk", "susu", "ice cream",
    "ais krim", "gelato", "creamery"],
  gluten: ["bakery", "bread", "roti", "noodle", "mee", "pasta",
    "ramen", "wheat", "bakeri"],
};
const HALAL_NEGATIVE = ["pork", "bak kut", "babi", " bar", "pub",
  "non-halal", "char siu", "siu yuk", "bacon", "ham "];
const HALAL_POSITIVE = ["malay", "melayu", "mamak", "nasi", "muslim"];
const VEG_POSITIVE = ["vegetarian", "vegan", "salad", "veg"];
const MEAT_HEAVY = ["steak", "bbq", "barbecue", "grill", "chicken",
  "beef", "mutton", "seafood", "burger", "ayam", "daging", "meat"];

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
  negativeSignals: string[];
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
  const topCuisines = (ctx.topCuisines ?? []).map((c) => c.toLowerCase());
  const avoidedCuisines =
    (ctx.avoidedCuisines ?? []).map((c) => c.toLowerCase());
  const recent = new Set(ctx.recentPlaceIds ?? []);
  const allergies = ctx.allergies ?? [];
  const rejects = (ctx.commonRejectReasons ?? []).map((r) => r.toLowerCase());
  const wantsCloser =
    rejects.some((r) => r.includes("far") || r.includes("jauh"));
  const wantsCheaper = rejects.some((r) =>
    r.includes("pricey") || r.includes("expensive") || r.includes("mahal"));
  const radiusKm = ctx.radiusKm && ctx.radiusKm > 0 ? ctx.radiusKm : 5;
  const allowedPrice = allowedPriceLevel(ctx.budgetMax);
  const spicy = ctx.spicyPreference ?? 0;
  const dietType = (ctx.dietType ?? "none").toLowerCase();
  const fitGoal = (ctx.fitGoal ?? "").toLowerCase();
  // Isyarat food-memory boleh laraskan pemberat jarak/bajet sedikit.
  const distanceWeight = w.distance * (wantsCloser ? 1.4 : 1);
  const budgetWeight = w.budget * (wantsCheaper ? 1.4 : 1);

  const scored: Scored[] = candidates
    .filter((p) => p.isOpen && !exclude.has(p.placeId))
    .map((p) => {
      const cuisine = p.cuisine.toLowerCase();
      const text = `${p.cuisine} ${p.name}`.toLowerCase();
      const reasons: string[] = [];
      const negativeSignals: string[] = [];

      const budget = p.priceLevel <= allowedPrice ?
        1 :
        Math.max(0, 1 - 0.45 * (p.priceLevel - allowedPrice));
      if (budget >= 1) reasons.push("withinBudget");
      if (p.priceLevel <= 0) negativeSignals.push("price_unknown");

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

      // ---- Prompt 6: keselamatan + peribadi (best-effort, tiada jaminan) ----
      let safetyAdj = 0;
      if (allergies.length > 0) {
        const conflict = allergies.some((a) =>
          (ALLERGY_CONFLICT[a] ?? []).some((t) => text.includes(t)));
        if (conflict) {
          safetyAdj -= 1.2;
          negativeSignals.push("possible_allergy_conflict");
        } else {
          // Data tidak jelas — kami TIDAK dakwa selamat.
          negativeSignals.push("allergy_data_unknown");
        }
      }
      if (ctx.halalPreference) {
        if (HALAL_NEGATIVE.some((t) => text.includes(t))) {
          safetyAdj -= 0.8;
          negativeSignals.push("possible_non_halal");
        } else if (HALAL_POSITIVE.some((t) => text.includes(t))) {
          safetyAdj += 0.2;
          reasons.push("halalFriendly");
        }
      }
      if (dietType === "vegetarian" || dietType === "vegan") {
        if (VEG_POSITIVE.some((t) => text.includes(t))) {
          safetyAdj += 0.3;
        } else if (MEAT_HEAVY.some((t) => text.includes(t))) {
          safetyAdj -= 0.6;
        }
      }
      if (spicy >= 3 && SPICY_CUISINES.some((c) => cuisine.includes(c))) {
        safetyAdj += 0.2;
      }
      if (topCuisines.some((c) => cuisine.includes(c))) safetyAdj += 0.15;
      if (avoidedCuisines.some((c) => cuisine.includes(c))) safetyAdj -= 0.3;
      if ((fitGoal.includes("fat") || fitGoal.includes("healthy") ||
          fitGoal.includes("cut") || fitGoal.includes("lose")) &&
        HEALTHY_CUISINES.some((c) => cuisine.includes(c))) {
        safetyAdj += 0.15;
      }

      const total =
        budget * budgetWeight +
        distance * distanceWeight +
        rating * w.rating +
        variety * w.variety +
        mood * w.mood +
        userPref * w.userPreference +
        goal * goalWeight +
        safetyAdj -
        historyPenalty;
      const maxTotal =
        budgetWeight + distanceWeight + w.rating + w.variety + w.mood +
        w.userPreference + goalWeight;

      return {place: p, score: total / maxTotal, reasons, negativeSignals};
    })
    .sort((a, b) => b.score - a.score);

  return scored.map((s) => ({
    ...s.place,
    matchScore: Math.min(99, Math.max(40, Math.round(s.score * 100))),
    matchReasonKeys: s.reasons.slice(0, 4),
    negativeSignals: s.negativeSignals,
  }));
}
