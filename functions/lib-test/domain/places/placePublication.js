"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BLOCKED_PLACE_STATUSES = exports.ALLOWED_VERIFICATION_FOR_PUBLICATION = exports.STANDARD_PUBLICATION_COMPLETENESS = exports.MIN_PUBLICATION_COMPLETENESS = void 0;
exports.evaluatePublicationEligibility = evaluatePublicationEligibility;
/** Phase 1.2 — kelayakan penerbitan (helper tulen; TIADA tulisan). */
const common_1 = require("./common");
/** Ambang minimum completeness untuk terbit (PDF §10.2: < 0.60 = tahan). */
exports.MIN_PUBLICATION_COMPLETENESS = 0.6;
/** >= 0.80 = terbitan standard; 0.60–0.79 = perlu label unknown + kelulusan. */
exports.STANDARD_PUBLICATION_COMPLETENESS = 0.8;
exports.ALLOWED_VERIFICATION_FOR_PUBLICATION = [
    "source_verified",
    "merchant_verified",
    "admin_verified",
    "community_reported",
];
exports.BLOCKED_PLACE_STATUSES = [
    "permanently_closed",
    "hidden_by_admin",
    "pending_validation",
    "stale_critical",
];
function identityComplete(place) {
    return ((0, common_1.isNonEmptyString)(place.identity.canonicalName) &&
        (0, common_1.isNonEmptyString)(place.identity.normalizedName));
}
function isMergedAway(place) {
    const m = place.mergeState;
    return (m.mergeStatus === "merged" ||
        m.mergeStatus === "superseded" ||
        (0, common_1.isNonEmptyString)(m.duplicateOf));
}
/**
 * Nilai kelayakan terbit. Layak HANYA bila: published + verification
 * dibenarkan + status tidak disekat + identiti lengkap + lokasi sah + tidak
 * digabung + completeness >= ambang. Semua ambang ialah pemalar (bukan nombor
 * ajaib tersembunyi).
 */
function evaluatePublicationEligibility(place) {
    const reasons = [];
    const warnings = [];
    if (place.publicationStatus !== "published")
        reasons.push("not_published");
    if (place.verificationStatus === "rejected") {
        reasons.push("verification_rejected");
    }
    else if (!exports.ALLOWED_VERIFICATION_FOR_PUBLICATION.includes(place.verificationStatus)) {
        reasons.push("verification_not_allowed");
    }
    if (exports.BLOCKED_PLACE_STATUSES.includes(place.status)) {
        reasons.push("status_blocked");
    }
    if (place.status === "community_unverified") {
        warnings.push("community_evidence_only");
    }
    if (!identityComplete(place))
        reasons.push("identity_incomplete");
    if (!(0, common_1.isValidLatLng)(place.location.lat, place.location.lng)) {
        reasons.push("location_invalid");
    }
    if (isMergedAway(place))
        reasons.push("merged_into_other");
    const overall = place.completeness.overallScore;
    if (overall < exports.MIN_PUBLICATION_COMPLETENESS) {
        reasons.push("completeness_below_threshold");
    }
    else if (overall < exports.STANDARD_PUBLICATION_COMPLETENESS) {
        warnings.push("completeness_needs_labels");
    }
    if (place.verificationStatus === "community_reported") {
        warnings.push("community_evidence_only");
    }
    if (place.hours.hoursState !== "known")
        warnings.push("hours_unknown");
    if (place.commercial.priceState === "unknown")
        warnings.push("price_unknown");
    return {
        eligible: reasons.length === 0,
        reasons: Array.from(new Set(reasons)),
        warnings: Array.from(new Set(warnings)),
    };
}
