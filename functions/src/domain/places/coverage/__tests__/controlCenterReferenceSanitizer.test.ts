import assert from "node:assert/strict";
import {test} from "node:test";

import {PlaceCandidate} from "../../../../types/place";
import {
  referencesFromAreaCachePage,
  sanitizeRuntimePlaceReference,
} from "../controlCenterReferenceSanitizer";

function candidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    placeId: "p-1",
    name: "  Kedai Makan Satu  ",
    cuisine: "Malay",
    emoji: "🍛",
    rating: 4.2,
    userRatingCount: 100,
    priceLevel: 2,
    distanceKm: 1.2,
    isOpen: true,
    address: "Jalan Satu",
    matchScore: 0,
    matchReasonKeys: [],
    priceEstimate: "RM10",
    lat: 3.1,
    lng: 101.6,
    ...overrides,
  };
}

test("runtime place reference uses stable placeId key and operational allow-list", () => {
  const row = sanitizeRuntimePlaceReference(candidate(), "w281z", {updatedAt: 1_700_000_000_000});
  assert.ok(row);
  assert.equal(row?.reference_key, "area_place_cache:p-1");
  assert.equal(row?.name, "Kedai Makan Satu");
  assert.equal(row?.normalized_name, "kedai makan satu");
  assert.deepEqual(row?.cuisine_tags, ["Malay"]);
  assert.equal(row?.latitude, 3.1);
  assert.equal(row?.longitude, 101.6);
  assert.equal(row?.source_updated_at, "2023-11-14T22:13:20.000Z");
});

test("runtime place reference never treats isOpen as lifecycle deletion", () => {
  const row = sanitizeRuntimePlaceReference(candidate({isOpen: false}), "cell", {});
  assert.equal(row?.lifecycle_status, "ACTIVE");
});

test("runtime place reference page deduplicates repeated placeIds", () => {
  const rows = referencesFromAreaCachePage([
    {id: "a", data: {updatedAt: 1000, candidates: [candidate({name: "Old"})]}},
    {id: "b", data: {updatedAt: 2000, candidates: [candidate({name: "New"}), candidate({placeId: "p-2", name: "Two"})]}},
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.reference_key === "area_place_cache:p-1")?.name, "New");
});

test("malformed runtime place is dropped", () => {
  const row = sanitizeRuntimePlaceReference(candidate({placeId: ""}), "cell", {});
  assert.equal(row, null);
});
