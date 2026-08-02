"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DUPLICATE_REVIEW_STATUS = void 0;
exports.initialReviewStatus = initialReviewStatus;
exports.canTransitionDuplicateStatus = canTransitionDuplicateStatus;
exports.assertValidDuplicateTransition = assertValidDuplicateTransition;
exports.DUPLICATE_REVIEW_STATUS = [
    "open",
    "auto_linked",
    "review_required",
    "confirmed_duplicate",
    "confirmed_separate",
    "confirmed_branch",
    "dismissed",
    "merged",
];
/** Status semakan awal daripada keputusan (auto-link HANYA identiti tepat). */
function initialReviewStatus(decision) {
    switch (decision) {
        case "auto_link_source":
            return "auto_linked";
        case "exact_duplicate":
        case "review_required":
            return "review_required";
        default:
            // possible_duplicate / likely_separate_branch / separate_place
            return "open";
    }
}
const ALLOWED = {
    open: ["auto_linked", "review_required", "confirmed_separate", "confirmed_branch", "dismissed"],
    review_required: ["confirmed_duplicate", "confirmed_separate", "confirmed_branch", "dismissed"],
    auto_linked: ["merged", "review_required"],
    confirmed_duplicate: ["merged", "review_required"],
    confirmed_separate: ["review_required"],
    confirmed_branch: ["review_required"],
    dismissed: ["review_required"],
    merged: ["review_required"], // reopen/rollback terkawal
};
function canTransitionDuplicateStatus(from, to) {
    if (from === to)
        return false;
    return (ALLOWED[from] ?? []).includes(to);
}
function assertValidDuplicateTransition(from, to) {
    if (!canTransitionDuplicateStatus(from, to)) {
        throw new Error(`invalid duplicate status transition: ${from} -> ${to}`);
    }
}
