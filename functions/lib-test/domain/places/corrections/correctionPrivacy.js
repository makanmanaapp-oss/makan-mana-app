"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FORBIDDEN_PUBLIC_FIELDS = void 0;
exports.toReporterVisibleSubmission = toReporterVisibleSubmission;
exports.anonymizeReporter = anonymizeReporter;
exports.toReviewerVisibleSubmission = toReviewerVisibleSubmission;
exports.containsForbiddenPublicField = containsForbiddenPublicField;
const hashing_1 = require("../staging/hashing");
/** Medan yang DILARANG muncul dalam sebarang paparan awam/pelapor. */
exports.FORBIDDEN_PUBLIC_FIELDS = [
    "submittedBy",
    "reporterUid",
    "email",
    "phone",
    "reviewedBy",
    "assignedReviewer",
    "decisionReason",
    "internalNotes",
    "trustedActorId",
    "auditTrail",
    "localReference",
    "checksum",
];
/** Ringkasan keputusan selamat-awam mengikut status. */
const PUBLIC_DECISION_SUMMARY = {
    draft: "draft_not_submitted",
    submitted: "received_pending_queue",
    validation_failed: "needs_correction_before_review",
    queued: "waiting_for_review",
    under_review: "under_review",
    needs_more_evidence: "more_evidence_requested",
    duplicate_report: "linked_to_existing_report",
    accepted_for_staging: "accepted_for_further_review",
    rejected: "not_accepted",
    withdrawn: "withdrawn_by_you",
    resolved: "resolved",
    superseded: "superseded_by_newer_report",
};
const REQUIRED_NEXT_ACTION = {
    validation_failed: "fix_and_resubmit",
    needs_more_evidence: "add_more_evidence",
    draft: "complete_and_submit",
};
/**
 * Tapis penghantaran kepada paparan pelapor. MELEMPAR jika pemanggil bukan
 * pemilik — laporan seorang pengguna tidak boleh dibaca oleh pengguna lain.
 */
function toReporterVisibleSubmission(submission, requestingUid) {
    if (submission.submittedBy !== requestingUid) {
        throw new Error("forbidden: submissions are private to their reporter");
    }
    const lastAudit = submission.auditTrail.at(-1);
    return {
        submissionId: submission.submissionId,
        placeId: submission.placeId,
        placeTitle: submission.originalSnapshot.title,
        submissionType: submission.submissionType,
        category: submission.category,
        affectedFields: [...submission.affectedFields],
        status: submission.status,
        decisionSummary: PUBLIC_DECISION_SUMMARY[submission.status],
        requiredNextAction: REQUIRED_NEXT_ACTION[submission.status],
        requestedEvidence: undefined,
        submittedAt: submission.submittedAt,
        lastUpdatedAt: lastAudit?.createdAt ?? submission.submittedAt,
        evidenceCount: submission.evidence.length,
        submittedFieldSummary: [...submission.affectedFields],
        canWithdraw: ["submitted", "queued", "needs_more_evidence"].includes(submission.status),
        mockOnly: true,
    };
}
/** Pengendali pelapor deterministik (tidak boleh dipulihkan kepada UID). */
function anonymizeReporter(uid, placeId) {
    return `reporter_${(0, hashing_1.hashCanonical)({ uid, placeId, salt: "phase_1_11" }).slice(0, 12)}`;
}
function toReviewerVisibleSubmission(submission) {
    const { submittedBy, ...rest } = submission;
    return { ...rest, reporterHandle: anonymizeReporter(submittedBy, submission.placeId) };
}
/**
 * Pengawal: sahkan bahawa objek yang akan dihantar ke permukaan awam tidak
 * mengandungi medan terlarang.
 *
 * Memeriksa KUNCI objek secara rekursif, bukan rentetan bersiri — nilai
 * seperti `submittedFieldSummary: ["phone"]` adalah sah dan tidak boleh
 * mencetuskan positif palsu.
 */
function containsForbiddenPublicField(value) {
    const forbidden = new Set(exports.FORBIDDEN_PUBLIC_FIELDS);
    const seen = new Set();
    function walk(node) {
        if (node === null || typeof node !== "object")
            return null;
        if (seen.has(node))
            return null;
        seen.add(node);
        if (Array.isArray(node)) {
            for (const item of node) {
                const hit = walk(item);
                if (hit)
                    return hit;
            }
            return null;
        }
        for (const [key, child] of Object.entries(node)) {
            if (forbidden.has(key))
                return key;
            const hit = walk(child);
            if (hit)
                return hit;
        }
        return null;
    }
    return walk(value);
}
