"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
function decision(over) {
    return {
        decisionId: "dec_1",
        stagingRecordId: "stg_valid",
        decision: "approve",
        decidedBy: "admin_1",
        decidedAt: fixtures_1.T,
        reasonCode: "meets_quality",
        previousReviewStatus: "needs_review",
        nextReviewStatus: "approved",
        ...over,
    };
}
(0, node_test_1.default)("valid approve decision passes", () => {
    strict_1.default.equal((0, index_1.validateReviewDecision)(decision({})).ok, true);
});
// 18. Merge decision without target fails.
(0, node_test_1.default)("merge decision without target fails", () => {
    const r = (0, index_1.validateReviewDecision)(decision({
        decision: "merge_into_existing",
        previousReviewStatus: "duplicate_candidate",
        nextReviewStatus: "merged",
        targetCanonicalPlaceId: undefined,
    }));
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "merge_target_missing"));
});
(0, node_test_1.default)("merge decision with target passes", () => {
    const r = (0, index_1.validateReviewDecision)(decision({
        decision: "merge_into_existing",
        previousReviewStatus: "duplicate_candidate",
        nextReviewStatus: "merged",
        targetCanonicalPlaceId: "mm_place_1",
    }));
    strict_1.default.equal(r.ok, true);
});
// 19. Reject decision without reason fails.
(0, node_test_1.default)("reject decision without reason fails", () => {
    const r = (0, index_1.validateReviewDecision)(decision({ decision: "reject", nextReviewStatus: "rejected", reasonCode: "" }));
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "reason_required"));
});
// Ketakpadanan status keputusan ditolak.
(0, node_test_1.default)("decision/next-status mismatch fails", () => {
    const r = (0, index_1.validateReviewDecision)(decision({ decision: "approve", nextReviewStatus: "rejected" }));
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "decision_status_mismatch"));
});
