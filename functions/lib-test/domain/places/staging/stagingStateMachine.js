"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canTransitionStagingStatus = canTransitionStagingStatus;
exports.assertValidStagingTransition = assertValidStagingTransition;
/**
 * Peralihan DIBENARKAN. Nota:
 * - Tiada laluan ke "published" (bukan status staging) — staging tidak boleh
 *   terbit sendiri.
 * - approved/rejected/merged HANYA boleh dibuka semula ke needs_review
 *   (tindakan reopen terkawal).
 * - validation_failed mesti melalui normalizing (revalidate) sebelum approve.
 */
const ALLOWED = {
    imported: ["normalizing", "cancelled"],
    normalizing: ["needs_review", "validation_failed", "cancelled"],
    validation_failed: ["normalizing", "cancelled"],
    needs_review: ["approved", "rejected", "duplicate_candidate", "split_required", "cancelled"],
    duplicate_candidate: ["merged", "needs_review", "split_required", "cancelled"],
    approved: ["needs_review"],
    rejected: ["needs_review"],
    merged: ["needs_review"],
    split_required: ["needs_review", "cancelled"],
    cancelled: [],
};
function canTransitionStagingStatus(from, to) {
    if (from === to)
        return false;
    return (ALLOWED[from] ?? []).includes(to);
}
function assertValidStagingTransition(from, to) {
    if (!canTransitionStagingStatus(from, to)) {
        throw new Error(`invalid staging transition: ${from} -> ${to}`);
    }
}
