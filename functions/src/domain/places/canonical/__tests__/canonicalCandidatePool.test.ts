import assert from "node:assert/strict";
import test from "node:test";

import {PlaceCandidate} from "../../../../types/place";
import {
  dedupeCanonicalCandidates,
  searchCanonicalCandidates,
} from "../canonicalCandidatePool";

function candidate(
  placeId: string,
  name: string,
  overrides: Partial<PlaceCandidate> = {},
): PlaceCandidate {
  return {
    placeId,
    name,
    cuisine: "Malaysian Food",
    emoji: "🍽️",
    rating: 0,
    userRatingCount: 0,
    priceLevel: 0,
    distanceKm: 1,
    isOpen: true,
    address: "Bandar Puncak Alam, Selangor",
    matchScore: 70,
    matchReasonKeys: [],
    priceEstimate: "",
    ...overrides,
  };
}

test("dedupe prefers direct canonical registry candidate over provider alias", () => {
  const provider = candidate("google-123", "Old Provider Name", {
    canonicalPlaceId: "CCM-abc",
    dataSource: "canonical",
    rating: 4.8,
  });
  const canonical = candidate("CCM-abc", "MakanMana Test Kitchen Puncak Alam", {
    canonicalPlaceId: "CCM-abc",
    dataSource: "canonical",
  });

  const result = dedupeCanonicalCandidates([provider, canonical]);
  assert.equal(result.length, 1);
  assert.equal(result[0].placeId, "CCM-abc");
  assert.equal(result[0].name, "MakanMana Test Kitchen Puncak Alam");
});

test("dedupe removes an exact-name provider rediscovery within 35m even before alias exists", () => {
  const canonical = candidate("CCM-abc", "MakanMana Test Kitchen Puncak Alam", {
    canonicalPlaceId: "CCM-abc",
    dataSource: "canonical",
    lat: 3.23890,
    lng: 101.42793,
  });
  const provider = candidate("google-later", "makanmana test kitchen puncak alam", {
    lat: 3.23891,
    lng: 101.42794,
    rating: 4.9,
  });
  const otherBranch = candidate("google-other", "MakanMana Test Kitchen Puncak Alam", {
    lat: 3.2400,
    lng: 101.4290,
  });

  const result = dedupeCanonicalCandidates([provider, canonical, otherBranch]);
  assert.equal(result.length, 2);
  assert.equal(result[0].placeId, "CCM-abc");
  assert.equal(result[1].placeId, "google-other");
});

test("search exact canonical name returns it first from the full pool", () => {
  const nearProvider = candidate("google-near", "Puncak Alam Cafe", {
    rating: 4.9,
    userRatingCount: 1000,
    matchScore: 94,
    distanceKm: 0.2,
  });
  const canonical = candidate("CCM-test", "MakanMana Test Kitchen Puncak Alam", {
    canonicalPlaceId: "CCM-test",
    dataSource: "canonical",
    matchScore: 62,
    distanceKm: 1.4,
  });

  const result = searchCanonicalCandidates(
    [nearProvider, canonical],
    "MakanMana Test Kitchen Puncak Alam",
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].placeId, "CCM-test");
});

test("search is case/spacing insensitive and can match cuisine/address", () => {
  const canonical = candidate("CCM-test", "MakanMana Test Kitchen Puncak Alam", {
    canonicalPlaceId: "CCM-test",
    address: "Bandar Puncak Alam, Kuala Selangor",
  });
  assert.equal(searchCanonicalCandidates([canonical], "  makanMana   test kitchen  ").length, 1);
  assert.equal(searchCanonicalCandidates([canonical], "kuala selangor").length, 1);
  assert.equal(searchCanonicalCandidates([canonical], "malaysian food").length, 1);
});
