/** Phase 1.3 — rekod staging. Approved ≠ published (tidak nampak di mobile). */
import { EpochMillis } from "../common";
import { NormalizedPlaceCandidate } from "./normalizedCandidate";
import { PlaceStagingAuditEntry } from "./stagingAudit";
import { PlaceValidationResult } from "./validationResult";
import { ReviewDecisionType, StagingReviewStatus } from "./stagingEnums";

/** Rujukan calon duplikat (skor penuh = enjin Phase 1.4). */
export interface DuplicateCandidateRef {
  candidatePlaceId?: string;
  stagingRecordId?: string;
  confidence: number; // 0..1
  reason: string;
}

export interface PlaceStagingRecord {
  stagingRecordId: string;
  importBatchId?: string;
  sourceSnapshotId: string;
  candidate: NormalizedPlaceCandidate;
  reviewStatus: StagingReviewStatus;
  validationResult: PlaceValidationResult;
  duplicateCandidates: DuplicateCandidateRef[];
  assignedReviewer?: string;
  reviewedBy?: string;
  reviewedAt?: EpochMillis;
  approvalDecision?: ReviewDecisionType;
  rejectionReason?: string;
  mergeTargetPlaceId?: string;
  /** Ringkasan audit terbenam (append-only); audit penuh di subkoleksi. */
  auditTrail: PlaceStagingAuditEntry[];
  createdAt: EpochMillis;
  updatedAt: EpochMillis;
}
