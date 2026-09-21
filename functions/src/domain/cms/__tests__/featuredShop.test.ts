/**
 * FEATURED SHOP BANNER — the honesty contract for shop identity.
 *
 * A featured banner makes a claim about a REAL restaurant. Every rule below
 * exists so the banner can only ever repeat what the registry already knows.
 * The failure mode this guards against is not a crash — it is a banner that
 * looks perfectly fine while naming a shop that does not exist, showing a
 * rating nobody earned, or pointing at a place that was taken down.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  FEATURED_SHOP_NAME_MAX,
  isFeaturedShopPlacement,
  shopDestinationFor,
  toFeaturedShop,
} from "../featuredShop";
import {
  PLACEMENT_EXPLORE_TOP,
  PLACEMENT_HOME_MID,
  PLACEMENT_HOME_TOP,
  PLACEMENT_RESTAURANT_DETAIL,
} from "../cmsTypes";

const ID = "PLC-abc123";

function details(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    displayName: "Warung Pak Din",
    photoUrl: "https://lh3.googleusercontent.com/places/photo.jpg",
    formattedAddress: "12 Jalan Besar, Shah Alam, Selangor",
    rating: 4.4,
    userRatingCount: 231,
    ...over,
  };
}

// ── identity ───────────────────────────────────────────────────────────────

test("a real place becomes a featured shop", () => {
  const shop = toFeaturedShop(ID, details());
  assert.ok(shop);
  assert.equal(shop.canonicalPlaceId, ID);
  assert.equal(shop.name, "Warung Pak Din");
  assert.equal(shop.address, "12 Jalan Besar, Shah Alam, Selangor");
  assert.equal(shop.photoUrl, "https://lh3.googleusercontent.com/places/photo.jpg");
});

test("a missing document cannot be featured", () => {
  assert.equal(toFeaturedShop(ID, null), null);
  assert.equal(toFeaturedShop(ID, undefined), null);
});

test("an unnamed place cannot be featured, and the id is NEVER the name", () => {
  // Falling back to the id would put `PLC-abc123` on a customer's Home screen
  // dressed up as a restaurant. Refusing is the only honest answer.
  for (const empty of [{displayName: ""}, {displayName: "   "}, {displayName: 42}]) {
    const shop = toFeaturedShop(ID, details(empty));
    assert.equal(shop, null, `named by accident: ${JSON.stringify(empty)}`);
  }
});

test("legacy name fields are accepted, in priority order", () => {
  assert.equal(toFeaturedShop(ID, {name: "Kedai Lama"})?.name, "Kedai Lama");
  assert.equal(toFeaturedShop(ID, {title: "Kedai Tajuk"})?.name, "Kedai Tajuk");
  assert.equal(
    toFeaturedShop(ID, {displayName: "Baharu", name: "Lama"})?.name,
    "Baharu",
  );
});

test("an absent canonical id cannot be featured", () => {
  assert.equal(toFeaturedShop("", details()), null);
  assert.equal(toFeaturedShop("   ", details()), null);
});

test("a name longer than the card can carry is truncated, never dropped", () => {
  const long = "A".repeat(FEATURED_SHOP_NAME_MAX + 50);
  const shop = toFeaturedShop(ID, details({displayName: long}));
  assert.ok(shop);
  assert.equal(shop.name.length, FEATURED_SHOP_NAME_MAX);
});

// ── rating: shown only when it is genuinely earned ──────────────────────────

test("rating is shown only with BOTH a value and a count", () => {
  const shown = toFeaturedShop(ID, details());
  assert.equal(shown?.rating, 4.4);
  assert.equal(shown?.ratingCount, 231);

  // Same rule the trusted-snapshot resolver already applies: a rating with no
  // reviews behind it is not a rating.
  for (const hidden of [
    {rating: 0, userRatingCount: 10},
    {rating: 4.4, userRatingCount: 0},
    {rating: 4.4, userRatingCount: undefined},
    {rating: undefined, userRatingCount: 231},
    {rating: "4.4", userRatingCount: 231},
  ]) {
    const shop = toFeaturedShop(ID, details(hidden));
    assert.ok(shop, "the shop itself is still featurable");
    assert.equal(shop.rating, null, `rating invented: ${JSON.stringify(hidden)}`);
    assert.equal(shop.ratingCount, null);
  }
});

// ── photo: it is rendered as an image, so it must be a real https image url ──

test("only an https photo url survives", () => {
  for (const bad of [
    "http://insecure/photo.jpg",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "//protocol-relative/x.jpg",
    "not a url",
    "",
    "   ",
    42,
  ]) {
    const shop = toFeaturedShop(ID, details({photoUrl: bad}));
    assert.ok(shop, "a shop with no usable photo still has an identity");
    assert.equal(shop.photoUrl, null, `unsafe photo accepted: ${String(bad)}`);
  }
});

test("a shop with no photo is still featurable — the card shows a monogram", () => {
  const shop = toFeaturedShop(ID, details({photoUrl: undefined}));
  assert.ok(shop);
  assert.equal(shop.photoUrl, null);
  assert.equal(shop.name, "Warung Pak Din");
});

// ── address ────────────────────────────────────────────────────────────────

test("address falls back across the real schema variants, else null", () => {
  assert.equal(
    toFeaturedShop(ID, {displayName: "X", formatted_address: "Jalan Snake"})?.address,
    "Jalan Snake",
  );
  assert.equal(toFeaturedShop(ID, {displayName: "X", address: "Jalan Plain"})?.address, "Jalan Plain");
  assert.equal(toFeaturedShop(ID, {displayName: "X"})?.address, null);
});

// ── what a featured shop must NOT carry ────────────────────────────────────

test("opening status and distance are not expressible", () => {
  // `place_details` carries neither, and the owner's rule is explicit: never
  // invent an opening status or a distance. The only way to guarantee that is
  // for the projection to have nowhere to put one.
  const shop = toFeaturedShop(ID, details({
    isOpen: true, openNow: true, distanceKm: 1.2, businessStatus: "OPERATIONAL",
  }));
  assert.ok(shop);
  const keys = Object.keys(shop).sort();
  assert.deepEqual(keys, [
    "address", "canonicalPlaceId", "name", "photoUrl", "rating", "ratingCount",
  ]);
});

// ── placement rules ────────────────────────────────────────────────────────

test("a shop may be featured on discovery surfaces, not on a restaurant page", () => {
  assert.equal(isFeaturedShopPlacement(PLACEMENT_HOME_TOP), true);
  assert.equal(isFeaturedShopPlacement(PLACEMENT_HOME_MID), true);
  assert.equal(isFeaturedShopPlacement(PLACEMENT_EXPLORE_TOP), true);
  // restaurant_detail already uses canonicalPlaceId to SCOPE a banner to one
  // restaurant's page. Reusing it to also mean "feature this shop" would change
  // what every existing row means.
  assert.equal(isFeaturedShopPlacement(PLACEMENT_RESTAURANT_DETAIL), false);
  assert.equal(isFeaturedShopPlacement("nonsense"), false);
});

// ── destination ────────────────────────────────────────────────────────────

test("the destination is derived from the proven id, never from operator text", () => {
  assert.equal(shopDestinationFor(ID), `/restaurant/${ID}`);
});

test("a destination is refused for an id that cannot be in a route", () => {
  for (const bad of ["", "   ", "has space", "has/slash", "has?query", "has#frag"]) {
    assert.equal(shopDestinationFor(bad), null, `bad id routed: "${bad}"`);
  }
});
