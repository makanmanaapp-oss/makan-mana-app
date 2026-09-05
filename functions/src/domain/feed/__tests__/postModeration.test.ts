import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  POST_IMMUTABLE_FIELDS,
  POST_MODERATION_WRITABLE_FIELDS,
  buildPostModerationUpdate,
  currentPostStatus,
  decidePostModeration,
  isModerationCausedState,
  isPostModerationAction,
  postUpdateTouchesOnlyModerationFields,
  targetStatusForPost,
} from "../postModeration";

const STAMP = "__server_timestamp__";
const bridge = readFileSync(resolve(process.cwd(), "src/controlCenter/socialModerationBridge.ts"), "utf8");

// Existing semantics: an active post OMITS status; users self-delete with
// status "deleted" + deletedAt; moderation owns moderationAction/hiddenAt/
// moderationRemovedAt and never writes deletedAt.
const activePost = {authorUid: "user-1", text: "hi"};
const moderatorHidden = {...activePost, status: "hidden", moderationAction: "hide"};
const moderatorRemoved = {...activePost, status: "deleted", moderationAction: "remove", moderationRemovedAt: 1};
const userDeleted = {...activePost, status: "deleted", deletedAt: 1};

test("active posts omit status and are treated as active", () => {
  assert.equal(currentPostStatus(activePost), "active");
  assert.equal(currentPostStatus({status: ""}), "active");
  assert.equal(currentPostStatus({status: "hidden"}), "hidden");
  assert.equal(currentPostStatus({status: "deleted"}), "deleted");
  assert.equal(currentPostStatus({status: "weird"}), null); // fail closed
  assert.equal(targetStatusForPost("hide"), "hidden");
  assert.equal(targetStatusForPost("remove"), "deleted");
  assert.equal(targetStatusForPost("restore"), "active");
});

// Required test 17 — normal post -> hidden.
test("17. normal post can be hidden", () => {
  const d = decidePostModeration("hide", activePost);
  assert.equal(d.ok, true);
  assert.equal(d.ok && d.from, "active");
  assert.equal(d.ok && d.to, "hidden");
  const update = buildPostModerationUpdate({action: "hide", to: "hidden", reason: "policy", requestId: "r1", serverTimestamp: STAMP});
  assert.equal(update.status, "hidden");
  assert.equal(update.hiddenAt, STAMP);
  assert.equal(update.moderationAction, "hide");
  assert.equal(postUpdateTouchesOnlyModerationFields(update), true);
});

// Required test 18 — normal post -> moderator remove.
test("18. normal post can be removed by a moderator (soft)", () => {
  const d = decidePostModeration("remove", activePost);
  assert.equal(d.ok, true);
  assert.equal(d.ok && d.to, "deleted");
  const update = buildPostModerationUpdate({action: "remove", to: "deleted", reason: "abuse", requestId: "r2", serverTimestamp: STAMP});
  assert.equal(update.status, "deleted");
  assert.equal(update.moderationRemovedAt, STAMP);
  // moderation must NEVER write the user-owned deletedAt field
  assert.equal("deletedAt" in update, false);
  assert.equal(postUpdateTouchesOnlyModerationFields(update), true);
});

// Required tests 19/20/21 — hidden -> restore, hidden -> remove, removed -> restore.
test("19/20/21. hidden restores, hidden removes, moderator-removed restores", () => {
  assert.equal(decidePostModeration("restore", moderatorHidden).ok, true);
  assert.equal(decidePostModeration("remove", moderatorHidden).ok, true);
  assert.equal(decidePostModeration("restore", moderatorRemoved).ok, true);
  const restore = buildPostModerationUpdate({action: "restore", to: "active", reason: "appeal upheld", requestId: "r3", serverTimestamp: STAMP});
  assert.equal(restore.status, "active");
  // moderation-owned visibility markers cleared; audit trail retained
  assert.equal(restore.hiddenAt, null);
  assert.equal(restore.moderationRemovedAt, null);
  assert.equal(restore.moderationAction, "restore");
  assert.equal(restore.moderationReason, "appeal upheld");
  assert.equal("deletedAt" in restore, false);
});

// Required test 22 — CRITICAL: a user-self-deleted post can never be restored.
test("22. a USER SELF-DELETED post is never restored", () => {
  const d = decidePostModeration("restore", userDeleted);
  assert.equal(d.ok, false);
  assert.equal(d.ok === false && d.error, "restore_not_moderated");
  assert.equal(isModerationCausedState("deleted", userDeleted), false);

  // even with a STALE moderation marker, a user deletion still wins
  const staleHideMarker = {...userDeleted, moderationAction: "hide"};
  assert.equal(decidePostModeration("restore", staleHideMarker).ok, false);
  const userDeletedAfterModeration = {...moderatorRemoved, deletedAt: 2};
  assert.equal(isModerationCausedState("deleted", userDeletedAfterModeration), false);
  assert.equal(decidePostModeration("restore", userDeletedAfterModeration).ok, false);

  // a hidden post whose marker does not match the state is also refused
  assert.equal(isModerationCausedState("hidden", {status: "hidden", moderationAction: "remove"}), false);
  assert.equal(decidePostModeration("restore", {status: "hidden"}).ok, false);
});

// Required test 16 — missing post rejected; plus unknown action / bad status.
test("16. missing post, unknown action and unknown status are rejected", () => {
  const missing = decidePostModeration("hide", null);
  assert.equal(missing.ok === false && missing.error, "post_missing");
  assert.equal(decidePostModeration("hide", undefined).ok, false);
  for (const bad of ["delete", "purge", "HIDE", "", null, undefined, 5]) {
    assert.equal(isPostModerationAction(bad), false, String(bad));
    const d = decidePostModeration(bad, activePost);
    assert.equal(d.ok === false && d.error, "unknown_action");
  }
  const badStatus = decidePostModeration("hide", {status: "weird"});
  assert.equal(badStatus.ok === false && badStatus.error, "invalid_status");
  // a deleted post cannot be hidden — it must be restored first
  const hideDeleted = decidePostModeration("hide", moderatorRemoved);
  assert.equal(hideDeleted.ok === false && hideDeleted.error, "transition_not_allowed");
});

// Required tests 24/25 — identity + content are never touched by moderation.
test("24/25. restaurant AND ordinary post identity/content fields are never mutated", () => {
  for (const action of ["hide", "remove", "restore"] as const) {
    const update = buildPostModerationUpdate({action, to: targetStatusForPost(action), reason: "r", requestId: "q", serverTimestamp: STAMP});
    for (const immutable of POST_IMMUTABLE_FIELDS) {
      assert.equal(immutable in update, false, `${immutable} must never be written (${action})`);
    }
    assert.equal(postUpdateTouchesOnlyModerationFields(update), true);
  }
  // explicit identity probes for both post kinds
  for (const field of ["authorUid", "authorType", "restaurantId", "canonicalPlaceId", "displayName", "text", "imageUrls", "createdAt"]) {
    assert.ok((POST_IMMUTABLE_FIELDS as readonly string[]).includes(field), field);
  }
  assert.equal(postUpdateTouchesOnlyModerationFields({status: "hidden", text: "tamper"}), false);
  assert.equal(postUpdateTouchesOnlyModerationFields({authorUid: "x"}), false);
  assert.equal(
    postUpdateTouchesOnlyModerationFields(Object.fromEntries(POST_MODERATION_WRITABLE_FIELDS.map((f) => [f, 1]))),
    true,
  );
});

// Required tests 13/14/15/23/27/28 — receiver contract (structural).
test("13/14/15. receiver rejects unauthenticated, unsupported command and wrong resourceType", () => {
  assert.ok(bridge.includes("timingSafeEqual"));
  assert.ok(bridge.includes('errorCode: "UNAUTHENTICATED"'));
  assert.ok(bridge.includes('errorCode: "UNSUPPORTED_COMMAND"'));
  // domain resolution requires prefix AND resourceType to agree
  assert.ok(bridge.includes('commandType.startsWith(POST_PREFIX) && resourceType === "social_post"'));
  assert.ok(bridge.includes('commandType.startsWith(MENU_COMMENT_PREFIX) && resourceType === "menu_comment"'));
  assert.ok(bridge.includes("if (!domain) {"));
});

test("23. moderation never hard-deletes a post or a comment", () => {
  assert.equal(/tx\.delete\(|targetRef\.delete\(|\.doc\([^)]*\)\.delete\(/.test(bridge), false);
  assert.ok(bridge.includes("tx.set(targetRef, update, {merge: true})"));
  assert.ok(bridge.includes("postUpdateTouchesOnlyModerationFields(update)"));
  assert.ok(bridge.includes("updateTouchesOnlyModerationFields(update)"));
});

test("27/28. duplicate requestId is idempotent; conflicting reuse fails closed", () => {
  assert.ok(bridge.includes("social_moderation_requests"));
  assert.ok(bridge.includes("priorRequest.commandType === commandType"));
  assert.ok(bridge.includes("priorRequest.resourceId === resourceId"));
  assert.ok(bridge.includes('errorCode: "REQUEST_ID_CONFLICT"'));
  assert.ok(bridge.includes("idempotent: true"));
});

test("the bridge never logs the bearer secret", () => {
  const logged = bridge.match(/console\.(log|error|warn)\([\s\S]{0,200}?\)/g) ?? [];
  for (const line of logged) {
    assert.equal(/secret|authorization|bearer/i.test(line), false, line);
  }
});
