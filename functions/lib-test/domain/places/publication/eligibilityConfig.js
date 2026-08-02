"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ELIGIBILITY_CONFIG = exports.PUBLISHABLE_VERIFICATION_STATUSES = exports.NON_PUBLISHABLE_PLACE_STATUSES = exports.DEFAULT_ELIGIBILITY_THRESHOLDS = exports.REQUIRED_ACTIONS = exports.WARNING_REASONS = exports.BLOCKING_REASONS = exports.ELIGIBILITY_ENGINE_VERSION = exports.PUBLICATION_CONFIG_VERSION = exports.PUBLICATION_ALGORITHM_VERSION = void 0;
exports.withEligibilityOverrides = withEligibilityOverrides;
exports.PUBLICATION_ALGORITHM_VERSION = "publication_v1";
exports.PUBLICATION_CONFIG_VERSION = "publication_config_v1";
exports.ELIGIBILITY_ENGINE_VERSION = "eligibility_v1";
/** Kod sebab MENYEKAT (kanonikal, bebas bahasa). */
exports.BLOCKING_REASONS = [
    "not_approved",
    "invalid_business_status",
    "permanently_closed",
    "merged_or_superseded_alias",
    "missing_stable_identity",
    "invalid_location",
    "below_minimum_completeness",
    "unresolved_duplicate",
    "unresolved_safety_conflict",
    "expired_critical_freshness",
    "missing_required_provenance",
    "invalid_or_unapproved_tags",
    "invalid_media_fallback_state",
    "verification_rejected",
    "verification_not_allowed",
];
/** Kod AMARAN (layak terbit, tetapi kad mesti melabelnya jujur). */
exports.WARNING_REASONS = [
    "unknown_price",
    "estimated_price",
    "unknown_hours",
    "stale_rating",
    "low_review_evidence",
    "community_reported_status",
    "incomplete_allergen_data",
    "inferred_tags",
    "completeness_needs_labels",
    "stale_non_critical_field",
    "halal_evidence_recheck",
];
/** Tindakan yang diperlukan untuk membuka sekatan. */
exports.REQUIRED_ACTIONS = [
    "approve_record",
    "resolve_duplicate",
    "resolve_safety_conflict",
    "refresh_critical_fields",
    "improve_completeness",
    "attach_provenance",
    "fix_location",
    "fix_identity",
    "review_tags",
    "review_media",
    "revalidate_verification",
];
exports.DEFAULT_ELIGIBILITY_THRESHOLDS = {
    minCompleteness: 0.6,
    standardCompleteness: 0.8,
    minReviewCountForStrongEvidence: 10,
    minTagConfidenceForApproved: 0.5,
    // Dasar lalai: waktu tidak diketahui ialah AMARAN jujur, bukan sekatan —
    // kad memaparkan "waktu tidak diketahui" dan tidak mengira open_now.
    unknownHoursBlocksPublication: false,
    unknownPriceBlocksPublication: false,
    requiredProvenanceFields: ["displayName", "coordinates"],
};
/** Status perniagaan yang TIDAK boleh diterbitkan. */
exports.NON_PUBLISHABLE_PLACE_STATUSES = [
    "permanently_closed",
    "hidden_by_admin",
    "pending_validation",
    "stale_critical",
    "moved",
];
/** Verification yang dibenarkan untuk penerbitan. */
exports.PUBLISHABLE_VERIFICATION_STATUSES = [
    "source_verified",
    "merchant_verified",
    "admin_verified",
    "community_reported",
];
exports.DEFAULT_ELIGIBILITY_CONFIG = {
    thresholds: exports.DEFAULT_ELIGIBILITY_THRESHOLDS,
    nonPublishableStatuses: exports.NON_PUBLISHABLE_PLACE_STATUSES,
    publishableVerifications: exports.PUBLISHABLE_VERIFICATION_STATUSES,
    algorithmVersion: exports.PUBLICATION_ALGORITHM_VERSION,
    configVersion: exports.PUBLICATION_CONFIG_VERSION,
    engineVersion: exports.ELIGIBILITY_ENGINE_VERSION,
};
/** Bina konfigurasi ubahsuai tanpa mengubah lalai. */
function withEligibilityOverrides(overrides, base = exports.DEFAULT_ELIGIBILITY_CONFIG) {
    return { ...base, thresholds: { ...base.thresholds, ...overrides } };
}
