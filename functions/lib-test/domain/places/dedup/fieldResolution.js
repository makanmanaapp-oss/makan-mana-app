"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFieldEvidence = resolveFieldEvidence;
const EVIDENCE_RANK = {
    verified: 3,
    reported: 2,
    inferred: 1,
    unknown: 0,
};
/**
 * Skor bukti: pangkat evidence (dominan) → confidence → kelulusan admin →
 * kesegaran (tiebreak halus). TIDAK bergantung pada susunan array/masa-tulis.
 */
function evidenceScore(e) {
    const rank = EVIDENCE_RANK[e.evidenceLevel] ?? 0;
    const approved = e.approvedBy ? 1 : 0;
    const freshTs = e.verifiedAt ?? e.fetchedAt ?? 0;
    // Kesegaran hanya sebagai pemecah seri sangat halus (<< confidence).
    const freshness = Math.min(0.99, freshTs / 1e15);
    return rank * 1000 + e.confidence * 100 + approved * 10 + freshness;
}
function resolveFieldEvidence(candidates) {
    if (candidates.length === 0) {
        return {
            selectedValue: undefined,
            rejected: [],
            conflictState: false,
            reason: "no_candidates",
        };
    }
    // Isih menurun ikut skor BUKTI (bukan kedudukan array).
    const ranked = candidates
        .map((e, i) => ({ e, i, s: evidenceScore(e) }))
        .sort((x, y) => y.s - x.s || x.i - y.i);
    const winner = ranked[0].e;
    const rejected = ranked.slice(1).map((r) => r.e);
    // Konflik: calon lain bernilai BERBEZA dengan skor hampir (dalam 10 mata).
    const conflictState = ranked
        .slice(1)
        .some((r) => r.e.value !== winner.value && ranked[0].s - r.s < 10);
    return {
        selectedValue: winner.value,
        selectedEvidence: winner,
        rejected,
        conflictState,
        reason: `selected_by_evidence:${winner.evidenceLevel}:conf_${winner.confidence}`,
    };
}
