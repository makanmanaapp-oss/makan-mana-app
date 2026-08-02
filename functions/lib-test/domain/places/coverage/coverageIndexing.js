"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REASON_TO_MUTATION = exports.COVERAGE_REMOVAL_REASONS = exports.INDEXING_DENY_REASONS = void 0;
exports.evaluateIndexingDecision = evaluateIndexingDecision;
exports.buildMembership = buildMembership;
const displayState_1 = require("../publication/displayState");
const coverageCell_1 = require("./coverageCell");
const coverageMembership_1 = require("./coverageMembership");
const geohash_1 = require("./geohash");
/** Sebab keahlian DITOLAK (kanonikal, bebas bahasa). */
exports.INDEXING_DENY_REASONS = [
    "publication_not_active_head",
    "publication_status_not_published",
    "publication_not_eligible",
    "business_status_not_public",
    "permanently_closed",
    "merged_or_superseded_alias",
    "critical_freshness_blocked",
    "invalid_location",
];
/**
 * Keputusan TULEN: bolehkah penerbitan ini masuk ke liputan awam?
 *
 * Menolak: draft, needs_review, approved-belum-terbit, hidden, superseded,
 * rejected, tutup kekal, alias digabung, dan penerbitan yang disekat oleh
 * freshness kritikal yang luput.
 */
function evaluateIndexingDecision(head, version, location, ctx) {
    const denyReasons = [];
    const place = version.snapshot.place;
    // 1. Mesti kepala AKTIF bagi kedai ini.
    if (!head || head.activePublicationId !== version.publicationId) {
        denyReasons.push("publication_not_active_head");
    }
    // 2. Status penerbitan mesti "published" — draft/needs_review/approved/
    //    hidden/stale/rejected/superseded semuanya ditolak di sini.
    if (version.publicationStatus !== "published") {
        denyReasons.push("publication_status_not_published");
    }
    // 3. Snapshot kelayakan mesti lulus.
    if (!version.eligibilitySnapshot.eligible) {
        denyReasons.push("publication_not_eligible");
    }
    // 4. Freshness kritikal yang luput menyekat keahlian.
    if (version.eligibilitySnapshot.criticalExpiredFieldIds.length > 0) {
        denyReasons.push("critical_freshness_blocked");
    }
    // 5. Alias digabung/superseded tidak pernah menjadi keahlian bebas.
    const merge = place.mergeState;
    if (ctx.mergedIntoPlaceId !== undefined ||
        merge.mergeStatus === "merged" ||
        merge.mergeStatus === "superseded" ||
        (merge.duplicateOf !== undefined && merge.duplicateOf.length > 0)) {
        denyReasons.push("merged_or_superseded_alias");
    }
    // 6. Keadaan perniagaan mesti boleh dipaparkan kepada orang awam.
    const business = (0, displayState_1.deriveBusinessDisplayState)(place.status);
    if (place.status === "permanently_closed") {
        denyReasons.push("permanently_closed");
    }
    else if (business.blockedFromPublic) {
        denyReasons.push("business_status_not_public");
    }
    // 7. Koordinat mesti sah (sel diterbitkan daripadanya).
    if (!Number.isFinite(location.lat) ||
        !Number.isFinite(location.lng) ||
        location.lat < -90 ||
        location.lat > 90 ||
        location.lng < -180 ||
        location.lng > 180) {
        denyReasons.push("invalid_location");
    }
    const indexable = denyReasons.length === 0;
    const eligibilityState = !indexable
        ? "blocked"
        : version.eligibilitySnapshot.warnings.length > 0
            ? "eligible_with_warnings"
            : "eligible";
    return {
        indexable,
        denyReasons: Array.from(new Set(denyReasons)),
        eligibilityState,
        // Tutup sementara boleh diindeks tetapi BUKAN cadangan utama (peraturan 8).
        primarySuggestionEligible: indexable && business.eligibleAsPrimarySuggestion,
    };
}
/**
 * Bina rekod keahlian daripada penerbitan aktif. TULEN.
 * `contentHash` mengecualikan `indexedAt`/`coverageVersion`, jadi
 * pengindeksan semula kandungan yang sama adalah IDEMPOTEN.
 */
function buildMembership(version, location, decision, ctx, coverageVersion) {
    const resolution = ctx.resolution ?? geohash_1.DEFAULT_CELL_RESOLUTION;
    const homeCellId = (0, coverageCell_1.getCoverageCellId)(location.lat, location.lng, resolution);
    const searchableCellIds = (0, coverageCell_1.getSearchableCellIds)(homeCellId);
    const placeStatus = version.snapshot.place.status;
    const core = {
        placeId: version.placeId,
        publicationId: version.publicationId,
        publicationVersion: version.versionNumber,
        homeCellId,
        searchableCellIds,
        lat: location.lat,
        lng: location.lng,
        placeStatus,
        eligibilityState: decision.eligibilityState,
        sourcePublicationHash: version.contentHash,
    };
    return {
        ...core,
        contentHash: (0, coverageMembership_1.membershipContentHash)(core),
        indexedAt: ctx.now,
        coverageVersion,
    };
}
// ---------------------------------------------------------------------------
// Part G — sebab buang / indeks semula
// ---------------------------------------------------------------------------
exports.COVERAGE_REMOVAL_REASONS = [
    "publication_superseded",
    "rollback_executed",
    "hidden",
    "restored",
    "permanently_closed",
    "moved",
    "merge_executed",
    "critical_freshness_expired",
    "location_corrected",
    "tag_set_changed",
];
/** Petakan sebab liputan → jenis mutasi versi (Part E). */
exports.REASON_TO_MUTATION = {
    publication_superseded: "publication_superseded",
    rollback_executed: "rollback_executed",
    hidden: "place_hidden",
    restored: "place_restored",
    permanently_closed: "place_permanently_closed",
    moved: "place_moved",
    merge_executed: "merge_executed",
    critical_freshness_expired: "critical_freshness_blocked",
    location_corrected: "place_moved",
    tag_set_changed: "tag_coverage_changed",
};
