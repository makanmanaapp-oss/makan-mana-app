import {strict as assert} from "node:assert";
import {test} from "node:test";
import {planForSubscriptionUser} from "../appleAccess";

const NOW = 1700000000000;
const paid = {plan: "pro", planSource: "app_store", planStatus: "active",
  subscriptionProductId: "makanmana_pro_monthly", subscriptionExpiryMillis: NOW + 1000};

test("expired Apple access is denied without waiting for a notification", () => {
  assert.equal(planForSubscriptionUser(paid, NOW), "pro");
  assert.equal(planForSubscriptionUser(paid, NOW + 1000), "free");
  assert.equal(planForSubscriptionUser(paid, NOW + 5000), "free");
});

test("missing expiry, unlisted product, pending, retry and revoked Apple plans fail closed", () => {
  for (const over of [{subscriptionExpiryMillis: null}, {subscriptionExpiryMillis: Number.NaN},
    {subscriptionProductId: "unlisted"}, {planStatus: "expired"}, {planStatus: "pending"},
    {planStatus: "on_hold"}, {plan: "admin"}]) {
    assert.equal(planForSubscriptionUser({...paid, ...over}, NOW), "free");
  }
});

test("valid cancellation and grace remain accessible only up to the stored deadline", () => {
  for (const planStatus of ["cancelled_but_active", "grace_period"]) {
    assert.equal(planForSubscriptionUser({...paid, planStatus}, NOW), "pro");
    assert.equal(planForSubscriptionUser({...paid, planStatus}, NOW + 1000), "free");
  }
});

test("Android Google Play, coupon, admin and legacy plan results are unchanged", () => {
  for (const planSource of ["google_play", "coupon", "admin", "expired_coupon", undefined]) {
    for (const plan of ["free", "plus", "pro"]) {
      assert.equal(planForSubscriptionUser({plan, planSource, planStatus: "expired", subscriptionExpiryMillis: 0}, NOW), plan);
    }
  }
  assert.equal(planForSubscriptionUser(undefined, NOW), "free");
});
