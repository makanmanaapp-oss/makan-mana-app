"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeDuplicateScore = computeDuplicateScore;
/** Phase 1.4 — skor duplikat berpemberat + penalti (rujuk PDF §8.2). */
const common_1 = require("../common");
const config_1 = require("./config");
function num(v) {
    return typeof v === "boolean" ? (v ? 1 : 0) : v;
}
function computeDuplicateScore(signals, config = config_1.DEFAULT_DEDUP_CONFIG) {
    const w = config.weights;
    const base = w.providerId * num(signals.exactProviderIdMatch.value) +
        w.verifiedPhone * num(signals.verifiedPhoneMatch.value) +
        w.geoProximity * num(signals.geoProximity.value) +
        w.nameSimilarity * num(signals.normalizedNameSimilarity.value) +
        w.addressSimilarity * num(signals.addressSimilarity.value) +
        w.websiteMatch * num(signals.websiteDomainMatch.value);
    const p = config.penalties;
    const branchConflict = num(signals.differentBranchIndicator.value) ? p.branchConflict : 0;
    const coordinateConflict = num(signals.coordinateConflict.value) ? p.coordinateConflict : 0;
    const phoneConflict = num(signals.phoneConflict.value) ? p.phoneConflict : 0;
    const addressConflict = num(signals.addressConflict.value) ? p.addressConflict : 0;
    const total = branchConflict + coordinateConflict + phoneConflict + addressConflict;
    return {
        baseScore: Math.round(base * 1000) / 1000,
        penalties: { branchConflict, coordinateConflict, phoneConflict, addressConflict, total },
        adjustedScore: (0, common_1.clamp01)(Math.round((base - total) * 1000) / 1000),
    };
}
