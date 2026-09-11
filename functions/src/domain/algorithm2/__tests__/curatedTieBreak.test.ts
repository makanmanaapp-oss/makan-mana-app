import assert from "node:assert/strict";
import test from "node:test";

import {PlaceCandidate} from "../../../types/place";
import {ScoredCandidate} from "../scoringModel";
import {CURATED_SOURCE_TIE_BREAK_BONUS, preferCuratedComparable} from "../unifiedRanking";

function place(placeId: string, canonical = false): PlaceCandidate {
  return {
    placeId,
    ...(canonical ? {canonicalPlaceId: placeId, dataSource: "canonical" as const} : {}),
    name: placeId,
    cuisine: "Malaysian Food",
    emoji: "🍽️",
    rating: 0,
    userRatingCount: 0,
    priceLevel: 0,
    distanceKm: 1,
    isOpen: true,
    address: "",
    matchScore: 0,
    matchReasonKeys: [],
    priceEstimate: "",
  };
}

function scored(p: PlaceCandidate, score: number): ScoredCandidate {
  return {
    place: p,
    score,
    matchScore: Math.round(score * 100),
    components: {
      availability: 0, distance: 0, ratingConfidence: 0, budget: 0,
      cuisinePreference: 0, moodFit: 0, dietCompatibility: 0,
      halalConfidence: 0, foodMemory: 0, variety: 0, exploration: 0,
      fitContext: 0, sportContext: 0, spendingContext: 0, placeQuality: 0,
    },
    reasons: [],
    negativeSignals: [],
    weightsUsed: {},
    fitEvidenceLevel: 0,
    sportEvidenceLevel: 0,
    nutritionVerified: false,
  };
}

test("direct canonical wins only when scores are comparable", () => {
  const provider = scored(place("provider"), 0.80);
  const canonical = scored(place("CCM-test", true), 0.79);
  const result = preferCuratedComparable([provider, canonical]);
  assert.equal(result[0].place.placeId, "CCM-test");
});

test("source trust never hard-pins a materially worse canonical candidate", () => {
  const provider = scored(place("provider"), 0.80);
  const canonical = scored(place("CCM-test", true), 0.70);
  const result = preferCuratedComparable([canonical, provider]);
  assert.equal(result[0].place.placeId, "provider");
  assert.ok(CURATED_SOURCE_TIE_BREAK_BONUS < 0.02);
});
