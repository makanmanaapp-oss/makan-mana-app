/** Phase 1.3 — keputusan semakan + pengesahannya. */
import {
  ValidationIssue,
  ValidationResult,
  isMember,
  isNonEmptyString,
  toResult,
} from "../common";
import { EpochMillis } from "../common";
import {
  REVIEW_DECISION_TYPE,
  ReviewDecisionType,
  StagingReviewStatus,
} from "./stagingEnums";
import { canTransitionStagingStatus } from "./stagingStateMachine";

export interface PlaceReviewDecision {
  decisionId: string;
  stagingRecordId: string;
  decision: ReviewDecisionType;
  decidedBy: string;
  decidedAt: EpochMillis;
  reasonCode: string;
  notes?: string;
  fieldOverrides?: Record<string, unknown>;
  targetCanonicalPlaceId?: string;
  previousReviewStatus: StagingReviewStatus;
  nextReviewStatus: StagingReviewStatus;
}

/** Status seterusnya yang DIJANGKA bagi setiap keputusan. */
export const DECISION_TO_NEXT_STATUS: Record<
  ReviewDecisionType,
  StagingReviewStatus
> = {
  approve: "approved",
  reject: "rejected",
  request_changes: "needs_review",
  mark_duplicate: "duplicate_candidate",
  merge_into_existing: "merged",
  split_record: "split_required",
  cancel: "cancelled",
};

function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

/**
 * Sahkan satu keputusan semakan. Menolak: keputusan tidak sah, pelaku kosong,
 * reasonCode kosong (reject tanpa sebab), merge tanpa sasaran canonical,
 * ketakpadanan status, dan peralihan status tidak sah.
 */
export function validateReviewDecision(
  d: PlaceReviewDecision,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isMember(REVIEW_DECISION_TYPE, d.decision)) {
    issues.push(issue("decision", "invalid_enum", "keputusan tidak sah"));
    return toResult(issues); // tidak boleh teruskan tanpa jenis sah
  }
  if (!isNonEmptyString(d.decidedBy)) {
    issues.push(issue("decidedBy", "untrusted_actor", "pelaku diperlukan"));
  }
  if (!isNonEmptyString(d.reasonCode)) {
    issues.push(issue("reasonCode", "reason_required", "sebab diperlukan"));
  }
  if (d.decision === "merge_into_existing" && !isNonEmptyString(d.targetCanonicalPlaceId)) {
    issues.push(
      issue("targetCanonicalPlaceId", "merge_target_missing", "sasaran hilang"),
    );
  }

  const expected = DECISION_TO_NEXT_STATUS[d.decision];
  if (d.nextReviewStatus !== expected) {
    issues.push(
      issue("nextReviewStatus", "decision_status_mismatch",
        `dijangka ${expected}, dapat ${d.nextReviewStatus}`),
    );
  }
  if (!canTransitionStagingStatus(d.previousReviewStatus, d.nextReviewStatus)) {
    issues.push(
      issue("nextReviewStatus", "invalid_transition",
        `${d.previousReviewStatus} -> ${d.nextReviewStatus}`),
    );
  }

  return toResult(issues);
}
