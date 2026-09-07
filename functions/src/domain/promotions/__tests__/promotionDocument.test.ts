/**
 * WAVE 4 — promotion projection contract.
 *
 * The claim under test is the one that matters for privacy: the public shape
 * is an ALLOWLIST, so a field added to storage later cannot leak by being
 * forgotten. Wave 3's Merchant Center leaked an internal UUID exactly because
 * nobody re-checked a screen after adding a field.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  MERCHANT_EDITABLE_FIELDS,
  buildPromotionDocument,
  toMerchantPromotion,
  toPublicPromotion,
} from "../promotionDocument";
import {
  DEFAULT_ELIGIBILITY,
  PROMOTION_STATUS_ACTIVE,
  PROMOTION_STATUS_DRAFT,
} from "../promotionTypes";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);

function doc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...buildPromotionDocument({
      canonicalPlaceId: "canon-1",
      restaurantDisplayName: "Warung Pak Din",
      title: "Set lunch RM12",
      description: "Nasi + air",
      terms: "Sehingga stok habis",
      offerType: "amount_off",
      offerLabel: "RM5 off",
      minSpendSen: 1200,
      eligibility: DEFAULT_ELIGIBILITY,
      startsAtMs: NOW - HOUR,
      endsAtMs: NOW + HOUR,
      status: PROMOTION_STATUS_ACTIVE,
      actorUid: "merchant-uid-abc",
      requestId: "req-123",
    }),
    createdAtMs: NOW - HOUR,
    updatedAtMs: NOW,
    ...overrides,
  };
}

test("stored document keeps the audit block", () => {
  const d = doc();
  assert.equal(d.createdByUid, "merchant-uid-abc");
  assert.equal(d.updatedByUid, "merchant-uid-abc");
  assert.equal(d.createdByRequestId, "req-123");
  assert.equal(d.schemaVersion, 1);
});

test("a draft has no publishedAt; a scheduled/active one does", () => {
  const draft: Record<string, unknown> = buildPromotionDocument({
    canonicalPlaceId: "c", restaurantDisplayName: "r", title: "t", description: "",
    terms: "", offerType: "other", offerLabel: "", minSpendSen: null,
    eligibility: DEFAULT_ELIGIBILITY, startsAtMs: NOW, endsAtMs: NOW + HOUR,
    status: PROMOTION_STATUS_DRAFT, actorUid: "u", requestId: "r",
  });
  assert.equal(draft.publishedAtMs, null);
  assert.equal(doc().publishedAtMs, NOW - HOUR);
});

test("public projection NEVER carries an actor uid or request id", () => {
  const pub = toPublicPromotion("promo-1", doc());
  assert.ok(pub);
  const serialized = JSON.stringify(pub);
  for (const leak of ["merchant-uid-abc", "req-123", "createdByUid", "updatedByUid", "RequestId"]) {
    assert.equal(serialized.includes(leak), false, `public payload leaked ${leak}`);
  }
});

test("public projection carries exactly the allowlisted keys", () => {
  const pub = toPublicPromotion("promo-1", doc());
  assert.deepEqual(Object.keys(pub!).sort(), [
    "canonicalPlaceId",
    "description",
    "eligibility",
    "endsAtMs",
    "minSpendSen",
    "offerLabel",
    "offerType",
    "promotionId",
    "startsAtMs",
    "terms",
    "title",
  ]);
});

test("a field added to storage later cannot leak into the public shape", () => {
  const pub = toPublicPromotion("promo-1", doc({
    internalMargin: 0.42,
    merchantMemberId: "member-999",
    supabaseRowId: "row-1",
  }));
  const serialized = JSON.stringify(pub);
  assert.equal(serialized.includes("member-999"), false);
  assert.equal(serialized.includes("supabaseRowId"), false);
  assert.equal(serialized.includes("internalMargin"), false);
});

test("an unshowable document simply has no public form", () => {
  assert.equal(toPublicPromotion("", doc()), null, "missing id");
  assert.equal(toPublicPromotion("p", null), null, "missing data");
  assert.equal(toPublicPromotion("p", doc({canonicalPlaceId: "  "})), null, "no identity");
  assert.equal(toPublicPromotion("p", doc({title: ""})), null, "no title");
  assert.equal(toPublicPromotion("p", doc({endsAtMs: "soon"})), null, "no usable window");
});

test("merchant projection adds truthful status but still no actor uid", () => {
  const m = toMerchantPromotion("promo-1", doc(), NOW);
  assert.ok(m);
  assert.equal(m!.storedStatus, PROMOTION_STATUS_ACTIVE);
  assert.equal(m!.status, PROMOTION_STATUS_ACTIVE);
  assert.equal(JSON.stringify(m).includes("merchant-uid-abc"), false,
    "a colleague's uid is still a real person's identifier");
});

test("merchant projection reports expiry even when storage says active", () => {
  const m = toMerchantPromotion("promo-1", doc({
    startsAtMs: NOW - 3 * HOUR, endsAtMs: NOW - HOUR,
  }), NOW);
  assert.equal(m!.storedStatus, PROMOTION_STATUS_ACTIVE, "intent is unchanged");
  assert.equal(m!.status, "expired", "truth is derived from the clock");
});

test("merchant edit allowlist excludes identity, status and audit", () => {
  const forbidden = ["canonicalPlaceId", "status", "createdByUid", "updatedByUid",
    "publishedAtMs", "expiredAtMs", "archivedAtMs", "schemaVersion"];
  for (const field of forbidden) {
    assert.equal((MERCHANT_EDITABLE_FIELDS as readonly string[]).includes(field), false,
      `${field} must not be merchant-editable`);
  }
});
