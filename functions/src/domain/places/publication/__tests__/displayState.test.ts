/**
 * Phase 1.6 Part O — ujian keadaan paparan JUJUR (5-12).
 * Prinsip: tiada helper boleh mereka buka/harga/rating/keselamatan.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_FRESHNESS_POLICY_REGISTRY,
  deriveBusinessDisplayState,
  deriveHoursDisplayState,
  derivePriceDisplayState,
  deriveRatingDisplayState,
  deriveSafetyWarningState,
  evaluateFieldFreshness,
} from "../index";
import { T, DAY } from "./fixtures";

const REG = DEFAULT_FRESHNESS_POLICY_REGISTRY;
const d = (n: number) => n * DAY;

const expiredHours = evaluateFieldFreshness({ fetchedAt: T }, REG.openingHours, T + d(61));
const freshHours = evaluateFieldFreshness({ fetchedAt: T }, REG.openingHours, T + d(1));
const expiredRating = evaluateFieldFreshness({ fetchedAt: T }, REG.rating, T + d(121));
const staleRating = evaluateFieldFreshness({ fetchedAt: T }, REG.rating, T + d(100));
const expiredPrice = evaluateFieldFreshness({ fetchedAt: T }, REG.price, T + d(181));
const expiredHalal = evaluateFieldFreshness({ fetchedAt: T }, REG.halalEvidence, T + d(366));
const expiredAllergen = evaluateFieldFreshness(
  { fetchedAt: T },
  REG.allergenEvidence,
  T + d(366),
);
const expiredBusiness = evaluateFieldFreshness(
  { fetchedAt: T },
  REG.businessStatus,
  T + d(31),
);

const KNOWN_HOURS = {
  hoursState: "known" as const,
  periods: [{ openMinuteOfWeek: 600, closeMinuteOfWeek: 1320 }],
};

// 5. Waktu operasi LUPUT tidak boleh menghasilkan open_now.
test("5. waktu luput → hours_expired dan open_now TIDAK boleh dikira", () => {
  const r = deriveHoursDisplayState(KNOWN_HOURS, "active", expiredHours);
  assert.equal(r.state, "hours_expired");
  assert.equal(r.canComputeOpenNow, false);
  assert.equal(r.warningCode, "hours_expired");
});

test("5b. hoursState='expired' juga menghalang open_now", () => {
  const r = deriveHoursDisplayState({ hoursState: "expired" }, "active");
  assert.equal(r.state, "hours_expired");
  assert.equal(r.canComputeOpenNow, false);
});

// 6. Waktu hilang → hours_unknown.
test("6. waktu tiada → hours_unknown (bukan diandaikan buka)", () => {
  const r = deriveHoursDisplayState({ hoursState: "unknown" }, "active", freshHours);
  assert.equal(r.state, "hours_unknown");
  assert.equal(r.canComputeOpenNow, false);
  assert.equal(r.warningCode, "hours_unknown");
});

test("6b. 'known' tanpa periods kekal unknown (tiada rekaan)", () => {
  const r = deriveHoursDisplayState({ hoursState: "known", periods: [] }, "active", freshHours);
  assert.equal(r.state, "hours_unknown");
  assert.equal(r.canComputeOpenNow, false);
});

test("6c. waktu diketahui + segar → open_now boleh dikira", () => {
  const r = deriveHoursDisplayState(KNOWN_HOURS, "active", freshHours);
  assert.equal(r.state, "hours_known");
  assert.equal(r.canComputeOpenNow, true);
});

test("6d. kedai tutup kekal/sementara mengatasi waktu", () => {
  assert.equal(
    deriveHoursDisplayState(KNOWN_HOURS, "permanently_closed", freshHours).state,
    "permanently_closed",
  );
  const tc = deriveHoursDisplayState(KNOWN_HOURS, "temporarily_closed", freshHours);
  assert.equal(tc.state, "temporarily_closed");
  assert.equal(tc.canComputeOpenNow, false);
});

// 7. Rating hilang kekal tersembunyi.
test("7. rating tiada → tersembunyi (tidak pernah 0.0)", () => {
  const r = deriveRatingDisplayState({ rating: undefined, reviewCount: 100 });
  assert.equal(r.state, "rating_hidden");
  assert.equal(r.rating, undefined);
  assert.equal(r.warningCode, "rating_missing");
});

// 8. reviewCount hilang kekal tersembunyi.
test("8. reviewCount tiada → tersembunyi", () => {
  const r = deriveRatingDisplayState({ rating: 4.5, reviewCount: undefined });
  assert.equal(r.state, "rating_hidden");
  assert.equal(r.rating, undefined);
  assert.equal(r.warningCode, "review_count_missing");
});

test("8b. rating luput → tersembunyi (fakta mati bukan fakta semasa)", () => {
  const r = deriveRatingDisplayState({ rating: 4.5, reviewCount: 100 }, expiredRating);
  assert.equal(r.state, "rating_hidden");
  assert.equal(r.warningCode, "rating_expired");
});

test("8c. rating stale dipapar DENGAN label stale", () => {
  const r = deriveRatingDisplayState({ rating: 4.5, reviewCount: 100 }, staleRating);
  assert.equal(r.state, "rating_stale");
  assert.equal(r.rating, 4.5);
  assert.equal(r.warningCode, "rating_stale");
});

// 9. Harga tidak diketahui kekal tidak diketahui.
test("9. harga unknown kekal price_unknown (tiada julat RM direka)", () => {
  const r = derivePriceDisplayState({ priceState: "unknown" });
  assert.equal(r.state, "price_unknown");
  assert.equal(r.priceBandId, undefined);
  assert.equal(r.averageSpend, undefined);
});

// 10. Harga inferred dilabel estimated.
test("10. harga estimated dilabel estimated_price (bukan verified)", () => {
  const r = derivePriceDisplayState({
    priceState: "estimated",
    priceBandId: "budget",
    averageSpend: 12,
  });
  assert.equal(r.state, "estimated_price");
  assert.equal(r.warningCode, "estimated_price");
  assert.equal(r.priceBandId, "budget");
});

test("10b. harga luput diturunkan taraf kepada price_expired", () => {
  const r = derivePriceDisplayState(
    { priceState: "verified", priceBandId: "moderate" },
    expiredPrice,
  );
  assert.equal(r.state, "price_expired");
  assert.equal(r.priceBandId, undefined, "nilai lama tidak disalurkan sebagai semasa");
});

// 11. Bukti halal luput TIDAK kekal verified.
test("11. bukti halal luput → recheck diperlukan (bukan certified)", () => {
  const r = deriveSafetyWarningState(
    {
      halal: { state: "certified", evidenceLevel: "verified" },
      dietaryReported: ["vegetarian_options"],
      allergenReported: ["peanuts"],
      allergenEvidenceLevel: "reported",
    },
    expiredHalal,
  );
  assert.equal(r.halal, "halal_recheck_required");
  assert.notEqual(r.halal, "halal_certified");
  assert.ok(r.warningCodes.includes("halal_evidence_expired"));
});

test("11b. amaran negatif possible_non_halal KEKAL walaupun luput (gagal-tertutup)", () => {
  const r = deriveSafetyWarningState(
    {
      halal: { state: "possible_non_halal", evidenceLevel: "reported" },
      dietaryReported: [],
      allergenReported: [],
      allergenEvidenceLevel: "unknown",
    },
    expiredHalal,
  );
  assert.equal(r.halal, "halal_possible_non_halal");
});

test("11c. halal unknown tidak pernah dinaik taraf", () => {
  const r = deriveSafetyWarningState({
    halal: { state: "unknown", evidenceLevel: "unknown" },
    dietaryReported: [],
    allergenReported: [],
    allergenEvidenceLevel: "unknown",
  });
  assert.equal(r.halal, "halal_unknown");
  assert.ok(r.warningCodes.includes("halal_unknown"));
});

// 12. Bukti alergen hilang menghasilkan amaran.
test("12. bukti alergen tiada → allergenUnknown + amaran", () => {
  const r = deriveSafetyWarningState({
    halal: { state: "certified", evidenceLevel: "verified" },
    dietaryReported: [],
    allergenReported: [],
    allergenEvidenceLevel: "unknown",
  });
  assert.equal(r.allergenUnknown, true);
  assert.ok(r.warningCodes.includes("allergen_evidence_unknown"));
});

test("12b. bukti alergen luput → allergenUnknown (tidak pernah 'selamat')", () => {
  const r = deriveSafetyWarningState(
    {
      halal: { state: "certified", evidenceLevel: "verified" },
      dietaryReported: ["vegan_options"],
      allergenReported: ["peanuts"],
      allergenEvidenceLevel: "reported",
    },
    undefined,
    expiredAllergen,
  );
  assert.equal(r.allergenUnknown, true);
});

// ---- Business display ----

test("business: permanently_closed → blocked daripada paparan awam", () => {
  const r = deriveBusinessDisplayState("permanently_closed");
  assert.equal(r.state, "blocked");
  assert.equal(r.blockedFromPublic, true);
  assert.equal(r.eligibleAsPrimarySuggestion, false);
});

test("business: temporarily_closed BUKAN cadangan utama tetapi tidak disekat", () => {
  const r = deriveBusinessDisplayState("temporarily_closed");
  assert.equal(r.state, "temporarily_closed");
  assert.equal(r.blockedFromPublic, false);
  assert.equal(r.eligibleAsPrimarySuggestion, false);
});

test("business: hidden_by_admin disekat", () => {
  assert.equal(deriveBusinessDisplayState("hidden_by_admin").blockedFromPublic, true);
});

test("business: status luput → status_unknown walaupun tersimpan 'active'", () => {
  const r = deriveBusinessDisplayState("active", expiredBusiness);
  assert.equal(r.state, "status_unknown");
  assert.equal(r.eligibleAsPrimarySuggestion, false);
  assert.equal(r.warningCode, "business_status_expired");
});

test("business: active + segar → operating", () => {
  const fresh = evaluateFieldFreshness({ fetchedAt: T }, REG.businessStatus, T + 1000);
  const r = deriveBusinessDisplayState("active", fresh);
  assert.equal(r.state, "operating");
  assert.equal(r.eligibleAsPrimarySuggestion, true);
});
