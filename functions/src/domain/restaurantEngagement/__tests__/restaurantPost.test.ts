import assert from "node:assert/strict";
import test from "node:test";

import {buildRestaurantPostDocument, validateRestaurantPostInput} from "../restaurantPost";

const MERCHANT_UID = "merchant-firebase-uid-SHOULD-NEVER-LEAK";

// Required test 8 — public restaurant identity, no merchant Firebase UID leak.
test("restaurant post document carries restaurant identity, never the merchant UID", () => {
  const doc = buildRestaurantPostDocument({
    canonicalPlaceId: "canon-1",
    restaurantDisplayName: "Warung Pak Din",
    text: "Nasi lemak panas hari ini!",
    imageUrls: [],
  });
  assert.equal(doc.postType, "restaurant_post");
  assert.equal(doc.authorType, "restaurant");
  assert.equal(doc.restaurantId, "canon-1");
  assert.equal(doc.canonicalPlaceId, "canon-1");
  assert.equal(doc.displayName, "Warung Pak Din");
  assert.equal(doc.authorUid, null); // no user/merchant author uid
  assert.equal(doc.username, null);
  assert.equal(doc.visibility, "public");
  // The builder has no merchant-UID input; the serialized doc can never carry it.
  const serialized = JSON.stringify(doc);
  assert.equal(serialized.includes(MERCHANT_UID), false);
  assert.equal(/"authorUid"\s*:\s*"[^"]/.test(serialized), false); // authorUid is never a non-empty string
  assert.equal(serialized.includes("merchantUid"), false);
});

test("restaurant post input validation", () => {
  assert.equal(validateRestaurantPostInput({}).ok, false); // empty
  assert.equal(validateRestaurantPostInput({}).error, "empty");
  assert.equal(validateRestaurantPostInput({text: "x".repeat(501)}).error, "too_long");
  assert.equal(validateRestaurantPostInput({imageUrls: ["http://evil.example/x"]}).error, "invalid_image_url");
  const ok = validateRestaurantPostInput({text: "Menu baharu", imageUrls: ["https://firebasestorage.googleapis.com/v0/b/x/o/y"]});
  assert.equal(ok.ok, true);
  assert.equal(ok.text, "Menu baharu");
  assert.equal(ok.imageUrls.length, 1);
});
