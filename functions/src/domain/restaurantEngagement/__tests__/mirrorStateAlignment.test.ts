import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMenuCommentMirrorRecord,
  buildSocialPostMirrorRecord,
  mapMenuCommentStatusToMirrorModeration,
  mapPostStatusToMirrorModeration,
} from "../mirrorPayload";
import {mirrorEventId} from "../mirrorEvents";
import {buildPostModerationUpdate} from "../../feed/postModeration";
import {
  buildMenuCommentModerationUpdate,
  decideMenuCommentModeration,
} from "../menuCommentModeration";

/**
 * Corrective B/C/D — integration-style proofs.
 *
 * The post-mirror tests do NOT invent source fields: they apply the REAL
 * buildPostModerationUpdate() output onto a base document (exactly what the
 * moderation receiver merges) and then run the shared mirror builder over the
 * merged result.
 */

const STAMP = {toDate: () => new Date("2026-04-04T10:00:00.000Z")}; // Timestamp-like
const MERCHANT_UID = "merchant-uid-MUST-NEVER-MIRROR";

const restaurantPost = {
  postType: "restaurant_post",
  authorType: "restaurant",
  authorUid: null,
  canonicalPlaceId: "canon-1",
  restaurantId: "canon-1",
  displayName: "Warung Pak Din",
  visibility: "public",
  text: "Promo hari ini",
  createdAt: {toDate: () => new Date("2026-01-01T00:00:00.000Z")},
};
const ordinaryPost = {
  postType: "food_post",
  authorUid: "user-1",
  displayName: "Aiman",
  visibility: "public",
  text: "Sedap",
};

/** Merge a moderation update the way the receiver's tx.set(..., {merge:true}) does. */
function applyUpdate(base: Record<string, unknown>, update: Record<string, unknown>) {
  return {...base, ...update};
}

// ── Corrective B: post moderation → mirror state ──────────────────────────

test("1. HIDE: authoritative status hidden → mirror moderation_status hidden", () => {
  const doc = applyUpdate(restaurantPost, buildPostModerationUpdate({
    action: "hide", to: "hidden", reason: "policy", requestId: "r1", serverTimestamp: STAMP,
  }));
  assert.equal(doc.status, "hidden");
  const rec = buildSocialPostMirrorRecord("p-1", doc);
  assert.ok(rec);
  assert.equal(rec!.moderation_status, "hidden");
  assert.equal(rec!.removed_at, null);
});

test("2. REMOVE: status deleted → mirror removed, removed_at from moderationRemovedAt", () => {
  const doc = applyUpdate(restaurantPost, buildPostModerationUpdate({
    action: "remove", to: "deleted", reason: "abuse", requestId: "r2", serverTimestamp: STAMP,
  }));
  assert.equal(doc.status, "deleted");
  assert.equal(doc.moderationRemovedAt, STAMP);
  const rec = buildSocialPostMirrorRecord("p-1", doc);
  assert.equal(rec!.moderation_status, "removed");
  assert.equal(rec!.removed_at, "2026-04-04T10:00:00.000Z");
});

test("3. RESTORE after remove: mirror visible with removed_at null", () => {
  const removed = applyUpdate(restaurantPost, buildPostModerationUpdate({
    action: "remove", to: "deleted", reason: "abuse", requestId: "r2", serverTimestamp: STAMP,
  }));
  const restored = applyUpdate(removed, buildPostModerationUpdate({
    action: "restore", to: "active", reason: "appeal upheld", requestId: "r3", serverTimestamp: STAMP,
  }));
  assert.equal(restored.status, "active");
  assert.equal(restored.moderationRemovedAt, null);
  const rec = buildSocialPostMirrorRecord("p-1", restored);
  assert.equal(rec!.moderation_status, "visible");
  assert.equal(rec!.removed_at, null);
});

test("4. RESTORE after hide: mirror visible", () => {
  const hidden = applyUpdate(restaurantPost, buildPostModerationUpdate({
    action: "hide", to: "hidden", reason: "policy", requestId: "r1", serverTimestamp: STAMP,
  }));
  const restored = applyUpdate(hidden, buildPostModerationUpdate({
    action: "restore", to: "active", reason: "ok", requestId: "r4", serverTimestamp: STAMP,
  }));
  const rec = buildSocialPostMirrorRecord("p-1", restored);
  assert.equal(rec!.moderation_status, "visible");
  assert.equal(rec!.removed_at, null);
  assert.equal(restored.hiddenAt, null);
});

test("5. UNKNOWN source status never becomes visible (fail closed)", () => {
  for (const bad of ["quarantined", "shadow", "DELETED", "0", "unknown"]) {
    assert.equal(mapPostStatusToMirrorModeration(bad), null, bad);
    assert.equal(buildSocialPostMirrorRecord("p-x", {...restaurantPost, status: bad}), null, bad);
  }
  // and the known mapping is exact
  assert.equal(mapPostStatusToMirrorModeration(undefined), "visible");
  assert.equal(mapPostStatusToMirrorModeration(""), "visible");
  assert.equal(mapPostStatusToMirrorModeration("active"), "visible");
  assert.equal(mapPostStatusToMirrorModeration("hidden"), "hidden");
  assert.equal(mapPostStatusToMirrorModeration("deleted"), "removed");
});

test("6. ordinary active/user post backward compatibility is intact", () => {
  const rec = buildSocialPostMirrorRecord("p-2", ordinaryPost); // no status field at all
  assert.ok(rec);
  assert.equal(rec!.moderation_status, "visible");
  assert.equal(rec!.author_type, "user");
  assert.equal(rec!.author_uid, "user-1");
  assert.equal(rec!.removed_at, null);
  // a user self-deleted post is non-public in the mirror, with no fabricated time
  const selfDeleted = buildSocialPostMirrorRecord("p-2", {...ordinaryPost, status: "deleted", deletedAt: STAMP});
  assert.equal(selfDeleted!.moderation_status, "removed");
  assert.equal(selfDeleted!.removed_at, null);
});

test("7. restaurant public identity preserved and no merchant UID mirrored", () => {
  const doc = applyUpdate({...restaurantPost, authorUid: MERCHANT_UID}, buildPostModerationUpdate({
    action: "hide", to: "hidden", reason: "policy", requestId: "r1", serverTimestamp: STAMP,
  }));
  const rec = buildSocialPostMirrorRecord("p-1", doc);
  assert.equal(rec!.author_type, "restaurant");
  assert.equal(rec!.canonical_place_id, "canon-1");
  assert.equal(rec!.restaurant_display_name, "Warung Pak Din");
  assert.equal(rec!.author_uid, null);
  assert.equal(JSON.stringify(rec).includes(MERCHANT_UID), false);
});

// ── Corrective D: menu comment current-state markers ──────────────────────

const baseComment = {
  canonicalPlaceId: "canon-1", menuItemId: "menu-1", authorType: "user",
  authorUid: "user-1", text: "Sedap", status: "visible",
};

function moderateComment(doc: Record<string, unknown>, action: "hide" | "remove" | "restore") {
  const decision = decideMenuCommentModeration(action, doc);
  assert.ok(decision.ok, `${action} must be allowed`);
  const update = buildMenuCommentModerationUpdate({
    to: decision.ok ? decision.to : "visible",
    reason: "r", requestId: `q-${action}`, serverTimestamp: STAMP,
  });
  return applyUpdate(doc, update);
}

test("D. visible → hide sets hiddenAt and clears removedAt", () => {
  const hidden = moderateComment(baseComment, "hide");
  assert.equal(hidden.status, "hidden");
  assert.equal(hidden.hiddenAt, STAMP);
  assert.equal(hidden.removedAt, null);
  assert.equal(buildMenuCommentMirrorRecord("c-1", hidden)!.moderation_status, "hidden");
  assert.equal(buildMenuCommentMirrorRecord("c-1", hidden)!.removed_at, null);
});

test("D. hidden → remove sets removedAt and clears hiddenAt", () => {
  const removed = moderateComment(moderateComment(baseComment, "hide"), "remove");
  assert.equal(removed.status, "removed");
  assert.equal(removed.removedAt, STAMP);
  assert.equal(removed.hiddenAt, null, "stale hiddenAt must be cleared");
  const rec = buildMenuCommentMirrorRecord("c-1", removed)!;
  assert.equal(rec.moderation_status, "removed");
  assert.equal(rec.removed_at, "2026-04-04T10:00:00.000Z");
});

test("D. removed → restore clears BOTH markers", () => {
  const restored = moderateComment(moderateComment(baseComment, "remove"), "restore");
  assert.equal(restored.status, "visible");
  assert.equal(restored.removedAt, null);
  assert.equal(restored.hiddenAt, null);
  const rec = buildMenuCommentMirrorRecord("c-1", restored)!;
  assert.equal(rec.moderation_status, "visible");
  assert.equal(rec.removed_at, null);
});

test("D. hidden → restore clears BOTH markers", () => {
  const restored = moderateComment(moderateComment(baseComment, "hide"), "restore");
  assert.equal(restored.hiddenAt, null);
  assert.equal(restored.removedAt, null);
  assert.equal(buildMenuCommentMirrorRecord("c-1", restored)!.moderation_status, "visible");
});

test("D. repeated valid action stays idempotent and identity is untouched", () => {
  const once = moderateComment(baseComment, "hide");
  const twice = moderateComment(once, "hide");
  assert.equal(twice.status, "hidden");
  assert.equal(twice.hiddenAt, STAMP);
  assert.equal(twice.removedAt, null);
  for (const field of ["canonicalPlaceId", "menuItemId", "authorType", "authorUid", "text"]) {
    assert.equal(twice[field], baseComment[field as keyof typeof baseComment], field);
  }
  // unknown comment status fails closed in the mirror too
  assert.equal(mapMenuCommentStatusToMirrorModeration("weird"), null);
  assert.equal(buildMenuCommentMirrorRecord("c-1", {...baseComment, status: "weird"}), null);
});

// ── Corrective C: deterministic collision-safe event id ───────────────────

test("C-A. same exact raw id → same mirrorEventId (deterministic retry)", () => {
  assert.equal(mirrorEventId("social_post", "evt-abc"), mirrorEventId("social_post", "evt-abc"));
});

test("C-B. 'evt/a' vs 'evta' produce DIFFERENT ids (no character stripping)", () => {
  assert.notEqual(mirrorEventId("social_post", "evt/a"), mirrorEventId("social_post", "evta"));
});

test("C-C. long ids sharing the first 180 chars still differ (no truncation)", () => {
  const shared = "x".repeat(180);
  const a = mirrorEventId("menu_comment", `${shared}-alpha`);
  const b = mirrorEventId("menu_comment", `${shared}-beta`);
  assert.notEqual(a, b);
});

test("C-D. Unicode event id is stable and deterministic", () => {
  const u = "évt-🍜-ﬁ";
  assert.equal(mirrorEventId("menu_comment", u), mirrorEventId("menu_comment", u));
  assert.match(mirrorEventId("menu_comment", u)!, /^menu_comment-event-[0-9a-f]{64}$/);
});

test("C-E. entity type namespaces the id", () => {
  assert.notEqual(mirrorEventId("social_post", "evt-1"), mirrorEventId("menu_comment", "evt-1"));
});

test("C-F/G. output is receipt-safe and well under 240 chars", () => {
  const id = mirrorEventId("social_post", "x".repeat(5000))!;
  assert.ok(id.length <= 240);
  assert.equal(id.length, "social_post-event-".length + 64);
  assert.match(id, /^[A-Za-z0-9_-]+$/);
});

test("C-H. missing/blank event id FAILS CLOSED (no timestamp fallback)", () => {
  for (const bad of [undefined, null, "", "   ", 123, {}]) {
    assert.equal(mirrorEventId("social_post", bad), null, String(bad));
  }
});
