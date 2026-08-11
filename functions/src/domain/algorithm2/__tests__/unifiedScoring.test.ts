/**
 * Algorithm 2 / Phase 2.3 — ujian PEMARKAHAN BERSATU (Part O).
 * Keselamatan · mood · bajet · food memory · fit/sport · rating · konsistensi ·
 * explainability. Deterministik, tulen.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRecommendationContext, maskForLog } from "../recommendationContext";
import { applyHardSafety } from "../safetyFilter";
import { scoreCandidateV2, rankCandidatesV2, SCORING_VERSION } from "../scoringModel";
import { rankUnified } from "../unifiedRanking";
import { unifiedScoringActive } from "../../../config/algorithm2Flags";
import {
  POOL_52, ctx, openPlace,
  NEAR_CHEAP, FAR_PRICEY, HIGH_CONF, LOW_CONF, HEALTHY_PLACE, HEAVY_PLACE,
  CAFE_PLACE, SPICY_PLACE, PROTEIN_PLACE, LATE_PLACE,
  ALLERGY_SEAFOOD, NON_HALAL, HALAL_UNKNOWN, CLOSED, HOURS_UNKNOWN, PRICE_UNKNOWN,
} from "./scoringFixtures";

const idOf = (arr: { placeId: string }[]) => arr.map((p) => p.placeId);
const rank = (cands: Parameters<typeof rankCandidatesV2>[0], c = ctx()) =>
  rankCandidatesV2(cands, c).ranked;

// ---------------- SAFETY ----------------

test("O1: hard allergy conflict always loses eligibility", () => {
  const r = applyHardSafety([ALLERGY_SEAFOOD, NEAR_CHEAP], ctx({ allergies: ["seafood"] }));
  assert.ok(!idOf(r.eligible).includes("alg_sf"));
  assert.equal(r.counts.allergy_conflict, 1);
});

test("O2: required-halal user excludes known non-halal place", () => {
  const r = applyHardSafety([NON_HALAL, NEAR_CHEAP], ctx({ halalPreference: true }));
  assert.ok(!idOf(r.eligible).includes("nonhalal"));
  assert.equal(r.counts.non_halal, 1);
});

test("O3: unknown halal remains warning, not certified", () => {
  const c = ctx({ halalPreference: true });
  const r = applyHardSafety([HALAL_UNKNOWN], c);
  assert.ok(idOf(r.eligible).includes("halal_unk")); // NOT filtered
  const s = scoreCandidateV2(HALAL_UNKNOWN, c);
  assert.ok(s.negativeSignals.includes("halal_status_unknown"));
  assert.ok(!s.reasons.includes("halalFriendly"));
});

test("O4: closed place excluded", () => {
  const r = applyHardSafety([CLOSED, NEAR_CHEAP], ctx());
  assert.ok(!idOf(r.eligible).includes("closed_x"));
  assert.equal(r.counts.closed, 1);
});

test("O5: invalid coordinates rejected at context level", () => {
  const bad = buildRecommendationContext({ uid: "u", latitude: 999, longitude: -999 });
  assert.equal(bad.hasValidLocation, false);
  assert.equal(bad.latitude, null);
  const nullIsland = buildRecommendationContext({ uid: "u", latitude: 0, longitude: 0 });
  assert.equal(nullIsland.hasValidLocation, false);
});

test("O6: safety cannot be overridden by mood or rating", () => {
  const superAllergen = openPlace({ placeId: "alg_sf", name: "Seafood Prawn Deluxe", cuisine: "seafood", rating: 5.0, userRatingCount: 5000, distanceKm: 0.1 });
  const res = rankUnified([superAllergen, NEAR_CHEAP], ctx({ allergies: ["seafood"], selectedMood: "moodHighRating" }));
  assert.ok(!idOf(res.ranked).includes("alg_sf"));
});

// ---------------- MOOD ----------------

test("O7: Nearby mood reorders near vs far (flips top vs HighRating)", () => {
  const near = openPlace({ placeId: "near_ok", cuisine: "malay", distanceKm: 0.4, rating: 4.0, userRatingCount: 120, priceLevel: 2 });
  const farHigh = openPlace({ placeId: "far_high", cuisine: "malay", distanceKm: 6.5, rating: 4.8, userRatingCount: 1500, priceLevel: 2 });
  const nearby = rank([near, farHigh], ctx({ selectedMood: "moodNearby" }));
  const highRating = rank([near, farHigh], ctx({ selectedMood: "moodHighRating" }));
  assert.equal(nearby[0].placeId, "near_ok");
  assert.equal(highRating[0].placeId, "far_high");
});

test("O8: High Rating uses rating confidence (4.5/1000 beats 5.0/2)", () => {
  const r = rank([LOW_CONF, HIGH_CONF], ctx({ selectedMood: "moodHighRating" }));
  assert.equal(r[0].placeId, "high_conf");
});

test("O9: Jimat promotes budget-fit (cheap over pricey)", () => {
  const r = rank([FAR_PRICEY, NEAR_CHEAP], ctx({ selectedMood: "moodJimat", budgetMax: 20 }));
  assert.equal(r[0].placeId, "near_cheap");
});

test("O10: Healthy promotes evidence-backed healthy place", () => {
  const r = rank([HEAVY_PLACE, HEALTHY_PLACE], ctx({ selectedMood: "moodHealthy" }));
  assert.equal(r[0].placeId, "healthy_1");
});

test("O11: Cafe Chill reorders cafe-compatible place to top", () => {
  const nonCafe = openPlace({ placeId: "noncafe", cuisine: "seafood", rating: 4.2, userRatingCount: 300, distanceKm: 1.2 });
  const r = rank([nonCafe, CAFE_PLACE], ctx({ selectedMood: "moodCafe" }));
  assert.equal(r[0].placeId, "cafe_1");
});

test("O12: Pedas respects spicy preference/sensitivity", () => {
  const highTol = scoreCandidateV2(SPICY_PLACE, ctx({ selectedMood: "moodPedas", spicyPreference: 3 }));
  const lowTol = scoreCandidateV2(SPICY_PLACE, ctx({ selectedMood: "moodPedas", spicyPreference: 0 }));
  assert.ok(highTol.components.moodFit > lowTol.components.moodFit);
});

test("O13: Supper favors verified-open late place over unknown-hours", () => {
  const r = rank([HOURS_UNKNOWN, LATE_PLACE], ctx({ selectedMood: "moodSupper" }));
  assert.equal(r[0].placeId, "late_1");
});

test("O14: Surprise increases controlled exploration weight", () => {
  const novel = openPlace({ placeId: "novel", cuisine: "korean", rating: 4.0, userRatingCount: 100, distanceKm: 1.5 });
  const s = scoreCandidateV2(novel, ctx({ selectedMood: "moodSurprise", explorationLevel: 1 }));
  const base = scoreCandidateV2(novel, ctx({ explorationLevel: 1 }));
  assert.ok((s.weightsUsed.exploration ?? 0) > (base.weightsUsed.exploration ?? 0));
});

// ---------------- BUDGET ----------------

test("O15: budget fit affects ranking", () => {
  const cheap = openPlace({ placeId: "b_cheap", cuisine: "malay", priceLevel: 1, distanceKm: 2, rating: 4.0, userRatingCount: 200 });
  const exp = openPlace({ placeId: "b_exp", cuisine: "malay", priceLevel: 4, distanceKm: 2, rating: 4.0, userRatingCount: 200 });
  const r = rank([exp, cheap], ctx({ budgetMax: 15 }));
  assert.equal(r[0].placeId, "b_cheap");
});

test("O16: overspend state promotes cheaper valid options", () => {
  const cheap = openPlace({ placeId: "os_cheap", cuisine: "malay", priceLevel: 1, distanceKm: 2, rating: 4.0, userRatingCount: 200 });
  const mid = openPlace({ placeId: "os_mid", cuisine: "malay", priceLevel: 3, distanceKm: 2, rating: 4.0, userRatingCount: 200 });
  const over = scoreCandidateV2(cheap, ctx({ budgetLeftWeek: -20 }));
  const normal = scoreCandidateV2(cheap, ctx({ budgetLeftWeek: 50 }));
  assert.ok(over.components.spendingContext >= normal.components.spendingContext);
  const r = rank([mid, cheap], ctx({ budgetLeftWeek: -20 }));
  assert.equal(r[0].placeId, "os_cheap");
});

test("O17: missing price does not become free (neutral, not best)", () => {
  const s = scoreCandidateV2(PRICE_UNKNOWN, ctx({ budgetMax: 15 }));
  assert.ok(s.components.budget < 1); // tidak dilayan sebagai padan-sempurna
  assert.equal(s.components.budget, 0.6);
});

test("O18: estimated price remains flagged", () => {
  const s = scoreCandidateV2(PRICE_UNKNOWN, ctx());
  assert.ok(s.negativeSignals.includes("price_estimated"));
});

// ---------------- FOOD MEMORY ----------------

test("O19: accepted cuisine receives bounded boost", () => {
  const p = openPlace({ placeId: "fm1", cuisine: "japanese", rating: 4.0, userRatingCount: 200, distanceKm: 2 });
  const withMem = scoreCandidateV2(p, ctx({ topAcceptedCuisines: ["japanese"] }));
  const without = scoreCandidateV2(p, ctx());
  assert.ok(withMem.components.foodMemory > without.components.foodMemory);
  assert.ok(withMem.score <= 1 && withMem.score >= 0); // terbatas
});

test("O20: avoided cuisine receives penalty", () => {
  const p = openPlace({ placeId: "av1", cuisine: "western", rating: 4.0, userRatingCount: 200, distanceKm: 2 });
  const avoided = scoreCandidateV2(p, ctx({ avoidedCuisines: ["western"] }));
  const neutral = scoreCandidateV2(p, ctx());
  assert.ok(avoided.score < neutral.score);
});

test("O21: repeat tolerance changes repeat penalty", () => {
  const p = openPlace({ placeId: "rep1", cuisine: "malay", rating: 4.0, userRatingCount: 200, distanceKm: 2 });
  const lowTol = scoreCandidateV2(p, ctx({ recentMealPlaceIds: ["rep1"], repeatTolerance: 0 }));
  const highTol = scoreCandidateV2(p, ctx({ recentMealPlaceIds: ["rep1"], repeatTolerance: 1 }));
  assert.ok(highTol.score > lowTol.score); // toleransi tinggi = penalti lebih kecil
});

test("O22: exploration level changes diversity behavior", () => {
  const novel = openPlace({ placeId: "ex1", cuisine: "korean", rating: 4.0, userRatingCount: 200, distanceKm: 2 });
  const high = scoreCandidateV2(novel, ctx({ explorationLevel: 1 }));
  const low = scoreCandidateV2(novel, ctx({ explorationLevel: 0 }));
  assert.ok(high.components.exploration > low.components.exploration);
});

test("O23: reject reason too_far strengthens distance preference", () => {
  const near = openPlace({ placeId: "tf_near", cuisine: "malay", distanceKm: 0.5, rating: 4.0, userRatingCount: 200, priceLevel: 2 });
  const s = scoreCandidateV2(near, ctx({ commonRejectReasons: ["too_far"] }));
  const base = scoreCandidateV2(near, ctx());
  assert.ok((s.weightsUsed.distance ?? 0) > (base.weightsUsed.distance ?? 0));
});

test("O24: reject reason too_expensive strengthens budget preference", () => {
  const cheap = openPlace({ placeId: "te_cheap", cuisine: "malay", priceLevel: 1, distanceKm: 2, rating: 4.0, userRatingCount: 200 });
  const s = scoreCandidateV2(cheap, ctx({ commonRejectReasons: ["too_expensive"] }));
  const base = scoreCandidateV2(cheap, ctx());
  assert.ok((s.weightsUsed.budget ?? 0) > (base.weightsUsed.budget ?? 0));
});

// ---------------- FIT / SPORT ----------------

test("O25: weight-loss context promotes healthy evidence", () => {
  const r = rank([HEAVY_PLACE, HEALTHY_PLACE], ctx({ fitGoal: "lose_weight" }));
  assert.equal(r[0].placeId, "healthy_1");
});

test("O26: muscle-gain context promotes protein-oriented evidence", () => {
  const nonProtein = openPlace({ placeId: "np", cuisine: "bakery", rating: 4.2, userRatingCount: 300, distanceKm: 1.2 });
  const r = rank([nonProtein, PROTEIN_PLACE], ctx({ fitGoal: "muscle_gain" }));
  assert.equal(r[0].placeId, "protein_1");
});

test("O27: sport context applies only when selected/current", () => {
  const p = PROTEIN_PLACE;
  const off = scoreCandidateV2(p, ctx());
  const on = scoreCandidateV2(p, ctx({ sportMood: "post_workout" }));
  assert.equal(off.weightsUsed.sportContext, undefined); // berat 0 → tidak direkod
  assert.ok((on.weightsUsed.sportContext ?? 0) > 0);
});

test("O28: fit context cannot override safety", () => {
  const allergen = openPlace({ placeId: "alg_sf", name: "Seafood Salad Healthy", cuisine: "seafood" });
  const res = rankUnified([allergen], ctx({ allergies: ["seafood"], fitGoal: "lose_weight" }));
  assert.equal(res.ranked.length, 0);
});

test("O29: missing nutrition does not create macro claims", () => {
  const s = scoreCandidateV2(PROTEIN_PLACE, ctx({ fitGoal: "muscle_gain" }));
  // Sebab hanya dari set dibenarkan; tiada dakwaan makro tepat.
  const allowed = new Set(["nearLocation", "withinBudget", "fitsMood", "matchesFavourite",
    "oftenAccepted", "highRating", "differentFromRecent", "openNow", "suitsFitGoal",
    "cheaperForBudget", "halalFriendly"]);
  assert.ok(s.reasons.every((r) => allowed.has(r)));
});

// ---------------- RATING CONFIDENCE ----------------

test("O30: 4.5/1000 beats 5.0/2 under confidence formula", () => {
  const a = scoreCandidateV2(HIGH_CONF, ctx()).components.ratingConfidence;
  const b = scoreCandidateV2(LOW_CONF, ctx()).components.ratingConfidence;
  assert.ok(a > b);
});

test("O31: missing rating remains unknown (neutral low)", () => {
  const noRating = openPlace({ placeId: "nr", cuisine: "malay", rating: 0, userRatingCount: 0, distanceKm: 2 });
  const s = scoreCandidateV2(noRating, ctx());
  assert.equal(s.components.ratingConfidence, 0.4);
});

test("O32: low review volume reduces confidence", () => {
  const many = scoreCandidateV2(openPlace({ placeId: "m", rating: 4.3, userRatingCount: 2000, distanceKm: 2 }), ctx());
  const few = scoreCandidateV2(openPlace({ placeId: "f", rating: 4.3, userRatingCount: 3, distanceKm: 2 }), ctx());
  assert.ok(many.components.ratingConfidence > few.components.ratingConfidence);
});

// ---------------- CONSISTENCY ----------------

test("O33: single scoring version constant (Home/Spin share)", () => {
  const res = rankUnified(POOL_52, ctx({ selectedMood: "moodJimat" }));
  assert.equal(res.diagnostics.scoringVersion, SCORING_VERSION);
});

test("O34: scoring deterministic (overlay-independent inputs)", () => {
  const a = idOf(rank(POOL_52, ctx({ selectedMood: "moodHealthy" })));
  const b = idOf(rank(POOL_52, ctx({ selectedMood: "moodHealthy" })));
  assert.deepEqual(a, b);
});

test("O35: session suppression respected by unified", () => {
  const res = rankUnified([NEAR_CHEAP, HIGH_CONF], ctx(), { suppressedIds: new Set(["near_cheap"]) });
  assert.ok(!idOf(res.ranked).includes("near_cheap"));
});

test("O36: reject memory respected by unified", () => {
  const res = rankUnified([NEAR_CHEAP, HIGH_CONF], ctx(), { rejectMemoryIds: new Set(["high_conf"]) });
  assert.ok(!idOf(res.ranked).includes("high_conf"));
});

test("O38: pagination-ready output has no duplicate placeIds", () => {
  const dup = [NEAR_CHEAP, NEAR_CHEAP, HIGH_CONF];
  const res = rankUnified(dup, ctx());
  assert.equal(new Set(idOf(res.ranked)).size, res.ranked.length);
});

test("O40: public (non-cohort) never uses unified scoring", () => {
  assert.equal(unifiedScoringActive(false), false);
});

test("O41: scoring emergency legacy forces legacy", () => {
  const prev = process.env.ALGO2_SCORING_EMERGENCY_LEGACY;
  process.env.ALGO2_SCORING_EMERGENCY_LEGACY = "true";
  try {
    assert.equal(unifiedScoringActive(true), false);
  } finally {
    if (prev === undefined) delete process.env.ALGO2_SCORING_EMERGENCY_LEGACY;
    else process.env.ALGO2_SCORING_EMERGENCY_LEGACY = prev;
  }
});

// ---------------- EXPLAINABILITY ----------------

test("O43: top reasons correspond to strongest positive components", () => {
  const s = scoreCandidateV2(NEAR_CHEAP, ctx({ budgetMax: 20 }));
  assert.ok(s.reasons.includes("nearLocation"));
  assert.ok(s.reasons.includes("withinBudget"));
  assert.ok(s.reasons.length <= 3);
});

test("O44: negative signals are honest (unknown → warning)", () => {
  // Cuisine neutral (tiada token halal-positif) + jam tidak diketahui.
  const neutral = openPlace({ placeId: "neu", name: "Random Bistro", cuisine: "western", priceLevel: 2, rating: 4.2, userRatingCount: 200, distanceKm: 1.0, openingPeriods: null });
  const s = scoreCandidateV2(neutral, ctx({ halalPreference: true, allergies: ["kacang"] }));
  assert.ok(s.negativeSignals.includes("hours_unverified"));
  assert.ok(s.negativeSignals.includes("halal_status_unknown"));
  assert.ok(s.negativeSignals.includes("allergy_data_unknown"));
});

test("O45: match score bounded 0..100", () => {
  const { scored } = rankCandidatesV2(POOL_52, ctx({ selectedMood: "moodSurprise" }));
  for (const s of scored) assert.ok(s.matchScore >= 0 && s.matchScore <= 100);
});

test("O46: missing data does not inflate score above complete places", () => {
  const complete = openPlace({ placeId: "cmp", cuisine: "malay", rating: 4.4, userRatingCount: 800, priceLevel: 2, distanceKm: 1.0 });
  const missing = scoreCandidateV2(HOURS_UNKNOWN, ctx());
  const full = scoreCandidateV2(complete, ctx());
  assert.ok(full.score > missing.score);
});

test("O47: same context is deterministic (score equal)", () => {
  const a = scoreCandidateV2(HIGH_CONF, ctx({ selectedMood: "moodHighRating" })).score;
  const b = scoreCandidateV2(HIGH_CONF, ctx({ selectedMood: "moodHighRating" })).score;
  assert.equal(a, b);
});

test("O48: masked log carries no raw sensitive data", () => {
  const masked = maskForLog(ctx({ allergies: ["kacang", "seafood"], halalPreference: true }));
  const json = JSON.stringify(masked);
  assert.ok(!json.includes("kacang"));
  assert.ok(!json.includes("seafood"));
  assert.equal((masked as { allergyCount: number }).allergyCount, 2);
});
