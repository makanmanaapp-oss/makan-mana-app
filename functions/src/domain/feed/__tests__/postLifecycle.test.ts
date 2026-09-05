import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  NEW_POST_STATUS,
  classifyLegacyPostStatus,
  isConsumerVisibleStatus,
  newPostLifecycleFields,
} from "../postLifecycle";
import {buildRestaurantPostDocument} from "../../restaurantEngagement/restaurantPost";
import {buildPostModerationUpdate} from "../postModeration";

/**
 * Wave 3C read-boundary closure — section I (new post write contract) and the
 * consumer-visibility half of the four-part invariant.
 *
 * The four ordinary creators build their document as an INLINE literal at the
 * Firestore write site (they need FieldValue tokens), so they are proven the
 * same way the mirror transport is proven elsewhere in this repo: by asserting
 * the actual source at the actual call site. `buildRestaurantPostDocument` is a
 * pure builder and is asserted by running it.
 */

/** Line endings are normalized: firestore.rules is CRLF in this repo. */
const read = (rel: string) =>
  readFileSync(resolve(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
const createFeedPost = read("src/callable/createFeedPost.ts");
const repostFeedPost = read("src/callable/repostFeedPost.ts");
const submitReview = read("src/callable/submitReview.ts");
const onReviewApproved = read("src/triggers/onReviewApproved.ts");
const rules = read("../firestore.rules");

/** The exact text every creator must contain inside its feed_posts payload. */
const BORN_ACTIVE = "...newPostLifecycleFields(),";

/** Extract the object literal passed to `db.collection("feed_posts").add({...})`. */
function feedPostAddPayload(src: string, occurrence = 0): string {
  const parts = src.split('collection("feed_posts").add({');
  assert.ok(parts.length > occurrence + 1, "feed_posts .add({ not found");
  const tail = parts[occurrence + 1];
  // The payload literal ends at the call's closing `});` — none of the four
  // creators nest a call-close inside their document literal.
  const end = tail.indexOf("});");
  assert.ok(end > 0, "could not delimit the payload literal");
  return tail.slice(0, end);
}

// ── 1. The contract module itself ─────────────────────────────────────────

test("1. a new post is born status 'active' and the value is defined once", () => {
  assert.equal(NEW_POST_STATUS, "active");
  assert.deepEqual(newPostLifecycleFields(), {status: "active"});
  // fresh object every call — no shared mutable literal leaking into documents
  assert.notEqual(newPostLifecycleFields(), newPostLifecycleFields());
});

test("2. consumer visibility is EXACTLY 'active' (absent/unknown fail closed)", () => {
  assert.equal(isConsumerVisibleStatus("active"), true);
  for (const bad of [undefined, null, "", "  ", "hidden", "deleted", "ACTIVE", "quarantined", 0, false, {}]) {
    assert.equal(isConsumerVisibleStatus(bad), false, String(bad));
  }
});

test("3. legacy status classification only ever nominates 'missing'", () => {
  assert.equal(classifyLegacyPostStatus(undefined), "missing");
  assert.equal(classifyLegacyPostStatus(null), "missing");
  assert.equal(classifyLegacyPostStatus(""), "missing");
  assert.equal(classifyLegacyPostStatus("   "), "missing");
  assert.equal(classifyLegacyPostStatus("active"), "active");
  assert.equal(classifyLegacyPostStatus("hidden"), "hidden");
  assert.equal(classifyLegacyPostStatus("deleted"), "deleted");
  for (const bad of ["quarantined", "ACTIVE", "Deleted", 7, {}, []]) {
    assert.equal(classifyLegacyPostStatus(bad), "unknown", String(bad));
  }
  // A PADDED value is byte-different from what firestore.rules accepts, so it
  // must be reported as unknown — not silently counted as already-active and
  // then be permanently unreadable after the rules deploy. The classifier is
  // the backfill's only detector for values the rules will reject, so it must
  // mirror the rule (p.get('status','') == 'active') byte for byte.
  for (const padded of [" active", "active ", " active ", "\tactive", "active\n"]) {
    assert.equal(classifyLegacyPostStatus(padded), "unknown", JSON.stringify(padded));
    assert.equal(isConsumerVisibleStatus(padded), false, JSON.stringify(padded));
  }
});

// ── 4-8. Every NEW post creation path writes status 'active' ──────────────

test("4. createFeedPost writes status 'active' inside the feed_posts payload", () => {
  assert.ok(createFeedPost.includes('import {newPostLifecycleFields} from "../domain/feed/postLifecycle";'));
  const payload = feedPostAddPayload(createFeedPost);
  assert.ok(payload.includes(BORN_ACTIVE), "payload must spread newPostLifecycleFields()");
  // and it is the ordinary user path, not a restaurant impersonation
  assert.ok(payload.includes("authorType: AUTHOR_TYPE_USER"));
});

test("5. repostFeedPost writes status 'active' on the NEW repost document", () => {
  assert.ok(repostFeedPost.includes('import {newPostLifecycleFields} from "../domain/feed/postLifecycle";'));
  const payload = feedPostAddPayload(repostFeedPost);
  assert.ok(payload.includes(BORN_ACTIVE));
  // the counter bump on the ORIGINAL post is a different write and must NOT
  // stamp a lifecycle status onto someone else's document
  const counterUpdate = repostFeedPost.split('.doc(originalPostId)')[1]?.split("});")[0] ?? "";
  assert.equal(counterUpdate.includes("newPostLifecycleFields"), false);
  assert.equal(counterUpdate.includes('status:'), false);
});

test("6. submitReview writes status 'active' when sharing a review to the feed", () => {
  assert.ok(submitReview.includes('import {newPostLifecycleFields} from "../domain/feed/postLifecycle";'));
  const payload = feedPostAddPayload(submitReview);
  assert.ok(payload.includes(BORN_ACTIVE));
});

test("7. onReviewApproved writes status 'active' on the published review post", () => {
  assert.ok(onReviewApproved.includes('import {newPostLifecycleFields} from "../domain/feed/postLifecycle";'));
  const payload = feedPostAddPayload(onReviewApproved);
  assert.ok(payload.includes(BORN_ACTIVE));
});

test("8. buildRestaurantPostDocument really returns status 'active'", () => {
  const doc = buildRestaurantPostDocument({
    canonicalPlaceId: "canon-1",
    restaurantDisplayName: "Warung Pak Din",
    text: "Promo hari ini",
    imageUrls: [],
  });
  assert.equal(doc.status, "active");
  assert.equal(isConsumerVisibleStatus(doc.status), true);
  // identity contract from Wave 3B is untouched
  assert.equal(doc.authorUid, null);
  assert.equal(doc.authorType, "restaurant");
  assert.equal(doc.canonicalPlaceId, "canon-1");
});

test("9. EVERY feed_posts creation site is covered — no unlisted creator", () => {
  // If a new creator appears, this count changes and the test fails loudly.
  const creators = [
    ["src/callable/createFeedPost.ts", 1],
    ["src/callable/repostFeedPost.ts", 1],
    ["src/callable/submitReview.ts", 1],
    ["src/triggers/onReviewApproved.ts", 1],
    ["src/callable/createRestaurantPost.ts", 1],
  ] as const;
  for (const [file, expected] of creators) {
    const src = read(file);
    const adds = src.match(/collection\("feed_posts"\)\s*\.?\s*\n?\s*\.add\(/g)
      ?? src.match(/collection\("feed_posts"\)\.add\(/g) ?? [];
    assert.equal(adds.length, expected, `${file} creation-site count`);
  }
  // createRestaurantPost delegates its payload to the pure builder
  const crp = read("src/callable/createRestaurantPost.ts");
  assert.ok(crp.includes("buildRestaurantPostDocument("));
});

// ── 10-12. Lifecycle transitions stay coherent with the read boundary ─────

test("10. moderation hide/remove/restore land on statuses the boundary understands", () => {
  const stamp = {__ts: true};
  const hidden = buildPostModerationUpdate({
    action: "hide", to: "hidden", reason: "policy", requestId: "r1", serverTimestamp: stamp,
  });
  assert.equal(hidden.status, "hidden");
  assert.equal(isConsumerVisibleStatus(hidden.status), false);

  const removed = buildPostModerationUpdate({
    action: "remove", to: "deleted", reason: "abuse", requestId: "r2", serverTimestamp: stamp,
  });
  assert.equal(removed.status, "deleted");
  assert.equal(isConsumerVisibleStatus(removed.status), false);

  const restored = buildPostModerationUpdate({
    action: "restore", to: "active", reason: "appeal", requestId: "r3", serverTimestamp: stamp,
  });
  // restore must write the SAME literal creation uses, or a restored post would
  // stay invisible under the strict rules
  assert.equal(restored.status, NEW_POST_STATUS);
  assert.equal(isConsumerVisibleStatus(restored.status), true);
});

test("11. user self-delete status is not consumer visible", () => {
  const selfDelete = read("src/callable/userContentControl.ts");
  assert.ok(selfDelete.includes('status: "deleted"'));
  assert.equal(isConsumerVisibleStatus("deleted"), false);
});

// ── 12-14. The rules half of the invariant ────────────────────────────────

test("12. firestore.rules enforces EXACTLY 'active' for non-authors", () => {
  assert.ok(rules.includes("function postLifecycleActive(p) {"));
  assert.ok(rules.includes("return p.get('status', '') == 'active';"));
  // the dangerous default must NOT be used for the post read boundary
  assert.equal(
    /function postLifecycleActive\(p\) \{[^}]*get\('status', 'active'\)/.test(rules),
    false,
    "postLifecycleActive must not default an absent status to active",
  );
});

test("13. canReadPostData gates every non-owner branch behind the lifecycle", () => {
  const fn = rules.split("function canReadPostData(p) {")[1]?.split("\n    }")[0] ?? "";
  assert.ok(fn.includes("p.get('authorUid', '') == request.auth.uid"), "author bypass preserved");
  assert.ok(fn.includes("postLifecycleActive(p)"), "lifecycle gate present");
  // the gate is ANDed in front of the visibility branch, not ORed beside it
  assert.ok(/\|\|\s*\(postLifecycleActive\(p\)\s*&&\s*\(vis == 'group_only'/.test(fn));
  assert.ok(fn.includes("vis == 'public' || vis == 'unlisted'"), "visibility contract preserved");
});

test("14. comment protections are not weakened and inherit the lifecycle gate", () => {
  // parent status checks in the comment read rule remain
  assert.ok(rules.includes(".data.get('status', 'active') != 'deleted'"));
  assert.ok(rules.includes(".data.get('status', 'active') != 'hidden'"));
  // both comment surfaces still route through canReadPostData
  assert.ok(rules.includes("function canReadCurrentParent(parentPath) {"));
  const currentParent = rules.split("function canReadCurrentParent(parentPath) {")[1]?.split("\n    }")[0] ?? "";
  assert.ok(currentParent.includes("canReadPostData(p)"));
  // client still cannot create/update a feed post
  assert.ok(rules.includes("allow create, update: if false;"));
});
