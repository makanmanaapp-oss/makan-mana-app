"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.6 Part O — ujian keadaan paparan JUJUR (5-12).
 * Prinsip: tiada helper boleh mereka buka/harga/rating/keselamatan.
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
const REG = index_1.DEFAULT_FRESHNESS_POLICY_REGISTRY;
const d = (n) => n * fixtures_1.DAY;
const expiredHours = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.openingHours, fixtures_1.T + d(61));
const freshHours = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.openingHours, fixtures_1.T + d(1));
const expiredRating = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.rating, fixtures_1.T + d(121));
const staleRating = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.rating, fixtures_1.T + d(100));
const expiredPrice = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.price, fixtures_1.T + d(181));
const expiredHalal = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.halalEvidence, fixtures_1.T + d(366));
const expiredAllergen = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.allergenEvidence, fixtures_1.T + d(366));
const expiredBusiness = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.businessStatus, fixtures_1.T + d(31));
const KNOWN_HOURS = {
    hoursState: "known",
    periods: [{ openMinuteOfWeek: 600, closeMinuteOfWeek: 1320 }],
};
// 5. Waktu operasi LUPUT tidak boleh menghasilkan open_now.
(0, node_test_1.default)("5. waktu luput → hours_expired dan open_now TIDAK boleh dikira", () => {
    const r = (0, index_1.deriveHoursDisplayState)(KNOWN_HOURS, "active", expiredHours);
    strict_1.default.equal(r.state, "hours_expired");
    strict_1.default.equal(r.canComputeOpenNow, false);
    strict_1.default.equal(r.warningCode, "hours_expired");
});
(0, node_test_1.default)("5b. hoursState='expired' juga menghalang open_now", () => {
    const r = (0, index_1.deriveHoursDisplayState)({ hoursState: "expired" }, "active");
    strict_1.default.equal(r.state, "hours_expired");
    strict_1.default.equal(r.canComputeOpenNow, false);
});
// 6. Waktu hilang → hours_unknown.
(0, node_test_1.default)("6. waktu tiada → hours_unknown (bukan diandaikan buka)", () => {
    const r = (0, index_1.deriveHoursDisplayState)({ hoursState: "unknown" }, "active", freshHours);
    strict_1.default.equal(r.state, "hours_unknown");
    strict_1.default.equal(r.canComputeOpenNow, false);
    strict_1.default.equal(r.warningCode, "hours_unknown");
});
(0, node_test_1.default)("6b. 'known' tanpa periods kekal unknown (tiada rekaan)", () => {
    const r = (0, index_1.deriveHoursDisplayState)({ hoursState: "known", periods: [] }, "active", freshHours);
    strict_1.default.equal(r.state, "hours_unknown");
    strict_1.default.equal(r.canComputeOpenNow, false);
});
(0, node_test_1.default)("6c. waktu diketahui + segar → open_now boleh dikira", () => {
    const r = (0, index_1.deriveHoursDisplayState)(KNOWN_HOURS, "active", freshHours);
    strict_1.default.equal(r.state, "hours_known");
    strict_1.default.equal(r.canComputeOpenNow, true);
});
(0, node_test_1.default)("6d. kedai tutup kekal/sementara mengatasi waktu", () => {
    strict_1.default.equal((0, index_1.deriveHoursDisplayState)(KNOWN_HOURS, "permanently_closed", freshHours).state, "permanently_closed");
    const tc = (0, index_1.deriveHoursDisplayState)(KNOWN_HOURS, "temporarily_closed", freshHours);
    strict_1.default.equal(tc.state, "temporarily_closed");
    strict_1.default.equal(tc.canComputeOpenNow, false);
});
// 7. Rating hilang kekal tersembunyi.
(0, node_test_1.default)("7. rating tiada → tersembunyi (tidak pernah 0.0)", () => {
    const r = (0, index_1.deriveRatingDisplayState)({ rating: undefined, reviewCount: 100 });
    strict_1.default.equal(r.state, "rating_hidden");
    strict_1.default.equal(r.rating, undefined);
    strict_1.default.equal(r.warningCode, "rating_missing");
});
// 8. reviewCount hilang kekal tersembunyi.
(0, node_test_1.default)("8. reviewCount tiada → tersembunyi", () => {
    const r = (0, index_1.deriveRatingDisplayState)({ rating: 4.5, reviewCount: undefined });
    strict_1.default.equal(r.state, "rating_hidden");
    strict_1.default.equal(r.rating, undefined);
    strict_1.default.equal(r.warningCode, "review_count_missing");
});
(0, node_test_1.default)("8b. rating luput → tersembunyi (fakta mati bukan fakta semasa)", () => {
    const r = (0, index_1.deriveRatingDisplayState)({ rating: 4.5, reviewCount: 100 }, expiredRating);
    strict_1.default.equal(r.state, "rating_hidden");
    strict_1.default.equal(r.warningCode, "rating_expired");
});
(0, node_test_1.default)("8c. rating stale dipapar DENGAN label stale", () => {
    const r = (0, index_1.deriveRatingDisplayState)({ rating: 4.5, reviewCount: 100 }, staleRating);
    strict_1.default.equal(r.state, "rating_stale");
    strict_1.default.equal(r.rating, 4.5);
    strict_1.default.equal(r.warningCode, "rating_stale");
});
// 9. Harga tidak diketahui kekal tidak diketahui.
(0, node_test_1.default)("9. harga unknown kekal price_unknown (tiada julat RM direka)", () => {
    const r = (0, index_1.derivePriceDisplayState)({ priceState: "unknown" });
    strict_1.default.equal(r.state, "price_unknown");
    strict_1.default.equal(r.priceBandId, undefined);
    strict_1.default.equal(r.averageSpend, undefined);
});
// 10. Harga inferred dilabel estimated.
(0, node_test_1.default)("10. harga estimated dilabel estimated_price (bukan verified)", () => {
    const r = (0, index_1.derivePriceDisplayState)({
        priceState: "estimated",
        priceBandId: "budget",
        averageSpend: 12,
    });
    strict_1.default.equal(r.state, "estimated_price");
    strict_1.default.equal(r.warningCode, "estimated_price");
    strict_1.default.equal(r.priceBandId, "budget");
});
(0, node_test_1.default)("10b. harga luput diturunkan taraf kepada price_expired", () => {
    const r = (0, index_1.derivePriceDisplayState)({ priceState: "verified", priceBandId: "moderate" }, expiredPrice);
    strict_1.default.equal(r.state, "price_expired");
    strict_1.default.equal(r.priceBandId, undefined, "nilai lama tidak disalurkan sebagai semasa");
});
// 11. Bukti halal luput TIDAK kekal verified.
(0, node_test_1.default)("11. bukti halal luput → recheck diperlukan (bukan certified)", () => {
    const r = (0, index_1.deriveSafetyWarningState)({
        halal: { state: "certified", evidenceLevel: "verified" },
        dietaryReported: ["vegetarian_options"],
        allergenReported: ["peanuts"],
        allergenEvidenceLevel: "reported",
    }, expiredHalal);
    strict_1.default.equal(r.halal, "halal_recheck_required");
    strict_1.default.notEqual(r.halal, "halal_certified");
    strict_1.default.ok(r.warningCodes.includes("halal_evidence_expired"));
});
(0, node_test_1.default)("11b. amaran negatif possible_non_halal KEKAL walaupun luput (gagal-tertutup)", () => {
    const r = (0, index_1.deriveSafetyWarningState)({
        halal: { state: "possible_non_halal", evidenceLevel: "reported" },
        dietaryReported: [],
        allergenReported: [],
        allergenEvidenceLevel: "unknown",
    }, expiredHalal);
    strict_1.default.equal(r.halal, "halal_possible_non_halal");
});
(0, node_test_1.default)("11c. halal unknown tidak pernah dinaik taraf", () => {
    const r = (0, index_1.deriveSafetyWarningState)({
        halal: { state: "unknown", evidenceLevel: "unknown" },
        dietaryReported: [],
        allergenReported: [],
        allergenEvidenceLevel: "unknown",
    });
    strict_1.default.equal(r.halal, "halal_unknown");
    strict_1.default.ok(r.warningCodes.includes("halal_unknown"));
});
// 12. Bukti alergen hilang menghasilkan amaran.
(0, node_test_1.default)("12. bukti alergen tiada → allergenUnknown + amaran", () => {
    const r = (0, index_1.deriveSafetyWarningState)({
        halal: { state: "certified", evidenceLevel: "verified" },
        dietaryReported: [],
        allergenReported: [],
        allergenEvidenceLevel: "unknown",
    });
    strict_1.default.equal(r.allergenUnknown, true);
    strict_1.default.ok(r.warningCodes.includes("allergen_evidence_unknown"));
});
(0, node_test_1.default)("12b. bukti alergen luput → allergenUnknown (tidak pernah 'selamat')", () => {
    const r = (0, index_1.deriveSafetyWarningState)({
        halal: { state: "certified", evidenceLevel: "verified" },
        dietaryReported: ["vegan_options"],
        allergenReported: ["peanuts"],
        allergenEvidenceLevel: "reported",
    }, undefined, expiredAllergen);
    strict_1.default.equal(r.allergenUnknown, true);
});
// ---- Business display ----
(0, node_test_1.default)("business: permanently_closed → blocked daripada paparan awam", () => {
    const r = (0, index_1.deriveBusinessDisplayState)("permanently_closed");
    strict_1.default.equal(r.state, "blocked");
    strict_1.default.equal(r.blockedFromPublic, true);
    strict_1.default.equal(r.eligibleAsPrimarySuggestion, false);
});
(0, node_test_1.default)("business: temporarily_closed BUKAN cadangan utama tetapi tidak disekat", () => {
    const r = (0, index_1.deriveBusinessDisplayState)("temporarily_closed");
    strict_1.default.equal(r.state, "temporarily_closed");
    strict_1.default.equal(r.blockedFromPublic, false);
    strict_1.default.equal(r.eligibleAsPrimarySuggestion, false);
});
(0, node_test_1.default)("business: hidden_by_admin disekat", () => {
    strict_1.default.equal((0, index_1.deriveBusinessDisplayState)("hidden_by_admin").blockedFromPublic, true);
});
(0, node_test_1.default)("business: status luput → status_unknown walaupun tersimpan 'active'", () => {
    const r = (0, index_1.deriveBusinessDisplayState)("active", expiredBusiness);
    strict_1.default.equal(r.state, "status_unknown");
    strict_1.default.equal(r.eligibleAsPrimarySuggestion, false);
    strict_1.default.equal(r.warningCode, "business_status_expired");
});
(0, node_test_1.default)("business: active + segar → operating", () => {
    const fresh = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.businessStatus, fixtures_1.T + 1000);
    const r = (0, index_1.deriveBusinessDisplayState)("active", fresh);
    strict_1.default.equal(r.state, "operating");
    strict_1.default.equal(r.eligibleAsPrimarySuggestion, true);
});
