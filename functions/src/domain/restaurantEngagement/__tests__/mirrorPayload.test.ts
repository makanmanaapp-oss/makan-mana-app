import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMenuCommentMirrorRecord,
  buildSocialPostMirrorRecord,
  mirrorTimestamp,
} from "../mirrorPayload";

const MERCHANT_UID = "merchant-uid-MUST-NEVER-MIRROR";
const ts = (iso: string) => ({toDate: () => new Date(iso)});

// Required test 1 — restaurant post mirror preserves restaurant identity.
test("1. restaurant post mirror preserves public restaurant identity", () => {
  const rec = buildSocialPostMirrorRecord("post-1", {
    postType: "restaurant_post",
    authorType: "restaurant",
    authorUid: null,
    canonicalPlaceId: "canon-1",
    restaurantId: "canon-1",
    displayName: "Warung Pak Din",
    visibility: "public",
    text: "Nasi lemak panas!",
    createdAt: ts("2026-01-01T00:00:00.000Z"),
  });
  assert.ok(rec);
  assert.equal(rec!.author_type, "restaurant");
  assert.equal(rec!.post_type, "restaurant_post");
  assert.equal(rec!.canonical_place_id, "canon-1");
  assert.equal(rec!.restaurant_display_name, "Warung Pak Din");
  assert.equal(rec!.author_uid, null);
  assert.equal(rec!.content_excerpt, "Nasi lemak panas!");
  assert.equal(rec!.moderation_status, "visible");
  assert.equal(rec!.created_at, "2026-01-01T00:00:00.000Z");
});

// Required test 2 — ordinary user post mirror stays backward compatible.
test("2. ordinary user post mirror is unchanged and defaults author_type user", () => {
  const rec = buildSocialPostMirrorRecord("post-2", {
    postType: "food_post",
    authorUid: "user-1",
    displayName: "Aiman",
    visibility: "public",
    text: "Sedap!",
  });
  assert.ok(rec);
  assert.equal(rec!.author_type, "user");        // legacy docs have no authorType
  assert.equal(rec!.author_uid, "user-1");
  assert.equal(rec!.canonical_place_id, null);   // no restaurant identity leaks in
  assert.equal(rec!.restaurant_display_name, null);
  assert.equal(rec!.post_type, "food_post");
});

// Required test 5 — a restaurant post must never mirror a merchant actor UID.
test("5. restaurant post mirror never carries a merchant actor UID", () => {
  const rec = buildSocialPostMirrorRecord("post-3", {
    postType: "restaurant_post",
    authorType: "restaurant",
    authorUid: MERCHANT_UID,          // even if a stray value existed upstream
    actingMerchantUid: MERCHANT_UID,  // and an unexpected field is present
    canonicalPlaceId: "canon-1",
    displayName: "Warung Pak Din",
    text: "Promo",
  });
  assert.ok(rec);
  assert.equal(rec!.author_uid, null);
  assert.equal(JSON.stringify(rec).includes(MERCHANT_UID), false);
});

// Required test 3 — menu comment mirror payload minimum fields.
test("3. menu comment mirror payload contains the required minimum fields", () => {
  const rec = buildMenuCommentMirrorRecord("c-1", {
    canonicalPlaceId: "canon-1",
    menuItemId: "menu-1",
    authorType: "user",
    authorUid: "user-1",
    parentCommentId: null,
    text: "Sedap!",
    status: "visible",
    createdAt: ts("2026-01-02T00:00:00.000Z"),
    updatedAt: ts("2026-01-03T00:00:00.000Z"),
  });
  assert.ok(rec);
  assert.deepEqual(Object.keys(rec!).sort(), [
    "author_type", "canonical_place_id", "excerpt", "firebase_comment_id",
    "firebase_created_at", "firebase_updated_at", "menu_item_id",
    "moderation_status", "parent_comment_id", "removed_at", "restaurant_id",
  ]);
  assert.equal(rec!.firebase_comment_id, "c-1");
  assert.equal(rec!.canonical_place_id, "canon-1");
  assert.equal(rec!.menu_item_id, "menu-1");
  assert.equal(rec!.author_type, "user");
  assert.equal(rec!.restaurant_id, null);
  assert.equal(rec!.moderation_status, "visible");
  assert.equal(rec!.firebase_created_at, "2026-01-02T00:00:00.000Z");
  // privacy: the mirror schema has NO author_uid column and must not invent one
  assert.equal("author_uid" in (rec as object), false);
});

// Required test 4 + 5 — official reply mirrors as restaurant, without merchant UID.
test("4/5. official restaurant reply mirrors authorType restaurant and no merchant UID", () => {
  const rec = buildMenuCommentMirrorRecord("c-2", {
    canonicalPlaceId: "canon-1",
    menuItemId: "menu-1",
    authorType: "restaurant",
    authorUid: null,
    restaurantId: "canon-1",
    parentCommentId: "c-1",
    displayNameSnapshot: "Warung Pak Din",
    text: "Terima kasih!",
    status: "visible",
  });
  assert.ok(rec);
  assert.equal(rec!.author_type, "restaurant");
  assert.equal(rec!.restaurant_id, "canon-1");
  assert.equal(rec!.parent_comment_id, "c-1");
  assert.equal(JSON.stringify(rec).includes(MERCHANT_UID), false);
  assert.equal("author_uid" in (rec as object), false);
});

// Required test 6 (producer half) — sanitizers are deterministic, so a replayed
// batch produces an identical payload (the Control Center receipt hash + upsert
// then make the apply idempotent).
test("6. mirror payload is deterministic for a replayed document", () => {
  const doc = {
    canonicalPlaceId: "canon-1", menuItemId: "menu-1", authorType: "user",
    text: "same", status: "hidden", createdAt: ts("2026-01-02T00:00:00.000Z"),
  };
  assert.deepEqual(buildMenuCommentMirrorRecord("c-3", doc), buildMenuCommentMirrorRecord("c-3", doc));
  const post = {postType: "restaurant_post", canonicalPlaceId: "canon-1", displayName: "W", text: "x"};
  assert.deepEqual(buildSocialPostMirrorRecord("p-9", post), buildSocialPostMirrorRecord("p-9", post));
});

test("mirror records reject incomplete identity and normalise timestamps", () => {
  assert.equal(buildMenuCommentMirrorRecord("c-4", {menuItemId: "menu-1"}), null);      // no place
  assert.equal(buildMenuCommentMirrorRecord("c-4", {canonicalPlaceId: "canon-1"}), null); // no item
  assert.equal(buildSocialPostMirrorRecord("", {}), null);
  assert.equal(mirrorTimestamp(ts("2026-05-05T10:00:00.000Z")), "2026-05-05T10:00:00.000Z");
  assert.equal(mirrorTimestamp(new Date("2026-05-05T10:00:00.000Z")), "2026-05-05T10:00:00.000Z");
  assert.equal(mirrorTimestamp(null), null);
  assert.equal(mirrorTimestamp("not-a-date"), null);
});
