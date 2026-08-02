"use strict";
/**
 * Phase 1.2 — enum canonical (union string immutable) untuk domain place.
 *
 * NILAI DISIMPAN = ID kanonikal bebas bahasa. JANGAN guna label terjemah
 * sebagai nilai enum. Setiap kumpulan mengeksport array runtime (`as const`)
 * untuk pengesahan + jenis union yang diterbitkan darinya.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HALAL_EVIDENCE_STATE = exports.CARD_SOURCE_MODE = exports.MERGE_STATUS = exports.MEDIA_STATUS = exports.HOURS_STATE = exports.FRESHNESS_STATE = exports.EVIDENCE_LEVEL = exports.SOURCE_TYPE = exports.PUBLICATION_STATUS = exports.VERIFICATION_STATUS = exports.PLACE_STATUS = void 0;
exports.PLACE_STATUS = [
    "active",
    "temporarily_closed",
    "permanently_closed",
    "moved",
    "pending_validation",
    "hidden_by_admin",
    "stale_critical",
    "community_unverified",
];
exports.VERIFICATION_STATUS = [
    "unverified",
    "source_verified",
    "merchant_verified",
    "community_reported",
    "admin_verified",
    "rejected",
];
exports.PUBLICATION_STATUS = [
    "draft",
    "needs_review",
    "approved",
    "published",
    "stale",
    "hidden",
    "rejected",
    "superseded",
];
exports.SOURCE_TYPE = [
    "provider",
    "owner_upload",
    "merchant",
    "community",
    "makanmana",
    "licensed_dataset",
];
exports.EVIDENCE_LEVEL = [
    "verified",
    "reported",
    "inferred",
    "unknown",
];
exports.FRESHNESS_STATE = [
    "fresh",
    "aging",
    "stale",
    "expired",
    "unknown",
];
exports.HOURS_STATE = [
    "known",
    "unknown",
    "expired",
    "temporarily_closed",
    "permanently_closed",
];
exports.MEDIA_STATUS = [
    "pending",
    "approved",
    "rejected",
    "unavailable",
    "fallback",
];
exports.MERGE_STATUS = [
    "none",
    "possible_duplicate",
    "review_required",
    "merged",
    "superseded",
    "split_required",
];
exports.CARD_SOURCE_MODE = [
    "live",
    "approved_cache",
    "community",
    "sample",
];
exports.HALAL_EVIDENCE_STATE = [
    "certified",
    "merchant_claimed",
    "community_reported",
    "unknown",
    "possible_non_halal",
];
