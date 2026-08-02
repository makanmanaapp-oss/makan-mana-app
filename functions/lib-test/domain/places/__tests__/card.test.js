"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
function baseCard() {
    return {
        placeId: "mm_place_0001",
        title: "Warung Fixture Satu",
        image: { isFallback: false, url: "https://example.test/img.jpg" },
        priceState: "verified",
        priceLabelKey: "price_moderate",
        hoursState: "known",
        cuisineTagIds: ["malay"],
        placeTypeTagIds: ["restaurant"],
        matchReasons: [],
        warnings: [],
        verificationBadges: [],
        sourceMode: "approved_cache",
    };
}
// 15. Rating hilang kekal hilang (undefined) — bukan 0.0.
(0, node_test_1.default)("missing rating remains missing", () => {
    const q = (0, index_1.toCardQuality)({ rating: undefined, reviewCount: undefined });
    strict_1.default.equal("rating" in q, false);
    strict_1.default.equal(q.rating, undefined);
    strict_1.default.equal(q.reviewCount, undefined);
});
// 16. Harga tidak diketahui kekal eksplisit unknown.
(0, node_test_1.default)("unknown price remains explicit unknown", () => {
    strict_1.default.equal((0, index_1.toCardPriceState)({ priceState: "unknown" }), "unknown");
});
// 17. Waktu tidak diketahui kekal eksplisit unknown.
(0, node_test_1.default)("unknown hours remains explicit unknown", () => {
    strict_1.default.equal((0, index_1.toCardHoursState)({ hoursState: "unknown" }), "unknown");
});
// 23. Match score kad adalah pilihan.
(0, node_test_1.default)("card match score is optional", () => {
    const withoutMatch = baseCard();
    strict_1.default.equal((0, index_1.validatePlaceCardData)(withoutMatch).ok, true);
    const withMatch = { ...baseCard(), matchScore: 87, matchBand: "high" };
    strict_1.default.equal((0, index_1.validatePlaceCardData)(withMatch).ok, true);
});
// 24. Tiada helper mereka rating, harga atau status buka.
(0, node_test_1.default)("no helper fabricates rating, price or opening status", () => {
    // Rating: input kosong -> output tanpa rating.
    strict_1.default.deepEqual((0, index_1.toCardQuality)({}), {});
    // Harga: unknown kekal unknown (tiada "estimated" direka).
    strict_1.default.equal((0, index_1.toCardPriceState)({ priceState: "unknown" }), "unknown");
    // Waktu: unknown kekal unknown (tiada "known" diandaikan).
    strict_1.default.equal((0, index_1.toCardHoursState)({ hoursState: "unknown" }), "unknown");
    // Rating 4.2 sebenar diteruskan apa adanya.
    strict_1.default.equal((0, index_1.toCardQuality)({ rating: 4.2 }).rating, 4.2);
});
