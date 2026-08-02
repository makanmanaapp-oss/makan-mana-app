"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryCorrectionStore = void 0;
const hashing_1 = require("../staging/hashing");
const correctionCategories_1 = require("./correctionCategories");
const correctionDedup_1 = require("./correctionDedup");
const correctionPrivacy_1 = require("./correctionPrivacy");
const correctionRepository_1 = require("./correctionRepository");
const correctionStateMachine_1 = require("./correctionStateMachine");
const correctionTypes_1 = require("./correctionTypes");
const correctionValidation_1 = require("./correctionValidation");
function clone(v) {
    return JSON.parse(JSON.stringify(v));
}
function paginate(ordered, idOf, page) {
    const limit = Math.max(1, Math.min(page.limit, correctionRepository_1.MAX_CORRECTION_PAGE_LIMIT));
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
class InMemoryCorrectionStore {
    limits;
    submissions = new Map();
    order = [];
    decisions = new Map();
    audit = new Map();
    stagingProposals = new Map();
    sequence = 0;
    // Tiada jam disuntik: setiap entri audit membawa cap masanya sendiri
    // daripada pemanggil, jadi stor ini tidak pernah mengarang masa.
    constructor(limits = correctionDedup_1.DEFAULT_CORRECTION_LIMITS) {
        this.limits = limits;
    }
    reset() {
        this.submissions.clear();
        this.order = [];
        this.decisions.clear();
        this.audit.clear();
        this.stagingProposals.clear();
        this.sequence = 0;
    }
    listStagingProposals() {
        return [...this.stagingProposals.values()].map(clone);
    }
    nextId(prefix) {
        this.sequence += 1;
        return `${prefix}_${String(this.sequence).padStart(6, "0")}`;
    }
    all() {
        return this.order.map((id) => this.submissions.get(id));
    }
    appendAuditEntry(entry) {
        const list = this.audit.get(entry.submissionId) ?? [];
        // Append-only: entri tidak pernah diganti atau dibuang.
        if (!list.some((e) => e.auditId === entry.auditId))
            list.push(clone(entry));
        this.audit.set(entry.submissionId, list);
        const submission = this.submissions.get(entry.submissionId);
        if (submission) {
            submission.auditTrail = [...submission.auditTrail, clone(entry)];
        }
        return clone(entry);
    }
    audits(submissionId) {
        return this.audit.get(submissionId) ?? [];
    }
    makeAudit(params) {
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
    buildSubmission(input, reporterUid, now, status) {
        const category = input.category;
        const rule = (0, correctionCategories_1.getCategoryRule)(category);
        const affectedFields = input.affectedFields;
        const dedupKey = (0, correctionDedup_1.dedupKeyFor)({
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
            sourceMode: input.originalSnapshot.sourceMode,
            submittedBy: reporterUid,
            submittedAt: now,
            submissionType: input.submissionType,
            category,
            affectedFields: [...affectedFields],
            // Snapshot dibekukan di sini dan TIDAK PERNAH ditulis ganti kemudian.
            originalSnapshot: clone(input.originalSnapshot),
            proposedValues: clone(input.proposedValues),
            evidence: input.evidence.map(clone),
            description: input.description,
            severity: input.severity ?? rule.defaultSeverity,
            status,
            auditTrail: [],
            clientMetadata: input.clientMetadata ?? {
                appVersion: "test",
                platform: "test",
                locale: "ms",
                surface: "canonical_detail",
            },
            algorithmVersion: correctionTypes_1.CORRECTION_ALGORITHM_VERSION,
            schemaVersion: correctionTypes_1.CORRECTION_SCHEMA_VERSION,
            dedupKey,
        };
    }
    // ---------------------------------------------------------------------
    // Pelapor
    // ---------------------------------------------------------------------
    async saveDraft(input, reporterUid, now) {
        const draft = this.buildSubmission(input, reporterUid, now, "draft");
        this.submissions.set(draft.submissionId, draft);
        this.order.push(draft.submissionId);
        this.appendAuditEntry(this.makeAudit({
            submissionId: draft.submissionId,
            action: "draft_created",
            actorType: "reporter",
            reporterUid,
            nextStatus: "draft",
            reasonCode: "draft_created",
            now,
        }));
        return clone(draft);
    }
    async submit(input, reporterUid, now) {
        const validation = (0, correctionValidation_1.validatePlaceCorrectionSubmission)(input, this.limits);
        const rateLimit = await this.evaluate(reporterUid, input.placeId, now);
        if (!validation.valid) {
            const failed = this.buildSubmission(input, reporterUid, now, "validation_failed");
            this.submissions.set(failed.submissionId, failed);
            this.order.push(failed.submissionId);
            this.appendAuditEntry(this.makeAudit({
                submissionId: failed.submissionId,
                action: "validation_failed",
                actorType: "system",
                nextStatus: "validation_failed",
                changedFields: validation.errors,
                reasonCode: "validation_failed",
                now,
            }));
            return {
                submission: clone(this.submissions.get(failed.submissionId)),
                deduplicated: false,
                rateLimit,
                validationErrors: validation.errors,
            };
        }
        if (!rateLimit.allowed) {
            // Tiada rekod dicipta — laporan spam tidak menghasilkan data.
            throw new Error(`rate_limited: ${rateLimit.reasons.join(",")}`);
        }
        const dedupKey = (0, correctionDedup_1.dedupKeyFor)({
            placeId: input.placeId,
            category: input.category,
            affectedFields: input.affectedFields,
            submittedBy: reporterUid,
            proposal: input.proposedValues,
        });
        const duplicate = (0, correctionDedup_1.findOpenDuplicate)(this.all(), dedupKey);
        if (duplicate.isDuplicate && duplicate.existing) {
            // Penghantaran serupa berulang → gunakan semula rekod terbuka sedia ada.
            this.appendAuditEntry(this.makeAudit({
                submissionId: duplicate.existing.submissionId,
                action: "duplicate_detected",
                actorType: "system",
                reporterUid,
                reasonCode: "identical_open_submission",
                now,
            }));
            return {
                submission: clone(this.submissions.get(duplicate.existing.submissionId)),
                deduplicated: true,
                rateLimit,
                validationErrors: [],
            };
        }
        const submission = this.buildSubmission(input, reporterUid, now, "submitted");
        this.submissions.set(submission.submissionId, submission);
        this.order.push(submission.submissionId);
        this.appendAuditEntry(this.makeAudit({
            submissionId: submission.submissionId,
            action: "submitted",
            actorType: "reporter",
            reporterUid,
            nextStatus: "submitted",
            changedFields: submission.affectedFields,
            reasonCode: "submitted",
            now,
        }));
        // Baris gilir automatik oleh sistem (bukan pengguna).
        const stored = this.submissions.get(submission.submissionId);
        (0, correctionStateMachine_1.assertValidPlaceReportTransition)("submitted", "queued", {
            actorType: "system",
            actorId: "system",
            reasonCode: "auto_queue",
        });
        stored.status = "queued";
        this.appendAuditEntry(this.makeAudit({
            submissionId: stored.submissionId,
            action: "queued",
            actorType: "system",
            previousStatus: "submitted",
            nextStatus: "queued",
            reasonCode: "auto_queue",
            now,
        }));
        await this.recordSubmission(reporterUid, input.placeId, now);
        return {
            submission: clone(stored),
            deduplicated: false,
            rateLimit,
            validationErrors: [],
        };
    }
    async getOwnSubmission(submissionId, reporterUid) {
        const submission = this.submissions.get(submissionId);
        if (!submission)
            return null;
        // MELEMPAR bila bukan pemilik — laporan adalah persendirian.
        return (0, correctionPrivacy_1.toReporterVisibleSubmission)(submission, reporterUid);
    }
    async listOwnSubmissions(reporterUid, page) {
        const mine = this.all()
            .filter((s) => s.submittedBy === reporterUid)
            .map((s) => (0, correctionPrivacy_1.toReporterVisibleSubmission)(s, reporterUid));
        return paginate(mine, (s) => s.submissionId, page);
    }
    async appendEvidence(submissionId, evidence, reporterUid, now) {
        const submission = this.submissions.get(submissionId);
        if (!submission)
            throw new Error(`submission not found: ${submissionId}`);
        if (submission.submittedBy !== reporterUid)
            throw new Error("forbidden: not your submission");
        if (submission.evidence.length >= this.limits.maxEvidenceItems) {
            throw new Error("too_many_evidence_items");
        }
        const before = clone(submission.originalSnapshot);
        submission.evidence = [...submission.evidence, clone(evidence)];
        // Snapshot asal MESTI kekal tidak berubah.
        submission.originalSnapshot = before;
        this.appendAuditEntry(this.makeAudit({
            submissionId,
            action: "evidence_added",
            actorType: "reporter",
            reporterUid,
            changedFields: ["evidence"],
            reasonCode: "evidence_added",
            now,
        }));
        return clone(submission);
    }
    async withdraw(submissionId, reporterUid, now) {
        const submission = this.submissions.get(submissionId);
        if (!submission)
            throw new Error(`submission not found: ${submissionId}`);
        if (submission.submittedBy !== reporterUid)
            throw new Error("forbidden: not your submission");
        (0, correctionStateMachine_1.assertValidPlaceReportTransition)(submission.status, "withdrawn", {
            actorType: "reporter",
            actorId: reporterUid,
        });
        const previous = submission.status;
        submission.status = "withdrawn";
        this.appendAuditEntry(this.makeAudit({
            submissionId,
            action: "withdrawn",
            actorType: "reporter",
            reporterUid,
            previousStatus: previous,
            nextStatus: "withdrawn",
            reasonCode: "withdrawn_by_reporter",
            now,
        }));
        return clone(submission);
    }
    // ---------------------------------------------------------------------
    // Penyemak dipercayai
    // ---------------------------------------------------------------------
    async listForReview(filter, page, _actor) {
        let rows = this.all();
        if (filter.status)
            rows = rows.filter((s) => s.status === filter.status);
        if (filter.category)
            rows = rows.filter((s) => s.category === filter.category);
        if (filter.placeId)
            rows = rows.filter((s) => s.placeId === filter.placeId);
        if (filter.assignedReviewer)
            rows = rows.filter((s) => s.assignedReviewer === filter.assignedReviewer);
        if (filter.safetySensitiveOnly) {
            rows = rows.filter((s) => (0, correctionCategories_1.getCategoryRule)(s.category).safetySensitive);
        }
        return paginate(rows.map(correctionPrivacy_1.toReviewerVisibleSubmission), (s) => s.submissionId, page);
    }
    async getForReview(submissionId, _actor) {
        const submission = this.submissions.get(submissionId);
        // Klon: pemanggil tidak boleh mencapai semula keadaan dalaman (snapshot
        // asal mesti kekal tidak boleh diubah oleh sesiapa di luar repository).
        return submission ? clone((0, correctionPrivacy_1.toReviewerVisibleSubmission)(submission)) : null;
    }
    async assignReviewer(submissionId, reviewerId, actor, now) {
        const submission = this.submissions.get(submissionId);
        if (!submission)
            throw new Error(`submission not found: ${submissionId}`);
        submission.assignedReviewer = reviewerId;
        if (submission.status === "queued") {
            (0, correctionStateMachine_1.assertValidPlaceReportTransition)("queued", "under_review", {
                actorType: "trusted_reviewer",
                actorId: actor.actorUid,
                reasonCode: "review_started",
            });
            submission.status = "under_review";
            this.appendAuditEntry(this.makeAudit({
                submissionId,
                action: "review_started",
                actorType: "trusted_reviewer",
                trustedActorId: actor.actorUid,
                previousStatus: "queued",
                nextStatus: "under_review",
                reasonCode: "review_started",
                now,
            }));
        }
        this.appendAuditEntry(this.makeAudit({
            submissionId,
            action: "assigned",
            actorType: "trusted_reviewer",
            trustedActorId: actor.actorUid,
            changedFields: ["assignedReviewer"],
            reasonCode: "assigned",
            now,
        }));
        return clone((0, correctionPrivacy_1.toReviewerVisibleSubmission)(submission));
    }
    async markDuplicate(submissionId, duplicateOfSubmissionId, actor, now) {
        const submission = this.submissions.get(submissionId);
        if (!submission)
            throw new Error(`submission not found: ${submissionId}`);
        if (!this.submissions.has(duplicateOfSubmissionId)) {
            throw new Error(`duplicate target not found: ${duplicateOfSubmissionId}`);
        }
        const previous = submission.status;
        (0, correctionStateMachine_1.assertValidPlaceReportTransition)(previous, "duplicate_report", {
            actorType: "trusted_reviewer",
            actorId: actor.actorUid,
            reasonCode: "duplicate_confirmed",
        });
        submission.status = "duplicate_report";
        submission.duplicateOfSubmissionId = duplicateOfSubmissionId;
        this.appendAuditEntry(this.makeAudit({
            submissionId,
            action: "duplicate_confirmed",
            actorType: "trusted_reviewer",
            trustedActorId: actor.actorUid,
            previousStatus: previous,
            nextStatus: "duplicate_report",
            reasonCode: "duplicate_confirmed",
            now,
        }));
        return clone((0, correctionPrivacy_1.toReviewerVisibleSubmission)(submission));
    }
    // ---------------------------------------------------------------------
    // Keputusan
    // ---------------------------------------------------------------------
    async recordDecision(params) {
        const submission = this.submissions.get(params.submissionId);
        if (!submission)
            throw new Error(`submission not found: ${params.submissionId}`);
        const validation = (0, correctionStateMachine_1.validateReviewDecision)(params.decision, {
            reasonCode: params.reasonCode,
            acceptedFields: params.acceptedFields,
            duplicateOfSubmissionId: params.duplicateOfSubmissionId,
            requiredEvidence: params.requiredEvidence,
            evidenceSummary: params.evidenceSummary,
        });
        if (!validation.valid) {
            throw new Error(`invalid decision: ${validation.reasons.join(",")}`);
        }
        const previousStatus = submission.status;
        const nextStatus = correctionStateMachine_1.DECISION_NEXT_STATUS[params.decision];
        (0, correctionStateMachine_1.assertValidPlaceReportTransition)(previousStatus, nextStatus, {
            actorType: "trusted_reviewer",
            actorId: params.actor.actorUid,
            reasonCode: params.decision === "reopen" ? "reopen" : params.reasonCode,
        });
        let stagingRecordId;
        const accepting = params.decision === "accept_for_staging" ||
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
        const auditEntry = this.appendAuditEntry(this.makeAudit({
            submissionId: submission.submissionId,
            action: params.decision === "request_more_evidence"
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
        }));
        if (stagingRecordId) {
            this.appendAuditEntry(this.makeAudit({
                submissionId: submission.submissionId,
                action: "staging_reference_created",
                actorType: "trusted_reviewer",
                trustedActorId: params.actor.actorUid,
                changedFields: [stagingRecordId],
                reasonCode: "staging_proposal_created",
                now: params.now,
            }));
        }
        submission.status = nextStatus;
        submission.reviewedBy = params.actor.actorUid;
        submission.reviewedAt = params.now;
        submission.decision = params.decision;
        submission.decisionReason = params.reasonCode;
        if (params.duplicateOfSubmissionId) {
            submission.duplicateOfSubmissionId = params.duplicateOfSubmissionId;
        }
        const decision = {
            decisionId: this.nextId("dec"),
            submissionId: submission.submissionId,
            decision: params.decision,
            decidedBy: params.actor.actorUid,
            decidedAt: params.now,
            reasonCode: params.reasonCode,
            notes: params.notes,
            acceptedFields: (params.acceptedFields ?? []),
            rejectedFields: (params.rejectedFields ?? []),
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
    async getDecision(decisionId, _actor) {
        const d = this.decisions.get(decisionId);
        return d ? clone(d) : null;
    }
    async listDecisions(submissionId, _actor) {
        return [...this.decisions.values()]
            .filter((d) => d.submissionId === submissionId)
            .map(clone);
    }
    // ---------------------------------------------------------------------
    // Audit & had kadar
    // ---------------------------------------------------------------------
    async appendAudit(entry) {
        return this.appendAuditEntry(entry);
    }
    async listAudit(submissionId, _actor, page) {
        return paginate(this.audits(submissionId), (e) => e.auditId, page);
    }
    async evaluate(reporterUid, placeId, now) {
        return (0, correctionDedup_1.evaluateRateLimit)({ submittedBy: reporterUid, placeId, now, userSubmissions: this.all() }, this.limits);
    }
    async recordSubmission(_reporterUid, _placeId, _now) {
        // Kiraan diperoleh daripada penghantaran tersimpan; tiada kaunter berasingan.
    }
    /** Pengendali pelapor tanpa nama (untuk paparan penyemak/ujian). */
    reporterHandleFor(submissionId) {
        const s = this.submissions.get(submissionId);
        return (0, correctionPrivacy_1.anonymizeReporter)(s.submittedBy, s.placeId);
    }
    /** Hash snapshot semasa — digunakan untuk membuktikan ketidakubahan. */
    snapshotHash(submissionId) {
        return (0, hashing_1.hashCanonical)(this.submissions.get(submissionId).originalSnapshot);
    }
}
exports.InMemoryCorrectionStore = InMemoryCorrectionStore;
