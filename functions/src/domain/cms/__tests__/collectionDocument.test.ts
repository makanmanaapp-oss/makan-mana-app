/**
 * WAVE 5 — curated discovery collection contract.
 *
 * The claims that matter: order is the editorial decision and is never
 * re-sorted, duplicates are fixed rather than fatal, no actor identity exists
 * to leak, and the mirror carries oversight data without duplicating runtime
 * content.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  COLLECTION_EDITABLE_FIELDS,
  COLLECTION_MIRROR_ENTITY_TYPE,
  buildCollectionDocument,
  collectionMirrorEventId,
  normalizeRestaurantIds,
  toAdminCollection,
  toCollectionMirrorRecord,
  validateCollectionDescription,
  validateCollectionImagePath,
  validateCollectionTitle,
} from "../collectionDocument";
import {
  CMS_STATUS_ACTIVE,
  CMS_STATUS_DRAFT,
  DEFAULT_TARGETING,
  PLACEMENT_EXPLORE_TOP,
} from "../cmsTypes";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);

function doc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...buildCollectionDocument({
      placement: PLACEMENT_EXPLORE_TOP,
      title: "Best of Puncak Alam",
      description: "Pilihan editor minggu ini",
      imagePath: "cms/collections/puncak.webp",
      canonicalPlaceIds: ["canon-a", "canon-b", "canon-c"],
      targeting: DEFAULT_TARGETING,
      priority: 20,
      startsAtMs: NOW - HOUR,
      endsAtMs: NOW + HOUR,
      status: CMS_STATUS_ACTIVE,
      requestId: "req-abc",
    }),
    createdAtMs: NOW - HOUR,
    updatedAtMs: NOW,
    ...overrides,
  };
}

test("1. mirror entity type matches the Control Center contract", () => {
  assert.equal(COLLECTION_MIRROR_ENTITY_TYPE, "cms_collection");
});

test("2. title and description are validated like every other CMS text", () => {
  assert.equal(validateCollectionTitle("Best of KL").ok, true);
  assert.equal(validateCollectionTitle("  ").error, "title_required");
  assert.equal(validateCollectionTitle("x".repeat(81)).error, "title_too_long");
  assert.equal(validateCollectionTitle("<b>KL</b>").error, "title_markup_not_allowed");
  assert.equal(validateCollectionDescription(undefined).ok, true);
  assert.equal(validateCollectionDescription("x".repeat(241)).error, "description_too_long");
});

test("3. the cover image must live under the prefix this domain owns", () => {
  assert.equal(validateCollectionImagePath("cms/collections/a.webp").ok, true);
  assert.equal(validateCollectionImagePath(undefined).ok, true);
  assert.equal(validateCollectionImagePath("users/private.jpg").error, "image_path_not_allowed");
  assert.equal(validateCollectionImagePath("cms/../users/a.jpg").error, "image_path_not_allowed");
});

test("4. restaurant ORDER is preserved — it is the editorial decision", () => {
  const v = normalizeRestaurantIds(["c", "a", "b"]);
  assert.equal(v.ok, true);
  assert.deepEqual(v.value!.ids, ["c", "a", "b"], "never alphabetised, never re-sorted");
});

test("5. duplicates are deduped and REPORTED, not silently swallowed", () => {
  const v = normalizeRestaurantIds(["a", "b", "a", "c", "b"]);
  assert.deepEqual(v.value!.ids, ["a", "b", "c"]);
  assert.deepEqual(v.value!.duplicates, ["a", "b"],
    "the console must be able to tell the operator what it fixed");
});

test("6. an empty or oversized list is refused", () => {
  assert.equal(normalizeRestaurantIds([]).error, "restaurants_required");
  assert.equal(normalizeRestaurantIds("nope").error, "restaurants_invalid");
  assert.equal(normalizeRestaurantIds([1, 2]).error, "restaurants_invalid");
  assert.equal(normalizeRestaurantIds(["  "]).error, "restaurants_invalid");
  assert.equal(
    normalizeRestaurantIds(Array.from({length: 31}, (_, i) => `r${i}`)).error,
    "restaurants_too_many",
  );
});

test("7. a draft has no publishedAt; a scheduled/active one does", () => {
  const draft: Record<string, unknown> = buildCollectionDocument({
    placement: PLACEMENT_EXPLORE_TOP, title: "t", description: "", imagePath: "",
    canonicalPlaceIds: ["a"], targeting: DEFAULT_TARGETING, priority: 100,
    startsAtMs: NOW, endsAtMs: NOW + HOUR, status: CMS_STATUS_DRAFT, requestId: "r",
  });
  assert.equal(draft.publishedAtMs, null);
  assert.equal(doc().publishedAtMs, NOW - HOUR);
});

test("8. no actor identity exists on a collection document at all", () => {
  const serialized = JSON.stringify(doc());
  for (const leak of ["adminId", "AdminId", "actorAdminId", "uid"]) {
    assert.equal(serialized.includes(leak), false, `document carried ${leak}`);
  }
  // The request id is the correlation handle, and it names no person.
  assert.equal((doc() as Record<string, unknown>).createdByRequestId, "req-abc");
});

test("9. the editable allowlist excludes status and audit", () => {
  for (const forbidden of ["status", "createdByRequestId", "updatedByRequestId",
    "publishedAtMs", "archivedAtMs", "schemaVersion"]) {
    assert.equal((COLLECTION_EDITABLE_FIELDS as readonly string[]).includes(forbidden), false,
      `${forbidden} must not be editable`);
  }
});

test("10. admin projection reports truthful status and a real count", () => {
  const a = toAdminCollection("col-1", doc(), NOW);
  assert.ok(a);
  assert.equal(a!.restaurantCount, 3);
  assert.deepEqual(a!.canonicalPlaceIds, ["canon-a", "canon-b", "canon-c"]);
  assert.equal(a!.status, CMS_STATUS_ACTIVE);

  const expired = toAdminCollection("col-1", doc({
    startsAtMs: NOW - 3 * HOUR, endsAtMs: NOW - HOUR,
  }), NOW);
  assert.equal(expired!.storedStatus, CMS_STATUS_ACTIVE, "intent unchanged");
  assert.equal(expired!.status, "expired", "truth derived from the schedule");
});

test("11. an unusable collection has no projection", () => {
  assert.equal(toAdminCollection("", doc(), NOW), null);
  assert.equal(toAdminCollection("c", null, NOW), null);
  assert.equal(toAdminCollection("c", doc({title: ""}), NOW), null);
  assert.equal(toAdminCollection("c", doc({placement: ""}), NOW), null);
});

test("12. the mirror carries oversight fields and the COUNT, not the list", () => {
  const r = toCollectionMirrorRecord("col-1", doc(), NOW);
  assert.ok(r);
  assert.equal(r!.collection_id, "col-1");
  assert.equal(r!.title, "Best of Puncak Alam");
  assert.equal(r!.placement, "explore_top");
  assert.equal(r!.restaurant_count, 3);
  assert.equal(r!.effective_status, "active");
  assert.equal(r!.last_request_id, "req-abc");
  // The membership list is runtime content owned by Firestore; duplicating it
  // into the operational read model would only create a second copy to drift.
  assert.equal("canonical_place_ids" in (r as object), false);
  assert.equal(JSON.stringify(r).includes("canon-a"), false);
});

test("13. a row the mirror migration would drop is never sent", () => {
  assert.equal(toCollectionMirrorRecord("", doc(), NOW), null);
  assert.equal(toCollectionMirrorRecord("c", doc({title: ""}), NOW), null);
  assert.equal(toCollectionMirrorRecord("c", doc({placement: ""}), NOW), null);
  assert.equal(toCollectionMirrorRecord("c", doc({status: ""}), NOW), null);
});

test("14. mirror event id is stable for the same state, new for a change", () => {
  assert.equal(collectionMirrorEventId("c", NOW), collectionMirrorEventId("c", NOW));
  assert.notEqual(collectionMirrorEventId("c", NOW), collectionMirrorEventId("c", NOW + 1));
  assert.equal(collectionMirrorEventId("c", null), null);
  assert.equal(collectionMirrorEventId("", NOW), null);
});
