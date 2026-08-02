"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COVERAGE_POOL_SOURCES = exports.MEMBERSHIP_ELIGIBILITY_STATES = void 0;
exports.membershipId = membershipId;
exports.membershipContentHash = membershipContentHash;
exports.coveragePoolId = coveragePoolId;
const hashing_1 = require("../staging/hashing");
/** Keadaan kelayakan keahlian (dari snapshot kelayakan Phase 1.6). */
exports.MEMBERSHIP_ELIGIBILITY_STATES = [
    "eligible",
    "eligible_with_warnings",
    "blocked",
];
/** ID keahlian deterministik — satu keahlian aktif per kedai. */
function membershipId(placeId) {
    return `mem_${(0, hashing_1.hashCanonical)({ placeId }).slice(0, 32)}`;
}
/**
 * Hash kandungan keahlian. Sengaja MENGECUALIKAN `indexedAt` dan
 * `coverageVersion` supaya pengindeksan semula kandungan yang sama adalah
 * IDEMPOTEN (Part F: "create or update membership idempotently").
 */
function membershipContentHash(m) {
    return (0, hashing_1.hashCanonical)({
        placeId: m.placeId,
        publicationId: m.publicationId,
        publicationVersion: m.publicationVersion,
        homeCellId: m.homeCellId,
        searchableCellIds: [...m.searchableCellIds].sort(),
        lat: m.lat,
        lng: m.lng,
        placeStatus: m.placeStatus,
        eligibilityState: m.eligibilityState,
        sourcePublicationHash: m.sourcePublicationHash,
    });
}
// ---------------------------------------------------------------------------
// Part D — kontrak kolam liputan
// ---------------------------------------------------------------------------
exports.COVERAGE_POOL_SOURCES = [
    "approved_database",
    "approved_cache",
    "partial_coverage",
    "empty_coverage",
];
/** ID kolam deterministik daripada sel + versi liputannya. */
function coveragePoolId(cellIds, coverageVersions) {
    const digest = (0, hashing_1.hashCanonical)({
        cells: [...cellIds].sort(),
        versions: coverageVersions,
    });
    return `pool_${digest.slice(0, 32)}`;
}
