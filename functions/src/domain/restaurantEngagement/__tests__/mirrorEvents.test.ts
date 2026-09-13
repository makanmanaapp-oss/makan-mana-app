import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  isRestaurantPostDocument,
  mirrorEventId,
  tombstoneMenuCommentRecord,
  tombstoneSocialPostRecord,
} from "../mirrorEvents";
import {
  buildMenuCommentMirrorRecord,
  buildSocialPostMirrorRecord,
} from "../mirrorPayload";

const MERCHANT_UID = "merchant-uid-MUST-NEVER-MIRROR";
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const triggers = read("src/triggers/onEngagementMirrorWrite.ts");
const reconciler = read("src/controlCenter/socialEngagementMirrorSync.ts");
const transport = read("src/controlCenter/mirrorEventPush.ts");

// Required test 5 — a restaurant post event creates a social_post mirror payload.
test("5. restaurant post event produces a social_post mirror payload", () => {
  const doc = {
    postType: "restaurant_post", authorType: "restaurant", authorUid: null,
    canonicalPlaceId: "canon-1", displayName: "Warung Pak Din",
    visibility: "public", text: "Promo hari ini",
  };
  assert.equal(isRestaurantPostDocument(doc), true);
  const rec = buildSocialPostMirrorRecord("post-1", doc);
  assert.ok(rec);
  assert.equal(rec!.author_type, "restaurant");
  assert.equal(rec!.canonical_place_id, "canon-1");
  assert.ok(triggers.includes('entityType: "social_post"'));
});

// Required test 6 — an ordinary user post event is ignored.
test("6. ordinary user post events are ignored by the mirror trigger", () => {
  assert.equal(isRestaurantPostDocument({postType: "food_post", authorUid: "user-1"}), false);
  assert.equal(isRestaurantPostDocument({postType: "checkin", authorUid: "user-1"}), false);
  assert.equal(isRestaurantPostDocument({}), false);
  assert.equal(isRestaurantPostDocument(null), false);
  // the trigger returns before doing any work when the gate fails
  assert.ok(triggers.includes("if (!isRestaurantPostDocument(source)) return;"));
});

// Required test 7 — a restaurant post moderation update produces a mirror update.
// NOTE: the mirror reads the AUTHORITATIVE fields the moderation receiver
// actually writes (`status`, `moderationRemovedAt`) — never an invented
// `moderationStatus`. The full end-to-end proof (real buildPostModerationUpdate
// merged into the doc) lives in mirrorStateAlignment.test.ts.
test("7. restaurant post moderation update is reflected in the mirror payload", () => {
  const base = {postType: "restaurant_post", canonicalPlaceId: "canon-1", displayName: "W", text: "x"};
  assert.equal(buildSocialPostMirrorRecord("post-1", {...base, status: "hidden"})!.moderation_status, "hidden");
  const removed = buildSocialPostMirrorRecord("post-1", {
    ...base, status: "deleted", moderationRemovedAt: new Date("2026-02-02T00:00:00.000Z"),
  });
  assert.equal(removed!.moderation_status, "removed");
  assert.equal(removed!.removed_at, "2026-02-02T00:00:00.000Z");
  // an unknown authoritative status is rejected rather than shown as visible
  assert.equal(buildSocialPostMirrorRecord("post-1", {...base, status: "quarantined"}), null);
});

// Required test 8 — menu comment create produces a menu_comment mirror payload.
test("8. menu comment event produces a menu_comment mirror payload", () => {
  const rec = buildMenuCommentMirrorRecord("c-1", {
    canonicalPlaceId: "canon-1", menuItemId: "menu-1", authorType: "user",
    text: "Sedap", status: "visible",
  });
  assert.ok(rec);
  assert.equal(rec!.firebase_comment_id, "c-1");
  assert.equal(rec!.author_type, "user");
  assert.ok(triggers.includes('entityType: "menu_comment"'));
});

// Required test 9 — official restaurant reply carries no merchant actor UID.
test("9. official restaurant reply mirror contains no merchant actor UID", () => {
  const rec = buildMenuCommentMirrorRecord("c-2", {
    canonicalPlaceId: "canon-1", menuItemId: "menu-1", authorType: "restaurant",
    restaurantId: "canon-1", authorUid: MERCHANT_UID, actingMerchantUid: MERCHANT_UID,
    text: "Terima kasih", status: "visible",
  });
  assert.equal(rec!.author_type, "restaurant");
  assert.equal(JSON.stringify(rec).includes(MERCHANT_UID), false);
  assert.equal("author_uid" in (rec as object), false);
});

// Required test 10 — menu comment moderation update produces the new status.
test("10. menu comment moderation transitions propagate through the mirror payload", () => {
  for (const status of ["visible", "hidden", "removed"]) {
    const rec = buildMenuCommentMirrorRecord("c-3", {
      canonicalPlaceId: "canon-1", menuItemId: "menu-1", authorType: "user",
      text: "x", status,
    });
    assert.equal(rec!.moderation_status, status);
  }
});

// Required test 11 — duplicate event delivery is idempotent.
test("11. a redelivered event yields the same mirror eventId (idempotent)", () => {
  const a = mirrorEventId("menu_comment", "evt-abc-123");
  const b = mirrorEventId("menu_comment", "evt-abc-123");
  assert.equal(a, b);
  // deterministic sha256 of the EXACT raw id, namespaced by entity type
  assert.match(a!, /^menu_comment-event-[0-9a-f]{64}$/);
  // distinct events and distinct datasets never collide
  assert.notEqual(mirrorEventId("menu_comment", "evt-1"), mirrorEventId("menu_comment", "evt-2"));
  assert.notEqual(mirrorEventId("menu_comment", "evt-1"), mirrorEventId("social_post", "evt-1"));
  assert.ok(a!.length <= 240);
  // no character stripping / truncation can collapse distinct ids
  assert.notEqual(mirrorEventId("social_post", "evt/../weird id"), mirrorEventId("social_post", "evtweirdid"));
  // missing id fails closed (no fabricated fallback)
  assert.equal(mirrorEventId("social_post", ""), null);
  assert.ok(triggers.includes("if (!eventId) throw new Error("));
});

// Required test 12 — sender-side receipt contract must remain deterministic.
// The receiver-side conflicting-payload/hash enforcement belongs to the private
// Control Center migration suite. This repository must never depend on a sibling
// checkout path, because unit CI runs from a standalone clone.
test("12. the same raw event keeps the same receipt id and transport fails closed on receiver rejection", () => {
  const eventId = mirrorEventId("social_post", "evt-conflict-1");
  assert.ok(eventId);
  assert.equal(eventId, mirrorEventId("social_post", "evt-conflict-1"));
  assert.notEqual(eventId, mirrorEventId("social_post", "evt-conflict-2"));
  assert.ok(transport.includes("eventId: params.eventId"));
  assert.ok(transport.includes("records: params.records"));
  assert.ok(transport.includes("if (!response.ok)"));
  assert.ok(transport.includes("Control Center engagement mirror rejected"));
});

// Required tests 13/14 — reconciliation remains (now drift repair only).
test("13/14. scheduled and manual reconcilers still exist and stay restaurant-scoped", () => {
  assert.ok(reconciler.includes("export const syncSocialEngagementToControlCenter = onRequest("));
  assert.ok(reconciler.includes("export const syncSocialEngagementToControlCenterEvery5Hours = onSchedule("));
  assert.ok(reconciler.includes('schedule: "every 5 hours"'));
  assert.ok(reconciler.includes('.where("postType", "==", RESTAURANT_POST_TYPE)'));
});

// Required test 15 — one social mirror sync secret only.
test("15. CONTROL_CENTER_SYNC_SECRET is the only social mirror sync secret", () => {
  for (const src of [triggers, reconciler, transport]) {
    const secrets = src.match(/defineSecret\("([A-Z_]+)"\)/g) ?? [];
    for (const s of secrets) assert.equal(s, 'defineSecret("CONTROL_CENTER_SYNC_SECRET")');
  }
  // exactly one definition, shared by both paths
  assert.equal((transport.match(/defineSecret\(/g) ?? []).length, 1);
  assert.equal((triggers.match(/defineSecret\(/g) ?? []).length, 0);
  assert.equal((reconciler.match(/defineSecret\(/g) ?? []).length, 0);
  // one endpoint + one transport, owned solely by the shared push module
  assert.equal((transport.match(/CONTROL_CENTER_MIRROR_URL\s*=/g) ?? []).length, 1);
  assert.ok(transport.includes("api/internal/sync/mirror"));
  for (const src of [triggers, reconciler]) {
    assert.equal(/CONTROL_CENTER_MIRROR_URL\s*=/.test(src), false, "must not define a second endpoint");
    assert.equal(/\bfetch\(/.test(src), false, "must not open a second transport");
    assert.ok(src.includes("pushMirrorBatch("), "must reuse the shared transport");
  }
});

test("a mirror failure never mutates the authoritative Firestore document", () => {
  // The triggers only read snapshots and push; they must never write Firestore.
  assert.equal(/\.set\(|\.update\(|\.delete\(|runTransaction/.test(triggers), false);
  assert.ok(triggers.includes("throw new Error(\"CONTROL_CENTER_SYNC_SECRET is unavailable.\")"));
});

test("hard-delete is handled fail-safely as a schema-supported tombstone", () => {
  const post = buildSocialPostMirrorRecord("p-1", {postType: "restaurant_post", canonicalPlaceId: "c", displayName: "W", text: "x"});
  const tombPost = tombstoneSocialPostRecord(post!, "2026-03-03T00:00:00.000Z");
  assert.equal(tombPost.moderation_status, "removed");
  assert.equal(tombPost.removed_at, "2026-03-03T00:00:00.000Z");

  const comment = buildMenuCommentMirrorRecord("c-1", {canonicalPlaceId: "c", menuItemId: "m", authorType: "user", text: "x"});
  const tombComment = tombstoneMenuCommentRecord(comment!, "2026-03-03T00:00:00.000Z");
  assert.equal(tombComment.moderation_status, "removed");
  // an existing removed_at is preserved rather than overwritten
  assert.equal(tombstoneMenuCommentRecord({...comment!, removed_at: "2026-01-01T00:00:00.000Z"}, "2026-03-03T00:00:00.000Z").removed_at, "2026-01-01T00:00:00.000Z");
  assert.ok(triggers.includes("tombstoneSocialPostRecord(record"));
  assert.ok(triggers.includes("tombstoneMenuCommentRecord(record"));
});