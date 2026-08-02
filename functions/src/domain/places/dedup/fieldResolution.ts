/**
 * Phase 1.4 — resolusi medan berasaskan BUKTI (bukan last-write-wins).
 * Guna kontrak provenance Phase 1.2 (FieldEvidence).
 */
import { EvidenceLevel } from "../placeEnums";
import { FieldEvidence } from "../placeProvenance";

const EVIDENCE_RANK: Record<EvidenceLevel, number> = {
  verified: 3,
  reported: 2,
  inferred: 1,
  unknown: 0,
};

export interface FieldResolution<T> {
  selectedValue: T | undefined;
  selectedEvidence?: FieldEvidence<T>;
  rejected: FieldEvidence<T>[];
  conflictState: boolean;
  reason: string;
}

/**
 * Skor bukti: pangkat evidence (dominan) → confidence → kelulusan admin →
 * kesegaran (tiebreak halus). TIDAK bergantung pada susunan array/masa-tulis.
 */
function evidenceScore(e: FieldEvidence<unknown>): number {
  const rank = EVIDENCE_RANK[e.evidenceLevel] ?? 0;
  const approved = e.approvedBy ? 1 : 0;
  const freshTs = e.verifiedAt ?? e.fetchedAt ?? 0;
  // Kesegaran hanya sebagai pemecah seri sangat halus (<< confidence).
  const freshness = Math.min(0.99, freshTs / 1e15);
  return rank * 1000 + e.confidence * 100 + approved * 10 + freshness;
}

export function resolveFieldEvidence<T>(
  candidates: FieldEvidence<T>[],
): FieldResolution<T> {
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
