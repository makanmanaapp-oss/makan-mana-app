/**
 * Algorithm 2 / Phase 2.3 — Pembina RecommendationUserContext dari hidrat Firestore.
 *
 * Digunakan oleh getSuggestions (Home AI Pick + Spin) DAN getNearbyPlaces (Home
 * Nearby + Explore) supaya semua permukaan membina konteks yang SAMA → versi
 * pemarkahan yang konsisten. Best-effort: medan tiada → default selamat ternormal.
 */
import {
  RawRecommendationInput,
  RecommendationUserContext,
  buildRecommendationContext,
  deriveTimeSegment,
} from "../domain/algorithm2/recommendationContext";

/** Map {nama: kiraan} atau array → senarai kunci diisih kiraan menurun. */
function keysByValueDesc(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .sort((a, b) => ((b[1] as number) ?? 0) - ((a[1] as number) ?? 0))
      .map(([k]) => k);
  }
  return [];
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export interface HydrationInput {
  uid: string;
  plan: string;
  language: string;
  lat: number | null;
  lng: number | null;
  radiusMeters: number;
  locationGrid?: string | null;
  mood: string | null;
  /** Jam tempatan MYT (0..23) untuk segmen masa. */
  localHour: number;
  profile: Record<string, unknown>;
  brain?: Record<string, unknown>;
  fitness?: Record<string, unknown>;
  wallet?: Record<string, unknown>;
  meals?: Array<Record<string, unknown>>;
}

/** Bina RecommendationUserContext ternormal dari data hidrat. */
export function buildRecCtxFromHydration(h: HydrationInput): RecommendationUserContext {
  const profile = h.profile ?? {};
  const brain = h.brain ?? {};
  const fitness = h.fitness ?? {};
  const wallet = h.wallet ?? {};

  const recentCuisines: string[] = [];
  const recentMealPlaceIds: string[] = [];
  const recentMealTags: string[] = [];
  for (const m of h.meals ?? []) {
    const pid = m.placeId as string | undefined;
    if (pid) recentMealPlaceIds.push(pid);
    const c = m.cuisine as string | undefined;
    if (c) recentCuisines.push(c);
    for (const t of (m.cuisineTags as string[] | undefined) ?? []) recentMealTags.push(t);
    for (const t of (m.healthTags as string[] | undefined) ?? []) recentMealTags.push(t);
  }

  const raw: RawRecommendationInput = {
    uid: h.uid,
    plan: h.plan,
    language: h.language,
    latitude: h.lat,
    longitude: h.lng,
    radiusMeters: h.radiusMeters,
    locationGrid: h.locationGrid ?? null,
    timeSegment: deriveTimeSegment(h.localHour),
    selectedMood: h.mood,
    recentMealPlaceIds,
    recentCuisines,
    recentMealTags,
    lastAcceptedAt: num(brain.lastAcceptedAt),
    // Profil makanan
    dietType: (profile.dietType as string | undefined) ?? null,
    dietTypes: (profile.dietTypes as string[] | undefined) ?? undefined,
    halalPreference: (profile.halalPreference as boolean | undefined) ?? false,
    allergies:
      (profile.allergies as string[] | undefined) ?? [],
    allergySeverity: (profile.allergySeverity as Record<string, string> | undefined) ?? undefined,
    favouriteCuisines:
      (profile.favoriteCuisines as string[] | undefined) ??
      (profile.favouriteCuisines as string[] | undefined) ?? [],
    cuisinesToTry: (profile.cuisinesToTry as string[] | undefined) ?? [],
    avoidedCuisines: keysByValueDesc(brain.avoidedCuisines),
    spicyPreference: num(profile.spicyPreference),
    dislikedFoods: (profile.dislikedFoods as string[] | undefined) ?? [],
    usualMealTimes: (profile.usualMealTimes as string[] | undefined) ?? [],
    // Tingkah laku
    repeatTolerance: num(brain.repeatTolerance),
    explorationLevel: num(brain.explorationLevel),
    preferredDistanceKm: num(brain.preferredDistanceKm),
    preferredPriceLevel: num(brain.preferredPriceLevel) ?? num(profile.preferredPriceLevel),
    commonRejectReasons: keysByValueDesc(brain.commonRejectReasons),
    topAcceptedCuisines: keysByValueDesc(brain.topCuisines),
    // Bajet
    budgetMin: num(profile.budgetMin),
    budgetMax: num(profile.budgetMax),
    averageMealSpend: num(wallet.averageMealSpend) ?? num(brain.averageMealSpend),
    budgetLeftToday: num(wallet.budgetLeftToday),
    budgetLeftWeek: num(wallet.budgetLeftWeek),
    // Fit
    fitGoal: (fitness.mainGoal as string | undefined) ?? null,
    sportMood: (fitness.sportMood as string | undefined) ?? (profile.sportMood as string | undefined) ?? null,
    trainingDay: (fitness.trainingDay as boolean | undefined) ?? false,
    calorieTarget: num(fitness.calorieTarget),
    proteinTarget: num(fitness.proteinTarget),
    recoveryContext: (fitness.recoveryContext as boolean | undefined) ?? false,
  };

  return buildRecommendationContext(raw);
}
