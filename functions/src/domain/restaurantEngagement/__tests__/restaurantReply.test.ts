import assert from "node:assert/strict";
import test from "node:test";

import {buildRestaurantReplyDocument, validateReplyTarget} from "../restaurantReply";

const parent = {canonicalPlaceId: "canon-A", menuItemId: "menu-1", status: "visible"};
const MERCHANT_UID = "merchant-uid-SHOULD-NEVER-LEAK";

// Required test 15 — restaurant reply requires a matching restaurant + menu item.
test("reply is valid when the authorized place + menu item match the parent", () => {
  assert.equal(validateReplyTarget(parent, "canon-A", "menu-1").ok, true);
  assert.equal(validateReplyTarget(parent, "canon-A", "menu-2").error, "menu_item_mismatch");
});

// Required test 16 — a merchant of another restaurant cannot reply.
test("a merchant authorized for another restaurant cannot reply", () => {
  const r = validateReplyTarget(parent, "canon-B", "menu-1");
  assert.equal(r.ok, false);
  assert.equal(r.error, "restaurant_mismatch");
});

// Fix 5 — fail closed on status: ONLY an explicitly visible parent is replyable.
test("cannot reply to a missing parent", () => {
  assert.equal(validateReplyTarget(null, "canon-A", "menu-1").error, "parent_missing");
  assert.equal(validateReplyTarget(undefined, "canon-A", "menu-1").error, "parent_missing");
});

test("only status 'visible' is replyable — removed/hidden/deleted/missing/unknown all reject", () => {
  for (const status of ["removed", "hidden", "deleted", "quarantined", "", "VISIBLE", "pending"]) {
    const r = validateReplyTarget({...parent, status}, "canon-A", "menu-1");
    assert.equal(r.ok, false, `status ${JSON.stringify(status)} must reject`);
    assert.equal(r.error, "parent_not_visible");
  }
  // missing status field entirely
  assert.equal(validateReplyTarget({canonicalPlaceId: "canon-A", menuItemId: "menu-1"}, "canon-A", "menu-1").error, "parent_not_visible");
  // non-string status
  assert.equal(validateReplyTarget({...parent, status: 1}, "canon-A", "menu-1").error, "parent_not_visible");
  assert.equal(validateReplyTarget({...parent, status: null}, "canon-A", "menu-1").error, "parent_not_visible");
});

// Required test 17 — official reply exposes restaurant identity, not merchant.
test("official reply document exposes restaurant identity, never the merchant UID", () => {
  const doc = buildRestaurantReplyDocument({
    canonicalPlaceId: "canon-A",
    menuItemId: "menu-1",
    parentCommentId: "parent-1",
    restaurantDisplayName: "Warung Pak Din",
    text: "Terima kasih!",
  });
  assert.equal(doc.authorType, "restaurant");
  assert.equal(doc.authorUid, null);
  assert.equal(doc.restaurantId, "canon-A");
  assert.equal(doc.displayNameSnapshot, "Warung Pak Din");
  assert.equal(doc.status, "visible");
  assert.equal(JSON.stringify(doc).includes(MERCHANT_UID), false);
});
