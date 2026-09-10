import assert from "node:assert/strict";
import {test} from "node:test";

import {rankUnified} from "../unifiedRanking";
import {scoreAndRank} from "../../../services/scoringService";
import {openPlace, ctx} from "./scoringFixtures";

const providerHigh = openPlace({
  placeId: "provider-high",
  name: "Provider Popular",
  cuisine: "western",
  rating: 4.9,
  userRatingCount: 5000,
  distanceKm: 0.3,
  priceLevel: 1,
});

const curatedUnknown = openPlace({
  placeId: "CCM-curated",
  canonicalPlaceId: "CCM-curated",
  dataSource: "canonical",
  name: "MakanMana Test Kitchen Puncak Alam",
  cuisine: "Malaysian Food",
  rating: 0,
  userRatingCount: 0,
  distanceKm: 1.0,
  priceLevel: 1,
});

test("Algorithm 2: curated registry is source-priority while retaining a real score", () => {
  const result = rankUnified([providerHigh, curatedUnknown], ctx(), {excludeClosed: false});
  assert.equal(result.ranked[0].placeId, "CCM-curated");
  assert.equal(result.ranked[0].dataSource, "canonical");
  assert.ok(result.ranked[0].matchScore >= 0);
  assert.equal(result.diagnostics.curatedEligibleCount, 1);
  assert.equal(result.diagnostics.curatedPriorityApplied, true);
});

test("Algorithm 2: hard safety/availability still wins over curated priority", () => {
  const closedCurated = {...curatedUnknown, isOpen: false};
  const result = rankUnified([providerHigh, closedCurated], ctx(), {excludeClosed: true});
  assert.equal(result.ranked.length, 1);
  assert.equal(result.ranked[0].placeId, "provider-high");
  assert.equal(result.diagnostics.curatedEligibleCount, 0);
  assert.equal(result.diagnostics.curatedPriorityApplied, false);
});

test("legacy scorer fallback also keeps curated registry above provider-only rows", () => {
  const result = scoreAndRank([providerHigh, curatedUnknown], {radiusKm: 5});
  assert.equal(result[0].placeId, "CCM-curated");
  assert.equal(result[1].placeId, "provider-high");
});
