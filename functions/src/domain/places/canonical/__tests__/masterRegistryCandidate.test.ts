import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMasterRegistryCandidate,
  openingPeriodsFromRegistryHours,
  upsertMasterRegistryCandidate,
} from "../masterRegistryCandidate";

const canonicalId = "CCM-test-kitchen";

test("builds a first-class canonical candidate without inventing rating or price", () => {
  const candidate = buildMasterRegistryCandidate({
    canonicalPlaceId: canonicalId,
    name: "MakanMana Test Kitchen Puncak Alam",
    address: "Bandar Puncak Alam, Selangor",
    latitude: 3.2389,
    longitude: 101.42793,
    primaryCategory: "Malaysian Food",
    cuisineTags: [],
    priceRange: "unknown",
    businessStatus: "active",
    openingHours: {},
    nowMs: Date.UTC(2026, 8, 12, 0, 0, 0),
  });

  assert.equal(candidate.placeId, canonicalId);
  assert.equal(candidate.canonicalPlaceId, canonicalId);
  assert.equal(candidate.dataSource, "canonical");
  assert.equal(candidate.cuisine, "Malaysian Food");
  assert.equal(candidate.rating, 0);
  assert.equal(candidate.userRatingCount, 0);
  assert.equal(candidate.priceLevel, 0);
  assert.equal(candidate.openingPeriods, null);
  assert.equal(candidate.lat, 3.2389);
  assert.equal(candidate.lng, 101.42793);
});

test("converts two-session weekly hours and overnight sessions safely", () => {
  const periods = openingPeriodsFromRegistryHours({
    monday: {
      closed: false,
      all_day: false,
      sessions: [
        {open: "09:00", close: "14:00"},
        {open: "17:00", close: "22:00"},
      ],
    },
    saturday: {
      closed: false,
      all_day: false,
      sessions: [{open: "22:00", close: "02:00"}],
    },
    sunday: {closed: true, all_day: false, sessions: []},
  });

  assert.ok(periods);
  assert.equal(periods.length, 3);
  assert.deepEqual(periods[0], {openMinuteOfWeek: 1980, closeMinuteOfWeek: 2280});
  assert.deepEqual(periods[1], {openMinuteOfWeek: 2460, closeMinuteOfWeek: 2760});
  assert.deepEqual(periods[2], {openMinuteOfWeek: 9960, closeMinuteOfWeek: 10200});
});

test("area cache upsert preserves unrelated candidates and removes known aliases", () => {
  const canonical = buildMasterRegistryCandidate({
    canonicalPlaceId: canonicalId,
    name: "MakanMana Test Kitchen Puncak Alam",
    latitude: 3.2389,
    longitude: 101.42793,
  });
  const result = upsertMasterRegistryCandidate([
    {...canonical, placeId: "provider-123", canonicalPlaceId: canonicalId, name: "Provider copy"},
    {...canonical, placeId: "other-place", canonicalPlaceId: undefined, name: "Other"},
  ], canonical, ["provider-123"]);

  assert.equal(result.length, 2);
  assert.equal(result[0].placeId, canonicalId);
  assert.equal(result[1].placeId, "other-place");
});
