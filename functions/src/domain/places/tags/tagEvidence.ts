/** Phase 1.5 — bukti tag canonical (superset Phase 1.2) + mesin keadaan. */
import { EpochMillis } from "../common";
import { EvidenceLevel, SourceType } from "../placeEnums";
import { TagFamily } from "../placeTags";

export const TAG_EVIDENCE_STATUS = [
  "proposed",
  "needs_review",
  "approved",
  "rejected",
  "expired",
  "superseded",
] as const;
export type TagEvidenceStatus = (typeof TAG_EVIDENCE_STATUS)[number];

export interface TagEvidence {
  tagId: string;
  familyId: TagFamily;
  evidenceLevel: EvidenceLevel;
  confidence: number; // 0..1
  sourceType: SourceType;
  sourceRecordId?: string;
  evidenceTextRef?: string;
  evidenceMediaRef?: string;
  observedAt?: EpochMillis;
  fetchedAt?: EpochMillis;
  verifiedAt?: EpochMillis;
  approvedAt?: EpochMillis;
  approvedBy?: string;
  expiresAt?: EpochMillis;
  validatorVersion: string;
  status: TagEvidenceStatus;
  rejectionReason?: string;
}

const ALLOWED: Record<TagEvidenceStatus, TagEvidenceStatus[]> = {
  proposed: ["needs_review", "approved", "rejected"],
  needs_review: ["approved", "rejected"],
  approved: ["expired", "superseded", "needs_review"],
  rejected: ["needs_review"],
  expired: ["needs_review"],
  superseded: [],
};

export function canTransitionTagEvidence(
  from: TagEvidenceStatus,
  to: TagEvidenceStatus,
): boolean {
  if (from === to) return false;
  return (ALLOWED[from] ?? []).includes(to);
}

export function assertValidTagEvidenceTransition(
  from: TagEvidenceStatus,
  to: TagEvidenceStatus,
): void {
  if (!canTransitionTagEvidence(from, to)) {
    throw new Error(`invalid tag evidence transition: ${from} -> ${to}`);
  }
}

const EVIDENCE_RANK: Record<EvidenceLevel, number> = {
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
export function scoreTagEvidence(ev: TagEvidence): number {
  const rank = EVIDENCE_RANK[ev.evidenceLevel] ?? 0;
  const approved = ev.approvedBy ? 1 : 0;
  const freshTs = ev.verifiedAt ?? ev.approvedAt ?? ev.fetchedAt ?? 0;
  const freshness = Math.min(0.99, freshTs / 1e15);
  return rank * 1000 + ev.confidence * 100 + approved * 10 + freshness;
}
