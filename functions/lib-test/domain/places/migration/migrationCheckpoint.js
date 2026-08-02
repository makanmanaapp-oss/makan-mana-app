"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkpointId = checkpointId;
exports.checkpointChecksum = checkpointChecksum;
exports.createCheckpoint = createCheckpoint;
exports.recordCandidate = recordCandidate;
exports.pauseCheckpoint = pauseCheckpoint;
exports.resumeCheckpoint = resumeCheckpoint;
exports.completeCheckpoint = completeCheckpoint;
exports.verifyCheckpoint = verifyCheckpoint;
exports.markCheckpointCorrupt = markCheckpointCorrupt;
exports.remainingCandidates = remainingCandidates;
const hashing_1 = require("../staging/hashing");
/** ID checkpoint deterministik: satu checkpoint bagi setiap pelan + kelompok. */
function checkpointId(migrationPlanId, batchId) {
    return `CKP-${(0, hashing_1.hashCanonical)({ migrationPlanId, batchId }).slice(0, 24)}`;
}
/**
 * Checksum melindungi integriti checkpoint. Ia meliputi identiti pelan dan
 * SET calon yang telah diproses (diisih) — bukan susunan atau masa.
 */
function checkpointChecksum(input) {
    return (0, hashing_1.hashCanonical)({
        migrationPlanId: input.migrationPlanId,
        batchId: input.batchId,
        processedCandidateIds: [...input.processedCandidateIds].sort(),
        succeededCount: input.succeededCount,
        heldCount: input.heldCount,
        failedCount: input.failedCount,
    });
}
function createCheckpoint(migrationPlanId, batchId, now) {
    const base = {
        migrationPlanId,
        batchId,
        processedCandidateIds: [],
        succeededCount: 0,
        heldCount: 0,
        failedCount: 0,
    };
    return {
        checkpointId: checkpointId(migrationPlanId, batchId),
        ...base,
        lastProcessedCandidateId: null,
        processedCount: 0,
        checksum: checkpointChecksum(base),
        status: "pending",
        createdAt: now,
        updatedAt: now,
    };
}
/**
 * Rekod satu calon. Memainkan semula calon yang sama tidak mengubah apa-apa —
 * inilah yang menjadikan pelaksanaan berulang idempoten.
 */
function recordCandidate(checkpoint, candidateId, outcome, now) {
    if (checkpoint.processedCandidateIds.includes(candidateId)) {
        return checkpoint;
    }
    const processedCandidateIds = [...checkpoint.processedCandidateIds, candidateId];
    const succeededCount = checkpoint.succeededCount + (outcome === "succeeded" ? 1 : 0);
    const heldCount = checkpoint.heldCount + (outcome === "held" ? 1 : 0);
    const failedCount = checkpoint.failedCount + (outcome === "failed" ? 1 : 0);
    return {
        ...checkpoint,
        lastProcessedCandidateId: candidateId,
        processedCandidateIds,
        processedCount: processedCandidateIds.length,
        succeededCount,
        heldCount,
        failedCount,
        checksum: checkpointChecksum({
            migrationPlanId: checkpoint.migrationPlanId,
            batchId: checkpoint.batchId,
            processedCandidateIds,
            succeededCount,
            heldCount,
            failedCount,
        }),
        status: "running",
        updatedAt: now,
    };
}
function pauseCheckpoint(checkpoint, now) {
    return { ...checkpoint, status: "paused", updatedAt: now };
}
function resumeCheckpoint(checkpoint, now) {
    return { ...checkpoint, status: "running", updatedAt: now };
}
function completeCheckpoint(checkpoint, now) {
    return { ...checkpoint, status: "completed", updatedAt: now };
}
/**
 * Sahkan integriti checkpoint. Checksum yang tidak sepadan bermakna checkpoint
 * telah diusik atau rosak — kita GAGAL DENGAN SELAMAT dan bukannya menyambung
 * semula ke atas keadaan yang tidak dipercayai.
 */
function verifyCheckpoint(checkpoint) {
    const expected = checkpointChecksum({
        migrationPlanId: checkpoint.migrationPlanId,
        batchId: checkpoint.batchId,
        processedCandidateIds: checkpoint.processedCandidateIds,
        succeededCount: checkpoint.succeededCount,
        heldCount: checkpoint.heldCount,
        failedCount: checkpoint.failedCount,
    });
    if (expected !== checkpoint.checksum) {
        return { ok: false, reason: "checksum_mismatch" };
    }
    if (checkpoint.processedCount !== checkpoint.processedCandidateIds.length) {
        return { ok: false, reason: "processed_count_mismatch" };
    }
    const tallied = checkpoint.succeededCount + checkpoint.heldCount + checkpoint.failedCount;
    if (tallied !== checkpoint.processedCount) {
        return { ok: false, reason: "outcome_tally_mismatch" };
    }
    return { ok: true, reason: null };
}
function markCheckpointCorrupt(checkpoint, now) {
    return { ...checkpoint, status: "corrupt", updatedAt: now };
}
/** Calon yang masih perlu diproses (sambung semula bermula di sini). */
function remainingCandidates(checkpoint, allCandidateIds) {
    const done = new Set(checkpoint.processedCandidateIds);
    return allCandidateIds.filter((id) => !done.has(id));
}
