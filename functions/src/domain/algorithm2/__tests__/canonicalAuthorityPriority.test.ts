import assert from "node:assert/strict";
import { test } from "node:test";

import { PlaceCandidate } from "../../../types/place";
import { applyCuisineDiversity, applyMoodPriority } from "../sessionEngine";

function cand(
  id: string,
  cuisine: string,
  score: number,
  canonical = false,
): PlaceCandidate {
  return {
    placeId: id,
    name: id,
    cuisine,
    emoji: "🍽️",
    rating: 4,
    userRatingCount: 20,
    priceLevel: 2,
    distanceKm: 1,
    isOpen: true,
    address: "",
    matchScore: score,
    matchReasonKeys: [],
    priceEstimate: "",
    ...(canonical ? { dataSource: "canonical" as const, canonicalPlaceId: `PLC-${id}` } : {}),
  };
}

test("diversity cannot move provider-only suggestion above canonical tier", () => {
  const input = [
    cand("legacy-1", "Malay", 99),
    cand("canonical-1", "Malay", 70, true),
    cand("legacy-2", "Malay", 65),
    cand("canonical-2", "Cafe", 60, true),
  ];
  assert.deepEqual(
    applyCuisineDiversity(input, { cuisineCap: 1, window: 3 }).map((p) => p.placeId),
    ["canonical-1", "canonical-2", "legacy-1", "legacy-2"],
  );
});

test("stronger mood provider-only result stays below canonical tier", () => {
  const input = [
    cand("canonical-low-mood", "Malay", 80, true),
    cand("legacy-high-mood", "Cafe", 78),
  ];
  const mood = new Map([
    ["canonical-low-mood", 0.4],
    ["legacy-high-mood", 1.0],
  ]);
  assert.deepEqual(
    applyMoodPriority(input, (id) => mood.get(id) ?? 0.5).map((p) => p.placeId),
    ["canonical-low-mood", "legacy-high-mood"],
  );
});

test("mood still orders candidates inside canonical tier", () => {
  const input = [
    cand("canonical-a", "Malay", 90, true),
    cand("canonical-b", "Cafe", 80, true),
    cand("legacy", "Cafe", 99),
  ];
  const mood = new Map([
    ["canonical-a", 0.4],
    ["canonical-b", 1.0],
    ["legacy", 1.0],
  ]);
  assert.deepEqual(
    applyMoodPriority(input, (id) => mood.get(id) ?? 0.5).map((p) => p.placeId),
    ["canonical-b", "canonical-a", "legacy"],
  );
});
