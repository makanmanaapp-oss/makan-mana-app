import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRestaurantFollowDocument,
  decodeRestaurantFollowDocId,
  nextFollowerCount,
  restaurantFollowDocId,
  shouldApplyFollow,
  shouldApplyUnfollow,
} from "../restaurantFollow";

// Required test 9 — follow is idempotent.
test("follow is idempotent (apply only when not already following)", () => {
  assert.equal(shouldApplyFollow(false), true);
  assert.equal(shouldApplyFollow(true), false);
});

// Required test 10 — unfollow is idempotent.
test("unfollow is idempotent (apply only when currently following)", () => {
  assert.equal(shouldApplyUnfollow(true), true);
  assert.equal(shouldApplyUnfollow(false), false);
});

// Required test 11 — follower count can never go below zero.
test("follower count never goes below zero", () => {
  assert.equal(nextFollowerCount(0, -1), 0);
  assert.equal(nextFollowerCount(undefined, -1), 0);
  assert.equal(nextFollowerCount(null, -1), 0);
  assert.equal(nextFollowerCount(1, -1), 0);
  assert.equal(nextFollowerCount(5, -1), 4);
  assert.equal(nextFollowerCount(0, 1), 1);
  assert.equal(nextFollowerCount(-3, 1), 1); // negative base clamps to 0 first
  assert.equal(nextFollowerCount(2.9, 1), 3); // floored base + delta
});

test("follow document is place-scoped and does not embed a restaurant author uid", () => {
  const doc = buildRestaurantFollowDocument("user-1", "canon-1");
  assert.equal(doc.followerUid, "user-1");
  assert.equal(doc.canonicalPlaceId, "canon-1");
  assert.equal(doc.restaurantId, "canon-1");
});

// Fix 3 — the follow doc id must be collision-proof. Both UIDs and canonical
// place ids may contain underscores, so delimiter ambiguity must be impossible.
test("follow doc id cannot collapse through delimiter ambiguity", () => {
  const a = restaurantFollowDocId("a__b", "c");
  const b = restaurantFollowDocId("a", "b__c");
  assert.notEqual(a, b);

  // further ambiguity probes across separator-ish characters
  assert.notEqual(restaurantFollowDocId("a:b", "c"), restaurantFollowDocId("a", "b:c"));
  assert.notEqual(restaurantFollowDocId("a", ""), restaurantFollowDocId("", "a"));
  assert.notEqual(restaurantFollowDocId("a%3Ab", "c"), restaurantFollowDocId("a:b", "c"));
});

test("follow doc id is deterministic and a legal Firestore document id", () => {
  assert.equal(restaurantFollowDocId("user-1", "canon-1"), restaurantFollowDocId("user-1", "canon-1"));
  const ids = [
    restaurantFollowDocId("user-1", "canon-1"),
    restaurantFollowDocId("uid/with/slash", "place/with/slash"),
    restaurantFollowDocId("__weird__", "__place__"),
    restaurantFollowDocId("a b", "c d"),
    restaurantFollowDocId("😀🍜", "canon-1"),
  ];
  for (const id of ids) {
    assert.equal(id.includes("/"), false, `no slash allowed: ${id}`);
    assert.equal(id === "." || id === "..", false);
    assert.equal(/^__.*__$/.test(id), false, `must not match reserved __.*__: ${id}`);
    assert.ok(Buffer.byteLength(id, "utf8") <= 1500);
    assert.ok(id.startsWith("rf."));
    // Base64URL alphabet only (plus the two "." delimiters).
    assert.match(id, /^rf\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*$/);
  }
});

// ── Follow-ID hardening: proof for ALL valid Firebase UIDs, not just ASCII ──

test("worst-case VALID identifiers stay inside Firestore's 1500-byte doc-id limit", () => {
  // A Firebase UID is up to 128 CHARACTERS and is NOT restricted to ASCII, so the
  // worst case is 128 code points that each use 4 UTF-8 bytes.
  const worstUid = "😀".repeat(128); // 128 code points
  assert.equal(Array.from(worstUid).length, 128, "must be 128 code points");
  assert.equal(Buffer.byteLength(worstUid, "utf8"), 512, "worst-case UID is 512 UTF-8 bytes");

  // canonicalPlaceId contract is ASCII: [A-Za-z0-9_:.-]{1,300} → max 300 bytes.
  const worstPlace = ":".repeat(300);
  assert.equal(Buffer.byteLength(worstPlace, "utf8"), 300);

  const id = restaurantFollowDocId(worstUid, worstPlace);
  const bytes = Buffer.byteLength(id, "utf8"); // measured, not hand-calculated
  assert.ok(bytes <= 1500, `worst-case doc id must fit 1500 bytes, measured ${bytes}`);
  assert.equal(id.includes("/"), false);
  assert.notEqual(id, ".");
  assert.notEqual(id, "..");
  assert.equal(/^__.*__$/.test(id), false);
  assert.match(id, /^rf\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

  // Base64URL grows a fixed 4/3, so the bound holds structurally.
  assert.equal(bytes, 3 + Math.ceil(512 * 4 / 3) + 1 + Math.ceil(300 * 4 / 3));
});

test("round-trip: the doc id decodes back to the exact original components", () => {
  const cases: Array<[string, string]> = [
    ["user-1", "canon-1"],                    // ASCII
    ["a__b", "b__c"],                          // underscores
    ["uid:with:colons", "google:ABC:123"],     // colons
    ["ユーザー", "canon-unicode"],               // Unicode UID
    ["😀🍜🇲🇾", "canon-astral"],                 // astral / multi-byte
    ["😀".repeat(128), ":".repeat(300)],        // worst case
    ["uid/with/slash", "place.with.dots"],     // slash + dots
    ["", ""],                                  // empty components stay reversible
  ];
  for (const [uid, place] of cases) {
    const decoded = decodeRestaurantFollowDocId(restaurantFollowDocId(uid, place));
    assert.ok(decoded, `must decode: ${uid} / ${place}`);
    assert.equal(decoded!.followerUid, uid);
    assert.equal(decoded!.canonicalPlaceId, place);
  }
});

test("decoder rejects malformed ids", () => {
  assert.equal(decodeRestaurantFollowDocId("nope"), null);
  assert.equal(decodeRestaurantFollowDocId("rf.only-two"), null);
  assert.equal(decodeRestaurantFollowDocId("xx.YQ.Yg"), null);        // wrong prefix
  assert.equal(decodeRestaurantFollowDocId("rf.YQ.Yg.extra"), null);  // too many parts
  assert.equal(decodeRestaurantFollowDocId("rf.YQ.not+base64url"), null);
});
