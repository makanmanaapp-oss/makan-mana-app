/**
 * MAKANMANA FINAL PRE-AAB — ujian domain langganan Google Play (tulen).
 *
 * Menangkap kontrak KESELAMATAN + kitaran hayat (Part 13-19, 34):
 *  - allowlist produk (klien tak boleh minta plan sembarangan)
 *  - pemetaan setiap keadaan langganan → kelayakan
 *  - dibatalkan-tetapi-aktif vs dibatalkan-dan-luput (guna tarikh luput)
 *  - on_hold/paused/pending/expired → TIDAK entitled (turun ke free) tapi
 *    planStatus jujur dikekalkan
 *  - medan users yang pelayan tulis (planSource=google_play, nama kanonikal)
 */
import assert from "node:assert/strict";
import {test} from "node:test";

import {
  PRODUCT_ALLOWLIST,
  entitlementToUserFields,
  isAllowedProduct,
  mapSubscriptionToEntitlement,
  planForProduct,
  type SubscriptionPurchaseV2Like,
} from "../googlePlaySubscription";
import {requiresServerAcknowledgement} from "../../../services/googlePlaySubscriptionService";
import {__rtdnTest} from "../../../triggers/handleGooglePlayRtdn";

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;
const FUTURE = new Date(NOW + 30 * DAY).toISOString();
const PAST = new Date(NOW - 2 * DAY).toISOString();

function sub(
  state: string,
  o: {
    productId?: string;
    expiryTime?: string | null;
    autoRenew?: boolean;
    ack?: boolean;
  } = {},
): SubscriptionPurchaseV2Like {
  return {
    subscriptionState: state,
    acknowledgementState: o.ack
      ? "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"
      : "ACKNOWLEDGEMENT_STATE_PENDING",
    lineItems: [
      {
        productId: o.productId ?? "makanmana_pro_monthly",
        expiryTime: o.expiryTime === undefined ? FUTURE : o.expiryTime,
        autoRenewingPlan: {autoRenewEnabled: o.autoRenew ?? true},
      },
    ],
  };
}

// 1
test("allowlist maps only the two real product IDs", () => {
  assert.equal(planForProduct("makanmana_plus_monthly"), "plus");
  assert.equal(planForProduct("makanmana_pro_monthly"), "pro");
  assert.equal(Object.keys(PRODUCT_ALLOWLIST).length, 2);
});

// 2
test("unknown product is rejected by allowlist", () => {
  assert.equal(isAllowedProduct("makanmana_pro_yearly"), false);
  assert.equal(isAllowedProduct("android.test.purchased"), false);
  assert.equal(isAllowedProduct(""), false);
  assert.equal(isAllowedProduct(null), false);
  assert.equal(planForProduct("something_else"), null);
});

// 3
test("ACTIVE pro → entitled pro / active", () => {
  const e = mapSubscriptionToEntitlement(sub("SUBSCRIPTION_STATE_ACTIVE"), NOW);
  assert.equal(e.entitled, true);
  assert.equal(e.plan, "pro");
  assert.equal(e.planStatus, "active");
});

// 4
test("ACTIVE plus → entitled plus", () => {
  const e = mapSubscriptionToEntitlement(
    sub("SUBSCRIPTION_STATE_ACTIVE", {productId: "makanmana_plus_monthly"}),
    NOW,
  );
  assert.equal(e.entitled, true);
  assert.equal(e.plan, "plus");
});

test("only an entitled, unacknowledged new subscription needs server acknowledgement", () => {
  const activePending = sub("SUBSCRIPTION_STATE_ACTIVE", {ack: false});
  assert.equal(
    requiresServerAcknowledgement(activePending, mapSubscriptionToEntitlement(activePending, NOW)),
    true,
  );
  const alreadyAcknowledged = sub("SUBSCRIPTION_STATE_ACTIVE", {ack: true});
  assert.equal(
    requiresServerAcknowledgement(
      alreadyAcknowledged,
      mapSubscriptionToEntitlement(alreadyAcknowledged, NOW),
    ),
    false,
  );
  const pendingPayment = sub("SUBSCRIPTION_STATE_PENDING", {ack: false});
  assert.equal(
    requiresServerAcknowledgement(
      pendingPayment,
      mapSubscriptionToEntitlement(pendingPayment, NOW),
    ),
    false,
  );
});

test("RTDN parser rejects malformed notifications before any entitlement work", () => {
  assert.equal(
    __rtdnTest.validateGooglePlayRtdn("not base64!", "com.makanmana.apps").kind,
    "ignore",
  );
  const body = Buffer.from(JSON.stringify({
    version: "1.0",
    packageName: "com.makanmana.apps",
    subscriptionNotification: {
      version: "1.0",
      notificationType: 4,
      purchaseToken: "valid-token-123",
    },
  })).toString("base64");
  const validated = __rtdnTest.validateGooglePlayRtdn(body, "com.makanmana.apps");
  assert.equal(validated.kind, "subscription");
  assert.equal(validated.kind === "subscription" && validated.purchaseToken, "valid-token-123");
});

test("RTDN test notification is connectivity-only and unknown/wrong messages fail safe", () => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64");
  const testEvent = __rtdnTest.validateGooglePlayRtdn(encode({
    version: "1.0",
    packageName: "com.makanmana.apps",
    testNotification: {version: "1.0"},
  }), "com.makanmana.apps");
  assert.equal(testEvent.kind, "test");

  const wrongPackage = __rtdnTest.validateGooglePlayRtdn(encode({
    version: "1.0",
    packageName: "com.other.app",
    subscriptionNotification: {version: "1.0", notificationType: 4, purchaseToken: "valid-token-123"},
  }), "com.makanmana.apps");
  assert.deepEqual(wrongPackage, {kind: "ignore", reason: "wrong_package"});

  const unknownType = __rtdnTest.validateGooglePlayRtdn(encode({
    version: "1.0",
    packageName: "com.makanmana.apps",
    subscriptionNotification: {version: "1.0", notificationType: 999, purchaseToken: "valid-token-123"},
  }), "com.makanmana.apps");
  assert.deepEqual(unknownType, {kind: "ignore", reason: "unknown_notification_type"});
});

test("invalid product and already-acknowledged renewal never request acknowledgement", () => {
  const unknownProduct = sub("SUBSCRIPTION_STATE_ACTIVE", {
    productId: "untrusted_product",
    ack: false,
  });
  assert.equal(
    requiresServerAcknowledgement(
      unknownProduct,
      mapSubscriptionToEntitlement(unknownProduct, NOW),
    ),
    false,
  );
  const renewal = sub("SUBSCRIPTION_STATE_ACTIVE", {ack: true});
  assert.equal(
    requiresServerAcknowledgement(renewal, mapSubscriptionToEntitlement(renewal, NOW)),
    false,
  );
});

// 5
test("GRACE_PERIOD keeps access (entitled) with grace status", () => {
  const e = mapSubscriptionToEntitlement(
    sub("SUBSCRIPTION_STATE_IN_GRACE_PERIOD"),
    NOW,
  );
  assert.equal(e.entitled, true);
  assert.equal(e.planStatus, "grace_period");
  assert.equal(e.plan, "pro");
});

// 6
test("CANCELED but expiry in future → entitled, cancelled_but_active", () => {
  const e = mapSubscriptionToEntitlement(
    sub("SUBSCRIPTION_STATE_CANCELED", {expiryTime: FUTURE, autoRenew: false}),
    NOW,
  );
  assert.equal(e.entitled, true);
  assert.equal(e.planStatus, "cancelled_but_active");
  assert.equal(e.autoRenewing, false);
});

// 7
test("CANCELED and expired → NOT entitled (free / expired)", () => {
  const e = mapSubscriptionToEntitlement(
    sub("SUBSCRIPTION_STATE_CANCELED", {expiryTime: PAST}),
    NOW,
  );
  assert.equal(e.entitled, false);
  assert.equal(e.planStatus, "expired");
});

// 8
test("ON_HOLD → NOT entitled but on_hold status retained", () => {
  const e = mapSubscriptionToEntitlement(
    sub("SUBSCRIPTION_STATE_ON_HOLD"),
    NOW,
  );
  assert.equal(e.entitled, false);
  assert.equal(e.planStatus, "on_hold");
});

// 9
test("PAUSED → NOT entitled, paused status", () => {
  const e = mapSubscriptionToEntitlement(sub("SUBSCRIPTION_STATE_PAUSED"), NOW);
  assert.equal(e.entitled, false);
  assert.equal(e.planStatus, "paused");
});

// 10
test("PENDING → NOT entitled (pending, not success)", () => {
  const e = mapSubscriptionToEntitlement(sub("SUBSCRIPTION_STATE_PENDING"), NOW);
  assert.equal(e.entitled, false);
  assert.equal(e.planStatus, "pending");
});

// 11
test("EXPIRED → NOT entitled, expired", () => {
  const e = mapSubscriptionToEntitlement(
    sub("SUBSCRIPTION_STATE_EXPIRED", {expiryTime: PAST}),
    NOW,
  );
  assert.equal(e.entitled, false);
  assert.equal(e.planStatus, "expired");
});

// 12
test("unknown/unspecified state is treated as NOT entitled (fail-safe)", () => {
  const e = mapSubscriptionToEntitlement(
    sub("SUBSCRIPTION_STATE_UNSPECIFIED", {expiryTime: FUTURE}),
    NOW,
  );
  assert.equal(e.entitled, false);
  assert.match(e.reason, /unknown_state/);
});

// 13
test("unknown product on an ACTIVE sub grants NO plan", () => {
  const e = mapSubscriptionToEntitlement(
    sub("SUBSCRIPTION_STATE_ACTIVE", {productId: "makanmana_pro_yearly"}),
    NOW,
  );
  assert.equal(e.entitled, false);
  assert.equal(e.plan, "free");
  assert.equal(e.reason, "product_not_in_allowlist");
});

// 14
test("entitlementToUserFields uses canonical google_play source", () => {
  const e = mapSubscriptionToEntitlement(sub("SUBSCRIPTION_STATE_ACTIVE"), NOW);
  const f = entitlementToUserFields(e);
  assert.equal(f.plan, "pro");
  assert.equal(f.planStatus, "active");
  assert.equal(f.planSource, "google_play");
  assert.equal(f.subscriptionProductId, "makanmana_pro_monthly");
  assert.equal(f.subscriptionAutoRenewing, true);
});

// 15
test("not-entitled state downgrades plan to free but keeps honest status", () => {
  const e = mapSubscriptionToEntitlement(
    sub("SUBSCRIPTION_STATE_ON_HOLD"),
    NOW,
  );
  const f = entitlementToUserFields(e);
  assert.equal(f.plan, "free");
  assert.equal(f.planStatus, "on_hold");
  assert.equal(f.planSource, "google_play");
});

// 16
test("missing lineItems / empty sub does not crash and grants nothing", () => {
  const e = mapSubscriptionToEntitlement({subscriptionState: undefined}, NOW);
  assert.equal(e.entitled, false);
  assert.equal(e.plan, "free");
  assert.equal(e.productId, null);
});
