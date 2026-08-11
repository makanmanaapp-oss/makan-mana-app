/**
 * Algorithm 2 / Phase 2.4 — AI Brain / Food Memory PURE calculator.
 *
 * Transformasi tingkah laku sebenar → profil brain BERPADU, BERVERSI, PERIBADI.
 * TULEN (tiada I/O) supaya boleh diuji sepenuhnya. Prinsip:
 *  - data tidak diketahui BUKAN keutamaan positif.
 *  - satu tindakan tidak mencipta keutamaan keyakinan-tinggi.
 *  - cuisine dielakkan perlu bukti berulang.
 *  - keselamatan (alahan/halal) TIDAK DIPELAJARI di sini (kekal profil).
 *  - reput: isyarat lebih baharu lebih penting.
 *  - JANGAN simpan lat/lng tepat, nota alahan/kesihatan, resit, token.
 */

export const BRAIN_SCHEMA_VERSION = 2; // 2.4: tambah brainVersion + decay + reset boundary
export const PRIVACY_VERSION = 1;

export const EVENT_WINDOW_DAYS = 30;
export const MEAL_WINDOW_DAYS = 60;
export const EVENT_HALFLIFE_DAYS = 14; // reput tingkah laku
export const MEAL_HALFLIFE_DAYS = 30; // reput sejarah makan

const HEALTHY_TAGS = ["healthy", "light", "salad", "clean", "low_cal", "veg"];
const HEAVY_TAGS = ["heavy", "fried", "fast_food", "sweet_drink", "dessert", "greasy"];
const DAY_MS = 86400_000;

export interface BrainEvent {
  eventType: string;
  placeId?: string | null;
  timeSlot?: string | null;
  mood?: string | null;
  timestampMs: number;
  metadata?: Record<string, unknown> | null;
  isSample?: boolean;
  sourceMode?: string | null;
  resultSource?: string | null;
  sessionOwnerUid?: string | null;
}

export interface BrainMeal {
  cuisine?: string | null;
  cuisineTags?: string[] | null;
  mealTimeMs: number;
  source?: string | null;
  satisfactionRating?: number | null;
  wouldRepeat?: boolean | null;
  priceLevel?: number | null;
  placeId?: string | null;
  tags?: string[] | null;
  healthTags?: string[] | null;
}

export interface BrainInputs {
  uid: string;
  events: BrainEvent[];
  meals: BrainMeal[];
  profile: Record<string, unknown>;
  oldBrain: Record<string, unknown>;
  now: number;
  /** Sempadan reset: abaikan isyarat SEBELUM masa ini (Part K). */
  resetBoundaryMs?: number | null;
}

export interface BrainResult {
  insufficientData: boolean;
  brainDoc: Record<string, unknown>;
  diagnostics: {
    acceptedRealEvents: number;
    excludedEvents: number;
    excludedByReason: Record<string, number>;
    sourceMealCount: number;
    totalRealSignals: number;
    oldBrainVersion: number;
    newBrainVersion: number;
    confidenceBefore: number;
    confidenceAfter: number;
  };
}

// ---------------- Pembantu terbatas ----------------
export function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
export function smooth(oldV: number | null, newV: number, weightNew = 0.6): number {
  if (oldV == null || Number.isNaN(oldV)) return newV;
  return oldV * (1 - weightNew) + newV * weightNew;
}
/** Keyakinan saturasi terbatas: 0→0, 5→~0.2, 20→~0.6, 50+→~0.9. */
export function confidenceFrom(signals: number): number {
  return clamp01(1 - Math.exp(-signals / 22));
}
/** Berat reput: umur 0 → 1.0; umur = separuh-hayat → 0.5. Part F. */
export function decayWeight(ageMs: number, halfLifeDays: number): number {
  const ageDays = Math.max(0, ageMs) / DAY_MS;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Penapis event SEBENAR (Part D). Sample/mock/demo/offline/tidak sah TIDAK
 * melatih brain. Pulangkan sebab pengecualian (null = diterima).
 */
export function realEventExclusionReason(e: BrainEvent): string | null {
  if (e.isSample === true) return "isSample";
  if (e.sourceMode === "sample") return "sample_mode";
  if (e.resultSource === "mock_fallback") return "mock_fallback";
  if (e.resultSource === "demo_preview") return "demo_preview";
  if (e.resultSource === "offline_fallback") return "offline_fallback";
  if (!e.eventType || typeof e.eventType !== "string") return "malformed";
  if (typeof e.timestampMs !== "number" || !Number.isFinite(e.timestampMs)) return "bad_timestamp";
  return null;
}
export function isRealEvent(e: BrainEvent): boolean {
  return realEventExclusionReason(e) === null;
}

function normalizeCounts(counts: Record<string, number>, maxKeep = 10): Record<string, number> {
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  if (entries.length === 0) return {};
  const max = Math.max(...entries.map(([, v]) => v));
  entries.sort((a, b) => b[1] - a[1]);
  const out: Record<string, number> = {};
  for (const [k, v] of entries.slice(0, maxKeep)) out[k] = Math.round((v / max) * 100) / 100;
  return out;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Kira brain BERPADU (tulen, deterministik). */
export function computeBrain(inputs: BrainInputs): BrainResult {
  const { events, meals, profile, oldBrain, now } = inputs;
  const boundary = inputs.resetBoundaryMs ?? null;
  const eventSince = now - EVENT_WINDOW_DAYS * DAY_MS;
  const mealSince = now - MEAL_WINDOW_DAYS * DAY_MS;
  const oldBrainVersion = (num(oldBrain.brainVersion) ?? 0);
  const confidenceBefore = num((oldBrain.confidence as Record<string, unknown> | undefined)?.overall) ?? 0;

  // ---- EVENTS (reput + penapis) ----
  let accepts = 0; let rejects = 0; let skips = 0; let opens = 0;
  let detailViews = 0;
  let acceptWeighted = 0; // untuk kadar berwajaran-reput
  const rejectReasons: Record<string, number> = {};
  const skipReasons: Record<string, number> = {};
  const timeSlotCounts: Record<string, number> = {};
  const moodCounts: Record<string, number> = {};
  const acceptedPlaceIds: string[] = [];
  const rejectedPlaceIds: string[] = [];
  const skippedPlaceIds: string[] = [];
  const acceptDistances: Array<{ d: number; w: number }> = [];
  const openDistances: Array<{ d: number; w: number }> = [];
  let tooFarRejects = 0; let tooExpensiveRejects = 0; let recentlyAteRejects = 0;
  let excludedEvents = 0;
  const excludedByReason: Record<string, number> = {};

  for (const e of events) {
    if (e.timestampMs < eventSince) continue;
    if (boundary != null && e.timestampMs < boundary) continue; // Part K reset boundary
    const reason = realEventExclusionReason(e);
    if (reason) { excludedEvents++; excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1; continue; }
    const w = decayWeight(now - e.timestampMs, EVENT_HALFLIFE_DAYS);
    const meta = e.metadata ?? {};
    if (e.timeSlot) timeSlotCounts[e.timeSlot] = (timeSlotCounts[e.timeSlot] ?? 0) + w;
    if (e.mood) moodCounts[e.mood] = (moodCounts[e.mood] ?? 0) + w;
    const dist = num(meta.distanceKm);
    switch (e.eventType) {
      case "suggestion_accept":
      case "accept":
        accepts++; acceptWeighted += w;
        if (e.placeId) acceptedPlaceIds.push(e.placeId);
        if (dist != null && dist > 0) acceptDistances.push({ d: dist, w });
        break;
      case "suggestion_reject":
      case "reject": {
        rejects++;
        if (e.placeId) rejectedPlaceIds.push(e.placeId);
        const r = (meta.reason as string | undefined) ?? "other";
        rejectReasons[r] = (rejectReasons[r] ?? 0) + w;
        if (r === "too_far") tooFarRejects++;
        if (r === "too_expensive") tooExpensiveRejects++;
        if (r === "recently_ate") recentlyAteRejects++;
        break;
      }
      case "suggestion_skipped":
      case "suggestion_skip": {
        skips++;
        if (e.placeId) skippedPlaceIds.push(e.placeId);
        const r = (meta.reason as string | undefined) ?? "other";
        skipReasons[r] = (skipReasons[r] ?? 0) + w;
        break;
      }
      case "open_map":
        opens++;
        if (dist != null && dist > 0) openDistances.push({ d: dist, w });
        break;
      case "restaurant_detail_viewed":
      case "suggestion_viewed":
        detailViews++;
        break;
      default:
        break;
    }
  }

  // ---- MEALS (reput; sample lemah) ----
  const cuisineScore: Record<string, number> = {};
  const cuisineNeg: Record<string, number> = {};
  const priceWeighted: Array<{ p: number; w: number }> = [];
  let healthyHits = 0; let heavyHits = 0; let mealCount = 0;
  let mealSignalSum = 0; // jumlah berat reput (untuk keyakinan cuisine)
  const recentCuisineTags: string[] = [];
  const placeAcceptCount: Record<string, number> = {};

  for (const m of meals) {
    if (m.mealTimeMs < mealSince) continue;
    if (boundary != null && m.mealTimeMs < boundary) continue;
    const decay = decayWeight(now - m.mealTimeMs, MEAL_HALFLIFE_DAYS);
    const base = (m.source === "sample_manual_log" ? 0.3 : 1) * decay;
    mealCount++;
    mealSignalSum += decay;
    const tags: string[] = [];
    if (m.cuisine) tags.push(m.cuisine);
    for (const c of m.cuisineTags ?? []) tags.push(c);
    const rating = num(m.satisfactionRating);
    for (const c of tags) {
      if (!c) continue;
      recentCuisineTags.push(c);
      let s = base;
      if (rating != null) { if (rating >= 4) s += 0.6 * decay; else if (rating <= 2) s -= 0.5 * decay; }
      if (m.wouldRepeat === true) s += 0.4 * decay;
      // wouldNotRepeat: kurangkan skor positif + tambah bukti dielakkan (Part F #26).
      if (m.wouldRepeat === false) { s -= 0.5 * decay; cuisineNeg[c] = (cuisineNeg[c] ?? 0) + base; }
      cuisineScore[c] = (cuisineScore[c] ?? 0) + Math.max(0, s);
    }
    const price = num(m.priceLevel);
    if (price != null && price >= 0 && price <= 4) priceWeighted.push({ p: price, w: base });
    if (m.placeId) placeAcceptCount[m.placeId] = (placeAcceptCount[m.placeId] ?? 0) + 1;
    const healthTags = [...(m.tags ?? []), ...(m.healthTags ?? [])].map((t) => t.toLowerCase());
    if (healthTags.some((t) => HEALTHY_TAGS.includes(t))) healthyHits++;
    if (healthTags.some((t) => HEAVY_TAGS.includes(t))) heavyHits++;
  }

  // Baseline profil LEMAH (keutamaan diisytihar berasingan, tidak menghapus pembelajaran).
  const favCuisines = (profile.favoriteCuisines as string[] | undefined) ??
    (profile.favouriteCuisines as string[] | undefined) ?? [];
  for (const c of favCuisines) cuisineScore[c] = (cuisineScore[c] ?? 0) + 0.5;

  const totalRealSignals = accepts + rejects + skips + opens + mealCount;
  const newBrainVersion = oldBrainVersion + 1;

  // Tiada data: kekal insufficientData (JANGAN cipta kepastian palsu).
  if (totalRealSignals === 0) {
    return {
      insufficientData: true,
      brainDoc: {
        userId: inputs.uid,
        schemaVersion: BRAIN_SCHEMA_VERSION,
        brainVersion: newBrainVersion,
        privacyVersion: PRIVACY_VERSION,
        insufficientData: true,
        confidence: { overall: 0 },
        sourceEventCount: 0,
        sourceMealCount: 0,
        privacy: { personalizationEnabled: true, excludedSensitiveFields: ["allergies", "gps", "health"] },
      },
      diagnostics: {
        acceptedRealEvents: 0, excludedEvents, excludedByReason,
        sourceMealCount: 0, totalRealSignals: 0,
        oldBrainVersion, newBrainVersion, confidenceBefore, confidenceAfter: 0,
      },
    };
  }

  const topCuisines = normalizeCounts(cuisineScore, 10);
  const avoidedCuisines = normalizeCounts(cuisineNeg, 10);
  for (const c of Object.keys(topCuisines)) if (topCuisines[c] >= 0.6) delete avoidedCuisines[c];
  const preferredTimeSlots = normalizeCounts(timeSlotCounts, 8);

  // Harga: median berwajaran-reput; too_expensive menurunkan.
  let preferredPriceLevel: number | null = null;
  if (priceWeighted.length > 0) {
    const sorted = [...priceWeighted].sort((a, b) => a.p - b.p);
    preferredPriceLevel = sorted[Math.floor(sorted.length / 2)].p;
    if (tooExpensiveRejects >= 2 && preferredPriceLevel > 0) preferredPriceLevel -= 1;
    preferredPriceLevel = Math.max(0, Math.min(4, preferredPriceLevel));
  } else {
    const bmax = num(profile.budgetMax);
    if (bmax != null) preferredPriceLevel = bmax >= 40 ? 3 : bmax >= 20 ? 2 : 1;
  }

  // Jarak: purata berwajaran-reput accept + sedikit open; too_far menurunkan.
  const oldDist = num(oldBrain.preferredDistanceKm);
  const profilePrefDist = num(profile.preferredNearbyDistanceKm);
  const maxTravel = num(profile.maxTravelDistanceKm) ?? 15;
  let preferredDistanceKm: number;
  const wAvg = (arr: Array<{ d: number; w: number }>): number | null => {
    if (arr.length === 0) return null;
    const sw = arr.reduce((a, x) => a + x.w, 0);
    return sw > 0 ? arr.reduce((a, x) => a + x.d * x.w, 0) / sw : null;
  };
  const accAvg = wAvg(acceptDistances);
  if (accAvg != null) {
    const openAvg = wAvg(openDistances) ?? accAvg;
    preferredDistanceKm = accAvg * 0.75 + openAvg * 0.25;
  } else {
    preferredDistanceKm = profilePrefDist ?? oldDist ?? 4;
  }
  if (tooFarRejects >= 2) preferredDistanceKm *= 0.85;
  preferredDistanceKm = Math.max(1, Math.min(maxTravel, preferredDistanceKm));
  preferredDistanceKm = Math.round(smooth(oldDist, preferredDistanceKm, 0.6) * 10) / 10;

  const meaningful = accepts + rejects + skips;
  const acceptRate = meaningful > 0 ? accepts / meaningful : 0;
  const rejectRate = meaningful > 0 ? rejects / meaningful : 0;
  const skipRate = meaningful > 0 ? skips / meaningful : 0;
  const detailViewRate = totalRealSignals > 0 ? detailViews / totalRealSignals : 0;
  const openMapRate = totalRealSignals > 0 ? opens / totalRealSignals : 0;

  const tagTotal = healthyHits + heavyHits;
  const healthyPreference = tagTotal > 0 ? clamp01(healthyHits / tagTotal) : 0;
  const heavyFoodFrequency = mealCount > 0 ? clamp01(heavyHits / mealCount) : 0;

  const repeatedPlaces = Object.values(placeAcceptCount).filter((v) => v > 1).length;
  const distinctPlaces = Object.keys(placeAcceptCount).length || 1;
  let repeatTolerance = clamp01(repeatedPlaces / distinctPlaces) - recentlyAteRejects * 0.1;
  repeatTolerance = smooth(num(oldBrain.repeatTolerance), clamp01(repeatTolerance), 0.5);

  const distinctCuisines = Object.keys(cuisineScore).length;
  const surpriseUse = (moodCounts["moodSurprise"] ?? 0) > 0 ? 0.2 : 0;
  const explorationLevel = smooth(
    num(oldBrain.explorationLevel), clamp01(distinctCuisines / 8 + surpriseUse), 0.5);

  const overall = confidenceFrom(totalRealSignals);
  const confidence = {
    overall: Math.round(overall * 100) / 100,
    cuisine: Math.round(confidenceFrom(mealSignalSum + acceptWeighted) * 100) / 100,
    distance: Math.round(confidenceFrom(acceptDistances.length + opens) * 100) / 100,
    budget: Math.round(confidenceFrom(priceWeighted.length) * 100) / 100,
    timeSlot: Math.round(confidenceFrom(Object.keys(timeSlotCounts).length * 3) * 100) / 100,
  };

  const last = <T>(arr: T[], n: number): T[] => arr.slice(-n).reverse();

  const brainDoc: Record<string, unknown> = {
    userId: inputs.uid,
    schemaVersion: BRAIN_SCHEMA_VERSION,
    brainVersion: newBrainVersion,
    privacyVersion: PRIVACY_VERSION,
    insufficientData: false,
    eventWindowDays: EVENT_WINDOW_DAYS,
    mealWindowDays: MEAL_WINDOW_DAYS,
    sourceEventCount: accepts + rejects + skips + opens + detailViews,
    sourceMealCount: mealCount,
    profileVersionUsed: num(profile.profileVersion) ?? null,
    learnedTopCuisines: topCuisines,
    learnedAvoidedCuisines: avoidedCuisines,
    topCuisines, // keserasian ke belakang (legasi)
    avoidedCuisines,
    preferredPriceLevel,
    preferredDistanceKm,
    preferredTimeSlots,
    healthyPreference: Math.round(healthyPreference * 100) / 100,
    heavyFoodFrequency: Math.round(heavyFoodFrequency * 100) / 100,
    repeatTolerance: Math.round(repeatTolerance * 100) / 100,
    explorationLevel: Math.round(explorationLevel * 100) / 100,
    acceptRate: Math.round(acceptRate * 100) / 100,
    rejectRate: Math.round(rejectRate * 100) / 100,
    skipRate: Math.round(skipRate * 100) / 100,
    detailViewRate: Math.round(detailViewRate * 100) / 100,
    openMapRate: Math.round(openMapRate * 100) / 100,
    tooFarRejectRate: meaningful > 0 ? Math.round((tooFarRejects / meaningful) * 100) / 100 : 0,
    tooExpensiveRejectRate: meaningful > 0 ? Math.round((tooExpensiveRejects / meaningful) * 100) / 100 : 0,
    commonRejectReasons: normalizeCounts(rejectReasons, 8),
    skipReasons: normalizeCounts(skipReasons, 8),
    recentAcceptedPlaceIds: last(acceptedPlaceIds, 20),
    recentRejectedPlaceIds: last(rejectedPlaceIds, 20),
    recentSkippedPlaceIds: last(skippedPlaceIds, 20),
    recentCuisineTags: Array.from(new Set(recentCuisineTags)).slice(0, 15),
    recentMoodTags: Object.keys(normalizeCounts(moodCounts, 6)),
    confidence,
    privacy: { personalizationEnabled: true, excludedSensitiveFields: ["allergies", "gps", "health", "receipt", "tokens"] },
  };

  return {
    insufficientData: false,
    brainDoc,
    diagnostics: {
      acceptedRealEvents: accepts + rejects + skips + opens + detailViews,
      excludedEvents, excludedByReason,
      sourceMealCount: mealCount, totalRealSignals,
      oldBrainVersion, newBrainVersion,
      confidenceBefore, confidenceAfter: confidence.overall,
    },
  };
}
