/**
 * Phase 1.11 Part P — ANTARA MUKA REPOSITORY PEMBETULAN (emulator sahaja).
 *
 * Sengaja TIADA operasi untuk:
 * - kemas kini canonical place secara langsung
 * - penerbitan
 * - hard delete
 * - eksport callable produksi
 * - tulisan terus daripada pelayar
 * - query luas awam
 */
import { EpochMillis } from "../common";
import { TrustedActor } from "../staging/stagingAudit";
import {
  PlaceCorrectionAuditEntry,
  PlaceCorrectionSubmission,
  PlaceReportEvidence,
  ReportCategory,
  SubmissionStatus,
} from "./correctionTypes";
import {
  PlaceReportReviewDecision,
  ReviewDecision,
} from "./correctionStateMachine";
import { RateLimitDecision } from "./correctionDedup";
import { ClientSubmissionInput } from "./correctionValidation";
import { ReporterVisibleSubmission, ReviewerVisibleSubmission } from "./correctionPrivacy";

export const MAX_CORRECTION_PAGE_LIMIT = 50;

export interface CorrectionPagination {
  limit: number;
  cursor?: string;
}
export interface CorrectionPage<T> {
  items: readonly T[];
  nextCursor?: string;
}

export interface SubmissionFilter {
  status?: SubmissionStatus;
  category?: ReportCategory;
  placeId?: string;
  safetySensitiveOnly?: boolean;
  assignedReviewer?: string;
}

export interface SubmitResult {
  submission: PlaceCorrectionSubmission;
  /** true bila penghantaran sedia ada digunakan semula (dedup). */
  deduplicated: boolean;
  rateLimit: RateLimitDecision;
  validationErrors: readonly string[];
}

export interface PlaceCorrectionRepository {
  /** Simpan draf milik pengguna sendiri. */
  saveDraft(input: ClientSubmissionInput, reporterUid: string, now: EpochMillis): Promise<PlaceCorrectionSubmission>;

  /**
   * Hantar draf/penghantaran baharu. IDEMPOTEN mengikut identiti dedup:
   * penghantaran serupa yang berulang memulangkan rekod terbuka sedia ada.
   */
  submit(input: ClientSubmissionInput, reporterUid: string, now: EpochMillis): Promise<SubmitResult>;

  /** Pelapor membaca penghantaran SENDIRI sahaja (paparan ditapis privasi). */
  getOwnSubmission(submissionId: string, reporterUid: string): Promise<ReporterVisibleSubmission | null>;
  listOwnSubmissions(reporterUid: string, page: CorrectionPagination): Promise<CorrectionPage<ReporterVisibleSubmission>>;

  /** Tambah bukti kepada penghantaran terbuka milik sendiri. */
  appendEvidence(submissionId: string, evidence: PlaceReportEvidence, reporterUid: string, now: EpochMillis): Promise<PlaceCorrectionSubmission>;

  /** Tarik balik — hanya untuk status yang dibenarkan. */
  withdraw(submissionId: string, reporterUid: string, now: EpochMillis): Promise<PlaceCorrectionSubmission>;

  // ---- operasi DIPERCAYAI (Admin SDK sahaja) ----
  listForReview(filter: SubmissionFilter, page: CorrectionPagination, actor: TrustedActor): Promise<CorrectionPage<ReviewerVisibleSubmission>>;
  getForReview(submissionId: string, actor: TrustedActor): Promise<ReviewerVisibleSubmission | null>;
  assignReviewer(submissionId: string, reviewerId: string, actor: TrustedActor, now: EpochMillis): Promise<ReviewerVisibleSubmission>;
  markDuplicate(submissionId: string, duplicateOfSubmissionId: string, actor: TrustedActor, now: EpochMillis): Promise<ReviewerVisibleSubmission>;
}

export interface PlaceCorrectionDecisionRepository {
  /**
   * Rekod keputusan DIPERCAYAI. Penerimaan mencipta rujukan cadangan staging
   * SAHAJA — tiada penerbitan dan tiada kemas kini canonical.
   */
  recordDecision(params: {
    submissionId: string;
    decision: ReviewDecision;
    reasonCode: string;
    notes?: string;
    acceptedFields?: readonly string[];
    rejectedFields?: readonly string[];
    duplicateOfSubmissionId?: string;
    requiredEvidence?: readonly string[];
    evidenceSummary?: string;
    actor: TrustedActor;
    now: EpochMillis;
  }): Promise<PlaceReportReviewDecision>;

  getDecision(decisionId: string, actor: TrustedActor): Promise<PlaceReportReviewDecision | null>;
  listDecisions(submissionId: string, actor: TrustedActor): Promise<readonly PlaceReportReviewDecision[]>;
}

export interface PlaceCorrectionAuditRepository {
  /** Append-only — tiada update/delete didedahkan. */
  appendAudit(entry: PlaceCorrectionAuditEntry): Promise<PlaceCorrectionAuditEntry>;
  listAudit(submissionId: string, actor: TrustedActor, page: CorrectionPagination): Promise<CorrectionPage<PlaceCorrectionAuditEntry>>;
}

export interface PlaceCorrectionRateLimitRepository {
  evaluate(reporterUid: string, placeId: string, now: EpochMillis): Promise<RateLimitDecision>;
  recordSubmission(reporterUid: string, placeId: string, now: EpochMillis): Promise<void>;
}

/** Rujukan cadangan staging yang dicipta oleh penerimaan — BUKAN penerbitan. */
export interface StagingProposalReference {
  stagingProposalId: string;
  submissionId: string;
  placeId: string;
  acceptedFields: readonly string[];
  createdBy: string;
  createdAt: EpochMillis;
  /** Sentiasa false — cadangan tidak pernah diterbitkan oleh fasa ini. */
  published: false;
  mockOnly: true;
}
