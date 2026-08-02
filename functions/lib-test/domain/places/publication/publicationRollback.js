"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLLBACK_REASON_CODES = exports.ROLLBACK_STATUSES = void 0;
exports.canTransitionRollbackStatus = canTransitionRollbackStatus;
exports.assertValidRollbackTransition = assertValidRollbackTransition;
exports.isRollbackTerminal = isRollbackTerminal;
exports.ROLLBACK_STATUSES = [
    "requested",
    "approved",
    "executed_in_emulator",
    "rejected",
    "cancelled",
    "failed",
];
/** Sebab rollback kanonikal (bebas bahasa). */
exports.ROLLBACK_REASON_CODES = [
    "incorrect_data_published",
    "safety_data_incorrect",
    "wrong_place_merged",
    "premature_publication",
    "expired_evidence_published",
    "admin_request",
];
/** Peralihan status rollback yang dibenarkan. */
const ROLLBACK_ALLOWED = {
    requested: ["approved", "rejected", "cancelled"],
    approved: ["executed_in_emulator", "failed", "cancelled"],
    executed_in_emulator: [],
    rejected: [],
    cancelled: [],
    failed: ["approved", "cancelled"],
};
function canTransitionRollbackStatus(from, to) {
    if (from === to)
        return false;
    return (ROLLBACK_ALLOWED[from] ?? []).includes(to);
}
function assertValidRollbackTransition(from, to) {
    if (!canTransitionRollbackStatus(from, to)) {
        throw new Error(`invalid rollback transition: ${from} -> ${to}`);
    }
}
/** Rollback yang telah dilaksanakan ialah TERMINAL (idempoten pada ulangan). */
function isRollbackTerminal(status) {
    return (status === "executed_in_emulator" || status === "rejected" || status === "cancelled");
}
