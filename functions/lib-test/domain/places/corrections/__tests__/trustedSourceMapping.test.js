"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.14B.4 — ujian pemetaan sumber dipercayai terhadap SKEMA PRODUKSI SEBENAR.
 * Fixtures mencerminkan medan sebenar yang disampel (baca-sahaja) daripada
 * place_details / places_cache produksi.
 */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const trustedSourceMapping_1 = require("../trustedSourceMapping");
// Bentuk sebenar place_details produksi.
const prodPlaceDetails = {
    displayName: "Restoran Pelita",
    keywords: ["mamak", "nasi kandar"],
    lastFetchedAt: { toDate: () => new Date() },
    photoUrl: "https://example.com/p.jpg",
    priceLevel: 2,
    rating: 4.3,
    userRatingCount: 88,
};
(0, node_test_1.test)("place_details maps displayName → title (production field name)", () => {
    const v = (0, trustedSourceMapping_1.placeDetailsDocToView)("p1", prodPlaceDetails);
    strict_1.default.equal(v.title, "Restoran Pelita");
    strict_1.default.equal(v.placeId, "p1");
});
(0, node_test_1.test)("rating shown only when rating>0 AND userRatingCount>0", () => {
    strict_1.default.equal((0, trustedSourceMapping_1.placeDetailsDocToView)("p1", prodPlaceDetails).ratingState, "rating_shown");
    strict_1.default.equal((0, trustedSourceMapping_1.placeDetailsDocToView)("p1", { ...prodPlaceDetails, userRatingCount: 0 }).ratingState, "rating_hidden");
    strict_1.default.equal((0, trustedSourceMapping_1.placeDetailsDocToView)("p1", { rating: 4.1 }).ratingState, "rating_hidden");
});
(0, node_test_1.test)("priceLevel present → provider band; absent → unknown", () => {
    strict_1.default.equal((0, trustedSourceMapping_1.placeDetailsDocToView)("p1", prodPlaceDetails).priceState, "price_provider_band");
    strict_1.default.equal((0, trustedSourceMapping_1.placeDetailsDocToView)("p1", { displayName: "X" }).priceState, "price_unknown");
});
(0, node_test_1.test)("fields absent in production stay *_unknown (never fabricated)", () => {
    const v = (0, trustedSourceMapping_1.placeDetailsDocToView)("p1", prodPlaceDetails);
    strict_1.default.equal(v.hoursState, "hours_unknown");
    strict_1.default.equal(v.businessState, "status_unknown");
    strict_1.default.equal(v.halalState, "halal_unknown");
    strict_1.default.equal(v.allergenState, "allergen_unknown");
    strict_1.default.equal(v.dietaryState, "dietary_unknown");
    strict_1.default.equal(v.address, undefined); // no address field in production place_details
});
(0, node_test_1.test)("photoUrl → imageReferences; missing → empty", () => {
    strict_1.default.deepEqual((0, trustedSourceMapping_1.placeDetailsDocToView)("p1", prodPlaceDetails).imageReferences, ["https://example.com/p.jpg"]);
    strict_1.default.deepEqual((0, trustedSourceMapping_1.placeDetailsDocToView)("p1", { displayName: "X" }).imageReferences, []);
});
(0, node_test_1.test)("title falls back to placeId when no name field", () => {
    strict_1.default.equal((0, trustedSourceMapping_1.placeDetailsDocToView)("p1", {}).title, "p1");
});
(0, node_test_1.test)("places_cache is NEVER a per-place trusted source (area query cache)", () => {
    strict_1.default.equal((0, trustedSourceMapping_1.placesCacheDocToView)(), null);
});
