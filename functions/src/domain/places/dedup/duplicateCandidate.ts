/** Phase 1.4 — kontrak calon duplikat + mesin keadaan semakan. */
import { EpochMillis } from "../common";
import { DuplicateSignalSet } from "./duplicateSignals";
import { DuplicateDecision } from "./duplicateDecision";

export const DUPLICATE_REVIEW_STATUS = [
  "open",
  "auto_linked",
  "review_required",
  "confirmed_duplicate",
  "confirmed_separate",
  "confirmed_branch",
  "dismissed",
  "merged",
] as const;
export type DuplicateReviewStatus = (typeof DUPLICATE_REVIEW_STATUS)[number];

export interface PlaceDuplicateCandidate {
  duplicateCandidateId: string;
  stagingRecordId: string;
  comparedPlaceId?: string;
  comparedStagingRecordId?: string;
  signalSet: DuplicateSignalSet;
  duplicateScore: number;
  decision: DuplicateDecision;
  reviewStatus: DuplicateReviewStatus;
  reasons: string[];
  warnings: string[];
  generatedAt: EpochMillis;
  algorithmVersion: string;
  configVersion: string;
  resolvedAt?: EpochMillis;
  resolvedBy?: string;
  resolution?: string;
}

/** Status semakan awal daripada keputusan (auto-link HANYA identiti tepat). */
export function initialReviewStatus(
  decision: DuplicateDecision,
): DuplicateReviewStatus {
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

const ALLOWED: Record<DuplicateReviewStatus, DuplicateReviewStatus[]> = {
  open: ["auto_linked", "review_required", "confirmed_separate", "confirmed_branch", "dismissed"],
  review_required: ["confirmed_duplicate", "confirmed_separate", "confirmed_branch", "dismissed"],
  auto_linked: ["merged", "review_required"],
  confirmed_duplicate: ["merged", "review_required"],
  confirmed_separate: ["review_required"],
  confirmed_branch: ["review_required"],
  dismissed: ["review_required"],
  merged: ["review_required"], // reopen/rollback terkawal
};

export function canTransitionDuplicateStatus(
  from: DuplicateReviewStatus,
  to: DuplicateReviewStatus,
): boolean {
  if (from === to) return false;
  return (ALLOWED[from] ?? []).includes(to);
}

export function assertValidDuplicateTransition(
  from: DuplicateReviewStatus,
  to: DuplicateReviewStatus,
): void {
  if (!canTransitionDuplicateStatus(from, to)) {
    throw new Error(`invalid duplicate status transition: ${from} -> ${to}`);
  }
}
