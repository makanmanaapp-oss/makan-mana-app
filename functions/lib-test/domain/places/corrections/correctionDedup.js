"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RATE_LIMIT_REASONS = exports.DEFAULT_CORRECTION_LIMITS = void 0;
exports.withCorrectionLimits = withCorrectionLimits;
exports.proposalHash = proposalHash;
exports.dedupKeyFor = dedupKeyFor;
exports.isOpenStatus = isOpenStatus;
exports.findOpenDuplicate = findOpenDuplicate;
exports.evaluateRateLimit = evaluateRateLimit;
exports.rateLimitKey = rateLimitKey;
const hashing_1 = require("../staging/hashing");
const correctionTypes_1 = require("./correctionTypes");
exports.DEFAULT_CORRECTION_LIMITS = {
    maxOpenReportsPerUser: 10,
    maxReportsPerPlacePerDay: 5,
    maxEvidenceItems: 8,
    maxDescriptionLength: 1000,
    maxDraftAgeMs: 30 * 24 * 60 * 60 * 1000,
    cooldownSeconds: 60,
    minDescriptionLength: 10,
};
function withCorrectionLimits(overrides) {
    return { ...exports.DEFAULT_CORRECTION_LIMITS, ...overrides };
}
/**
 * Hash kanonikal bagi nilai yang dicadangkan. Susunan kunci tidak penting;
 * senarai diisih supaya cadangan yang sama secara semantik menghasilkan hash
 * yang sama.
 */
function proposalHash(proposal) {
    const normalized = {};
    for (const key of Object.keys(proposal).sort()) {
        const value = proposal[key];
        if (value === undefined)
            continue;
        normalized[key] = Array.isArray(value) ? [...value].map(String).sort() : value;
    }
    return (0, hashing_1.hashCanonical)(normalized);
}
/**
 * Kunci identiti dedup: kedai + kategori + medan terjejas + pelapor +
 * hash cadangan + versi skema. Sengaja TIDAK mengandungi masa.
 */
function dedupKeyFor(input) {
    return (0, hashing_1.hashCanonical)({
        placeId: input.placeId,
        category: input.category,
        affectedFields: [...input.affectedFields].sort(),
        submittedBy: input.submittedBy,
        proposal: proposalHash(input.proposal),
        schemaVersion: input.schemaVersion ?? correctionTypes_1.CORRECTION_SCHEMA_VERSION,
    }).slice(0, 32);
}
function isOpenStatus(status) {
    return correctionTypes_1.OPEN_SUBMISSION_STATUSES.includes(status);
}
/**
 * Cari penghantaran TERBUKA sedia ada dengan identiti dedup yang sama.
 * Penghantaran yang ditarik balik / ditolak / diselesaikan TIDAK menyekat
 * laporan sah pada masa hadapan.
 */
function findOpenDuplicate(existing, dedupKey) {
    const match = existing.find((s) => s.dedupKey === dedupKey && isOpenStatus(s.status));
    return { existing: match, isDuplicate: match !== undefined };
}
exports.RATE_LIMIT_REASONS = [
    "max_open_reports_per_user_exceeded",
    "max_reports_per_place_per_day_exceeded",
    "cooldown_active",
];
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Nilai had kadar. TULEN — `now` disuntik dan sejarah dibekalkan pemanggil.
 */
function evaluateRateLimit(input, limits = exports.DEFAULT_CORRECTION_LIMITS) {
    const reasons = [];
    let retryAfter;
    const mine = input.userSubmissions.filter((s) => s.submittedBy === input.submittedBy);
    const open = mine.filter((s) => isOpenStatus(s.status));
    if (open.length >= limits.maxOpenReportsPerUser) {
        reasons.push("max_open_reports_per_user_exceeded");
    }
    const sameePlaceToday = mine.filter((s) => s.placeId === input.placeId && input.now - s.submittedAt < DAY_MS);
    if (sameePlaceToday.length >= limits.maxReportsPerPlacePerDay) {
        reasons.push("max_reports_per_place_per_day_exceeded");
        const oldest = Math.min(...sameePlaceToday.map((s) => s.submittedAt));
        retryAfter = oldest + DAY_MS;
    }
    const lastSubmittedAt = mine.reduce((max, s) => Math.max(max, s.submittedAt), 0);
    if (lastSubmittedAt > 0) {
        const nextAllowed = lastSubmittedAt + limits.cooldownSeconds * 1000;
        if (input.now < nextAllowed) {
            reasons.push("cooldown_active");
            retryAfter = retryAfter === undefined ? nextAllowed : Math.min(retryAfter, nextAllowed);
        }
    }
    return { allowed: reasons.length === 0, reasons, retryAfter };
}
/** Kunci baris had kadar (untuk storan emulator). */
function rateLimitKey(submittedBy, placeId) {
    return `rl_${(0, hashing_1.hashCanonical)({ submittedBy, placeId }).slice(0, 32)}`;
}
