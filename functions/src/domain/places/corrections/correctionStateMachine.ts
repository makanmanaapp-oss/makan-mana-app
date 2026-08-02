/**
 * Phase 1.11 Part F & G — MESIN KEADAAN PENGHANTARAN + MODEL KEPUTUSAN.
 *
 * Pengguna hanya boleh menggerakkan draft → submitted → withdrawn. Setiap
 * peralihan lain memerlukan pelaku DIPERCAYAI (Admin SDK). Tiada peralihan
 * menerbitkan apa-apa.
 */
import { EpochMillis } from "../common";
import {
  CorrectableField,
  SubmissionStatus,
} from "./correctionTypes";

export interface TransitionActor {
  /** "reporter" hanya boleh menggunakan peralihan milik sendiri. */
  actorType: "reporter" | "trusted_reviewer" | "system";
  actorId: string;
  /** Wajib untuk peralihan dipercayai. */
  reasonCode?: string;
}

export interface TransitionCheck {
  allowed: boolean;
  reason?: string;
}

/** Peralihan yang dibenarkan untuk pelaku DIPERCAYAI. */
const TRUSTED_TRANSITIONS: Readonly<Record<SubmissionStatus, readonly SubmissionStatus[]>> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["queued", "validation_failed", "withdrawn", "duplicate_report"],
  validation_failed: ["draft", "withdrawn"],
  queued: ["under_review", "withdrawn", "duplicate_report"],
  under_review: [
    "needs_more_evidence",
    "accepted_for_staging",
    "rejected",
    "duplicate_report",
  ],
  needs_more_evidence: ["queued", "rejected", "withdrawn"],
  duplicate_report: ["queued", "rejected"],
  accepted_for_staging: ["resolved", "rejected"],
  // rejected memerlukan reopen terkawal (lihat REOPEN_TRANSITIONS).
  rejected: [],
  withdrawn: [],
  resolved: ["superseded"],
  superseded: [],
};

/** Peralihan pelapor sendiri sahaja. */
const REPORTER_TRANSITIONS: Readonly<Record<SubmissionStatus, readonly SubmissionStatus[]>> = {
  draft: ["submitted"],
  submitted: ["withdrawn"],
  queued: ["withdrawn"],
  needs_more_evidence: ["withdrawn"],
  validation_failed: ["draft"],
  under_review: [],
  duplicate_report: [],
  accepted_for_staging: [],
  rejected: [],
  withdrawn: [],
  resolved: [],
  superseded: [],
};

/**
 * Peralihan REOPEN terkawal — hanya penyemak dipercayai dengan kod sebab
 * `reopen`. Ini satu-satunya laluan keluar dari `rejected`.
 */
const REOPEN_TRANSITIONS: readonly { from: SubmissionStatus; to: SubmissionStatus }[] = [
  { from: "rejected", to: "queued" },
  { from: "withdrawn", to: "queued" },
];

export function checkPlaceReportTransition(
  from: SubmissionStatus,
  to: SubmissionStatus,
  actor: TransitionActor,
): TransitionCheck {
  if (from === to) return { allowed: false, reason: "no_op_transition" };

  // Larangan mutlak yang dinyatakan dalam spesifikasi.
  if (from === "draft" && to === "accepted_for_staging") {
    return { allowed: false, reason: "draft_cannot_be_accepted_directly" };
  }
  if (from === "submitted" && to === "resolved") {
    return { allowed: false, reason: "submitted_cannot_resolve_directly" };
  }
  if (from === "withdrawn" && to === "under_review") {
    return { allowed: false, reason: "withdrawn_cannot_return_to_review" };
  }

  if (actor.actorType === "reporter") {
    const allowed = (REPORTER_TRANSITIONS[from] ?? []).includes(to);
    return allowed
      ? { allowed: true }
      : { allowed: false, reason: "reporter_cannot_perform_transition" };
  }

  // Reopen terkawal.
  const reopen = REOPEN_TRANSITIONS.find((r) => r.from === from && r.to === to);
  if (reopen) {
    return actor.reasonCode === "reopen"
      ? { allowed: true }
      : { allowed: false, reason: "reopen_requires_reason_code_reopen" };
  }

  if (from === "rejected") {
    return { allowed: false, reason: "rejected_requires_controlled_reopen" };
  }

  const allowed = (TRUSTED_TRANSITIONS[from] ?? []).includes(to);
  return allowed ? { allowed: true } : { allowed: false, reason: "transition_not_allowed" };
}

export function canTransitionPlaceReportStatus(
  from: SubmissionStatus,
  to: SubmissionStatus,
  actor: TransitionActor,
): boolean {
  return checkPlaceReportTransition(from, to, actor).allowed;
}

export function assertValidPlaceReportTransition(
  from: SubmissionStatus,
  to: SubmissionStatus,
  actor: TransitionActor,
): void {
  const r = checkPlaceReportTransition(from, to, actor);
  if (!r.allowed) {
    throw new Error(`invalid report transition: ${from} -> ${to} (${r.reason ?? "denied"})`);
  }
}

/** Status di mana pelapor boleh menarik balik. */
export function canReporterWithdraw(status: SubmissionStatus): boolean {
  return (REPORTER_TRANSITIONS[status] ?? []).includes("withdrawn");
}

// ---------------------------------------------------------------------------
// Part G — keputusan semakan
// ---------------------------------------------------------------------------

export const REVIEW_DECISIONS = [
  "accept_for_staging",
  "reject",
  "request_more_evidence",
  "mark_duplicate",
  "confirm_closure_report",
  "confirm_moved_report",
  "confirm_unsafe_claim",
  "dismiss",
  "reopen",
] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface PlaceReportReviewDecision {
  decisionId: string;
  submissionId: string;
  decision: ReviewDecision;
  /** Identiti pelaku datang daripada backend dipercayai, bukan klien. */
  decidedBy: string;
  decidedAt: EpochMillis;
  reasonCode: string;
  notes?: string;
  acceptedFields: readonly CorrectableField[];
  rejectedFields: readonly CorrectableField[];
  /** Cadangan staging yang dicipta — BUKAN penerbitan. */
  stagingRecordId?: string;
  duplicateOfSubmissionId?: string;
  requiredEvidence?: readonly string[];
  previousStatus: SubmissionStatus;
  nextStatus: SubmissionStatus;
  auditEntryId: string;
}

/** Status hasil bagi setiap keputusan. */
export const DECISION_NEXT_STATUS: Readonly<Record<ReviewDecision, SubmissionStatus>> = {
  accept_for_staging: "accepted_for_staging",
  reject: "rejected",
  request_more_evidence: "needs_more_evidence",
  mark_duplicate: "duplicate_report",
  confirm_closure_report: "accepted_for_staging",
  confirm_moved_report: "accepted_for_staging",
  confirm_unsafe_claim: "accepted_for_staging",
  dismiss: "rejected",
  reopen: "queued",
};

export interface DecisionValidationResult {
  valid: boolean;
  reasons: readonly string[];
}

/**
 * Sahkan keputusan sebelum ia direkodkan.
 *
 * Peraturan:
 * - penolakan MEMERLUKAN kod sebab
 * - keputusan pendua MEMERLUKAN penghantaran sasaran
 * - pengesahan penutupan MEMERLUKAN ringkasan bukti
 * - penerimaan MEMERLUKAN sekurang-kurangnya satu medan diterima
 * - permintaan bukti MEMERLUKAN senarai bukti yang diperlukan
 * - keputusan TIDAK PERNAH menerbitkan (tiada medan penerbitan wujud di sini)
 */
export function validateReviewDecision(
  decision: ReviewDecision,
  input: {
    reasonCode?: string;
    acceptedFields?: readonly CorrectableField[];
    duplicateOfSubmissionId?: string;
    requiredEvidence?: readonly string[];
    evidenceSummary?: string;
  },
): DecisionValidationResult {
  const reasons: string[] = [];
  if (!input.reasonCode || !input.reasonCode.trim()) reasons.push("reason_code_required");

  if (decision === "reject" || decision === "dismiss") {
    if (!input.reasonCode?.trim()) reasons.push("rejection_requires_reason");
  }
  if (decision === "mark_duplicate" && !input.duplicateOfSubmissionId) {
    reasons.push("duplicate_decision_requires_target_submission");
  }
  if (decision === "confirm_closure_report" && !input.evidenceSummary?.trim()) {
    reasons.push("closure_confirmation_requires_evidence_summary");
  }
  if (decision === "request_more_evidence" && !(input.requiredEvidence?.length)) {
    reasons.push("request_more_evidence_requires_required_evidence_list");
  }
  if (
    (decision === "accept_for_staging" ||
      decision === "confirm_closure_report" ||
      decision === "confirm_moved_report" ||
      decision === "confirm_unsafe_claim") &&
    !(input.acceptedFields?.length)
  ) {
    reasons.push("acceptance_requires_at_least_one_accepted_field");
  }
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/**
 * Bukti bahawa keputusan TIDAK PERNAH mensijilkan keselamatan secara automatik.
 * Menerima laporan halal/alergen hanya menghasilkan cadangan staging untuk
 * semakan manual lanjut — ia tidak menetapkan keadaan disahkan.
 */
export function decisionGrantsVerifiedSafety(): false {
  return false;
}
