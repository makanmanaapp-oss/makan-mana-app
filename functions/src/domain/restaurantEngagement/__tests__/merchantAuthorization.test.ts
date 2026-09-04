import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {interpretPlaceAuthorization} from "../merchantAuthorization";
import {ALLOWED_MERCHANT_ROLES} from "../identity";

const OK = (role: string) => ({
  ok: true,
  action: "merchant.authorize_place",
  authorization: {authorized: true, role, canonicalPlaceId: "canon-1", registryId: "reg-1", restaurantDisplayName: "Warung Pak Din"},
});

// Required tests 5,6,7 — active owner / manager / editor accepted.
for (const role of ALLOWED_MERCHANT_ROLES) {
  test(`active ${role} membership is accepted`, () => {
    const r = interpretPlaceAuthorization(200, OK(role));
    assert.equal(r.authorized, true);
    assert.equal(r.role, role);
    assert.equal(r.canonicalPlaceId, "canon-1");
    assert.equal(r.restaurantDisplayName, "Warung Pak Din");
  });
}

// Required tests 3,4 (interpretation side) — rejections are fail-closed.
test("no account / missing membership (403/404) is not authorized", () => {
  assert.equal(interpretPlaceAuthorization(404, {ok: false, error: "merchant_account_not_found"}).authorized, false);
  assert.equal(interpretPlaceAuthorization(403, {ok: false, error: "merchant_place_access_required"}).authorized, false);
});

test("suspended/closed account or revoked membership (403) is not authorized", () => {
  assert.equal(interpretPlaceAuthorization(403, {ok: false, error: "merchant_account_not_active"}).authorized, false);
  assert.equal(interpretPlaceAuthorization(403, {ok: false, error: "membership_not_active"}).authorized, false);
});

test("fail-closed: non-2xx, missing authorization, or disallowed role → not authorized", () => {
  assert.equal(interpretPlaceAuthorization(500, {}).authorized, false);
  assert.equal(interpretPlaceAuthorization(200, {ok: true}).authorized, false); // no authorization block
  assert.equal(interpretPlaceAuthorization(200, {authorization: {authorized: true, role: "viewer", canonicalPlaceId: "c"}}).authorized, false); // role not allowed
  assert.equal(interpretPlaceAuthorization(200, {authorization: {authorized: false, reason: "x"}}).authorized, false);
});

// Required test 2 — unauthenticated restaurant-post publish rejected (server guard).
test("createRestaurantPost + reply require auth and server authorization", () => {
  const post = readFileSync(resolve(process.cwd(), "src/callable/createRestaurantPost.ts"), "utf8");
  assert.ok(/if \(!uid\) throw new HttpsError\("unauthenticated"/.test(post));
  assert.ok(post.includes("authorizeMerchantPlace("));
  assert.ok(post.includes("merchant_place_access_required"));
  const reply = readFileSync(resolve(process.cwd(), "src/callable/restaurantReplyControl.ts"), "utf8");
  assert.ok(/if \(!uid\) throw new HttpsError\("unauthenticated"/.test(reply));
  assert.ok(reply.includes("authorizeMerchantPlace("));
});
