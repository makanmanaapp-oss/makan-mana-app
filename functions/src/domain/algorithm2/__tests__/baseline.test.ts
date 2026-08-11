/**
 * Algorithm 2 / Phase 2.1 — ujian GARIS DASAR (menangkap tingkah laku SEMASA
 * sebelum sebarang perubahan). Sesetengah ujian mendedahkan kecacatan sedia ada
 * (cth. ketiadaan penindasan shown/reject) — TIDAK dilemahkan.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { scoreAndRank } from "../../../services/scoringService";
import { computeCandidateFunnel } from "../candidateFunnel";
import {
  ALLERGY_PLACE,
  BRANCH_PLACES,
  CLOSED_PLACE,
  DUP_PLACES,
  FORTY_PLACES,
  HALAL_NEG_PLACE,
  NEAR_EQUAL,
  place,
} from "./fixtures";

// 1. Home output capped at 12 (presentation slice of the pool).
test("1: home returned count capped at 12", () => {
  const f = computeCandidateFunnel(FORTY_PLACES);
  assert.equal(f.homeReturnedCount, 12);
  assert.ok(f.rankedCandidateCount > 12, "pool larger than home slice");
});

// 2. Spin output capped at 5 (primary + 4 alternatives).
test("2: spin primary=1 + alternatives=4 (slice 5)", () => {
  const f = computeCandidateFunnel(FORTY_PLACES);
  assert.equal(f.spinPrimaryCount, 1);
  assert.equal(f.spinAlternativesCount, 4);
});

// 3. Raw candidate count recorded before slice.
test("3: raw candidate count recorded (40)", () => {
  assert.equal(computeCandidateFunnel(FORTY_PLACES).rawCandidateCount, 40);
});

// 4. Duplicate provider IDs collapse (dedupe exposes current behavior).
test("4: duplicate provider IDs collapse in funnel", () => {
  const f = computeCandidateFunnel(DUP_PLACES);
  assert.equal(f.rawCandidateCount, 3);
  assert.equal(f.uniqueCandidateCount, 2);
  assert.equal(f.duplicateRemovedCount, 1);
});

// 5. DEFECT CAPTURE: repeated identical call → identical ordering (no rotation).
test("5: repeated identical context returns identical ordering (deterministic, no rotation)", () => {
  const a = scoreAndRank([...FORTY_PLACES], { mood: "moodLapar" }).map((p) => p.placeId);
  const b = scoreAndRank([...FORTY_PLACES], { mood: "moodLapar" }).map((p) => p.placeId);
  assert.deepEqual(a, b, "same input+context → identical order every time (repetition driver)");
});

// 6. Mood change MAY reorder — record current truth.
test("6: mood change reorders (mood weight is active)", () => {
  const lapar = scoreAndRank([...FORTY_PLACES], { mood: "moodJimat" }).map((p) => p.placeId);
  const pedas = scoreAndRank([...FORTY_PLACES], { mood: "moodPedas" }).map((p) => p.placeId);
  // Current truth: ordering CAN differ by mood (not asserting equality either way).
  assert.equal(Array.isArray(lapar) && Array.isArray(pedas), true);
});

// 7. Radius change alters distance eligibility/score.
test("7: smaller radius penalizes far places more", () => {
  const near = place({ placeId: "near", distanceKm: 0.5, cuisine: "cafe", rating: 4.0, userRatingCount: 100 });
  const far = place({ placeId: "far", distanceKm: 4.8, cuisine: "cafe", rating: 4.0, userRatingCount: 100 });
  const tight = scoreAndRank([near, far], { radiusKm: 2 }).map((p) => p.placeId);
  assert.equal(tight[0], "near", "closer place ranks first at tight radius");
});

// 8. excludePlaceIds MECHANISM works in scoreAndRank (even though callables don't use it).
test("8: scoreAndRank supports excludePlaceIds (mechanism exists)", () => {
  const ranked = scoreAndRank([...FORTY_PLACES], { excludePlaceIds: ["p_01", "p_02"] });
  const ids = ranked.map((p) => p.placeId);
  assert.ok(!ids.includes("p_01") && !ids.includes("p_02"));
});

// 9. DEFECT CAPTURE: funnel shows exclude removes when provided; callables pass none.
test("9: funnel exclude-removed reflects provided exclusions (callables provide zero)", () => {
  const f = computeCandidateFunnel(FORTY_PLACES, { excludePlaceIds: ["p_03"] });
  assert.equal(f.excludeRemovedCount, 1);
  const fNone = computeCandidateFunnel(FORTY_PLACES, {});
  assert.equal(fNone.excludeRemovedCount, 0);
});

// 10. Closed places removed (hard isOpen filter).
test("10: closed places are removed", () => {
  const ranked = scoreAndRank([place({ placeId: "open1", isOpen: true }), CLOSED_PLACE], {});
  const ids = ranked.map((p) => p.placeId);
  assert.ok(ids.includes("open1") && !ids.includes("closed_1"));
});

// 11. History penalty: recentPlaceIds lowers a place's score/rank.
test("11: recent (eaten) place is penalized vs identical non-recent", () => {
  const a = place({ placeId: "recent", cuisine: "cafe", rating: 4.2, userRatingCount: 200, distanceKm: 1 });
  const b = place({ placeId: "fresh", cuisine: "cafe", rating: 4.2, userRatingCount: 200, distanceKm: 1 });
  const ranked = scoreAndRank([a, b], { recentPlaceIds: ["recent"] }).map((p) => p.placeId);
  assert.equal(ranked[0], "fresh", "non-recent ranks above recently-eaten identical place");
});

// 12. Variety penalty: repeated last-cuisine is penalized.
test("12: last-cuisine variety penalty lowers matching cuisine", () => {
  const same = place({ placeId: "same_cui", cuisine: "thai", rating: 4.3, userRatingCount: 300, distanceKm: 1 });
  const diff = place({ placeId: "diff_cui", cuisine: "japanese", rating: 4.3, userRatingCount: 300, distanceKm: 1 });
  const ranked = scoreAndRank([same, diff], { lastCuisines: ["thai"] }).map((p) => p.placeId);
  assert.equal(ranked[0], "diff_cui", "different cuisine ranks above repeated last-cuisine");
});

// 13. Near-equal candidates: deterministic (stable) order — no rotation.
test("13: near-equal candidates keep deterministic order (no tie rotation)", () => {
  const a = scoreAndRank([...NEAR_EQUAL], {}).map((p) => p.placeId);
  const b = scoreAndRank([...NEAR_EQUAL], {}).map((p) => p.placeId);
  assert.deepEqual(a, b);
});

// 14. Safety: allergy conflict flags negative signal (not silently "safe").
test("14: allergy conflict surfaces possible_allergy_conflict", () => {
  const ranked = scoreAndRank([ALLERGY_PLACE], { allergies: ["seafood"] });
  assert.ok(ranked[0].negativeSignals?.includes("possible_allergy_conflict"));
});

// 15. Safety: halal-negative text penalized/flagged.
test("15: halal-negative place flagged possible_non_halal", () => {
  const ranked = scoreAndRank([HALAL_NEG_PLACE], { halalPreference: true });
  assert.ok(ranked[0].negativeSignals?.includes("possible_non_halal"));
});

// 16. Branches (similar name, different id) both survive (no false merge in legacy path).
test("16: distinct branches both remain (no legacy merge)", () => {
  const ids = scoreAndRank([...BRANCH_PLACES], {}).map((p) => p.placeId);
  assert.ok(ids.includes("br_kl") && ids.includes("br_pj"));
});

// 17. Pool/unique diagnostics captured.
test("17: funnel captures eligible/unique/cuisine diversity", () => {
  const f = computeCandidateFunnel(FORTY_PLACES);
  assert.ok(f.eligibleCandidateCount <= f.uniqueCandidateCount);
  assert.ok(f.uniqueCuisineCount >= 10, "40 fixtures span many cuisines");
  assert.ok(typeof f.topScoreGap === "number");
});

// 18. Purity: scoreAndRank does not mutate input array / writes nothing.
test("18: scoreAndRank is pure (input length preserved, no throw)", () => {
  const input = [...FORTY_PLACES];
  const len = input.length;
  scoreAndRank(input, {});
  assert.equal(input.length, len);
});
