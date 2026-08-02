/**
 * Algorithm 2 / Phase 2.3 — MODEL PEMARKAHAN BERSATU & BERVERSI (tulen).
 *
 * finalScore = Σ(component_i × weight_i × moodMultiplier_i) + moodFit×w.mood − Σpenalti
 * Setiap komponen dinormalkan ke julat [0,1] yang didokumenkan. Berat & multiplier
 * mood didokumenkan. Skor deterministik & terbatas (tiada pendaraban tak terbatas).
 *
 * KESELAMATAN: penapis keras (safetyFilter) dijalankan SEBELUM modul ini. Model
 * ini TIDAK mendakwa kalori/harga/halal yang tidak disahkan — data tidak diketahui
 * menghasilkan isyarat negatif jujur, bukan kepastian palsu.
 *
 * Modul TULEN (tiada I/O). Boleh diuji sepenuhnya.
 */
import { PlaceCandidate } from "../../types/place";
import { RecommendationUserContext } from "./recommendationContext";

export const SCORING_VERSION = "algo2_scoring_v1";

/**
 * BERAT ASAS (didokumenkan). Dipilih supaya tiada satu isyarat mendominasi:
 * keutamaan pengguna & mood adalah tertinggi, diikuti bajet/jarak/rating.
 */
export const WEIGHTS_V2 = {
  availability: 0.8,
  distance: 1.0,
  ratingConfidence: 0.9,
  budget: 1.0,
  cuisinePreference: 1.1,
  mood: 1.2,
  dietCompatibility: 0.7,
  halalConfidence: 0.5,
  foodMemory: 0.9,
  variety: 0.7,
  exploration: 0.5,
  fitContext: 0.6,
  sportContext: 0.5,
  spendingContext: 0.6,
  placeQuality: 0.5,
} as const;

export type WeightKey = keyof typeof WEIGHTS_V2;

/** Had penalti (dokumen). Semua terbatas; keselamatan alahan/halal = penapis keras. */
export const PENALTY_CAPS = {
  explicitAvoid: 0.6,
  recentRepeat: 0.7,
  distanceOverPreference: 0.4,
  budgetOverrun: 0.5,
  unknownAvailability: 0.25,
  dislikedFood: 0.5,
  staleData: 0.2,
} as const;

/**
 * PROFIL MOOD — multiplier ke atas berat asas (Part E). Nilai >1 mengukuhkan
 * isyarat, <1 melemahkan. Mood juga mempunyai komponen "moodFit" berasingan.
 */
export const MOOD_WEIGHT_MULTIPLIERS: Record<string, Partial<Record<WeightKey, number>>> = {
  moodNearby: { distance: 1.9, availability: 1.3 },
  moodHighRating: { ratingConfidence: 2.2, placeQuality: 1.6 },
  moodJimat: { budget: 2.0, spendingContext: 1.6 },
  moodHealthy: { dietCompatibility: 1.9, fitContext: 1.4 },
  moodCafe: { cuisinePreference: 1.2 },
  moodLapar: { distance: 1.3, availability: 1.4 },
  moodPedas: {},
  moodSupper: { availability: 1.8, distance: 1.2 },
  moodHujan: { distance: 1.1 },
  moodSurprise: { exploration: 2.2, variety: 1.5 },
};

// ---------------- Token/heuristik (best-effort, tiada dakwaan pasti) ----------------
const CAFE_TOKENS = ["cafe", "kafe", "coffee", "kopi", "bakery", "bakeri", "dessert", "cake", "brunch"];
const COMFORT_TOKENS = ["soup", "sup", "noodle", "mee", "ramen", "porridge", "bubur", "hotpot", "steamboat", "congee"];
const SPICY_TOKENS = ["thai", "melayu", "malay", "mamak", "indonesia", "india", "korean", "szechuan", "sichuan", "pedas", "tomyam", "curry", "kari"];
const HEALTHY_TOKENS = ["vegetarian", "vegan", "salad", "healthy", "juice", "poke", "grill", "sihat", "smoothie"];
const HEAVY_TOKENS = ["fried", "goreng", "burger", "pizza", "fast", "bbq", "barbecue", "buffet"];
const LATE_TOKENS = ["mamak", "24", "supper", "street", "burger", "fast", "roti canai"];
const PROTEIN_TOKENS = ["chicken", "ayam", "beef", "daging", "steak", "grill", "seafood", "fish", "egg", "protein", "bbq"];
const HALAL_POSITIVE_TOKENS = ["malay", "melayu", "mamak", "nasi", "muslim", "halal"];

function textOf(p: PlaceCandidate): string {
  return `${p.cuisine} ${p.name}`.toLowerCase();
}
function anyIncludes(text: string, tokens: string[]): boolean {
  return tokens.some((t) => text.includes(t));
}
function cuisineMatches(cuisine: string, list: string[]): boolean {
  return list.some((c) => c.length > 0 && cuisine.includes(c));
}

/** Had harga dibenarkan dari budgetMax (RM). */
function allowedPriceLevel(budgetMax: number | null): number {
  if (budgetMax == null || budgetMax <= 0) return 2;
  if (budgetMax <= 15) return 1;
  if (budgetMax <= 30) return 2;
  if (budgetMax <= 60) return 3;
  return 4;
}

export interface ScoreComponents {
  availability: number;
  distance: number;
  ratingConfidence: number;
  budget: number;
  cuisinePreference: number;
  moodFit: number;
  dietCompatibility: number;
  halalConfidence: number;
  foodMemory: number;
  variety: number;
  exploration: number;
  fitContext: number;
  sportContext: number;
  spendingContext: number;
  placeQuality: number;
}

export interface ScoredCandidate {
  place: PlaceCandidate;
  score: number; // 0..1 ternormal
  matchScore: number; // 0..100
  components: ScoreComponents;
  reasons: string[];
  negativeSignals: string[];
  weightsUsed: Record<string, number>;
  // Part C/D — diagnostik bukti (owner-only).
  fitEvidenceLevel: EvidenceLevel;
  sportEvidenceLevel: EvidenceLevel;
  nutritionVerified: boolean;
}

// ---------------- Komponen (setiap satu 0..1) ----------------

function availabilityScore(p: PlaceCandidate): number {
  // Tutup sudah ditapis keras. Jadual diketahui = 1.0; tidak diketahui = 0.72.
  const known = Array.isArray(p.openingPeriods) && p.openingPeriods.length > 0;
  return known ? 1.0 : 0.72;
}

function distanceScore(p: PlaceCandidate, radiusKm: number): number {
  const r = radiusKm > 0 ? radiusKm : 5;
  return Math.min(1, Math.max(0, 1 - p.distanceKm / r));
}

/** Part I — keyakinan rating: rating × keyakinan-bilangan-ulasan (log). */
function ratingConfidenceScore(p: PlaceCandidate): number {
  if (!p.rating || p.rating <= 0 || !p.userRatingCount || p.userRatingCount <= 0) {
    return 0.4; // rating tidak diketahui kekal tidak diketahui (neutral rendah)
  }
  const confidence = Math.min(1, Math.log10(p.userRatingCount + 1) / 3); // ~1000 ulasan → ~1.0
  return Math.min(1, (p.rating / 5) * confidence);
}

function placeQualityScore(p: PlaceCandidate): number {
  if (!p.userRatingCount || p.userRatingCount <= 0) return 0.4;
  return Math.min(1, Math.log10(p.userRatingCount + 1) / 3);
}

function budgetScore(p: PlaceCandidate, ctx: RecommendationUserContext): number {
  if (p.priceLevel <= 0) return 0.6; // harga tidak diketahui → neutral (jangan jadi "percuma")
  const allowed = ctx.preferredPriceLevel ?? allowedPriceLevel(ctx.budgetMax);
  if (p.priceLevel <= allowed) return 1;
  return Math.max(0, 1 - 0.4 * (p.priceLevel - allowed));
}

function spendingContextScore(p: PlaceCandidate, ctx: RecommendationUserContext): number {
  // Overspend → promosi tempat lebih murah. Under/unknown → neutral.
  if (ctx.overspendState !== "over") return 0.6;
  if (p.priceLevel <= 0) return 0.5;
  return p.priceLevel <= 1 ? 1 : p.priceLevel === 2 ? 0.6 : 0.2;
}

function cuisinePreferenceScore(cuisine: string, ctx: RecommendationUserContext): number {
  if (cuisineMatches(cuisine, ctx.favouriteCuisines)) return 1;
  if (cuisineMatches(cuisine, ctx.cuisinesToTry)) return 0.8;
  return 0.5;
}

function foodMemoryScore(cuisine: string, ctx: RecommendationUserContext): number {
  if (cuisineMatches(cuisine, ctx.topAcceptedCuisines)) return 1;
  return 0.5;
}

function dietCompatibilityScore(text: string, ctx: RecommendationUserContext): number {
  if (ctx.dietTypes.length === 0) return 0.6; // tiada diet → neutral
  const veg = ctx.dietTypes.some((d) => d.includes("veg"));
  if (veg) {
    if (anyIncludes(text, HEALTHY_TOKENS.concat(["vegetarian", "vegan", "veg"]))) return 1;
    if (anyIncludes(text, ["steak", "bbq", "grill", "chicken", "beef", "seafood", "ayam", "daging"])) return 0.2;
  }
  return 0.55;
}

/** Keyakinan halal: JANGAN dakwa halal. positif → naik; tidak diketahui → 0.5. */
function halalConfidenceScore(text: string, ctx: RecommendationUserContext): number {
  if (!ctx.halalPreference) return 0.6; // bukan faktor
  if (anyIncludes(text, HALAL_POSITIVE_TOKENS)) return 1;
  return 0.5; // tidak disahkan → neutral (isyarat halal_status_unknown ditambah)
}

function varietyScore(cuisine: string, ctx: RecommendationUserContext): number {
  const inRecent = cuisineMatches(cuisine, ctx.recentCuisines);
  if (!inRecent) return 1;
  // Repeat-tolerant → penalti kepelbagaian lebih kecil.
  return 0.3 + 0.5 * ctx.repeatTolerance;
}

function explorationScore(cuisine: string, ctx: RecommendationUserContext): number {
  const novel = !cuisineMatches(cuisine, ctx.favouriteCuisines) &&
    !cuisineMatches(cuisine, ctx.recentCuisines);
  // Pengguna exploration tinggi → cuisine baharu skor lebih tinggi.
  if (novel) return 0.5 + 0.5 * ctx.explorationLevel;
  return 0.5 - 0.2 * ctx.explorationLevel;
}

export type EvidenceLevel = 0 | 1 | 2;

const CARB_TOKENS = ["rice", "nasi", "noodle", "mee", "pasta", "carb", "bread", "roti"];
const ENERGY_TOKENS = ["rice", "nasi", "pasta", "juice", "smoothie", "energy"];

/**
 * Part C — tahap bukti Fit (per-tempat). Tiada nutrisi berstruktur disahkan
 * dalam data tempat → tahap 2 TIDAK PERNAH dicapai (didokumen). Tag klasifikasi
 * dipercayai = tahap 1; tiada tag relevan = tahap 0.
 */
export function fitEvidenceLevel(text: string, ctx: RecommendationUserContext): EvidenceLevel {
  if (!ctx.fitGoal) return 0;
  const goal = ctx.fitGoal;
  let tags: string[];
  if (goal.includes("lose") || goal.includes("fat") || goal.includes("cut") || goal.includes("weight")) {
    tags = HEALTHY_TOKENS.concat(HEAVY_TOKENS); // healthy/heavy kedua-dua = bukti klasifikasi
  } else if (goal.includes("muscle") || goal.includes("gain") || goal.includes("protein") || goal.includes("bulk")) {
    tags = PROTEIN_TOKENS;
  } else {
    tags = HEALTHY_TOKENS.concat(PROTEIN_TOKENS);
  }
  return anyIncludes(text, tags) ? 1 : 0;
}

/** Part D — tahap bukti Sport (per-tempat). Sama: tag = tahap 1, tiada = tahap 0. */
export function sportEvidenceLevel(text: string, ctx: RecommendationUserContext): EvidenceLevel {
  if (!ctx.sportMood && !ctx.trainingDay) return 0;
  const sm = ctx.sportMood ?? "";
  let tags: string[];
  if (sm.includes("pre")) tags = CARB_TOKENS;
  else if (sm.includes("post") || ctx.recoveryContext) tags = PROTEIN_TOKENS;
  else if (sm.includes("endurance")) tags = ENERGY_TOKENS;
  else tags = []; // rest day → tiada tag khusus (keutamaan biasa mendominasi)
  return tags.length > 0 && anyIncludes(text, tags) ? 1 : 0;
}

/**
 * Part C — Fit: BUKTI-BERPAGAR. Tahap 0 → neutral (berat dimatikan). Tahap 1 →
 * galakan TERBATAS (0.85, bukan 1.0 — bukan nutrisi disahkan). Tiada dakwaan makro.
 */
function fitContextScore(text: string, ctx: RecommendationUserContext, level: EvidenceLevel): number {
  if (level === 0 || !ctx.fitGoal) return 0.5;
  const goal = ctx.fitGoal;
  if (goal.includes("lose") || goal.includes("fat") || goal.includes("cut") || goal.includes("weight")) {
    if (anyIncludes(text, HEALTHY_TOKENS)) return 0.85; // terbatas (tag sahaja)
    if (anyIncludes(text, HEAVY_TOKENS)) return 0.25;
    return 0.5;
  }
  if (goal.includes("muscle") || goal.includes("gain") || goal.includes("protein") || goal.includes("bulk")) {
    return anyIncludes(text, PROTEIN_TOKENS) ? 0.85 : 0.5;
  }
  return 0.55;
}

/** Part D — Sport: BUKTI-BERPAGAR. Tahap 0 → neutral (berat 0). Tahap 1 → 0.85. */
function sportContextScore(text: string, ctx: RecommendationUserContext, level: EvidenceLevel): number {
  if (level === 0) return 0.5;
  return 0.85; // tag dipadan (terbatas; bukan nutrisi disahkan)
}

/** moodFit — keserasian cuisine/tag/harga/masa dengan mood dipilih (0..1). */
function moodFitScore(p: PlaceCandidate, ctx: RecommendationUserContext): number {
  const mood = ctx.selectedMood;
  if (!mood) return 0.6;
  const cuisine = p.cuisine.toLowerCase();
  const text = textOf(p);
  switch (mood) {
    case "moodJimat":
      return p.priceLevel <= 1 ? 1 : p.priceLevel === 2 ? 0.55 : 0.15;
    case "moodPedas": {
      const spicy = anyIncludes(text, SPICY_TOKENS);
      if (ctx.spicyPreference <= 1 && spicy) return 0.6; // hormati sensitiviti
      return spicy ? 1 : 0.3;
    }
    case "moodCafe":
      return anyIncludes(text, CAFE_TOKENS) ? 1 : 0.3;
    case "moodHujan":
      return anyIncludes(text, COMFORT_TOKENS) ? 1 : 0.45;
    case "moodSupper":
      return anyIncludes(text, LATE_TOKENS) ? 1 : 0.45;
    case "moodHighRating":
      return p.rating >= 4.5 ? 1 : p.rating >= 4.0 ? 0.6 : 0.2;
    case "moodNearby":
      return p.distanceKm <= 1.5 ? 1 : p.distanceKm <= 3 ? 0.55 : 0.2;
    case "moodHealthy":
      return anyIncludes(text, HEALTHY_TOKENS) ? 1 : 0.3;
    case "moodLapar":
      return anyIncludes(cuisine, ["nasi", "rice", "noodle", "mee", "burger", "fast", "buffet"]) ? 0.9 : 0.65;
    case "moodSurprise":
      return 0.7; // exploration dikendali oleh komponen exploration
    default:
      return 0.65;
  }
}

// ---------------- Penalti (0..cap) ----------------

function explicitAvoidPenalty(cuisine: string, ctx: RecommendationUserContext): number {
  return cuisineMatches(cuisine, ctx.avoidedCuisines) ? PENALTY_CAPS.explicitAvoid : 0;
}
function dislikedFoodPenalty(text: string, ctx: RecommendationUserContext): number {
  return anyIncludes(text, ctx.dislikedFoods) ? PENALTY_CAPS.dislikedFood : 0;
}
function recentRepeatPenalty(p: PlaceCandidate, ctx: RecommendationUserContext): number {
  if (!ctx.recentMealPlaceIds.includes(p.placeId)) return 0;
  // Toleransi ulang tinggi → penalti lebih kecil (jangan tanam kekal).
  return PENALTY_CAPS.recentRepeat * (1 - 0.7 * ctx.repeatTolerance);
}
function distanceOverPreferencePenalty(p: PlaceCandidate, ctx: RecommendationUserContext): number {
  if (p.distanceKm <= ctx.preferredDistanceKm) return 0;
  const over = (p.distanceKm - ctx.preferredDistanceKm) / Math.max(1, ctx.preferredDistanceKm);
  return Math.min(PENALTY_CAPS.distanceOverPreference, PENALTY_CAPS.distanceOverPreference * over);
}
function budgetOverrunPenalty(p: PlaceCandidate, ctx: RecommendationUserContext): number {
  if (p.priceLevel <= 0) return 0;
  const allowed = ctx.preferredPriceLevel ?? allowedPriceLevel(ctx.budgetMax);
  if (p.priceLevel <= allowed) return 0;
  return Math.min(PENALTY_CAPS.budgetOverrun, 0.25 * (p.priceLevel - allowed));
}
function unknownAvailabilityPenalty(p: PlaceCandidate): number {
  const known = Array.isArray(p.openingPeriods) && p.openingPeriods.length > 0;
  return known ? 0 : PENALTY_CAPS.unknownAvailability;
}

// ---------------- Skor + sebab ----------------

/** Multiplier mood untuk kunci berat tertentu (1 jika tiada). */
function moodMultiplier(mood: string | null, key: WeightKey): number {
  if (!mood) return 1;
  return MOOD_WEIGHT_MULTIPLIERS[mood]?.[key] ?? 1;
}

/**
 * Part G — sebab reject biasa mengukuhkan keutamaan tertentu:
 * too_far → jarak; too_expensive → bajet + spending. Terbatas & didokumen.
 */
function rejectReasonMultiplier(ctx: RecommendationUserContext, key: WeightKey): number {
  const reasons = ctx.commonRejectReasons;
  if (reasons.length === 0) return 1;
  const wantsCloser = reasons.some((r) => r.includes("far") || r.includes("jauh"));
  const wantsCheaper = reasons.some((r) =>
    r.includes("expensive") || r.includes("pricey") || r.includes("mahal"));
  if (key === "distance" && wantsCloser) return 1.4;
  if (key === "budget" && wantsCheaper) return 1.4;
  if (key === "spendingContext" && wantsCheaper) return 1.2;
  return 1;
}

/** Kunci berat yang dimatikan bila konteks tidak relevan (Fit/Sport). */
function effectiveWeight(key: WeightKey, ctx: RecommendationUserContext): number {
  let w = WEIGHTS_V2[key] as number;
  if (key === "fitContext" && !ctx.fitGoal) w = 0;
  if (key === "sportContext" && !ctx.sportMood && !ctx.trainingDay) w = 0;
  if (key === "spendingContext" && ctx.overspendState === "unknown") w = 0;
  if (key === "halalConfidence" && !ctx.halalPreference) w = 0;
  if (key === "dietCompatibility" && ctx.dietTypes.length === 0) w = 0;
  return w;
}

/** Skor satu calon (deterministik). */
export function scoreCandidateV2(
  p: PlaceCandidate,
  ctx: RecommendationUserContext,
): ScoredCandidate {
  const cuisine = p.cuisine.toLowerCase();
  const text = textOf(p);
  const radiusKm = ctx.radiusMeters / 1000;

  // Part C/D — bukti Fit/Sport per-tempat (pagar berat + sebab + isyarat).
  const fitLevel = fitEvidenceLevel(text, ctx);
  const sportLevel = sportEvidenceLevel(text, ctx);

  const components: ScoreComponents = {
    availability: availabilityScore(p),
    distance: distanceScore(p, radiusKm),
    ratingConfidence: ratingConfidenceScore(p),
    budget: budgetScore(p, ctx),
    cuisinePreference: cuisinePreferenceScore(cuisine, ctx),
    moodFit: moodFitScore(p, ctx),
    dietCompatibility: dietCompatibilityScore(text, ctx),
    halalConfidence: halalConfidenceScore(text, ctx),
    foodMemory: foodMemoryScore(cuisine, ctx),
    variety: varietyScore(cuisine, ctx),
    exploration: explorationScore(cuisine, ctx),
    fitContext: fitContextScore(text, ctx, fitLevel),
    sportContext: sportContextScore(text, ctx, sportLevel),
    spendingContext: spendingContextScore(p, ctx),
    placeQuality: placeQualityScore(p),
  };

  // Jumlah berwajaran + moodFit; normalkan dengan jumlah berat berkesan.
  const keys: WeightKey[] = [
    "availability", "distance", "ratingConfidence", "budget", "cuisinePreference",
    "dietCompatibility", "halalConfidence", "foodMemory", "variety", "exploration",
    "fitContext", "sportContext", "spendingContext", "placeQuality",
  ];
  let weightedSum = 0;
  let maxSum = 0;
  const weightsUsed: Record<string, number> = {};
  for (const k of keys) {
    let base = effectiveWeight(k, ctx);
    // Part C/D — pagar bukti: tiada bukti tag → berat Fit/Sport = 0.
    if (k === "fitContext" && fitLevel === 0) base = 0;
    if (k === "sportContext" && sportLevel === 0) base = 0;
    const w = base * moodMultiplier(ctx.selectedMood, k) * rejectReasonMultiplier(ctx, k);
    if (w <= 0) continue;
    weightsUsed[k] = Number(w.toFixed(3));
    weightedSum += (components[k as keyof ScoreComponents] as number) * w;
    maxSum += w;
  }
  // moodFit (berat mood).
  const moodW = WEIGHTS_V2.mood;
  weightsUsed.mood = moodW;
  weightedSum += components.moodFit * moodW;
  maxSum += moodW;

  // Penalti terbatas.
  const penalties =
    explicitAvoidPenalty(cuisine, ctx) +
    dislikedFoodPenalty(text, ctx) +
    recentRepeatPenalty(p, ctx) +
    distanceOverPreferencePenalty(p, ctx) +
    budgetOverrunPenalty(p, ctx) +
    unknownAvailabilityPenalty(p);

  const normalized = maxSum > 0 ? weightedSum / maxSum : 0;
  const score = Math.min(1, Math.max(0, normalized - penalties / Math.max(1, maxSum)));

  // Tahap 2 (nutrisi berstruktur disahkan) tidak wujud dalam data tempat.
  const nutritionVerified = false;
  const { reasons, negativeSignals } = explain(p, ctx, components, fitLevel, sportLevel);

  return {
    place: p,
    score,
    matchScore: Math.min(100, Math.max(0, Math.round(score * 100))),
    components,
    reasons,
    negativeSignals,
    weightsUsed,
    fitEvidenceLevel: fitLevel,
    sportEvidenceLevel: sportLevel,
    nutritionVerified,
  };
}

/** Part J — sebab + isyarat negatif jujur dari komponen (bukti-berpagar). */
function explain(
  p: PlaceCandidate,
  ctx: RecommendationUserContext,
  c: ScoreComponents,
  fitLevel: EvidenceLevel,
  sportLevel: EvidenceLevel,
): { reasons: string[]; negativeSignals: string[] } {
  const cuisine = p.cuisine.toLowerCase();
  const text = textOf(p);
  // Calon sebab (kunci, kekuatan) — pilih 3 terkuat yang benar.
  const cand: Array<{ key: string; strength: number }> = [];
  if (c.distance >= 0.75) cand.push({ key: "nearLocation", strength: c.distance });
  if (c.budget >= 0.95 && p.priceLevel > 0) cand.push({ key: "withinBudget", strength: 0.9 });
  if (ctx.selectedMood && c.moodFit >= 0.85) cand.push({ key: "fitsMood", strength: c.moodFit });
  if (cuisineMatches(cuisine, ctx.favouriteCuisines)) cand.push({ key: "matchesFavourite", strength: 0.95 });
  if (cuisineMatches(cuisine, ctx.topAcceptedCuisines)) cand.push({ key: "oftenAccepted", strength: 0.85 });
  if (c.ratingConfidence >= 0.7) cand.push({ key: "highRating", strength: c.ratingConfidence });
  if (c.variety >= 0.95 && ctx.recentCuisines.length > 0) cand.push({ key: "differentFromRecent", strength: 0.7 });
  if (c.availability >= 1 && ctx.selectedMood === "moodSupper") cand.push({ key: "openNow", strength: 0.8 });
  // Part H — suitsFitGoal HANYA dengan bukti tag (level ≥ 1), tiada dakwaan makro.
  if (ctx.fitGoal && fitLevel >= 1 && c.fitContext >= 0.8) cand.push({ key: "suitsFitGoal", strength: 0.75 });
  if (ctx.overspendState === "over" && c.spendingContext >= 0.9) cand.push({ key: "cheaperForBudget", strength: 0.8 });
  if (ctx.halalPreference && anyIncludes(text, HALAL_POSITIVE_TOKENS)) cand.push({ key: "halalFriendly", strength: 0.6 });
  const reasons = cand.sort((a, b) => b.strength - a.strength).slice(0, 3).map((r) => r.key);

  // Isyarat negatif JUJUR.
  const neg: string[] = [];
  if (p.priceLevel <= 0) neg.push("price_estimated");
  if (!Array.isArray(p.openingPeriods) || p.openingPeriods.length === 0) neg.push("hours_unverified");
  if (ctx.halalPreference && !anyIncludes(text, HALAL_POSITIVE_TOKENS)) neg.push("halal_status_unknown");
  if (ctx.allergies.length > 0) neg.push("allergy_data_unknown"); // konflik jelas sudah ditapis keras
  if (p.distanceKm > ctx.preferredDistanceKm) neg.push("beyond_preferred_distance");
  if (ctx.recentMealPlaceIds.includes(p.placeId)) neg.push("similar_to_recent");
  // Part C/D — bila Fit/Sport aktif tetapi nutrisi tidak disahkan → jujur.
  if ((ctx.fitGoal || ctx.sportMood || ctx.trainingDay) && (fitLevel >= 1 || sportLevel >= 1)) {
    neg.push("nutrition_not_verified");
  }
  return { reasons, negativeSignals: [...new Set(neg)] };
}

/** Skor + susun senarai (menurun). matchScore/reasons/negativeSignals diisi. */
export function rankCandidatesV2(
  candidates: PlaceCandidate[],
  ctx: RecommendationUserContext,
): { ranked: PlaceCandidate[]; scored: ScoredCandidate[] } {
  const scored = candidates
    .map((p) => scoreCandidateV2(p, ctx))
    .sort((a, b) => b.score - a.score);
  const ranked = scored.map((s) => ({
    ...s.place,
    matchScore: s.matchScore,
    matchReasonKeys: s.reasons.slice(0, 3),
    negativeSignals: s.negativeSignals,
  }));
  return { ranked, scored };
}
