"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXECUTION_REFUSAL_CODES = void 0;
exports.executeMigrationPlanInEmulator = executeMigrationPlanInEmulator;
exports.resetAuditSequenceForTests = resetAuditSequenceForTests;
const migrationAlias_1 = require("./migrationAlias");
const migrationCandidate_1 = require("./migrationCandidate");
const migrationCheckpoint_1 = require("./migrationCheckpoint");
const migrationPlan_1 = require("./migrationPlan");
const rollbackPlan_1 = require("./rollbackPlan");
const referenceRewrite_1 = require("./referenceRewrite");
exports.EXECUTION_REFUSAL_CODES = [
    "plan_not_executable",
    "dry_run_incomplete",
    "checkpoint_corrupt",
    "non_emulator_target",
];
function refuse(code, checkpoint) {
    return {
        ok: false,
        refusalCode: code,
        canonicalRecords: [],
        aliases: [],
        rewrites: [],
        heldCandidateIds: [],
        skippedAlreadyProcessed: [],
        checkpoint,
        rollbackPlan: null,
        audit: [],
        wroteProductionData: false,
        deletedLegacyData: false,
    };
}
let auditSequence = 0;
function audit(action, at, fields) {
    auditSequence += 1;
    return {
        auditId: `MAU-${String(auditSequence).padStart(8, "0")}`,
        action,
        actorType: "system",
        reasonCode: "emulator_execution",
        at,
        ...fields,
    };
}
/**
 * Laksanakan pelan dalam emulator.
 *
 * Idempoten: calon yang sudah direkodkan dalam checkpoint dilangkau, jadi
 * menjalankan semula fungsi ini dengan checkpoint yang sama tidak menghasilkan
 * rekod pendua.
 */
function executeMigrationPlanInEmulator(input, now) {
    const { plan, checkpoint } = input;
    // --- Prasyarat -----------------------------------------------------------
    if (plan.targetCollectionMode !== "emulator_only") {
        return refuse("non_emulator_target", checkpoint);
    }
    if (plan.status === "draft" || plan.status === "dry_run_ready") {
        return refuse("dry_run_incomplete", checkpoint);
    }
    if (!(0, migrationPlan_1.planIsExecutable)(plan)) {
        return refuse("plan_not_executable", checkpoint);
    }
    const integrity = (0, migrationCheckpoint_1.verifyCheckpoint)(checkpoint);
    if (!integrity.ok) {
        return refuse("checkpoint_corrupt", checkpoint);
    }
    const existingCanonical = new Set(input.existingCanonicalIds ?? []);
    const canonicalRecords = [];
    const aliases = [];
    const rewrites = [];
    const heldCandidateIds = [];
    const skippedAlreadyProcessed = [];
    const entries = [
        audit("emulator_execution_started", now, { migrationPlanId: plan.migrationPlanId }),
    ];
    let workingCheckpoint = checkpoint;
    const planCandidateIds = new Set(plan.candidateIds);
    const ordered = [...input.candidates].sort((a, b) => a.candidateId.localeCompare(b.candidateId));
    for (const candidate of ordered) {
        if (!planCandidateIds.has(candidate.candidateId))
            continue;
        // Idempotensi: jangan sekali-kali laksanakan calon yang sama dua kali.
        if (workingCheckpoint.processedCandidateIds.includes(candidate.candidateId)) {
            skippedAlreadyProcessed.push(candidate.candidateId);
            continue;
        }
        // Calon yang ditahan TIDAK PERNAH dilaksanakan.
        if (!(0, migrationCandidate_1.candidateIsExecutable)(candidate)) {
            heldCandidateIds.push(candidate.candidateId);
            workingCheckpoint = (0, migrationCheckpoint_1.recordCandidate)(workingCheckpoint, candidate.candidateId, "held", now);
            entries.push(audit("candidate_held", now, {
                migrationPlanId: plan.migrationPlanId,
                candidateId: candidate.candidateId,
                reasonCode: candidate.holdReasons.join(",") || "not_ready",
            }));
            continue;
        }
        // --- Cipta rekod canonical emulator ------------------------------------
        if (!existingCanonical.has(candidate.proposedCanonicalPlaceId)) {
            canonicalRecords.push({
                canonicalPlaceId: candidate.proposedCanonicalPlaceId,
                candidateId: candidate.candidateId,
                migrationPlanId: plan.migrationPlanId,
                displayName: candidate.proposedCanonicalSnapshot.canonicalName,
                lat: candidate.proposedCanonicalSnapshot.lat,
                lng: candidate.proposedCanonicalSnapshot.lng,
                address: candidate.proposedCanonicalSnapshot.address,
                emulatorOnly: true,
                published: false,
                active: true,
                createdAt: now,
            });
            existingCanonical.add(candidate.proposedCanonicalPlaceId);
            entries.push(audit("emulator_canonical_created", now, {
                migrationPlanId: plan.migrationPlanId,
                candidateId: candidate.candidateId,
                canonicalPlaceId: candidate.proposedCanonicalPlaceId,
            }));
        }
        // --- Aktifkan alias ----------------------------------------------------
        for (const alias of plan.aliasesToCreate.filter((a) => a.canonicalPlaceId === candidate.proposedCanonicalPlaceId)) {
            aliases.push((0, migrationAlias_1.activateAlias)(alias));
            entries.push(audit("emulator_alias_created", now, {
                migrationPlanId: plan.migrationPlanId,
                candidateId: candidate.candidateId,
                canonicalPlaceId: alias.canonicalPlaceId,
                legacyPlaceId: alias.legacyValue,
            }));
        }
        // --- Tulis semula rujukan (emulator sahaja, nilai legasi dikekalkan) ----
        for (const rewrite of plan.referenceRewritePlan.filter((r) => r.canonicalPlaceId === candidate.proposedCanonicalPlaceId)) {
            rewrites.push((0, referenceRewrite_1.markRewriteAppliedInEmulator)(rewrite));
            entries.push(audit("emulator_reference_rewritten", now, {
                migrationPlanId: plan.migrationPlanId,
                candidateId: candidate.candidateId,
                legacyPlaceId: rewrite.legacyPlaceId,
                canonicalPlaceId: rewrite.canonicalPlaceId,
            }));
        }
        workingCheckpoint = (0, migrationCheckpoint_1.recordCandidate)(workingCheckpoint, candidate.candidateId, "succeeded", now);
        entries.push(audit("checkpoint_written", now, {
            migrationPlanId: plan.migrationPlanId,
            candidateId: candidate.candidateId,
        }));
    }
    workingCheckpoint = (0, migrationCheckpoint_1.completeCheckpoint)(workingCheckpoint, now);
    const rollbackPlan = (0, rollbackPlan_1.buildRollbackPlan)({
        rollbackPlanId: plan.rollbackPlanId,
        migrationPlanId: plan.migrationPlanId,
        createdCanonicalIds: canonicalRecords.map((r) => r.canonicalPlaceId),
        createdAliases: aliases,
        rewrites,
    }, now);
    entries.push(audit("rollback_prepared", now, { migrationPlanId: plan.migrationPlanId }), audit("emulator_execution_completed", now, {
        migrationPlanId: plan.migrationPlanId,
    }));
    return {
        ok: true,
        refusalCode: null,
        canonicalRecords,
        aliases,
        rewrites,
        heldCandidateIds,
        skippedAlreadyProcessed,
        checkpoint: workingCheckpoint,
        rollbackPlan,
        audit: entries,
        wroteProductionData: false,
        deletedLegacyData: false,
    };
}
/** Tetapkan semula pembilang audit (ujian sahaja — menjaga ID deterministik). */
function resetAuditSequenceForTests() {
    auditSequence = 0;
}
