import assert from "node:assert/strict";
import { test } from "node:test";

import { PlaceCandidate } from "../../../../types/place";
import {
  isCanonicalCandidate,
  prioritizeCanonicalCandidates,
} from "../canonicalPriority";

function cand(
  placeId: string,
  matchScore: number,
  over: Partial<PlaceCandidate> = {},
): PlaceCandidate {
  return {
    placeId,
    name: placeId,
    cuisine: "Restoran",
    emoji: "🍽️",
    rating: 4,
    userRatingCount: 20,
    priceLevel: 2,
    distanceKm: 1,
    isOpen: true,
    address: "",
    matchScore,
    matchReasonKeys: [],
    priceEstimate: "",
    ...over,
  };
}

const canonical = (id: string, score: number) => cand(id, score, {
  dataSource: "canonical",
  canonicalPlaceId: `PLC-${id}`,
});

test("canonical marker requires both canonical id and canonical data source", () => {
  assert.equal(isCanonicalCandidate(canonical("a", 70)), true);
  assert.equal(isCanonicalCandidate(cand("b", 90, { canonicalPlaceId: "PLC-b" })), false);
  assert.equal(isCanonicalCandidate(cand("c", 90, { dataSource: "canonical" })), false);
});

test("published canonical tier sits ahead of legacy tier", () => {
  const input = [
    cand("legacy-high", 98),
    canonical("canonical-mid", 72),
    cand("legacy-mid", 70),
    canonical("canonical-low", 61),
  ];
  assert.deepEqual(
    prioritizeCanonicalCandidates(input).map((p) => p.placeId),
    ["canonical-mid", "canonical-low", "legacy-high", "legacy-mid"],
  );
});

test("algorithm order is preserved inside each tier", () => {
  const input = [
    cand("l1", 99),
    canonical("c1", 88),
    canonical("c2", 77),
    cand("l2", 66),
    canonical("c3", 55),
  ];
  const out = prioritizeCanonicalCandidates(input);
  assert.deepEqual(out.filter(isCanonicalCandidate).map((p) => p.placeId), ["c1", "c2", "c3"]);
  assert.deepEqual(out.filter((p) => !isCanonicalCandidate(p)).map((p) => p.placeId), ["l1", "l2"]);
});

test("all-legacy and all-canonical lists remain unchanged", () => {
  const legacy = [cand("l1", 90), cand("l2", 80)];
  const canon = [canonical("c1", 90), canonical("c2", 80)];
  assert.deepEqual(prioritizeCanonicalCandidates(legacy).map((p) => p.placeId), ["l1", "l2"]);
  assert.deepEqual(prioritizeCanonicalCandidates(canon).map((p) => p.placeId), ["c1", "c2"]);
});
