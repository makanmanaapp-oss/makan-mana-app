/**
 * Algorithm 2 / Phase 2.3 — Kontrak konteks pengesyoran TERNORMAL (tunggal).
 *
 * Satu bentuk konteks pengguna yang dinormalkan + disahkan sebelum pemarkahan.
 * Semua permukaan (Home AI Pick, Spin, Explore) menggunakan kontrak yang SAMA.
 *
 * PRINSIP KESELAMATAN:
 *  - sahkan & normalkan setiap medan; nilai mustahil diabaikan (default selamat).
 *  - data tidak diketahui KEKAL tidak diketahui (jangan jadi "selamat").
 *  - JANGAN log nota alahan/kesihatan mentah (lihat maskForLog).
 *  - kontrak berversi (RECOMMENDATION_CONTEXT_VERSION).
 */

export const RECOMMENDATION_CONTEXT_VERSION = "recctx_v1";

/** Segmen masa kasar (untuk mood Supper / ketersediaan). */
export type TimeSegment =
  | "breakfast" | "brunch" | "lunch" | "tea" | "dinner" | "supper" | "latenight";

export interface RecommendationUserContext {
  version: string;
  // Identiti
  uid: string;
  plan: string;
  language: string;
  // Lokasi
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  locationGrid: string | null;
  locationUpdatedAt: number | null;
  hasValidLocation: boolean;
  // Konteks hidangan
  timeSegment: TimeSegment;
  selectedMood: string | null;
  recentMealPlaceIds: string[];
  recentCuisines: string[];
  recentMealTags: string[];
  lastAcceptedAt: number | null;
  // Profil makanan
  dietTypes: string[];
  halalPreference: boolean;
  allergies: string[];
  allergySeverity: Record<string, "mild" | "severe">;
  favouriteCuisines: string[];
  cuisinesToTry: string[];
  avoidedCuisines: string[];
  spicyPreference: number; // 0..3
  dislikedFoods: string[];
  usualMealTimes: string[];
  // Tingkah laku
  repeatTolerance: number; // 0..1
  explorationLevel: number; // 0..1
  preferredDistanceKm: number;
  preferredPriceLevel: number | null; // 1..4
  commonRejectReasons: string[];
  topAcceptedCuisines: string[];
  sessionShownPlaceIds: string[];
  sessionRejectedPlaceIds: string[];
  // Bajet
  budgetMin: number | null;
  budgetMax: number | null;
  averageMealSpend: number | null;
  budgetLeftToday: number | null;
  budgetLeftWeek: number | null;
  overspendState: "under" | "normal" | "over" | "unknown";
  /** Part E — rekod perbelanjaan DIPERCAYAI (pelayan) wujud? (bukan dari klien). */
  walletDataAvailable: boolean;
  // Fit
  fitGoal: string | null;
  sportMood: string | null;
  trainingDay: boolean;
  calorieTarget: number | null;
  proteinTarget: number | null;
  recoveryContext: boolean;
}

/** Bentuk mentah (dari payload klien + hidrat Firestore). Semua pilihan. */
export interface RawRecommendationInput {
  uid: string;
  plan?: string | null;
  language?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number | null;
  locationGrid?: string | null;
  locationUpdatedAt?: number | null;
  timeSegment?: string | null;
  selectedMood?: string | null;
  recentMealPlaceIds?: unknown;
  recentCuisines?: unknown;
  recentMealTags?: unknown;
  lastAcceptedAt?: number | null;
  dietTypes?: unknown;
  dietType?: string | null;
  halalPreference?: boolean | null;
  allergies?: unknown;
  allergySeverity?: unknown;
  favouriteCuisines?: unknown;
  cuisinesToTry?: unknown;
  avoidedCuisines?: unknown;
  spicyPreference?: number | null;
  dislikedFoods?: unknown;
  usualMealTimes?: unknown;
  repeatTolerance?: number | null;
  explorationLevel?: number | null;
  preferredDistanceKm?: number | null;
  preferredPriceLevel?: number | null;
  commonRejectReasons?: unknown;
  topAcceptedCuisines?: unknown;
  sessionShownPlaceIds?: unknown;
  sessionRejectedPlaceIds?: unknown;
  budgetMin?: number | null;
  budgetMax?: number | null;
  averageMealSpend?: number | null;
  budgetLeftToday?: number | null;
  budgetLeftWeek?: number | null;
  fitGoal?: string | null;
  sportMood?: string | null;
  trainingDay?: boolean | null;
  calorieTarget?: number | null;
  proteinTarget?: number | null;
  recoveryContext?: boolean | null;
}

// ---------------- Pembantu normalisasi ----------------

function strList(v: unknown, max = 40): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string") {
      const s = x.trim().toLowerCase();
      if (s.length > 0 && s.length <= 64) out.push(s);
    }
    if (out.length >= max) break;
  }
  return [...new Set(out)];
}

function idList(v: unknown, max = 200): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string" && x.trim().length > 0) out.push(x.trim());
    if (out.length >= max) break;
  }
  return [...new Set(out)];
}

function clamp01(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

function posNum(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return v;
}

function validLat(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v >= -90 && v <= 90 ? v : null;
}
function validLng(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v >= -180 && v <= 180 ? v : null;
}

/** Rejab tiada koordinat (0,0) — laut Atlantik, hampir pasti tak sah untuk MY. */
function isNullIsland(lat: number | null, lng: number | null): boolean {
  return lat != null && lng != null && Math.abs(lat) < 0.5 && Math.abs(lng) < 0.5;
}

export function deriveTimeSegment(hour: number): TimeSegment {
  if (hour >= 5 && hour < 10) return "breakfast";
  if (hour >= 10 && hour < 12) return "brunch";
  if (hour >= 12 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 18) return "tea";
  if (hour >= 18 && hour < 22) return "dinner";
  if (hour >= 22 || hour < 2) return "supper";
  return "latenight";
}

function normTimeSegment(v: unknown): TimeSegment {
  const allowed: TimeSegment[] =
    ["breakfast", "brunch", "lunch", "tea", "dinner", "supper", "latenight"];
  if (typeof v === "string" && allowed.includes(v as TimeSegment)) {
    return v as TimeSegment;
  }
  return "lunch";
}

function normSeverity(v: unknown): Record<string, "mild" | "severe"> {
  const out: Record<string, "mild" | "severe"> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const key = k.trim().toLowerCase();
      if (!key) continue;
      out[key] = val === "severe" ? "severe" : "mild";
    }
  }
  return out;
}

/** Klasifikasi keadaan overspend dari baki bajet. */
function overspend(
  budgetLeftWeek: number | null,
  budgetLeftToday: number | null,
): RecommendationUserContext["overspendState"] {
  if (budgetLeftToday == null && budgetLeftWeek == null) return "unknown";
  if ((budgetLeftToday != null && budgetLeftToday < 0) ||
      (budgetLeftWeek != null && budgetLeftWeek < 0)) return "over";
  if ((budgetLeftWeek != null && budgetLeftWeek > 0) ||
      (budgetLeftToday != null && budgetLeftToday > 0)) return "under";
  return "normal";
}

/**
 * Bina konteks ternormal + berversi dari input mentah. Idempoten & deterministik.
 * TIDAK menyentuh I/O.
 */
export function buildRecommendationContext(
  raw: RawRecommendationInput,
): RecommendationUserContext {
  const lat = validLat(raw.latitude);
  const lng = validLng(raw.longitude);
  const hasValidLocation = lat != null && lng != null && !isNullIsland(lat, lng);

  // radius: julat munasabah 500 m .. 15 km (padan cap klien).
  let radiusMeters = posNum(raw.radiusMeters) ?? 3000;
  radiusMeters = Math.min(15000, Math.max(500, Math.round(radiusMeters)));

  const dietTypes = (() => {
    const list = strList(raw.dietTypes);
    if (list.length > 0) return list;
    const single = typeof raw.dietType === "string" ? raw.dietType.trim().toLowerCase() : "";
    return single && single !== "none" ? [single] : [];
  })();

  const budgetMin = posNum(raw.budgetMin);
  const budgetMax = posNum(raw.budgetMax);
  const budgetLeftToday = typeof raw.budgetLeftToday === "number" && Number.isFinite(raw.budgetLeftToday)
    ? raw.budgetLeftToday : null;
  const budgetLeftWeek = typeof raw.budgetLeftWeek === "number" && Number.isFinite(raw.budgetLeftWeek)
    ? raw.budgetLeftWeek : null;

  let preferredPriceLevel: number | null = null;
  if (typeof raw.preferredPriceLevel === "number" && Number.isFinite(raw.preferredPriceLevel)) {
    const pl = Math.round(raw.preferredPriceLevel);
    if (pl >= 1 && pl <= 4) preferredPriceLevel = pl;
  }

  let spicy = 0;
  if (typeof raw.spicyPreference === "number" && Number.isFinite(raw.spicyPreference)) {
    spicy = Math.min(3, Math.max(0, Math.round(raw.spicyPreference)));
  }

  const preferredDistanceKm = (() => {
    const d = posNum(raw.preferredDistanceKm);
    if (d == null || d <= 0) return radiusMeters / 1000;
    return Math.min(15, d);
  })();

  return {
    version: RECOMMENDATION_CONTEXT_VERSION,
    uid: typeof raw.uid === "string" ? raw.uid : "",
    plan: (typeof raw.plan === "string" && raw.plan.trim()) ? raw.plan.trim() : "free",
    language: (typeof raw.language === "string" && raw.language.trim()) ? raw.language.trim() : "ms",
    latitude: hasValidLocation ? lat : null,
    longitude: hasValidLocation ? lng : null,
    radiusMeters,
    locationGrid: typeof raw.locationGrid === "string" ? raw.locationGrid : null,
    locationUpdatedAt: typeof raw.locationUpdatedAt === "number" ? raw.locationUpdatedAt : null,
    hasValidLocation,
    timeSegment: normTimeSegment(raw.timeSegment),
    selectedMood: (typeof raw.selectedMood === "string" && raw.selectedMood.trim())
      ? raw.selectedMood.trim() : null,
    recentMealPlaceIds: idList(raw.recentMealPlaceIds),
    recentCuisines: strList(raw.recentCuisines),
    recentMealTags: strList(raw.recentMealTags),
    lastAcceptedAt: typeof raw.lastAcceptedAt === "number" ? raw.lastAcceptedAt : null,
    dietTypes,
    halalPreference: raw.halalPreference === true,
    allergies: strList(raw.allergies),
    allergySeverity: normSeverity(raw.allergySeverity),
    favouriteCuisines: strList(raw.favouriteCuisines),
    cuisinesToTry: strList(raw.cuisinesToTry),
    avoidedCuisines: strList(raw.avoidedCuisines),
    spicyPreference: spicy,
    dislikedFoods: strList(raw.dislikedFoods),
    usualMealTimes: strList(raw.usualMealTimes),
    repeatTolerance: clamp01(raw.repeatTolerance, 0.5),
    explorationLevel: clamp01(raw.explorationLevel, 0.5),
    preferredDistanceKm,
    preferredPriceLevel,
    commonRejectReasons: strList(raw.commonRejectReasons),
    topAcceptedCuisines: strList(raw.topAcceptedCuisines),
    sessionShownPlaceIds: idList(raw.sessionShownPlaceIds),
    sessionRejectedPlaceIds: idList(raw.sessionRejectedPlaceIds),
    budgetMin,
    budgetMax,
    averageMealSpend: posNum(raw.averageMealSpend),
    budgetLeftToday,
    budgetLeftWeek,
    overspendState: overspend(budgetLeftWeek, budgetLeftToday),
    walletDataAvailable:
      budgetLeftToday != null || budgetLeftWeek != null || posNum(raw.averageMealSpend) != null,
    fitGoal: (typeof raw.fitGoal === "string" && raw.fitGoal.trim() && raw.fitGoal !== "none")
      ? raw.fitGoal.trim().toLowerCase() : null,
    sportMood: (typeof raw.sportMood === "string" && raw.sportMood.trim() && raw.sportMood !== "none")
      ? raw.sportMood.trim().toLowerCase() : null,
    trainingDay: raw.trainingDay === true,
    calorieTarget: posNum(raw.calorieTarget),
    proteinTarget: posNum(raw.proteinTarget),
    recoveryContext: raw.recoveryContext === true,
  };
}

/**
 * Bentuk selamat-log untuk diagnostik pemilik: TIADA nota alahan/kesihatan mentah,
 * TIADA profil penuh, TIADA token. Hanya kiraan + bendera boolean.
 */
export function maskForLog(ctx: RecommendationUserContext): Record<string, unknown> {
  return {
    version: ctx.version,
    plan: ctx.plan,
    hasValidLocation: ctx.hasValidLocation,
    radiusMeters: ctx.radiusMeters,
    timeSegment: ctx.timeSegment,
    selectedMood: ctx.selectedMood,
    allergyCount: ctx.allergies.length,
    halalPreference: ctx.halalPreference,
    dietTypeCount: ctx.dietTypes.length,
    favouriteCount: ctx.favouriteCuisines.length,
    avoidedCount: ctx.avoidedCuisines.length,
    repeatTolerance: ctx.repeatTolerance,
    explorationLevel: ctx.explorationLevel,
    overspendState: ctx.overspendState,
    hasFitGoal: ctx.fitGoal != null,
    sportMood: ctx.sportMood,
    trainingDay: ctx.trainingDay,
  };
}
