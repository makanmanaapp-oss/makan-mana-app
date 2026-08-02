"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPTY_COVERAGE_VERSION = exports.COVERAGE_MUTATION_KINDS = exports.COVERAGE_ALGORITHM_VERSION = void 0;
exports.coverageVersionFromMembers = coverageVersionFromMembers;
exports.applyCoverageMutation = applyCoverageMutation;
exports.calculateCoverageVersion = calculateCoverageVersion;
exports.combinedCoverageVersion = combinedCoverageVersion;
/**
 * Phase 1.7 Part E — VERSI LIPUTAN DETERMINISTIK.
 *
 * Reka bentuk: versi ialah HASH bagi SET keahlian yang berkesan bagi sel,
 * bukan kaunter berasaskan jam. Sifat yang diperoleh:
 *
 * - IDEMPOTEN: mutasi yang sama diguna dua kali → versi sama.
 * - BEBAS SUSUNAN: set placeId yang sama dalam susunan berbeza → versi sama.
 * - SENSITIF KANDUNGAN: set keahlian berbeza → versi berbeza.
 * - TIADA perubahan versi hanya kerana masa berlalu (bukan wall-clock).
 * - Boleh digunakan terus sebagai sebahagian kunci cache (Part M).
 *
 * PDF §5.3: "Coverage version berubah apabila place published, hidden, merged
 * atau moved" — semua itu mengubah set keahlian, jadi ia mengubah hash.
 */
const hashing_1 = require("../staging/hashing");
exports.COVERAGE_ALGORITHM_VERSION = "coverage_v1";
/** Mutasi yang boleh mengubah liputan (rujuk Part E senarai). */
exports.COVERAGE_MUTATION_KINDS = [
    "publication_activated",
    "publication_superseded",
    "rollback_executed",
    "place_hidden",
    "place_restored",
    "place_permanently_closed",
    "place_moved",
    "merge_executed",
    "tag_coverage_changed",
    "media_changed",
    "critical_freshness_blocked",
];
/** Versi bagi sel KOSONG (deterministik, dikongsi semua sel kosong). */
exports.EMPTY_COVERAGE_VERSION = coverageVersionFromMembers([]);
/**
 * Kira versi liputan daripada SET ahli. Bebas susunan: ahli diisih mengikut
 * placeId sebelum hashing.
 */
function coverageVersionFromMembers(members) {
    const normalized = [...members]
        .map((m) => ({
        placeId: m.placeId,
        publicationId: m.publicationId,
        publicationVersion: m.publicationVersion,
    }))
        .sort((a, b) => (a.placeId < b.placeId ? -1 : a.placeId > b.placeId ? 1 : 0));
    const digest = (0, hashing_1.hashCanonical)({
        algo: exports.COVERAGE_ALGORITHM_VERSION,
        members: normalized,
    });
    return `cv_${digest.slice(0, 24)}`;
}
/**
 * Terapkan satu mutasi kepada set ahli sedia ada dan pulangkan versi baharu.
 *
 * Mutasi yang MENAMBAH/MENGEMASKINI ahli: `publication_activated`,
 * `place_restored`, `rollback_executed`, `place_moved`, `tag_coverage_changed`,
 * `media_changed` (bila publikasi dibekalkan).
 *
 * Mutasi yang MEMBUANG ahli: `place_hidden`, `place_permanently_closed`,
 * `publication_superseded` (tanpa gantian), `merge_executed`,
 * `critical_freshness_blocked`.
 */
function applyCoverageMutation(members, mutation) {
    const without = members.filter((m) => m.placeId !== mutation.placeId);
    const removes = [
        "place_hidden",
        "place_permanently_closed",
        "merge_executed",
        "critical_freshness_blocked",
    ];
    if (removes.includes(mutation.kind))
        return without;
    if (mutation.kind === "publication_superseded" && !mutation.publicationId) {
        return without;
    }
    if (!mutation.publicationId || mutation.publicationVersion === undefined) {
        // Tiada penerbitan untuk dirujuk → tiada ahli boleh ditambah. Set kekal
        // tanpa kedai ini (jujur: kami tidak mereka rujukan penerbitan).
        return without;
    }
    return [
        ...without,
        {
            placeId: mutation.placeId,
            publicationId: mutation.publicationId,
            publicationVersion: mutation.publicationVersion,
        },
    ];
}
/**
 * Tandatangan yang diminta spesifikasi Part E.
 * `previousVersion` disertakan untuk pengesanan no-op: jika mutasi tidak
 * mengubah set ahli, versi yang SAMA dikembalikan (idempoten).
 */
function calculateCoverageVersion(previousVersion, mutation, members) {
    const next = applyCoverageMutation(members, mutation);
    const version = coverageVersionFromMembers(next);
    return { version, members: next, changed: version !== previousVersion };
}
/**
 * Versi kolam gabungan merentas beberapa sel — digunakan sebagai
 * `publicationPoolVersion` dalam kunci cache (Part M). Bebas susunan sel.
 */
function combinedCoverageVersion(versionsByCell) {
    const digest = (0, hashing_1.hashCanonical)({
        algo: exports.COVERAGE_ALGORITHM_VERSION,
        cells: Object.keys(versionsByCell)
            .sort()
            .map((c) => [c, versionsByCell[c]]),
    });
    return `cpv_${digest.slice(0, 24)}`;
}
