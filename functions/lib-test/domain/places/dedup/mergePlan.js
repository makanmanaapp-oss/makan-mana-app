"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MERGE_PLAN_STATUS = void 0;
exports.buildMergePlan = buildMergePlan;
exports.canTransitionMergePlan = canTransitionMergePlan;
exports.assertValidMergePlanTransition = assertValidMergePlanTransition;
const hashing_1 = require("../staging/hashing");
exports.MERGE_PLAN_STATUS = [
    "draft",
    "review_required",
    "approved",
    "executed_in_emulator",
    "cancelled",
    "rolled_back",
];
/**
 * Bina pelan merge yang MENGEKALKAN setiap sourcePlaceId sebagai alias ke
 * target (tiada rujukan pengguna pecah) + semua source refs + metadata boleh
 * balik. Status awal "draft". TIDAK melaksanakan apa-apa terhadap produksi.
 */
function buildMergePlan(input) {
    const preservedAliases = [...input.aliases];
    for (const sid of input.sourcePlaceIds) {
        if (sid === input.targetCanonicalPlaceId)
            continue;
        if (!preservedAliases.some((a) => a.aliasId === sid)) {
            preservedAliases.push({
                aliasId: sid,
                canonicalPlaceId: input.targetCanonicalPlaceId,
                aliasType: "merged_from",
                createdAt: input.now,
                reason: "merge_source_preserved",
            });
        }
    }
    const reversibleMetadata = {
        originalSourceIds: [...input.sourcePlaceIds],
        originalAliases: [...input.aliases],
        originalSourceRefs: [...input.sourceRefs],
        snapshotHash: (0, hashing_1.hashCanonical)({
            sourceIds: [...input.sourcePlaceIds].sort(),
            target: input.targetCanonicalPlaceId,
        }),
    };
    return {
        mergePlanId: input.mergePlanId,
        sourcePlaceIds: [...input.sourcePlaceIds],
        targetCanonicalPlaceId: input.targetCanonicalPlaceId,
        preservedAliases,
        preservedSourceRefs: [...input.sourceRefs],
        fieldResolutionPlan: input.fieldResolutionPlan ?? [],
        tagResolutionPlan: input.tagResolutionPlan ?? [],
        mediaResolutionPlan: input.mediaResolutionPlan ?? [],
        provenanceResolutionPlan: input.provenanceResolutionPlan ?? [],
        conflictList: input.conflictList ?? [],
        auditEntries: [],
        createdBy: input.createdBy,
        createdAt: input.now,
        reversibleMetadata,
        status: "draft",
    };
}
const ALLOWED_PLAN = {
    draft: ["review_required", "cancelled"],
    review_required: ["approved", "cancelled"],
    approved: ["executed_in_emulator", "cancelled"],
    executed_in_emulator: ["rolled_back"],
    cancelled: [],
    rolled_back: [],
};
function canTransitionMergePlan(from, to) {
    if (from === to)
        return false;
    return (ALLOWED_PLAN[from] ?? []).includes(to);
}
function assertValidMergePlanTransition(from, to) {
    if (!canTransitionMergePlan(from, to)) {
        throw new Error(`invalid merge plan transition: ${from} -> ${to}`);
    }
}
