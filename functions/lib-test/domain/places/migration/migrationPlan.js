"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canTransitionPlan = canTransitionPlan;
exports.computePlanHash = computePlanHash;
exports.migrationPlanId = migrationPlanId;
exports.planIsExecutable = planIsExecutable;
const hashing_1 = require("../staging/hashing");
const migrationTypes_1 = require("./migrationTypes");
/** Peralihan status pelan yang dibenarkan. */
const PLAN_TRANSITIONS = {
    draft: ["dry_run_ready", "cancelled", "blocked"],
    dry_run_ready: ["dry_run_completed", "blocked", "cancelled"],
    dry_run_completed: ["review_required", "approved_for_emulator", "blocked", "cancelled"],
    review_required: ["approved_for_emulator", "blocked", "cancelled"],
    approved_for_emulator: ["executed_in_emulator", "paused", "cancelled", "blocked"],
    executed_in_emulator: ["rolled_back", "paused"],
    paused: ["approved_for_emulator", "executed_in_emulator", "cancelled", "rolled_back"],
    cancelled: [],
    rolled_back: [],
    blocked: ["draft", "cancelled"],
};
function canTransitionPlan(from, to) {
    return PLAN_TRANSITIONS[from].includes(to);
}
/**
 * Cincang kandungan pelan. SENGAJA mengecualikan cap masa, pengarang dan
 * status supaya dry-run berulang atas data yang sama menghasilkan hash yang
 * sama (idempotensi), sambil kekal sensitif kepada perubahan data legasi.
 */
function computePlanHash(input) {
    return (0, hashing_1.hashCanonical)({
        batchId: input.batchId,
        candidateHashes: [...input.candidateHashes].sort((a, b) => a.candidateId.localeCompare(b.candidateId)),
        aliasKeys: [...input.aliasKeys].sort(),
        rewriteIds: [...input.rewriteIds].sort(),
        targetCollectionMode: input.targetCollectionMode,
        algorithmVersion: migrationTypes_1.MIGRATION_ALGORITHM_VERSION,
        configVersion: migrationTypes_1.MIGRATION_CONFIG_VERSION,
    });
}
/** ID pelan deterministik daripada cincang kandungannya. */
function migrationPlanId(contentHash) {
    return `MPL-${contentHash.slice(0, 24)}`;
}
/**
 * Pelan boleh dilaksanakan HANYA apabila diluluskan untuk emulator dan tiada
 * konflik yang belum diselesaikan.
 */
function planIsExecutable(plan) {
    if (plan.targetCollectionMode !== "emulator_only")
        return false;
    if (plan.status !== "approved_for_emulator" && plan.status !== "paused") {
        return false;
    }
    if (plan.conflicts.length > 0)
        return false;
    return plan.candidateIds.length > 0;
}
