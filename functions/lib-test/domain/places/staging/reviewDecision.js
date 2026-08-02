"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DECISION_TO_NEXT_STATUS = void 0;
exports.validateReviewDecision = validateReviewDecision;
/** Phase 1.3 — keputusan semakan + pengesahannya. */
const common_1 = require("../common");
const stagingEnums_1 = require("./stagingEnums");
const stagingStateMachine_1 = require("./stagingStateMachine");
/** Status seterusnya yang DIJANGKA bagi setiap keputusan. */
exports.DECISION_TO_NEXT_STATUS = {
    approve: "approved",
    reject: "rejected",
    request_changes: "needs_review",
    mark_duplicate: "duplicate_candidate",
    merge_into_existing: "merged",
    split_record: "split_required",
    cancel: "cancelled",
};
function issue(path, code, message) {
    return { path, code, message };
}
/**
 * Sahkan satu keputusan semakan. Menolak: keputusan tidak sah, pelaku kosong,
 * reasonCode kosong (reject tanpa sebab), merge tanpa sasaran canonical,
 * ketakpadanan status, dan peralihan status tidak sah.
 */
function validateReviewDecision(d) {
    const issues = [];
    if (!(0, common_1.isMember)(stagingEnums_1.REVIEW_DECISION_TYPE, d.decision)) {
        issues.push(issue("decision", "invalid_enum", "keputusan tidak sah"));
        return (0, common_1.toResult)(issues); // tidak boleh teruskan tanpa jenis sah
    }
    if (!(0, common_1.isNonEmptyString)(d.decidedBy)) {
        issues.push(issue("decidedBy", "untrusted_actor", "pelaku diperlukan"));
    }
    if (!(0, common_1.isNonEmptyString)(d.reasonCode)) {
        issues.push(issue("reasonCode", "reason_required", "sebab diperlukan"));
    }
    if (d.decision === "merge_into_existing" && !(0, common_1.isNonEmptyString)(d.targetCanonicalPlaceId)) {
        issues.push(issue("targetCanonicalPlaceId", "merge_target_missing", "sasaran hilang"));
    }
    const expected = exports.DECISION_TO_NEXT_STATUS[d.decision];
    if (d.nextReviewStatus !== expected) {
        issues.push(issue("nextReviewStatus", "decision_status_mismatch", `dijangka ${expected}, dapat ${d.nextReviewStatus}`));
    }
    if (!(0, stagingStateMachine_1.canTransitionStagingStatus)(d.previousReviewStatus, d.nextReviewStatus)) {
        issues.push(issue("nextReviewStatus", "invalid_transition", `${d.previousReviewStatus} -> ${d.nextReviewStatus}`));
    }
    return (0, common_1.toResult)(issues);
}
