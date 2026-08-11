/**
 * Phase 1.11 Part P — REPOSITORY PEMBETULAN DALAM-INGATAN.
 *
 * Menguatkuasa: snapshot asal IMMUTABLE, dedup, had kadar, privasi pelapor,
 * peralihan status terkawal, audit append-only, dan penerimaan yang hanya
 * mencipta rujukan cadangan staging. TIADA kemas kini canonical. TIADA
 * penerbitan. TIADA hard delete.
 */
import { EpochMillis } from "../common";
import { hashCanonical } from "../staging/hashing";
import { TrustedActor } from "../staging/stagingAudit";
import { getCategoryRule } from "./correctionCategories";
import {
  CorrectionLimits,
  DEFAULT_CORRECTION_LIMITS,
  dedupKeyFor,
  evaluateRateLimit,
  findOpenDuplicate,
} from "./correctionDedup";
import {
  anonymizeReporter,
  ReporterVisibleSubmission,
  ReviewerVisibleSubmission,
  toReporterVisibleSubmission,
  toReviewerVisibleSubmission,
} from "./correctionPrivacy";
import {
  CorrectionPage,
  CorrectionPagination,
  MAX_CORRECTION_PAGE_LIMIT,
  PlaceCorrectionAuditRepository,
  PlaceCorrectionDecisionRepository,
  PlaceCorrectionRateLimitRepository,
  PlaceCorrectionRepository,
  StagingProposalReference,
  SubmissionFilter,
  SubmitResult,
} from "./correctionRepository";
import {
  assertValidPlaceReportTransition,
  DECISION_NEXT_STATUS,
  PlaceReportReviewDecision,
  ReviewDecision,
  validateReviewDecision,
} from "./correctionStateMachine";
import {
  CORRECTION_ALGORITHM_VERSION,
  CORRECTION_SCHEMA_VERSION,
  CorrectableField,
  PlaceCorrectionAuditEntry,
  PlaceCorrectionSubmission,
  PlaceReportEvidence,
  ReportCategory,
  ReportSeverity,
  SubmissionStatus,
  SubmissionType,
} from "./correctionTypes";
import {
  ClientSubmissionInput,
  validatePlaceCorrectionSubmission,
} from "./correctionValidation";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function paginate<T>(
  ordered: readonly T[],
  idOf: (v: T) => string,
  page: CorrectionPagination,
): CorrectionPage<T> {
  const limit = Math.max(1, Math.min(page.limit, MAX_CORRECTION_PAGE_LIMIT));
  let list = [...ordered];
  if (page.cursor) {
    const idx = list.findIndex((v) => idOf(v) === page.cursor);
    list = idx >= 0 ? list.slice(idx + 1) : list;
  }
  const slice = list.slice(0, limit);
  return {
    items: slice.map(clone),
    nextCursor: list.length > limit ? idOf(slice[slice.length - 1]) : undefined,
  };
}

export class InMemoryCorrectionStore
  implements
    PlaceCorrectionRepository,
    PlaceCorrectionDecisionRepository,
    PlaceCorrectionAuditRepository,
    PlaceCorrectionRateLimitRepository
{
  private submissions = new Map<string, PlaceCorrectionSubmission>();
  private order: string[] = [];
  private decisions = new Map<string, PlaceReportReviewDecision>();
  private audit = new Map<string, PlaceCorrectionAuditEntry[]>();
  private stagingProposals = new Map<string, StagingProposalReference>();
  private sequence = 0;

  // Tiada jam disuntik: setiap entri audit membawa cap masanya sendiri
  // daripada pemanggil, jadi stor ini tidak pernah mengarang masa.
  constructor(
    private limits: CorrectionLimits = DEFAULT_CORRECTION_LIMITS,
  ) {}

  reset(): void {
    this.submissions.clear();
    this.order = [];
    this.decisions.clear();
    this.audit.clear();
    this.stagingProposals.clear();
    this.sequence = 0;
  }

  listStagingProposals(): readonly StagingProposalReference[] {
    return [...this.stagingProposals.values()].map(clone);
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${String(this.sequence).padStart(6, "0")}`;
  }

  private all(): readonly PlaceCorrectionSubmission[] {
    return this.order.map((id) => this.submissions.get(id)!);
  }

  private appendAuditEntry(entry: PlaceCorrectionAuditEntry): PlaceCorrectionAuditEntry {
    const list = this.audit.get(entry.submissionId) ?? [];
    // Append-only: entri tidak pernah diganti atau dibuang.
    if (!list.some((e) => e.auditId === entry.auditId)) list.push(clone(entry));
    this.audit.set(entry.submissionId, list);
    const submission = this.submissions.get(entry.submissionId);
    if (submission) {
      submission.auditTrail = [...submission.auditTrail, clone(entry)];
    }
    return clone(entry);
  }

  private audits(submissionId: string): PlaceCorrectionAuditEntry[] {
    return this.audit.get(submissionId) ?? [];
  }

  private makeAudit(params: {
    submissionId: string;
    action: PlaceCorrectionAuditEntry["action"];
    actorType: PlaceCorrectionAuditEntry["actorType"];
    trustedActorId?: string;
    reporterUid?: string;
    previousStatus?: SubmissionStatus;
    nextStatus?: SubmissionStatus;
    changedFields?: readonly string[];
    reasonCode: string;
    now: EpochMillis;
  }): PlaceCorrectionAuditEntry {
    return {
      auditId: this.nextId("caud"),
      submissionId: params.submissionId,
      action: params.action,
      actorType: params.actorType,
      trustedActorId: params.trustedActorId,
      reporterUid: params.reporterUid,
      previousStatus: params.previousStatus,
      nextStatus: params.nextStatus,
      changedFields: [...(params.changedFields ?? [])],
      reasonCode: params.reasonCode,
      createdAt: params.now,
    };
  }

  private buildSubmission(
    input: ClientSubmissionInput,
    reporterUid: string,
    now: EpochMillis,
    status: SubmissionStatus,
  ): PlaceCorrectionSubmission {
    const category = input.category as ReportCategory;
    const rule = getCategoryRule(category);
    const affectedFields = input.affectedFields as readonly CorrectableField[];
    const dedupKey = dedupKeyFor({
      placeId: input.placeId,
      category,
      affectedFields,
      submittedBy: reporterUid,
      proposal: input.proposedValues,
    });
    return {
      submissionId: this.nextId("sub"),
      placeId: input.placeId,
      publicationId: input.originalSnapshot?.publicationId,
      publicationVersion: input.originalSnapshot?.publicationVersion,
      sourceMode: input.originalSnapshot!.sourceMode,
      submittedBy: reporterUid,
      submittedAt: now,
      submissionType: input.submissionType as SubmissionType,
      category,
      affectedFields: [...affectedFields],
      // Snapshot dibekukan di sini dan TIDAK PERNAH ditulis ganti kemudian.
      originalSnapshot: clone(input.originalSnapshot!),
      proposedValues: clone(input.proposedValues),
      evidence: input.evidence.map(clone),
      description: input.description,
      severity: (input.severity as ReportSeverity) ?? rule.defaultSeverity,
      status,
      auditTrail: [],
      clientMetadata: (input.clientMetadata as PlaceCorrectionSubmission["clientMetadata"]) ?? {
        appVersion: "test",
        platform: "test",
        locale: "ms",
        surface: "canonical_detail",
      },
      algorithmVersion: CORRECTION_ALGORITHM_VERSION,
      schemaVersion: CORRECTION_SCHEMA_VERSION,
      dedupKey,
    };
  }

  // ---------------------------------------------------------------------
  // Pelapor
  // ---------------------------------------------------------------------

  async saveDraft(
    input: ClientSubmissionInput,
    reporterUid: string,
    now: EpochMillis,
  ): Promise<PlaceCorrectionSubmission> {
    const draft = this.buildSubmission(input, reporterUid, now, "draft");
    this.submissions.set(draft.submissionId, draft);
    this.order.push(draft.submissionId);
    this.appendAuditEntry(
      this.makeAudit({
        submissionId: draft.submissionId,
        action: "draft_created",
        actorType: "reporter",
        reporterUid,
        nextStatus: "draft",
        reasonCode: "draft_created",
        now,
      }),
    );
    return clone(draft);
  }

  async submit(
    input: ClientSubmissionInput,
    reporterUid: string,
    now: EpochMillis,
  ): Promise<SubmitResult> {
    const validation = validatePlaceCorrectionSubmission(input, this.limits);
    const rateLimit = await this.evaluate(reporterUid, input.placeId, now);

    if (!validation.valid) {
      const failed = this.buildSubmission(input, reporterUid, now, "validation_failed");
      this.submissions.set(failed.submissionId, failed);
      this.order.push(failed.submissionId);
      this.appendAuditEntry(
        this.makeAudit({
          submissionId: failed.submissionId,
          action: "validation_failed",
          actorType: "system",
          nextStatus: "validation_failed",
          changedFields: validation.errors,
          reasonCode: "validation_failed",
          now,
        }),
      );
      return {
        submission: clone(this.submissions.get(failed.submissionId)!),
        deduplicated: false,
        rateLimit,
        validationErrors: validation.errors,
      };
    }

    if (!rateLimit.allowed) {
      // Tiada rekod dicipta — laporan spam tidak menghasilkan data.
      throw new Error(`rate_limited: ${rateLimit.reasons.join(",")}`);
    }

    const dedupKey = dedupKeyFor({
      placeId: input.placeId,
      category: input.category as ReportCategory,
      affectedFields: input.affectedFields as readonly CorrectableField[],
      submittedBy: reporterUid,
      proposal: input.proposedValues,
    });
    const duplicate = findOpenDuplicate(this.all(), dedupKey);
    if (duplicate.isDuplicate && duplicate.existing) {
      // Penghantaran serupa berulang → gunakan semula rekod terbuka sedia ada.
      this.appendAuditEntry(
        this.makeAudit({
          submissionId: duplicate.existing.submissionId,
          action: "duplicate_detected",
          actorType: "system",
          reporterUid,
          reasonCode: "identical_open_submission",
          now,
        }),
      );
      return {
        submission: clone(this.submissions.get(duplicate.existing.submissionId)!),
        deduplicated: true,
        rateLimit,
        validationErrors: [],
      };
    }

    const submission = this.buildSubmission(input, reporterUid, now, "submitted");
    this.submissions.set(submission.submissionId, submission);
    this.order.push(submission.submissionId);
    this.appendAuditEntry(
      this.makeAudit({
        submissionId: submission.submissionId,
        action: "submitted",
        actorType: "reporter",
        reporterUid,
        nextStatus: "submitted",
        changedFields: submission.affectedFields,
        reasonCode: "submitted",
        now,
      }),
    );
    // Baris gilir automatik oleh sistem (bukan pengguna).
    const stored = this.submissions.get(submission.submissionId)!;
    assertValidPlaceReportTransition("submitted", "queued", {
      actorType: "system",
      actorId: "system",
      reasonCode: "auto_queue",
    });
    stored.status = "queued";
    this.appendAuditEntry(
      this.makeAudit({
        submissionId: stored.submissionId,
        action: "queued",
        actorType: "system",
        previousStatus: "submitted",
        nextStatus: "queued",
        reasonCode: "auto_queue",
        now,
      }),
    );
    await this.recordSubmission(reporterUid, input.placeId, now);

    return {
      submission: clone(stored),
      deduplicated: false,
      rateLimit,
      validationErrors: [],
    };
  }

  async getOwnSubmission(
    submissionId: string,
    reporterUid: string,
  ): Promise<ReporterVisibleSubmission | null> {
    const submission = this.submissions.get(submissionId);
    if (!submission) return null;
    // MELEMPAR bila bukan pemilik — laporan adalah persendirian.
    return toReporterVisibleSubmission(submission, reporterUid);
  }

  async listOwnSubmissions(
    reporterUid: string,
    page: CorrectionPagination,
  ): Promise<CorrectionPage<ReporterVisibleSubmission>> {
    const mine = this.all()
      .filter((s) => s.submittedBy === reporterUid)
      .map((s) => toReporterVisibleSubmission(s, reporterUid));
    return paginate(mine, (s) => s.submissionId, page);
  }

  async appendEvidence(
    submissionId: string,
    evidence: PlaceReportEvidence,
    reporterUid: string,
    now: EpochMillis,
  ): Promise<PlaceCorrectionSubmission> {
    const submission = this.submissions.get(submissionId);
    if (!submission) throw new Error(`submission not found: ${submissionId}`);
    if (submission.submittedBy !== reporterUid) throw new Error("forbidden: not your submission");
    if (submission.evidence.length >= this.limits.maxEvidenceItems) {
      throw new Error("too_many_evidence_items");
    }
    const before = clone(submission.originalSnapshot);
    submission.evidence = [...submission.evidence, clone(evidence)];
    // Snapshot asal MESTI kekal tidak berubah.
    submission.originalSnapshot = before;
    this.appendAuditEntry(
      this.makeAudit({
        submissionId,
        action: "evidence_added",
        actorType: "reporter",
        reporterUid,
        changedFields: ["evidence"],
        reasonCode: "evidence_added",
        now,
      }),
    );
    return clone(submission);
  }

  async withdraw(
    submissionId: string,
    reporterUid: string,
    now: EpochMillis,
  ): Promise<PlaceCorrectionSubmission> {
    const submission = this.submissions.get(submissionId);
    if (!submission) throw new Error(`submission not found: ${submissionId}`);
    if (submission.submittedBy !== reporterUid) throw new Error("forbidden: not your submission");
    assertValidPlaceReportTransition(submission.status, "withdrawn", {
      actorType: "reporter",
      actorId: reporterUid,
    });
    const previous = submission.status;
    submission.status = "withdrawn";
    this.appendAuditEntry(
      this.makeAudit({
        submissionId,
        action: "withdrawn",
        actorType: "reporter",
        reporterUid,
        previousStatus: previous,
        nextStatus: "withdrawn",
        reasonCode: "withdrawn_by_reporter",
        now,
      }),
    );
    return clone(submission);
  }

  // ---------------------------------------------------------------------
  // Penyemak dipercayai
  // ---------------------------------------------------------------------

  async listForReview(
    filter: SubmissionFilter,
    page: CorrectionPagination,
    _actor: TrustedActor,
  ): Promise<CorrectionPage<ReviewerVisibleSubmission>> {
    let rows = this.all();
    if (filter.status) rows = rows.filter((s) => s.status === filter.status);
    if (filter.category) rows = rows.filter((s) => s.category === filter.category);
    if (filter.placeId) rows = rows.filter((s) => s.placeId === filter.placeId);
    if (filter.assignedReviewer) rows = rows.filter((s) => s.assignedReviewer === filter.assignedReviewer);
    if (filter.safetySensitiveOnly) {
      rows = rows.filter((s) => getCategoryRule(s.category).safetySensitive);
    }
    return paginate(rows.map(toReviewerVisibleSubmission), (s) => s.submissionId, page);
  }

  async getForReview(
    submissionId: string,
    _actor: TrustedActor,
  ): Promise<ReviewerVisibleSubmission | null> {
    const submission = this.submissions.get(submissionId);
    // Klon: pemanggil tidak boleh mencapai semula keadaan dalaman (snapshot
    // asal mesti kekal tidak boleh diubah oleh sesiapa di luar repository).
    return submission ? clone(toReviewerVisibleSubmission(submission)) : null;
  }

  async assignReviewer(
    submissionId: string,
    reviewerId: string,
    actor: TrustedActor,
    now: EpochMillis,
  ): Promise<ReviewerVisibleSubmission> {
    const submission = this.submissions.get(submissionId);
    if (!submission) throw new Error(`submission not found: ${submissionId}`);
    submission.assignedReviewer = reviewerId;
    if (submission.status === "queued") {
      assertValidPlaceReportTransition("queued", "under_review", {
        actorType: "trusted_reviewer",
        actorId: actor.actorUid,
        reasonCode: "review_started",
      });
      submission.status = "under_review";
      this.appendAuditEntry(
        this.makeAudit({
          submissionId,
          action: "review_started",
          actorType: "trusted_reviewer",
          trustedActorId: actor.actorUid,
          previousStatus: "queued",
          nextStatus: "under_review",
          reasonCode: "review_started",
          now,
        }),
      );
    }
    this.appendAuditEntry(
      this.makeAudit({
        submissionId,
        action: "assigned",
        actorType: "trusted_reviewer",
        trustedActorId: actor.actorUid,
        changedFields: ["assignedReviewer"],
        reasonCode: "assigned",
        now,
      }),
    );
    return clone(toReviewerVisibleSubmission(submission));
  }

  async markDuplicate(
    submissionId: string,
    duplicateOfSubmissionId: string,
    actor: TrustedActor,
    now: EpochMillis,
  ): Promise<ReviewerVisibleSubmission> {
    const submission = this.submissions.get(submissionId);
    if (!submission) throw new Error(`submission not found: ${submissionId}`);
    if (!this.submissions.has(duplicateOfSubmissionId)) {
      throw new Error(`duplicate target not found: ${duplicateOfSubmissionId}`);
    }
    const previous = submission.status;
    assertValidPlaceReportTransition(previous, "duplicate_report", {
      actorType: "trusted_reviewer",
      actorId: actor.actorUid,
      reasonCode: "duplicate_confirmed",
    });
    submission.status = "duplicate_report";
    submission.duplicateOfSubmissionId = duplicateOfSubmissionId;
    this.appendAuditEntry(
      this.makeAudit({
        submissionId,
        action: "duplicate_confirmed",
        actorType: "trusted_reviewer",
        trustedActorId: actor.actorUid,
        previousStatus: previous,
        nextStatus: "duplicate_report",
        reasonCode: "duplicate_confirmed",
        now,
      }),
    );
    return clone(toReviewerVisibleSubmission(submission));
  }

  // ---------------------------------------------------------------------
  // Keputusan
  // ---------------------------------------------------------------------

  async recordDecision(params: {
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
  }): Promise<PlaceReportReviewDecision> {
    const submission = this.submissions.get(params.submissionId);
    if (!submission) throw new Error(`submission not found: ${params.submissionId}`);

    const validation = validateReviewDecision(params.decision, {
      reasonCode: params.reasonCode,
      acceptedFields: params.acceptedFields as readonly CorrectableField[] | undefined,
      duplicateOfSubmissionId: params.duplicateOfSubmissionId,
      requiredEvidence: params.requiredEvidence,
      evidenceSummary: params.evidenceSummary,
    });
    if (!validation.valid) {
      throw new Error(`invalid decision: ${validation.reasons.join(",")}`);
    }

    const previousStatus = submission.status;
    const nextStatus = DECISION_NEXT_STATUS[params.decision];
    assertValidPlaceReportTransition(previousStatus, nextStatus, {
      actorType: "trusted_reviewer",
      actorId: params.actor.actorUid,
      reasonCode: params.decision === "reopen" ? "reopen" : params.reasonCode,
    });

    let stagingRecordId: string | undefined;
    const accepting =
      params.decision === "accept_for_staging" ||
      params.decision === "confirm_closure_report" ||
      params.decision === "confirm_moved_report" ||
      params.decision === "confirm_unsafe_claim";

    if (accepting) {
      // Penerimaan mencipta CADANGAN STAGING sahaja — tiada penerbitan,
      // tiada kemas kini canonical, tiada pensijilan keselamatan automatik.
      stagingRecordId = this.nextId("stgprop");
      this.stagingProposals.set(stagingRecordId, {
        stagingProposalId: stagingRecordId,
        submissionId: submission.submissionId,
        placeId: submission.placeId,
        acceptedFields: [...(params.acceptedFields ?? [])],
        createdBy: params.actor.actorUid,
        createdAt: params.now,
        published: false,
        mockOnly: true,
      });
      submission.stagingProposalId = stagingRecordId;
    }

    const auditEntry = this.appendAuditEntry(
      this.makeAudit({
        submissionId: submission.submissionId,
        action:
          params.decision === "request_more_evidence"
            ? "more_evidence_requested"
            : accepting
              ? "accepted_for_staging"
              : params.decision === "reopen"
                ? "reopened"
                : params.decision === "mark_duplicate"
                  ? "duplicate_confirmed"
                  : "rejected",
        actorType: "trusted_reviewer",
        trustedActorId: params.actor.actorUid,
        previousStatus,
        nextStatus,
        changedFields: params.acceptedFields ?? [],
        reasonCode: params.reasonCode,
        now: params.now,
      }),
    );

    if (stagingRecordId) {
      this.appendAuditEntry(
        this.makeAudit({
          submissionId: submission.submissionId,
          action: "staging_reference_created",
          actorType: "trusted_reviewer",
          trustedActorId: params.actor.actorUid,
          changedFields: [stagingRecordId],
          reasonCode: "staging_proposal_created",
          now: params.now,
        }),
      );
    }

    submission.status = nextStatus;
    submission.reviewedBy = params.actor.actorUid;
    submission.reviewedAt = params.now;
    submission.decision = params.decision;
    submission.decisionReason = params.reasonCode;
    if (params.duplicateOfSubmissionId) {
      submission.duplicateOfSubmissionId = params.duplicateOfSubmissionId;
    }

    const decision: PlaceReportReviewDecision = {
      decisionId: this.nextId("dec"),
      submissionId: submission.submissionId,
      decision: params.decision,
      decidedBy: params.actor.actorUid,
      decidedAt: params.now,
      reasonCode: params.reasonCode,
      notes: params.notes,
      acceptedFields: (params.acceptedFields ?? []) as readonly CorrectableField[],
      rejectedFields: (params.rejectedFields ?? []) as readonly CorrectableField[],
      stagingRecordId,
      duplicateOfSubmissionId: params.duplicateOfSubmissionId,
      requiredEvidence: params.requiredEvidence,
      previousStatus,
      nextStatus,
      auditEntryId: auditEntry.auditId,
    };
    this.decisions.set(decision.decisionId, decision);
    return clone(decision);
  }

  async getDecision(
    decisionId: string,
    _actor: TrustedActor,
  ): Promise<PlaceReportReviewDecision | null> {
    const d = this.decisions.get(decisionId);
    return d ? clone(d) : null;
  }

  async listDecisions(
    submissionId: string,
    _actor: TrustedActor,
  ): Promise<readonly PlaceReportReviewDecision[]> {
    return [...this.decisions.values()]
      .filter((d) => d.submissionId === submissionId)
      .map(clone);
  }

  // ---------------------------------------------------------------------
  // Audit & had kadar
  // ---------------------------------------------------------------------

  async appendAudit(entry: PlaceCorrectionAuditEntry): Promise<PlaceCorrectionAuditEntry> {
    return this.appendAuditEntry(entry);
  }

  async listAudit(
    submissionId: string,
    _actor: TrustedActor,
    page: CorrectionPagination,
  ): Promise<CorrectionPage<PlaceCorrectionAuditEntry>> {
    return paginate(this.audits(submissionId), (e) => e.auditId, page);
  }

  async evaluate(reporterUid: string, placeId: string, now: EpochMillis) {
    return evaluateRateLimit(
      { submittedBy: reporterUid, placeId, now, userSubmissions: this.all() },
      this.limits,
    );
  }

  async recordSubmission(
    _reporterUid: string,
    _placeId: string,
    _now: EpochMillis,
  ): Promise<void> {
    // Kiraan diperoleh daripada penghantaran tersimpan; tiada kaunter berasingan.
  }

  /** Pengendali pelapor tanpa nama (untuk paparan penyemak/ujian). */
  reporterHandleFor(submissionId: string): string {
    const s = this.submissions.get(submissionId)!;
    return anonymizeReporter(s.submittedBy, s.placeId);
  }

  /** Hash snapshot semasa — digunakan untuk membuktikan ketidakubahan. */
  snapshotHash(submissionId: string): string {
    return hashCanonical(this.submissions.get(submissionId)!.originalSnapshot);
  }
}
