"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLIENT_SETTABLE_STATUSES = exports.CLIENT_FORBIDDEN_SUBMISSION_FIELDS = exports.AUDIT_ACTOR_TYPES = exports.CORRECTION_AUDIT_ACTIONS = exports.OPEN_SUBMISSION_STATUSES = exports.SUBMISSION_STATUSES = exports.EVIDENCE_STATUSES = exports.EVIDENCE_TYPES = exports.CORRECTABLE_FIELDS = exports.REPORT_CATEGORIES = exports.REPORT_SOURCE_MODES = exports.REPORT_SEVERITIES = exports.SUBMISSION_TYPES = exports.CORRECTION_ALGORITHM_VERSION = exports.CORRECTION_SCHEMA_VERSION = void 0;
exports.CORRECTION_SCHEMA_VERSION = "correction_schema_v1";
exports.CORRECTION_ALGORITHM_VERSION = "correction_v1";
// ---------------------------------------------------------------------------
// Part A — jenis penghantaran
// ---------------------------------------------------------------------------
exports.SUBMISSION_TYPES = [
    "correction",
    "safety_report",
    "closure_report",
    "moved_report",
    "duplicate_place_report",
    "inappropriate_content",
    "image_report",
    "menu_price_report",
    "hours_report",
    "contact_report",
    "location_report",
    "halal_evidence_report",
    "allergen_information_report",
    "general_report",
];
exports.REPORT_SEVERITIES = ["low", "medium", "high", "critical"];
/** Mod sumber yang dilihat pengguna semasa melaporkan. */
exports.REPORT_SOURCE_MODES = ["live", "approved_cache", "community", "sample"];
// ---------------------------------------------------------------------------
// Part B — kategori laporan
// ---------------------------------------------------------------------------
exports.REPORT_CATEGORIES = [
    "wrong_name",
    "wrong_address",
    "wrong_coordinates",
    "wrong_phone",
    "wrong_website",
    "wrong_hours",
    "wrong_price",
    "wrong_rating_source",
    "permanently_closed",
    "temporarily_closed",
    "moved_location",
    "duplicate_place",
    "wrong_cuisine",
    "wrong_place_type",
    "wrong_halal_status",
    "unsafe_halal_claim",
    "wrong_allergen_information",
    "unsafe_allergen_claim",
    "wrong_dietary_information",
    "wrong_image",
    "inappropriate_image",
    "spam_or_fake_place",
    "other",
];
/** Medan yang boleh dicadangkan oleh pengguna (Part E). */
exports.CORRECTABLE_FIELDS = [
    "displayName",
    "address",
    "coordinates",
    "phone",
    "website",
    "openingHours",
    "price",
    "businessStatus",
    "halalEvidence",
    "dietaryEvidence",
    "allergenEvidence",
    "cuisineTagIds",
    "placeTypeTagIds",
    "imageRemovalRequest",
    "duplicateTargetPlaceId",
    "movedToCoordinates",
    "notes",
];
// ---------------------------------------------------------------------------
// Part C — bukti
// ---------------------------------------------------------------------------
exports.EVIDENCE_TYPES = [
    "photo",
    "receipt",
    "menu_photo",
    "storefront_photo",
    "certificate_photo",
    "map_screenshot",
    "website_link",
    "official_document",
    "user_observation",
    "merchant_statement",
    "community_statement",
    "other",
];
exports.EVIDENCE_STATUSES = [
    "submitted",
    "pending_review",
    "accepted",
    "rejected",
    "insufficient",
    "expired",
    "superseded",
];
// ---------------------------------------------------------------------------
// Part F — status penghantaran
// ---------------------------------------------------------------------------
exports.SUBMISSION_STATUSES = [
    "draft",
    "submitted",
    "validation_failed",
    "queued",
    "under_review",
    "needs_more_evidence",
    "duplicate_report",
    "accepted_for_staging",
    "rejected",
    "withdrawn",
    "resolved",
    "superseded",
];
/** Status yang dianggap "terbuka" untuk tujuan dedup & had kadar. */
exports.OPEN_SUBMISSION_STATUSES = [
    "submitted",
    "queued",
    "under_review",
    "needs_more_evidence",
];
// ---------------------------------------------------------------------------
// Part U — audit
// ---------------------------------------------------------------------------
exports.CORRECTION_AUDIT_ACTIONS = [
    "draft_created",
    "submitted",
    "validation_failed",
    "queued",
    "assigned",
    "review_started",
    "evidence_added",
    "more_evidence_requested",
    "duplicate_detected",
    "duplicate_confirmed",
    "field_accepted",
    "field_rejected",
    "accepted_for_staging",
    "rejected",
    "withdrawn",
    "resolved",
    "reopened",
    "staging_reference_created",
];
exports.AUDIT_ACTOR_TYPES = ["reporter", "trusted_reviewer", "system"];
/**
 * Medan yang TIDAK PERNAH boleh datang daripada klien. Digunakan oleh
 * pengesahan untuk menolak penghantaran yang cuba menetapkan keadaan
 * dipercayai.
 */
exports.CLIENT_FORBIDDEN_SUBMISSION_FIELDS = [
    "assignedReviewer",
    "reviewedBy",
    "reviewedAt",
    "decision",
    "decisionReason",
    "stagingProposalId",
    "duplicateOfSubmissionId",
    "auditTrail",
];
/** Status yang boleh ditetapkan sendiri oleh pelapor. */
exports.CLIENT_SETTABLE_STATUSES = [
    "draft",
    "submitted",
    "withdrawn",
];
