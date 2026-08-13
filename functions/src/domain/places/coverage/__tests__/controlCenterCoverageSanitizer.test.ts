import assert from "node:assert/strict";
import test from "node:test";

import {sanitizeCoverageCell} from "../../../controlCenter/placeCoverageSanitizer";
import {PlaceCandidate} from "../../../../types/place";

function candidate(placeId: string, isOpen: boolean): PlaceCandidate {
  return {
    placeId,
    name: placeId,
    cuisine: "malay",
    emoji: "🍽️",
    rating: 4,
    userRatingCount: 10,
    priceLevel: 2,
    distanceKm: 1,
    isOpen,
    address: "",
    matchScore: 0,
    matchReasonKeys: [],
    priceEstimate: "",
  };
}

test("control-center sanitizer emits aggregate coverage only", () => {
  const now = Date.UTC(2026, 7, 14, 0, 0, 0);
  const result = sanitizeCoverageCell(
    "w2839",
    {
      candidates: [candidate("a", true), candidate("b", false), candidate("a", true)],
      lastDiscoveryAt: now - 60_000,
      updatedAt: now - 60_000,
    },
    now,
  );

  assert.equal(result.known_places, 2);
  assert.equal(result.active_places, 1);
  assert.equal(result.closed_places, 1);
  assert.equal(result.open_now_places, 1);
  assert.equal(result.coverage_status, "HEALTHY");
  assert.equal("uid" in result, false);
  assert.equal("userLat" in result, false);
  assert.equal("userLng" in result, false);
  assert.equal("moodId" in result, false);
});

test("control-center sanitizer follows the 24-hour live cell freshness rule", () => {
  const now = Date.UTC(2026, 7, 14, 0, 0, 0);
  const stale = sanitizeCoverageCell(
    "w2839",
    {candidates: [candidate("a", true)], updatedAt: now - (25 * 60 * 60 * 1000)},
    now,
  );
  const missing = sanitizeCoverageCell("w2839", {candidates: []}, now);

  assert.equal(stale.coverage_status, "STALE");
  assert.equal(missing.coverage_status, "STALE");
});
