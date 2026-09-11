import assert from "node:assert/strict";
import {test} from "node:test";

import {PublicRestaurantProfileV2} from "../../../merchant/publicRestaurantProfile";
import {
  canonicalCandidateFromProfile,
  mergeCanonicalPreferred,
  rankCanonicalSearch,
} from "../publishedCanonicalCandidates";
import {PlaceCandidate} from "../../../../types/place";

function candidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    placeId: "provider-1",
    name: "Provider Kedai",
    cuisine: "Malay",
    emoji: "🍽️",
    rating: 4.2,
    userRatingCount: 20,
    priceLevel: 2,
    distanceKm: 0.5,
    isOpen: true,
    address: "Puncak Alam",
    matchScore: 50,
    matchReasonKeys: [],
    priceEstimate: "",
    lat: 3.22,
    lng: 101.43,
    ...overrides,
  };
}

function profile(overrides: Partial<PublicRestaurantProfileV2> = {}): PublicRestaurantProfileV2 {
  return {
    canonicalPlaceId: "CCM-test",
    publicationVersion: 2,
    name: "MakanMana Test Kitchen Puncak Alam",
    latitude: 3.22,
    longitude: 101.43,
    cuisineTags: ["Malay", "Cafe"],
    foodTags: [],
    signatureDishes: [],
    menuItems: [],
    serviceModes: [],
    amenities: [],
    tags: [],
    priceState: "price_unknown",
    businessState: "active",
    hoursState: "hours_unknown",
    openingPeriods: [],
    specialHours: [],
    ratingState: "rating_hidden",
    halalState: "halal_unknown",
    halalEvidenceLevel: "unknown",
    dietaryReported: [],
    allergenReported: [],
    allergenEvidenceLevel: "unknown",
    media: [],
    verificationStatus: "published",
    freshnessState: "fresh",
    warnings: [],
    sourceMode: "canonical_publication",
    ...overrides,
  };
}

test("canonical profile becomes a ranking candidate without invented rating", () => {
  const result = canonicalCandidateFromProfile(profile(), {
    centerLat: 3.22,
    centerLng: 101.43,
    nowMs: Date.UTC(2026, 8, 11, 4, 0, 0),
  });
  assert.ok(result);
  assert.equal(result.placeId, "CCM-test");
  assert.equal(result.canonicalPlaceId, "CCM-test");
  assert.equal(result.dataSource, "canonical");
  assert.equal(result.rating, 0);
  assert.equal(result.userRatingCount, 0);
  assert.ok(result.distanceKm < 0.01);
});

test("permanently closed first-party publication cannot become a candidate", () => {
  assert.equal(
    canonicalCandidateFromProfile(profile({businessState: "permanently_closed"})),
    null,
  );
});

test("proven provider alias is replaced by canonical identity while provider evidence survives", () => {
  const canonical = candidate({
    placeId: "CCM-test",
    canonicalPlaceId: "CCM-test",
    name: "MakanMana Test Kitchen Puncak Alam",
    rating: 0,
    userRatingCount: 0,
    priceLevel: 0,
    priceEstimate: "",
    photoUrl: null,
    openingPeriods: null,
    isOpen: true,
    negativeSignals: ["price_unknown", "hours_unknown"],
    dataSource: "canonical",
  });
  const provider = candidate({
    placeId: "google-abc",
    name: "MakanMana Test Kitchen Puncak Alam",
    rating: 4.7,
    userRatingCount: 431,
    priceLevel: 2,
    priceEstimate: "RM15 - RM35",
    photoUrl: "https://example.com/provider.jpg",
    openingPeriods: [{openMinuteOfWeek: 0, closeMinuteOfWeek: 10080}],
    isOpen: false,
  });
  const unrelated = candidate({placeId: "google-other", name: "Kedai Lain", lat: 3.24});

  const merged = mergeCanonicalPreferred(
    [provider, unrelated],
    [canonical],
    {"google-abc": "CCM-test"},
  );

  assert.deepEqual(merged.map((item) => item.placeId), ["google-other", "CCM-test"]);
  const winner = merged[1];
  assert.equal(winner.dataSource, "canonical");
  assert.equal(winner.rating, 4.7);
  assert.equal(winner.userRatingCount, 431);
  assert.equal(winner.priceLevel, 2);
  assert.equal(winner.photoUrl, "https://example.com/provider.jpg");
  assert.deepEqual(winner.openingPeriods, provider.openingPeriods);
  assert.equal(winner.isOpen, false);
  assert.ok(!(winner.negativeSignals ?? []).includes("price_unknown"));
  assert.ok(!(winner.negativeSignals ?? []).includes("hours_unknown"));
});

test("conservative exact-name geo fallback prevents an unaliased duplicate", () => {
  const canonical = candidate({
    placeId: "CCM-test",
    canonicalPlaceId: "CCM-test",
    name: "MakanMana Test Kitchen Puncak Alam",
    dataSource: "canonical",
  });
  const provider = candidate({
    placeId: "google-abc",
    name: "MakanMana Test Kitchen Puncak Alam",
    lat: 3.2202,
    lng: 101.4301,
  });
  const merged = mergeCanonicalPreferred([provider], [canonical]);
  assert.deepEqual(merged.map((item) => item.placeId), ["CCM-test"]);
});

test("canonical exact-name search outranks prefix and contains matches", () => {
  const exact = candidate({placeId: "a", name: "MakanMana Test Kitchen Puncak Alam"});
  const prefix = candidate({placeId: "b", name: "MakanMana Test Kitchen Puncak Alam Annex"});
  const contains = candidate({placeId: "c", name: "Best MakanMana Test Kitchen Puncak Alam"});
  const ranked = rankCanonicalSearch(
    [contains, prefix, exact],
    "MakanMana Test Kitchen Puncak Alam",
  );
  assert.deepEqual(ranked.map((item) => item.placeId), ["a", "b", "c"]);
});
