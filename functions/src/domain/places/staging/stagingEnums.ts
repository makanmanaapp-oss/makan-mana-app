/**
 * Phase 1.3 — enum staging (union string immutable).
 *
 * ADDITIVE. Data staging TIDAK PERNAH menjadi awam automatik dan TIDAK PERNAH
 * ditulis ke place_registry. Nilai enum = ID kanonikal bebas bahasa.
 */

/** Status pemprosesan satu batch import. */
export const BATCH_PROCESSING_STATUS = [
  "created",
  "parsing",
  "parsed",
  "validating",
  "ready_for_review",
  "partially_failed",
  "failed",
  "completed",
  "cancelled",
] as const;
export type BatchProcessingStatus = (typeof BATCH_PROCESSING_STATUS)[number];

/** Status semakan satu rekod staging. */
export const STAGING_REVIEW_STATUS = [
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
] as const;
export type StagingReviewStatus = (typeof STAGING_REVIEW_STATUS)[number];

/** Jenis keputusan semakan admin. */
export const REVIEW_DECISION_TYPE = [
  "approve",
  "reject",
  "request_changes",
  "mark_duplicate",
  "merge_into_existing",
  "split_record",
  "cancel",
] as const;
export type ReviewDecisionType = (typeof REVIEW_DECISION_TYPE)[number];

/** Tindakan audit staging (append-only). */
export const STAGING_AUDIT_ACTION = [
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
] as const;
export type StagingAuditAction = (typeof STAGING_AUDIT_ACTION)[number];
