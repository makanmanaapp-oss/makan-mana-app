/**
 * Phase 1.11 Part J — PRIVASI PELAPOR.
 *
 * Sistem yang menghadap orang awam TIDAK PERNAH boleh mendedahkan UID pelapor,
 * e-mel, telefon, bukti persendirian, metadata lampiran mentah, nota dalaman,
 * nota keputusan admin, ID pelaku audit, atau kiraan laporan terhadap seorang
 * pengguna tertentu.
 */
import { EpochMillis } from "../common";
import { hashCanonical } from "../staging/hashing";
import {
  CorrectableField,
  PlaceCorrectionSubmission,
  ReportCategory,
  SubmissionStatus,
  SubmissionType,
} from "./correctionTypes";

/** Medan yang DILARANG muncul dalam sebarang paparan awam/pelapor. */
export const FORBIDDEN_PUBLIC_FIELDS = [
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
] as const;

/**
 * Paparan yang dilihat PELAPOR bagi penghantaran mereka sendiri.
 * Tiada identiti penyemak, tiada nota dalaman, tiada ID pelaku audit.
 */
export interface ReporterVisibleSubmission {
  submissionId: string;
  placeId: string;
  placeTitle: string;
  submissionType: SubmissionType;
  category: ReportCategory;
  affectedFields: readonly CorrectableField[];
  status: SubmissionStatus;
  /** Ringkasan keputusan selamat-awam — tanpa nota dalaman. */
  decisionSummary?: string;
  /** Apa yang pelapor perlu lakukan seterusnya. */
  requiredNextAction?: string;
  requestedEvidence?: readonly string[];
  submittedAt: EpochMillis;
  lastUpdatedAt: EpochMillis;
  evidenceCount: number;
  /** Ringkasan medan yang dihantar (bukan nilai dipercayai). */
  submittedFieldSummary: readonly string[];
  canWithdraw: boolean;
  mockOnly: true;
}

/** Ringkasan keputusan selamat-awam mengikut status. */
const PUBLIC_DECISION_SUMMARY: Readonly<Record<SubmissionStatus, string>> = {
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

const REQUIRED_NEXT_ACTION: Readonly<Partial<Record<SubmissionStatus, string>>> = {
  validation_failed: "fix_and_resubmit",
  needs_more_evidence: "add_more_evidence",
  draft: "complete_and_submit",
};

/**
 * Tapis penghantaran kepada paparan pelapor. MELEMPAR jika pemanggil bukan
 * pemilik — laporan seorang pengguna tidak boleh dibaca oleh pengguna lain.
 */
export function toReporterVisibleSubmission(
  submission: PlaceCorrectionSubmission,
  requestingUid: string,
): ReporterVisibleSubmission {
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

/**
 * Paparan penyemak DIPERCAYAI. Identiti pelapor DIANONIMKAN kepada pengendali
 * stabil supaya penyemak boleh mengesan corak tanpa mendedahkan pengguna.
 */
export interface ReviewerVisibleSubmission
  extends Omit<PlaceCorrectionSubmission, "submittedBy"> {
  /** Pengendali stabil yang diperoleh — BUKAN UID. */
  reporterHandle: string;
}

/** Pengendali pelapor deterministik (tidak boleh dipulihkan kepada UID). */
export function anonymizeReporter(uid: string, placeId: string): string {
  return `reporter_${hashCanonical({ uid, placeId, salt: "phase_1_11" }).slice(0, 12)}`;
}

export function toReviewerVisibleSubmission(
  submission: PlaceCorrectionSubmission,
): ReviewerVisibleSubmission {
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
export function containsForbiddenPublicField(value: unknown): string | null {
  const forbidden = new Set<string>(FORBIDDEN_PUBLIC_FIELDS);
  const seen = new Set<unknown>();

  function walk(node: unknown): string | null {
    if (node === null || typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = walk(item);
        if (hit) return hit;
      }
      return null;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (forbidden.has(key)) return key;
      const hit = walk(child);
      if (hit) return hit;
    }
    return null;
  }

  return walk(value);
}
