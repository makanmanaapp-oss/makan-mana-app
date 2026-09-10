import assert from "node:assert/strict";
import { test } from "node:test";

import { PlaceCandidate } from "../../../../types/place";
import {
  buildMasterCandidateSeed,
  upsertMasterCandidateSeed,
} from "../masterCandidateSeed";

function provider(over: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    placeId: "ChIJ-provider",
    name: "Kedai Lama",
    cuisine: "Malay restaurant",
    emoji: "🍛",
    rating: 4.7,
    userRatingCount: 321,
    priceLevel: 2,
    distanceKm: 1.3,
    isOpen: true,
    address: "Alamat lama",
    matchScore: 91,
    matchReasonKeys: ["highRating"],
    priceEstimate: "RM12 - RM30",
    openingPeriods: [{ openMinuteOfWeek: 100, closeMinuteOfWeek: 500 }],
    photoUrl: "https://example.com/provider.jpg",
    lat: 3.2000,
    lng: 101.5000,
    ...over,
  };
}

const seed = () => buildMasterCandidateSeed({
  canonicalPlaceId: "PLC-master-1",
  name: "Kedai Baru",
  address: "Alamat baharu",
  lat: 3.2001,
  lng: 101.5001,
  primaryCategory: "Masakan Melayu",
  businessStatus: "active",
  coverImageUrl: "https://example.com/curated.jpg",
  priceRange: "RM10 - RM25",
});

test("canonical-only seed does not fabricate provider rating or numeric price", () => {
  const c = seed();
  assert.equal(c.dataSource, "canonical");
  assert.equal(c.canonicalPlaceId, "PLC-master-1");
  assert.equal(c.rating, 0);
  assert.equal(c.userRatingCount, 0);
  assert.equal(c.priceLevel, 0);
  assert.equal(c.openingPeriods, null);
});

test("same provider candidate is upgraded to canonical while provider facts survive", () => {
  const stale = provider({
    name: "Kedai Baru",
    lat: 3.2001,
    lng: 101.5001,
  });
  const out = upsertMasterCandidateSeed([stale], seed());
  assert.equal(out.length, 1);
  assert.equal(out[0].placeId, "ChIJ-provider");
  assert.equal(out[0].canonicalPlaceId, "PLC-master-1");
  assert.equal(out[0].dataSource, "canonical");
  assert.equal(out[0].name, "Kedai Baru");
  assert.equal(out[0].address, "Alamat baharu");
  assert.equal(out[0].rating, 4.7);
  assert.equal(out[0].userRatingCount, 321);
  assert.equal(out[0].priceLevel, 2);
  assert.deepEqual(out[0].openingPeriods, stale.openingPeriods);
  assert.equal(out[0].photoUrl, "https://example.com/curated.jpg");
});

test("exact-name nearby duplicate collapses to one canonical candidate", () => {
  const oldCanonical = seed();
  const staleProvider = provider({
    name: "Kedai Baru",
    lat: 3.20011,
    lng: 101.50011,
  });
  const out = upsertMasterCandidateSeed([oldCanonical, staleProvider], seed());
  assert.equal(out.length, 1);
  assert.equal(out[0].placeId, "ChIJ-provider");
  assert.equal(out[0].rating, 4.7);
  assert.equal(out[0].dataSource, "canonical");
});

test("different nearby name is not silently merged", () => {
  const other = provider({ name: "Kedai Lain", lat: 3.2001, lng: 101.5001 });
  const out = upsertMasterCandidateSeed([other], seed());
  assert.equal(out.length, 2);
});

test("explicit master closure forces candidate closed", () => {
  const closedSeed = buildMasterCandidateSeed({
    canonicalPlaceId: "PLC-closed",
    name: "Kedai Tutup",
    address: null,
    lat: 3.2,
    lng: 101.5,
    businessStatus: "permanently_closed",
  });
  const out = upsertMasterCandidateSeed([
    provider({ placeId: "PLC-closed", name: "Kedai Tutup", isOpen: true }),
  ], closedSeed);
  assert.equal(out[0].isOpen, false);
});
