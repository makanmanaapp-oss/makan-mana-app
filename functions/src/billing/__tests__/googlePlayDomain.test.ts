import assert from "node:assert/strict";
import test from "node:test";

import {
  PLUS_PRODUCT_ID,
  PRO_PRODUCT_ID,
  hashPurchaseToken,
  isEntitledState,
  maskOrderId,
  normalizeSubscriptionPurchase,
  obfuscatedAccountIdForUid,
  planForProduct,
  rtdnTransactionType,
} from "../googlePlayDomain";

const NOW = Date.parse("2026-08-13T10:00:00Z");

test("maps approved subscription products to plans", () => {
  assert.equal(planForProduct(PLUS_PRODUCT_ID), "plus");
  assert.equal(planForProduct(PRO_PRODUCT_ID), "pro");
  assert.throws(() => planForProduct("evil_product"));
});

test("purchase token hash is deterministic and raw token is not returned", () => {
  const raw = "token-secret-123";
  const hash = hashPurchaseToken(raw);
  assert.equal(hash.length, 64);
  assert.equal(hash, hashPurchaseToken(raw));
  assert.notEqual(hash, raw);
});

test("obfuscated account id is stable and does not expose Firebase uid", () => {
  const uid = "firebase-user-123";
  const opaque = obfuscatedAccountIdForUid(uid);
  assert.equal(opaque.length, 64);
  assert.equal(opaque, obfuscatedAccountIdForUid(uid));
  assert.equal(opaque.includes(uid), false);
});

test("active purchase grants entitlement and preserves authoritative expiry", () => {
  const normalized = normalizeSubscriptionPurchase(
    PRO_PRODUCT_ID,
    {
      startTime: "2026-08-01T00:00:00Z",
      subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
      acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
      regionCode: "MY",
      lineItems: [{
        productId: PRO_PRODUCT_ID,
        expiryTime: "2026-09-01T00:00:00Z",
        latestSuccessfulOrderId: "GPA.1234-5678-9012-34567",
        autoRenewingPlan: {autoRenewEnabled: true},
      }],
    },
    NOW,
  );
  assert.equal(normalized.plan, "pro");
  assert.equal(normalized.status, "active");
  assert.equal(normalized.entitled, true);
  assert.equal(normalized.expiryTime, "2026-09-01T00:00:00Z");
  assert.equal(normalized.autoRenew, true);
  assert.equal(normalized.regionCode, "MY");
});

test("canceled but unexpired subscription keeps entitlement until expiry", () => {
  assert.equal(isEntitledState(
    "SUBSCRIPTION_STATE_CANCELED",
    "2026-08-20T00:00:00Z",
    NOW,
  ), true);
  assert.equal(isEntitledState(
    "SUBSCRIPTION_STATE_CANCELED",
    "2026-08-01T00:00:00Z",
    NOW,
  ), false);
});

test("pending, on-hold, paused and expired states never grant entitlement", () => {
  for (const state of [
    "SUBSCRIPTION_STATE_PENDING",
    "SUBSCRIPTION_STATE_ON_HOLD",
    "SUBSCRIPTION_STATE_PAUSED",
    "SUBSCRIPTION_STATE_EXPIRED",
  ]) {
    assert.equal(isEntitledState(state, "2026-09-01T00:00:00Z", NOW), false);
  }
});

test("Google Play response must contain the requested product", () => {
  assert.throws(() => normalizeSubscriptionPurchase(
    PRO_PRODUCT_ID,
    {
      subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
      lineItems: [{productId: PLUS_PRODUCT_ID, expiryTime: "2026-09-01T00:00:00Z"}],
    },
    NOW,
  ));
});

test("order id is masked for operational mirrors", () => {
  const masked = maskOrderId("GPA.1234-5678-9012-34567");
  assert.equal(masked, "GPA.…4567");
});

test("RTDN notification types map only to supported finance lifecycle events", () => {
  assert.equal(rtdnTransactionType(4), "purchase");
  assert.equal(rtdnTransactionType(2), "renewal");
  assert.equal(rtdnTransactionType(12), "reversal");
  assert.equal(rtdnTransactionType(13), "expiration");
  assert.equal(rtdnTransactionType(3), "cancellation");
  assert.equal(rtdnTransactionType(6), null);
});
