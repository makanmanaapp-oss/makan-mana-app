import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  MENU_COMMENT_IMMUTABLE_FIELDS,
  MENU_COMMENT_MODERATION_WRITABLE_FIELDS,
  buildMenuCommentModerationUpdate,
  decideMenuCommentModeration,
  isMenuCommentModerationAction,
  targetStatusFor,
  updateTouchesOnlyModerationFields,
} from "../menuCommentModeration";

const STAMP = "__server_timestamp__";
const visible = {status: "visible", canonicalPlaceId: "canon-1", menuItemId: "menu-1"};
const hidden = {...visible, status: "hidden"};
const removed = {...visible, status: "removed"};

// Required test 7 — moderation target validates.
test("7. moderation target validates against the stored comment", () => {
  assert.equal(decideMenuCommentModeration("hide", visible).ok, true);
  assert.equal(decideMenuCommentModeration("hide", {status: "weird"}).ok, false);
  assert.equal(decideMenuCommentModeration("hide", {}).ok, false); // missing status
  const d = decideMenuCommentModeration("hide", visible);
  assert.equal(d.ok && d.from, "visible");
  assert.equal(d.ok && d.to, "hidden");
  assert.equal(d.ok && d.changed, true);
});

// Required test 8 — hide changes ONLY allowed moderation fields.
test("8. hide writes only permitted moderation fields", () => {
  const d = decideMenuCommentModeration("hide", visible);
  assert.ok(d.ok);
  const update = buildMenuCommentModerationUpdate({to: d.ok ? d.to : "hidden", reason: "spam", requestId: "req-1", serverTimestamp: STAMP});
  assert.equal(update.status, "hidden");
  assert.equal(update.hiddenAt, STAMP);
  assert.equal(updateTouchesOnlyModerationFields(update), true);
  for (const immutable of MENU_COMMENT_IMMUTABLE_FIELDS) {
    assert.equal(immutable in update, false, `${immutable} must never be written by moderation`);
  }
});

// Required test 9 — remove changes ONLY allowed moderation fields, never deletes.
test("9. remove writes only permitted moderation fields (soft removal)", () => {
  const d = decideMenuCommentModeration("remove", visible);
  assert.ok(d.ok);
  const update = buildMenuCommentModerationUpdate({to: "removed", reason: "policy breach", requestId: "req-2", serverTimestamp: STAMP});
  assert.equal(update.status, "removed");
  assert.equal(update.removedAt, STAMP);
  assert.equal(updateTouchesOnlyModerationFields(update), true);
  for (const immutable of MENU_COMMENT_IMMUTABLE_FIELDS) {
    assert.equal(immutable in update, false);
  }
});

// Required test 10 — restore obeys the allowed transitions.
test("10. restore obeys allowed transitions", () => {
  assert.equal(decideMenuCommentModeration("restore", hidden).ok, true);
  assert.equal(decideMenuCommentModeration("restore", removed).ok, true);
  const d = decideMenuCommentModeration("restore", hidden);
  assert.equal(d.ok && d.to, "visible");
  // re-applying the current state is an idempotent no-change success
  const same = decideMenuCommentModeration("restore", visible);
  assert.equal(same.ok, true);
  assert.equal(same.ok && same.changed, false);
  // a removed comment cannot be "hidden" — it must be restored first
  const bad = decideMenuCommentModeration("hide", removed);
  assert.equal(bad.ok, false);
  assert.equal(bad.ok === false && bad.error, "transition_not_allowed");
});

// Required test 11 — unknown moderation action rejected.
test("11. unknown moderation action is rejected", () => {
  for (const action of ["delete", "purge", "", null, undefined, 7, "HIDE"]) {
    assert.equal(isMenuCommentModerationAction(action), false, String(action));
    const d = decideMenuCommentModeration(action, visible);
    assert.equal(d.ok, false);
    assert.equal(d.ok === false && d.error, "unknown_action");
  }
  assert.equal(targetStatusFor("hide"), "hidden");
  assert.equal(targetStatusFor("remove"), "removed");
  assert.equal(targetStatusFor("restore"), "visible");
});

// Required test 12 — missing menu comment rejected.
test("12. missing menu comment is rejected", () => {
  for (const missing of [null, undefined]) {
    const d = decideMenuCommentModeration("hide", missing);
    assert.equal(d.ok, false);
    assert.equal(d.ok === false && d.error, "comment_missing");
  }
});

test("moderation field allowlist rejects any non-moderation write", () => {
  assert.equal(updateTouchesOnlyModerationFields({status: "hidden", text: "tamper"}), false);
  assert.equal(updateTouchesOnlyModerationFields({canonicalPlaceId: "other"}), false);
  assert.equal(updateTouchesOnlyModerationFields({authorUid: "x"}), false);
  assert.equal(
    updateTouchesOnlyModerationFields(Object.fromEntries(MENU_COMMENT_MODERATION_WRITABLE_FIELDS.map((f) => [f, 1]))),
    true,
  );
});

// Required test 26 — menu-comment moderation regression through the UNIFIED
// Social moderation bridge (the menu-comment-only receiver is gone).
test("26. menu comment moderation runs on the unified Social bridge, never deletes", () => {
  const src = readFileSync(resolve(process.cwd(), "src/controlCenter/socialModerationBridge.ts"), "utf8");
  assert.ok(src.includes("decideMenuCommentModeration("));
  assert.ok(src.includes("updateTouchesOnlyModerationFields(update)"));
  assert.ok(src.includes("tx.set(targetRef, update, {merge: true})"));   // soft update
  assert.equal(/tx\.delete\(|targetRef\.delete\(|ref\.delete\(/.test(src), false, "must never hard-delete");
  assert.ok(src.includes("timingSafeEqual"));                            // constant-time secret
  assert.ok(src.includes('defineSecret("SOCIAL_MODERATION_BRIDGE_SECRET")'));
  assert.equal(src.includes("MENU_COMMENT_BRIDGE_SECRET"), false);
});
