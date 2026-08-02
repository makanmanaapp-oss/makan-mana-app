"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TAG_EVIDENCE_STATUS = void 0;
exports.canTransitionTagEvidence = canTransitionTagEvidence;
exports.assertValidTagEvidenceTransition = assertValidTagEvidenceTransition;
exports.scoreTagEvidence = scoreTagEvidence;
exports.TAG_EVIDENCE_STATUS = [
    "proposed",
    "needs_review",
    "approved",
    "rejected",
    "expired",
    "superseded",
];
const ALLOWED = {
    proposed: ["needs_review", "approved", "rejected"],
    needs_review: ["approved", "rejected"],
    approved: ["expired", "superseded", "needs_review"],
    rejected: ["needs_review"],
    expired: ["needs_review"],
    superseded: [],
};
function canTransitionTagEvidence(from, to) {
    if (from === to)
        return false;
    return (ALLOWED[from] ?? []).includes(to);
}
function assertValidTagEvidenceTransition(from, to) {
    if (!canTransitionTagEvidence(from, to)) {
        throw new Error(`invalid tag evidence transition: ${from} -> ${to}`);
    }
}
const EVIDENCE_RANK = {
    verified: 3,
    reported: 2,
    inferred: 1,
    unknown: 0,
};
/**
 * Skor bukti tag: pangkat evidence (dominan) → confidence → kelulusan admin →
 * kesegaran (tiebreak halus). Digunakan untuk memilih bukti TERKUAT tanpa
 * last-write-wins.
 */
function scoreTagEvidence(ev) {
    const rank = EVIDENCE_RANK[ev.evidenceLevel] ?? 0;
    const approved = ev.approvedBy ? 1 : 0;
    const freshTs = ev.verifiedAt ?? ev.approvedAt ?? ev.fetchedAt ?? 0;
    const freshness = Math.min(0.99, freshTs / 1e15);
    return rank * 1000 + ev.confidence * 100 + approved * 10 + freshness;
}
