import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  AUTHOR_TYPE_RESTAURANT,
  AUTHOR_TYPE_USER,
  ORDINARY_POST_TYPES,
  RESTAURANT_POST_TYPE,
  isOrdinaryPostType,
  resolveOrdinaryPostType,
} from "../postTypes";

// Required test 1 — ordinary createFeedPost cannot spoof restaurant identity.
test("restaurant_post is NOT an ordinary post type and resolves to food_post", () => {
  assert.equal(RESTAURANT_POST_TYPE, "restaurant_post");
  assert.equal((ORDINARY_POST_TYPES as readonly string[]).includes(RESTAURANT_POST_TYPE), false);
  assert.equal(isOrdinaryPostType("restaurant_post"), false);
  assert.equal(resolveOrdinaryPostType("restaurant_post"), "food_post");
  assert.equal(resolveOrdinaryPostType("anything_else"), "food_post");
  assert.equal(resolveOrdinaryPostType(undefined), "food_post");
  assert.equal(resolveOrdinaryPostType("meal_review"), "meal_review"); // real ordinary types preserved
});

test("createFeedPost source cannot manufacture a restaurant author", () => {
  const src = readFileSync(resolve(process.cwd(), "src/callable/createFeedPost.ts"), "utf8");
  assert.ok(src.includes("resolveOrdinaryPostType(input.postType)"));
  // The ordinary path never ASSIGNS restaurant author identity (a comment may
  // mention the term, but there must be no restaurant_post / restaurant author
  // assignment and no restaurantId write).
  assert.equal(new RegExp(`postType\\s*:\\s*["']${RESTAURANT_POST_TYPE}["']`).test(src), false);
  assert.equal(/authorType\s*:\s*["']restaurant["']/.test(src), false);
  assert.equal(/\brestaurantId\s*:/.test(src), false);
});

// Fix 8 — NEW ordinary posts explicitly record the user author type, while the
// ordinary path still cannot manufacture a restaurant post.
test("ordinary createFeedPost explicitly writes authorType user", () => {
  assert.equal(AUTHOR_TYPE_USER, "user");
  assert.equal(AUTHOR_TYPE_RESTAURANT, "restaurant");
  assert.notEqual(AUTHOR_TYPE_USER, AUTHOR_TYPE_RESTAURANT);

  const src = readFileSync(resolve(process.cwd(), "src/callable/createFeedPost.ts"), "utf8");
  assert.ok(src.includes("authorType: AUTHOR_TYPE_USER"), "ordinary post must record the user author type");
  assert.ok(src.includes("authorUid: uid"), "ordinary post keeps the real user author uid");
  // still cannot become a restaurant post
  assert.equal(resolveOrdinaryPostType("restaurant_post"), "food_post");
});
