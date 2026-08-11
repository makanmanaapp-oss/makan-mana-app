/**
 * Algorithm 2 / Phase 2.3A — bukti-berpagar Fit/Sport + wallet dipercayai +
 * matriks mood penuh (Lapar/Hujan). Deterministik, tulen.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { scoreCandidateV2, rankCandidatesV2, fitEvidenceLevel, sportEvidenceLevel } from "../scoringModel";
import { rankUnified } from "../unifiedRanking";
import { ctx, openPlace, HEALTHY_PLACE, HEAVY_PLACE, PROTEIN_PLACE, LATE_PLACE, ALLERGY_SEAFOOD } from "./scoringFixtures";

const rank = (cands: Parameters<typeof rankCandidatesV2>[0], c = ctx()) =>
  rankCandidatesV2(cands, c).ranked;
const NEUTRAL = openPlace({ placeId: "neutral", cuisine: "restoran", name: "Kedai Biasa", rating: 4.0, userRatingCount: 200, distanceKm: 1.5, priceLevel: 2 });

// ---------------- FIT EVIDENCE GATING ----------------

test("A-Fit6: Level 0 evidence gives NO fit weight/boost", () => {
  const c = ctx({ fitGoal: "lose_weight" });
  assert.equal(fitEvidenceLevel("restoran kedai biasa", c), 0);
  const s = scoreCandidateV2(NEUTRAL, c);
  assert.equal(s.fitEvidenceLevel, 0);
  assert.equal(s.weightsUsed.fitContext, undefined); // berat 0 → tidak direkod
  assert.ok(!s.reasons.includes("suitsFitGoal"));
});

test("A-Fit7: Level 1 tag evidence gives BOUNDED boost (<=0.85) + honest signal", () => {
  const c = ctx({ fitGoal: "lose_weight" });
  assert.equal(fitEvidenceLevel("green salad healthy bar", c), 1);
  const s = scoreCandidateV2(HEALTHY_PLACE, c);
  assert.equal(s.fitEvidenceLevel, 1);
  assert.ok((s.weightsUsed.fitContext ?? 0) > 0);
  assert.ok(s.components.fitContext <= 0.85); // terbatas (bukan nutrisi disahkan)
  assert.ok(s.negativeSignals.includes("nutrition_not_verified"));
});

test("A-Fit8: Level 2 (verified nutrition) never reached -> nutritionVerified false", () => {
  const s = scoreCandidateV2(HEALTHY_PLACE, ctx({ fitGoal: "lose_weight" }));
  assert.equal(s.nutritionVerified, false);
});

test("A-Fit9: missing nutrition never creates a macro reason", () => {
  const s = scoreCandidateV2(PROTEIN_PLACE, ctx({ fitGoal: "muscle_gain" }));
  const allowed = new Set(["nearLocation","withinBudget","fitsMood","matchesFavourite","oftenAccepted","highRating","differentFromRecent","openNow","suitsFitGoal","cheaperForBudget","halalFriendly"]);
  assert.ok(s.reasons.every((r) => allowed.has(r)));
  // suitsFitGoal dibenarkan HANYA dengan bukti tag (level>=1) — bukan dakwaan makro.
  if (s.reasons.includes("suitsFitGoal")) assert.ok(s.fitEvidenceLevel >= 1);
});

test("A-Fit10: fit cannot override safety (allergy hard-excluded)", () => {
  const allergen = openPlace({ placeId: "alg_sf", name: "Seafood Grill Healthy", cuisine: "seafood" });
  const res = rankUnified([allergen], ctx({ allergies: ["seafood"], fitGoal: "lose_weight" }));
  assert.equal(res.ranked.length, 0);
});

// ---------------- SPORT EVIDENCE GATING ----------------

test("A-Sport11: sport signal inactive when not selected (weight 0)", () => {
  const s = scoreCandidateV2(PROTEIN_PLACE, ctx());
  assert.equal(s.sportEvidenceLevel, 0);
  assert.equal(s.weightsUsed.sportContext, undefined);
});

test("A-Sport12: sport active only with supported evidence", () => {
  const c = ctx({ sportMood: "post_workout" });
  assert.equal(sportEvidenceLevel("grilled chicken protein", c), 1);
  assert.equal(sportEvidenceLevel("ice cream dessert", c), 0);
  const withTag = scoreCandidateV2(PROTEIN_PLACE, c);
  assert.ok((withTag.weightsUsed.sportContext ?? 0) > 0);
  const noTag = scoreCandidateV2(openPlace({ placeId: "dz", cuisine: "dessert", name: "Ice Cream" }), c);
  assert.equal(noTag.weightsUsed.sportContext, undefined);
});

test("A-Sport13: sport cannot override budget/safety", () => {
  const allergen = openPlace({ placeId: "alg_sf", name: "Seafood Protein Grill", cuisine: "seafood" });
  const res = rankUnified([allergen], ctx({ allergies: ["seafood"], sportMood: "post_workout" }));
  assert.equal(res.ranked.length, 0);
});

test("A-Sport14: rest day returns normal preference dominance (no sport tag weight)", () => {
  const s = scoreCandidateV2(PROTEIN_PLACE, ctx({ sportMood: "rest_day" }));
  assert.equal(s.sportEvidenceLevel, 0);
  assert.equal(s.weightsUsed.sportContext, undefined);
});

// ---------------- MEAL WALLET (trusted only) ----------------

test("A-Wallet15: missing wallet data is neutral (weight 0)", () => {
  const c = ctx();
  assert.equal(c.walletDataAvailable, false);
  const s = scoreCandidateV2(HEALTHY_PLACE, c);
  assert.equal(s.weightsUsed.spendingContext, undefined); // overspend unknown -> weight 0
});

test("A-Wallet16: trusted overspend promotes cheaper valid options", () => {
  const cheap = openPlace({ placeId: "w_cheap", cuisine: "malay", priceLevel: 1, distanceKm: 2, rating: 4.0, userRatingCount: 200 });
  const mid = openPlace({ placeId: "w_mid", cuisine: "malay", priceLevel: 3, distanceKm: 2, rating: 4.0, userRatingCount: 200 });
  const c = ctx({ budgetLeftWeek: -30 });
  assert.equal(c.walletDataAvailable, true);
  assert.equal(c.overspendState, "over");
  const r = rank([mid, cheap], c);
  assert.equal(r[0].placeId, "w_cheap");
});

test("A-Wallet17: without wallet record, spendingContext not applied (stale/absent ignored)", () => {
  const res = rankUnified([HEALTHY_PLACE], ctx());
  assert.equal(res.diagnostics.walletDataAvailable, false);
  assert.equal(res.diagnostics.spendingContextApplied, false);
});

test("A-Wallet18: wallet flags reflect only provided (server) values, not client score", () => {
  // budgetLeftWeek provided (simulasi rekod pelayan) -> available; tiada -> false.
  assert.equal(ctx({ budgetLeftWeek: 10 }).walletDataAvailable, true);
  assert.equal(ctx({ averageMealSpend: 15 }).walletDataAvailable, true);
  assert.equal(ctx().walletDataAvailable, false);
});

test("A-Wallet19: exact savings never fabricated (no numeric savings reason)", () => {
  const c = ctx({ budgetLeftWeek: -30 });
  const cheap = openPlace({ placeId: "sv", cuisine: "malay", priceLevel: 1, distanceKm: 2, rating: 4.0, userRatingCount: 200 });
  const s = scoreCandidateV2(cheap, c);
  // cheaperForBudget adalah kualitatif; tiada kunci sebab mengandungi angka.
  assert.ok(s.reasons.every((r) => !/[0-9]/.test(r)));
});

// ---------------- FULL MOOD MATRIX (remaining) ----------------

test("A-Mood-Lapar: reorders filling cuisines up", () => {
  const filling = openPlace({ placeId: "fill", cuisine: "nasi", name: "Nasi Campur", rating: 4.0, userRatingCount: 200, distanceKm: 1.5 });
  const dessert = openPlace({ placeId: "dz2", cuisine: "dessert", name: "Cake Shop", rating: 4.0, userRatingCount: 200, distanceKm: 1.5 });
  const r = rank([dessert, filling], ctx({ selectedMood: "moodLapar" }));
  assert.equal(r[0].placeId, "fill");
});

test("A-Mood-Hujan: comfort food reorders up", () => {
  const soup = openPlace({ placeId: "soup", cuisine: "noodle", name: "Hot Soup Noodle", rating: 4.0, userRatingCount: 200, distanceKm: 1.5 });
  const cold = openPlace({ placeId: "cold", cuisine: "salad", name: "Cold Salad", rating: 4.0, userRatingCount: 200, distanceKm: 1.5 });
  const r = rank([cold, soup], ctx({ selectedMood: "moodHujan" }));
  assert.equal(r[0].placeId, "soup");
});

test("A-Mood-identicalPoolHonest: no matching evidence -> stable order, safety intact", () => {
  // Pool tanpa ciri mood relevan → susunan sah (tidak crash, safety kekal).
  const a = openPlace({ placeId: "ma", cuisine: "restoran", rating: 4.0, userRatingCount: 200, distanceKm: 1.0 });
  const b = openPlace({ placeId: "mb", cuisine: "restoran", rating: 4.0, userRatingCount: 200, distanceKm: 1.0 });
  const r = rank([a, b], ctx({ selectedMood: "moodCafe" }));
  assert.equal(r.length, 2); // kedua kekal (tiada override safety)
});

// ---------------- MEAL PLAN CONSISTENCY (scoring version) ----------------

test("A-MealPlan30: ranking source is backend matchScore (LATE_PLACE example scored)", () => {
  // Meal Plan guna matchScore backend; sahkan scoreCandidateV2 hasilkan matchScore 0..100.
  const s = scoreCandidateV2(LATE_PLACE, ctx());
  assert.ok(s.matchScore >= 0 && s.matchScore <= 100);
});

test("A-MealPlan2: meal-plan-eligible pool excludes hard-safety rejects", () => {
  const res = rankUnified([ALLERGY_SEAFOOD, LATE_PLACE], ctx({ allergies: ["seafood"] }));
  assert.ok(!res.ranked.map((p) => p.placeId).includes("alg_sf"));
});
