"use strict";
/**
 * Phase 1.3 — enum staging (union string immutable).
 *
 * ADDITIVE. Data staging TIDAK PERNAH menjadi awam automatik dan TIDAK PERNAH
 * ditulis ke place_registry. Nilai enum = ID kanonikal bebas bahasa.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAGING_AUDIT_ACTION = exports.REVIEW_DECISION_TYPE = exports.STAGING_REVIEW_STATUS = exports.BATCH_PROCESSING_STATUS = void 0;
/** Status pemprosesan satu batch import. */
exports.BATCH_PROCESSING_STATUS = [
    "created",
    "parsing",
    "parsed",
    "validating",
    "ready_for_review",
    "partially_failed",
    "failed",
    "completed",
    "cancelled",
];
/** Status semakan satu rekod staging. */
exports.STAGING_REVIEW_STATUS = [
    "imported",
    "normalizing",
    "validation_failed",
    "needs_review",
    "duplicate_candidate",
    "approved",
    "rejected",
    "merged",
    "split_required",
    "cancelled",
];
/** Jenis keputusan semakan admin. */
exports.REVIEW_DECISION_TYPE = [
    "approve",
    "reject",
    "request_changes",
    "mark_duplicate",
    "merge_into_existing",
    "split_record",
    "cancel",
];
/** Tindakan audit staging (append-only). */
exports.STAGING_AUDIT_ACTION = [
    "imported",
    "normalized",
    "validation_failed",
    "validation_passed",
    "assigned",
    "edited",
    "approved",
    "rejected",
    "marked_duplicate",
    "merged",
    "reopened",
    "cancelled",
];
