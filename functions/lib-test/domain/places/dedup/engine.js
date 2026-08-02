"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDuplicateCandidate = buildDuplicateCandidate;
const config_1 = require("./config");
const duplicateSignals_1 = require("./duplicateSignals");
const duplicateDecision_1 = require("./duplicateDecision");
const dedupIds_1 = require("./dedupIds");
const duplicateCandidate_1 = require("./duplicateCandidate");
/**
 * Bina calon duplikat deterministik & idempoten. ID pasangan tidak berarah,
 * jadi susunan rekod terbalik → ID sama.
 */
function buildDuplicateCandidate(input) {
    const config = input.config ?? config_1.DEFAULT_DEDUP_CONFIG;
    const signals = (0, duplicateSignals_1.computeSignals)(input.a, input.b, config);
    const decision = (0, duplicateDecision_1.evaluateDuplicateDecision)(signals, config);
    const idB = input.comparedStagingRecordId ?? input.comparedPlaceId ?? "";
    const id = (0, dedupIds_1.duplicateCandidateId)(input.stagingRecordId, idB, config.algorithmVersion, config.configVersion);
    return {
        duplicateCandidateId: id,
        stagingRecordId: input.stagingRecordId,
        comparedPlaceId: input.comparedPlaceId,
        comparedStagingRecordId: input.comparedStagingRecordId,
        signalSet: signals,
        duplicateScore: decision.score,
        decision: decision.decision,
        reviewStatus: (0, duplicateCandidate_1.initialReviewStatus)(decision.decision),
        reasons: decision.reasons,
        warnings: decision.warnings,
        generatedAt: input.now,
        algorithmVersion: config.algorithmVersion,
        configVersion: config.configVersion,
    };
}
