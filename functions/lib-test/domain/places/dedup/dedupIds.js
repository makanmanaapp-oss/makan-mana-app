"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pairKey = pairKey;
exports.duplicateCandidateId = duplicateCandidateId;
/**
 * Phase 1.4 — ID pasangan duplikat deterministik (idempotency).
 * Susunan rekod terbalik menghasilkan identiti pasangan SAMA; versi config
 * berbeza menghasilkan ID berbeza.
 */
const hashing_1 = require("../staging/hashing");
/** Kunci pasangan tak-berarah (diisih supaya (A,B) === (B,A)). */
function pairKey(idA, idB) {
    return [idA, idB].sort().join("::");
}
function duplicateCandidateId(idA, idB, algorithmVersion, configVersion) {
    const digest = (0, hashing_1.hashCanonical)({
        pair: pairKey(idA, idB),
        algo: algorithmVersion,
        config: configVersion,
    });
    return `dup_${digest.slice(0, 32)}`;
}
