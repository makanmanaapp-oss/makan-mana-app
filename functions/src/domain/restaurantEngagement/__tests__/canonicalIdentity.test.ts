import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {buildMenuCommentDocument} from "../menuComment";
import {buildRestaurantReplyDocument} from "../restaurantReply";
import {buildRestaurantPostDocument} from "../restaurantPost";

/**
 * Fix 2 — the RESOLVED publication id (profile.canonicalPlaceId) is the ONLY
 * authoritative restaurant engagement identity. A caller may pass an
 * alias/provider identifier; it must never be persisted, or one restaurant's
 * engagement would fragment across ids.
 */

const ALIAS = "alias-provider-XYZ";
const CANONICAL = "canon-REAL";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const countOf = (haystack: string, needle: string) => haystack.split(needle).length - 1;

test("domain builders persist exactly the canonical identity they are given", () => {
  const comment = buildMenuCommentDocument({
    canonicalPlaceId: CANONICAL, menuItemId: "menu-1", authorUid: "u1",
    authorDisplayName: "A", text: "sedap", parentCommentId: null,
  });
  assert.equal(comment.canonicalPlaceId, CANONICAL);
  assert.equal(JSON.stringify(comment).includes(ALIAS), false);

  const reply = buildRestaurantReplyDocument({
    canonicalPlaceId: CANONICAL, menuItemId: "menu-1", parentCommentId: "p1",
    restaurantDisplayName: "Warung", text: "terima kasih",
  });
  assert.equal(reply.canonicalPlaceId, CANONICAL);
  assert.equal(reply.restaurantId, CANONICAL);

  const post = buildRestaurantPostDocument({
    canonicalPlaceId: CANONICAL, restaurantDisplayName: "Warung", text: "hi", imageUrls: [],
  });
  assert.equal(post.canonicalPlaceId, CANONICAL);
  assert.equal(post.restaurantId, CANONICAL);
});

test("createMenuComment uses the RESOLVED canonical id everywhere after resolution", () => {
  const src = read("src/callable/menuCommentControl.ts");
  assert.ok(src.includes("const canonicalPlaceId = profile.canonicalPlaceId;"));
  // The caller-supplied id may be used ONLY to resolve the profile — exactly once.
  assert.equal(countOf(src, "validation.canonicalPlaceId"), 1);
  assert.ok(src.includes("readPublishedRestaurantProfileV2(validation.canonicalPlaceId)"));
  // document, parent matching and event all use the resolved id
  assert.equal(/canonicalPlaceId:\s*validation\.canonicalPlaceId/.test(src), false);
  assert.ok(src.includes("p.canonicalPlaceId !== canonicalPlaceId"));
  assert.ok(src.includes("metadata: {commentId: ref.id, canonicalPlaceId,"));
});

test("restaurant reply resolves the canonical id BEFORE authorizing", () => {
  const src = read("src/callable/restaurantReplyControl.ts");
  const resolveAt = src.indexOf("readPublishedRestaurantProfileV2(canonicalPlaceId)");
  const authorizeAt = src.indexOf("authorizeMerchantPlace(uid, profile.canonicalPlaceId)");
  assert.ok(resolveAt > 0, "must resolve the published profile");
  assert.ok(authorizeAt > 0, "must authorize against the resolved canonical id");
  assert.ok(resolveAt < authorizeAt, "resolution must happen before authorization");
});

test("restaurant post + follow/unfollow use the resolved canonical identity", () => {
  const post = read("src/callable/createRestaurantPost.ts");
  assert.ok(post.includes("authorizeMerchantPlace(uid, profile.canonicalPlaceId)"));
  assert.ok(post.includes("canonicalPlaceId: profile.canonicalPlaceId"));

  const follow = read("src/callable/restaurantFollowControl.ts");
  assert.ok(follow.includes("followRef(uid, profile.canonicalPlaceId)"));
  // unfollow resolves through the SERVER canonical resolver — which does NOT
  // require an active publication and has NO alias fallback — so it always
  // targets the canonical follow document, never an alias-scoped one.
  assert.ok(follow.includes("const resolvedId = await resolveCanonicalRestaurantPlaceId(canonicalPlaceId);"));
  assert.ok(follow.includes("followRef(uid, resolvedId)"));
  assert.equal(follow.includes("profile?.canonicalPlaceId ?? canonicalPlaceId"), false);
});
