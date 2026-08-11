import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMergePlan,
  canTransitionMergePlan,
  assertValidMergePlanTransition,
} from "../index";
import { PlaceAlias } from "../../placeMerge";
import { SourceReference } from "../../placeSource";
import { T } from "./fixtures";

const sourceRefs: SourceReference[] = [
  { sourceType: "provider", sourceRecordId: "prov_1", providerPlaceId: "ChIJ_x" },
  { sourceType: "owner_upload", sourceRecordId: "owner_1" },
];
const existingAliases: PlaceAlias[] = [
  { aliasId: "ChIJ_x", canonicalPlaceId: "mm_1", aliasType: "google_place_id", createdAt: T, reason: "legacy" },
];

function plan() {
  return buildMergePlan({
    mergePlanId: "mp_1",
    sourcePlaceIds: ["mm_1", "mm_2", "mm_3"],
    targetCanonicalPlaceId: "mm_1",
    aliases: existingAliases,
    sourceRefs,
    createdBy: "admin_1",
    now: T,
  });
}

// 21. Merge plan preserves all source refs.
test("merge plan preserves all source refs", () => {
  const p = plan();
  assert.deepEqual(p.preservedSourceRefs, sourceRefs);
  assert.deepEqual(p.reversibleMetadata.originalSourceRefs, sourceRefs);
});

// 22. Merge plan preserves aliases (each non-target source becomes an alias).
test("merge plan preserves aliases", () => {
  const p = plan();
  // Alias sedia ada dikekalkan.
  assert.ok(p.preservedAliases.some((a) => a.aliasId === "ChIJ_x"));
  // Setiap sumber bukan-target menjadi alias merged_from → target.
  for (const sid of ["mm_2", "mm_3"]) {
    const alias = p.preservedAliases.find((a) => a.aliasId === sid);
    assert.ok(alias, `alias for ${sid}`);
    assert.equal(alias!.canonicalPlaceId, "mm_1");
    assert.equal(alias!.aliasType, "merged_from");
  }
  // Target sendiri tidak menjadi alias.
  assert.ok(!p.preservedAliases.some((a) => a.aliasId === "mm_1" && a.aliasType === "merged_from"));
  // Metadata boleh balik disimpan.
  assert.deepEqual(p.reversibleMetadata.originalSourceIds, ["mm_1", "mm_2", "mm_3"]);
  assert.ok(p.reversibleMetadata.snapshotHash.length > 0);
  assert.equal(p.status, "draft");
});

// State machine pelan merge.
test("merge plan transitions are guarded", () => {
  assert.equal(canTransitionMergePlan("draft", "review_required"), true);
  assert.equal(canTransitionMergePlan("review_required", "approved"), true);
  assert.equal(canTransitionMergePlan("approved", "executed_in_emulator"), true);
  assert.equal(canTransitionMergePlan("executed_in_emulator", "rolled_back"), true);
  // Dilarang lompat.
  assert.equal(canTransitionMergePlan("draft", "approved"), false);
  assert.equal(canTransitionMergePlan("draft", "executed_in_emulator"), false);
  assert.throws(() => assertValidMergePlanTransition("draft", "executed_in_emulator"));
});
