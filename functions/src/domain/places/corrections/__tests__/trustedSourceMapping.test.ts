/**
 * Phase 1.14B.4 — ujian pemetaan sumber dipercayai terhadap SKEMA PRODUKSI SEBENAR.
 * Fixtures mencerminkan medan sebenar yang disampel (baca-sahaja) daripada
 * place_details / places_cache produksi.
 */
import assert from "node:assert/strict";
import {test} from "node:test";

import {placeDetailsDocToView, placesCacheDocToView} from "../trustedSourceMapping";

// Bentuk sebenar place_details produksi.
const prodPlaceDetails = {
  displayName: "Restoran Pelita",
  keywords: ["mamak", "nasi kandar"],
  lastFetchedAt: {toDate: () => new Date()},
  photoUrl: "https://example.com/p.jpg",
  priceLevel: 2,
  rating: 4.3,
  userRatingCount: 88,
};

test("place_details maps displayName → title (production field name)", () => {
  const v = placeDetailsDocToView("p1", prodPlaceDetails);
  assert.equal(v.title, "Restoran Pelita");
  assert.equal(v.placeId, "p1");
});

test("rating shown only when rating>0 AND userRatingCount>0", () => {
  assert.equal(placeDetailsDocToView("p1", prodPlaceDetails).ratingState, "rating_shown");
  assert.equal(placeDetailsDocToView("p1", {...prodPlaceDetails, userRatingCount: 0}).ratingState, "rating_hidden");
  assert.equal(placeDetailsDocToView("p1", {rating: 4.1}).ratingState, "rating_hidden");
});

test("priceLevel present → provider band; absent → unknown", () => {
  assert.equal(placeDetailsDocToView("p1", prodPlaceDetails).priceState, "price_provider_band");
  assert.equal(placeDetailsDocToView("p1", {displayName: "X"}).priceState, "price_unknown");
});

test("fields absent in production stay *_unknown (never fabricated)", () => {
  const v = placeDetailsDocToView("p1", prodPlaceDetails);
  assert.equal(v.hoursState, "hours_unknown");
  assert.equal(v.businessState, "status_unknown");
  assert.equal(v.halalState, "halal_unknown");
  assert.equal(v.allergenState, "allergen_unknown");
  assert.equal(v.dietaryState, "dietary_unknown");
  assert.equal(v.address, undefined); // no address field in production place_details
});

test("photoUrl → imageReferences; missing → empty", () => {
  assert.deepEqual(placeDetailsDocToView("p1", prodPlaceDetails).imageReferences, ["https://example.com/p.jpg"]);
  assert.deepEqual(placeDetailsDocToView("p1", {displayName: "X"}).imageReferences, []);
});

test("title falls back to placeId when no name field", () => {
  assert.equal(placeDetailsDocToView("p1", {}).title, "p1");
});

test("places_cache is NEVER a per-place trusted source (area query cache)", () => {
  assert.equal(placesCacheDocToView(), null);
});
