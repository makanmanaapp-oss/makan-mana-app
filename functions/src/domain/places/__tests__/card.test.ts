import test from "node:test";
import assert from "node:assert/strict";

import {
  PlaceCardData,
  toCardHoursState,
  toCardPriceState,
  toCardQuality,
  validatePlaceCardData,
} from "../index";

function baseCard(): PlaceCardData {
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
test("missing rating remains missing", () => {
  const q = toCardQuality({ rating: undefined, reviewCount: undefined });
  assert.equal("rating" in q, false);
  assert.equal(q.rating, undefined);
  assert.equal(q.reviewCount, undefined);
});

// 16. Harga tidak diketahui kekal eksplisit unknown.
test("unknown price remains explicit unknown", () => {
  assert.equal(toCardPriceState({ priceState: "unknown" }), "unknown");
});

// 17. Waktu tidak diketahui kekal eksplisit unknown.
test("unknown hours remains explicit unknown", () => {
  assert.equal(toCardHoursState({ hoursState: "unknown" }), "unknown");
});

// 23. Match score kad adalah pilihan.
test("card match score is optional", () => {
  const withoutMatch = baseCard();
  assert.equal(validatePlaceCardData(withoutMatch).ok, true);

  const withMatch = { ...baseCard(), matchScore: 87, matchBand: "high" };
  assert.equal(validatePlaceCardData(withMatch).ok, true);
});

// 24. Tiada helper mereka rating, harga atau status buka.
test("no helper fabricates rating, price or opening status", () => {
  // Rating: input kosong -> output tanpa rating.
  assert.deepEqual(toCardQuality({}), {});
  // Harga: unknown kekal unknown (tiada "estimated" direka).
  assert.equal(toCardPriceState({ priceState: "unknown" }), "unknown");
  // Waktu: unknown kekal unknown (tiada "known" diandaikan).
  assert.equal(toCardHoursState({ hoursState: "unknown" }), "unknown");
  // Rating 4.2 sebenar diteruskan apa adanya.
  assert.equal(toCardQuality({ rating: 4.2 }).rating, 4.2);
});
