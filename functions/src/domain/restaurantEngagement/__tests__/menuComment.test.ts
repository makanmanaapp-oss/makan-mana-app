import assert from "node:assert/strict";
import test from "node:test";

import {buildMenuCommentDocument, validateMenuCommentInput} from "../menuComment";
import {menuItemExists} from "../identity";

const PROFILE_ITEMS = [{id: "menu-makanan-1"}, {id: "menu-minuman-2"}];

// Required test 12 — menu comment requires a valid restaurant + menu target.
test("menu comment requires canonicalPlaceId + menuItemId, and the item must exist", () => {
  assert.equal(validateMenuCommentInput({menuItemId: "menu-makanan-1", text: "sedap"}).error, "canonical_place_id_invalid");
  assert.equal(validateMenuCommentInput({canonicalPlaceId: "canon-1", text: "sedap"}).error, "menu_item_id_invalid");
  // menu item existence (checked in the callable against the published profile)
  assert.equal(menuItemExists(PROFILE_ITEMS, "menu-makanan-1"), true);
  assert.equal(menuItemExists(PROFILE_ITEMS, "does-not-exist"), false);
  assert.equal(menuItemExists(undefined, "x"), false);
});

// Required test 13 — empty menu comment rejected.
test("empty menu comment is rejected", () => {
  const r = validateMenuCommentInput({canonicalPlaceId: "canon-1", menuItemId: "menu-makanan-1", text: "   "});
  assert.equal(r.ok, false);
  assert.equal(r.error, "text_empty");
});

// Required test 14 — menu comment over max length (300) rejected.
test("menu comment over 300 chars rejected; exactly 300 accepted", () => {
  const over = validateMenuCommentInput({canonicalPlaceId: "canon-1", menuItemId: "menu-makanan-1", text: "x".repeat(301)});
  assert.equal(over.error, "text_too_long");
  const exact = validateMenuCommentInput({canonicalPlaceId: "canon-1", menuItemId: "menu-makanan-1", text: "x".repeat(300)});
  assert.equal(exact.ok, true);
});

test("user menu comment document carries the user author, not a restaurant", () => {
  const doc = buildMenuCommentDocument({
    canonicalPlaceId: "canon-1",
    menuItemId: "menu-makanan-1",
    authorUid: "user-1",
    authorDisplayName: "Aiman",
    text: "Sedap!",
    parentCommentId: null,
  });
  assert.equal(doc.authorType, "user");
  assert.equal(doc.authorUid, "user-1");
  assert.equal(doc.restaurantId, null);
  assert.equal(doc.status, "visible");
  assert.equal(doc.displayNameSnapshot, "Aiman");
});
