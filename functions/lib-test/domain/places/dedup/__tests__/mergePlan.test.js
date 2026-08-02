"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
const sourceRefs = [
    { sourceType: "provider", sourceRecordId: "prov_1", providerPlaceId: "ChIJ_x" },
    { sourceType: "owner_upload", sourceRecordId: "owner_1" },
];
const existingAliases = [
    { aliasId: "ChIJ_x", canonicalPlaceId: "mm_1", aliasType: "google_place_id", createdAt: fixtures_1.T, reason: "legacy" },
];
function plan() {
    return (0, index_1.buildMergePlan)({
        mergePlanId: "mp_1",
        sourcePlaceIds: ["mm_1", "mm_2", "mm_3"],
        targetCanonicalPlaceId: "mm_1",
        aliases: existingAliases,
        sourceRefs,
        createdBy: "admin_1",
        now: fixtures_1.T,
    });
}
// 21. Merge plan preserves all source refs.
(0, node_test_1.default)("merge plan preserves all source refs", () => {
    const p = plan();
    strict_1.default.deepEqual(p.preservedSourceRefs, sourceRefs);
    strict_1.default.deepEqual(p.reversibleMetadata.originalSourceRefs, sourceRefs);
});
// 22. Merge plan preserves aliases (each non-target source becomes an alias).
(0, node_test_1.default)("merge plan preserves aliases", () => {
    const p = plan();
    // Alias sedia ada dikekalkan.
    strict_1.default.ok(p.preservedAliases.some((a) => a.aliasId === "ChIJ_x"));
    // Setiap sumber bukan-target menjadi alias merged_from → target.
    for (const sid of ["mm_2", "mm_3"]) {
        const alias = p.preservedAliases.find((a) => a.aliasId === sid);
        strict_1.default.ok(alias, `alias for ${sid}`);
        strict_1.default.equal(alias.canonicalPlaceId, "mm_1");
        strict_1.default.equal(alias.aliasType, "merged_from");
    }
    // Target sendiri tidak menjadi alias.
    strict_1.default.ok(!p.preservedAliases.some((a) => a.aliasId === "mm_1" && a.aliasType === "merged_from"));
    // Metadata boleh balik disimpan.
    strict_1.default.deepEqual(p.reversibleMetadata.originalSourceIds, ["mm_1", "mm_2", "mm_3"]);
    strict_1.default.ok(p.reversibleMetadata.snapshotHash.length > 0);
    strict_1.default.equal(p.status, "draft");
});
// State machine pelan merge.
(0, node_test_1.default)("merge plan transitions are guarded", () => {
    strict_1.default.equal((0, index_1.canTransitionMergePlan)("draft", "review_required"), true);
    strict_1.default.equal((0, index_1.canTransitionMergePlan)("review_required", "approved"), true);
    strict_1.default.equal((0, index_1.canTransitionMergePlan)("approved", "executed_in_emulator"), true);
    strict_1.default.equal((0, index_1.canTransitionMergePlan)("executed_in_emulator", "rolled_back"), true);
    // Dilarang lompat.
    strict_1.default.equal((0, index_1.canTransitionMergePlan)("draft", "approved"), false);
    strict_1.default.equal((0, index_1.canTransitionMergePlan)("draft", "executed_in_emulator"), false);
    strict_1.default.throws(() => (0, index_1.assertValidMergePlanTransition)("draft", "executed_in_emulator"));
});
