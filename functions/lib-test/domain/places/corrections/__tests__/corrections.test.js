"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.11 Part V — ujian unit pembetulan/laporan (1-32 bahagian backend).
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
/** Stor dalam-ingatan tidak memegang jam: masa disuntik pada setiap panggilan. */
function store(limits = index_1.DEFAULT_CORRECTION_LIMITS) {
    return new index_1.InMemoryCorrectionStore(limits);
}
/** Had longgar supaya ujian tidak terhalang oleh cooldown. */
const LOOSE = (0, index_1.withCorrectionLimits)({ cooldownSeconds: 0, maxReportsPerPlacePerDay: 100, maxOpenReportsPerUser: 100 });
// ---- 1-12: pengesahan ----
(0, node_test_1.default)("1. penghantaran pembetulan sah lulus", () => {
    const r = (0, index_1.validatePlaceCorrectionSubmission)((0, fixtures_1.submissionInput)());
    strict_1.default.equal(r.valid, true, r.errors.join(","));
});
(0, node_test_1.default)("2. placeId tiada gagal", () => {
    const r = (0, index_1.validatePlaceCorrectionSubmission)((0, fixtures_1.submissionInput)({ placeId: "" }));
    strict_1.default.equal(r.valid, false);
    strict_1.default.ok(r.errors.includes("place_id_required"));
});
(0, node_test_1.default)("3. snapshot asal tiada gagal", () => {
    const r = (0, index_1.validatePlaceCorrectionSubmission)((0, fixtures_1.submissionInput)({ originalSnapshot: undefined }));
    strict_1.default.equal(r.valid, false);
    strict_1.default.ok(r.errors.includes("original_snapshot_required"));
});
(0, node_test_1.default)("4. pembetulan kosong gagal", () => {
    const r = (0, index_1.validatePlaceCorrectionSubmission)((0, fixtures_1.submissionInput)({ proposedValues: {} }));
    strict_1.default.equal(r.valid, false);
    strict_1.default.ok(r.errors.includes("empty_correction"));
    strict_1.default.equal((0, index_1.validateCorrectionProposal)({}).valid, false);
});
(0, node_test_1.default)("5. kategori tidak disokong gagal", () => {
    const r = (0, index_1.validatePlaceCorrectionSubmission)((0, fixtures_1.submissionInput)({ category: "not_a_category" }));
    strict_1.default.equal(r.valid, false);
    strict_1.default.ok(r.errors.includes("unsupported_category"));
});
(0, node_test_1.default)("6. koordinat tidak sah gagal", () => {
    const r = (0, index_1.validateCorrectionProposal)({ coordinates: { lat: 99, lng: 0 } });
    strict_1.default.equal(r.valid, false);
    strict_1.default.ok(r.errors.includes("invalid_coordinates"));
    strict_1.default.equal((0, index_1.validateCorrectionProposal)({ movedToCoordinates: { lat: 0, lng: 999 } }).valid, false);
});
(0, node_test_1.default)("7. URL tidak sah gagal", () => {
    strict_1.default.equal((0, index_1.isSyntacticallyValidUrl)("https://ok.example.test"), true);
    strict_1.default.equal((0, index_1.isSyntacticallyValidUrl)("javascript:alert(1)"), false);
    strict_1.default.equal((0, index_1.isSyntacticallyValidUrl)("bukan-url"), false);
    strict_1.default.equal((0, index_1.validateCorrectionProposal)({ website: "bukan-url" }).valid, false);
});
(0, node_test_1.default)("8. penerangan terlalu panjang/pendek gagal", () => {
    const long = "x".repeat(index_1.DEFAULT_CORRECTION_LIMITS.maxDescriptionLength + 1);
    strict_1.default.ok((0, index_1.validatePlaceCorrectionSubmission)((0, fixtures_1.submissionInput)({ description: long })).errors.includes("description_too_long"));
    strict_1.default.ok((0, index_1.validatePlaceCorrectionSubmission)((0, fixtures_1.submissionInput)({ description: "pendek" })).errors.includes("description_too_short"));
});
(0, node_test_1.default)("9. terlalu banyak item bukti gagal", () => {
    const many = Array.from({ length: index_1.DEFAULT_CORRECTION_LIMITS.maxEvidenceItems + 1 }, (_, i) => (0, fixtures_1.evidence)({ evidenceId: `ev_${i}` }));
    const r = (0, index_1.validatePlaceCorrectionSubmission)((0, fixtures_1.submissionInput)({ evidence: many }));
    strict_1.default.equal(r.valid, false);
    strict_1.default.ok(r.errors.includes("too_many_evidence_items"));
});
(0, node_test_1.default)("10. pengguna tidak boleh menetapkan penyemak", () => {
    for (const field of ["assignedReviewer", "reviewedBy"]) {
        const r = (0, index_1.validatePlaceCorrectionSubmission)((0, fixtures_1.submissionInput)({ [field]: "admin_1" }));
        strict_1.default.equal(r.valid, false, field);
        strict_1.default.ok(r.errors.some((e) => e.includes("reviewer") || e.includes(field)), field);
    }
});
(0, node_test_1.default)("11. pengguna tidak boleh menetapkan keadaan diluluskan", () => {
    const r = (0, index_1.validatePlaceCorrectionSubmission)((0, fixtures_1.submissionInput)({ approvalState: "approved" }));
    strict_1.default.equal(r.valid, false);
    strict_1.default.ok(r.errors.includes("client_cannot_set_approved_state"));
});
(0, node_test_1.default)("12. pengguna tidak boleh menetapkan keadaan penerbitan/pengesahan", () => {
    strict_1.default.ok((0, index_1.validatePlaceCorrectionSubmission)((0, fixtures_1.submissionInput)({ publicationStatus: "published" })).errors
        .includes("client_cannot_set_publication_or_verification_state"));
    strict_1.default.ok((0, index_1.validatePlaceCorrectionSubmission)((0, fixtures_1.submissionInput)({ verificationStatus: "admin_verified" })).errors
        .includes("client_cannot_set_publication_or_verification_state"));
    strict_1.default.ok((0, index_1.validatePlaceCorrectionSubmission)((0, fixtures_1.submissionInput)({ status: "accepted_for_staging" })).errors
        .some((e) => e.startsWith("client_cannot_set_status")));
});
(0, node_test_1.default)("12b. medan tidak disokong gagal", () => {
    const r = (0, index_1.validateCorrectionProposal)({ notAField: "x" });
    strict_1.default.equal(r.valid, false);
    strict_1.default.ok(r.errors.some((e) => e.startsWith("unsupported_field")));
});
// ---- 13-19: mesin keadaan ----
const reporter = { actorType: "reporter", actorId: fixtures_1.REPORTER };
const trusted = { actorType: "trusted_reviewer", actorId: fixtures_1.REVIEWER.actorUid, reasonCode: "review" };
(0, node_test_1.default)("13. draft → submitted dibenarkan (pelapor)", () => {
    strict_1.default.equal((0, index_1.canTransitionPlaceReportStatus)("draft", "submitted", reporter), true);
});
(0, node_test_1.default)("14. submitted → queued dibenarkan (sistem/dipercayai)", () => {
    strict_1.default.equal((0, index_1.canTransitionPlaceReportStatus)("submitted", "queued", trusted), true);
    strict_1.default.equal((0, index_1.canTransitionPlaceReportStatus)("submitted", "queued", reporter), false);
});
(0, node_test_1.default)("15. queued → under_review dibenarkan", () => {
    strict_1.default.equal((0, index_1.canTransitionPlaceReportStatus)("queued", "under_review", trusted), true);
});
(0, node_test_1.default)("16. under_review → accepted_for_staging dibenarkan", () => {
    strict_1.default.equal((0, index_1.canTransitionPlaceReportStatus)("under_review", "accepted_for_staging", trusted), true);
});
(0, node_test_1.default)("17. draft → resolved DILARANG", () => {
    strict_1.default.equal((0, index_1.canTransitionPlaceReportStatus)("draft", "resolved", trusted), false);
    strict_1.default.equal((0, index_1.canTransitionPlaceReportStatus)("draft", "accepted_for_staging", trusted), false);
    strict_1.default.equal((0, index_1.canTransitionPlaceReportStatus)("submitted", "resolved", trusted), false);
});
(0, node_test_1.default)("18. rejected → accepted DILARANG tanpa reopen", () => {
    strict_1.default.equal((0, index_1.canTransitionPlaceReportStatus)("rejected", "accepted_for_staging", trusted), false);
    strict_1.default.equal((0, index_1.canTransitionPlaceReportStatus)("rejected", "queued", trusted), false);
    strict_1.default.equal((0, index_1.canTransitionPlaceReportStatus)("rejected", "queued", { ...trusted, reasonCode: "reopen" }), true);
});
(0, node_test_1.default)("19. penarikan balik hanya untuk status dibenarkan", () => {
    strict_1.default.equal((0, index_1.canReporterWithdraw)("submitted"), true);
    strict_1.default.equal((0, index_1.canReporterWithdraw)("queued"), true);
    strict_1.default.equal((0, index_1.canReporterWithdraw)("needs_more_evidence"), true);
    strict_1.default.equal((0, index_1.canReporterWithdraw)("under_review"), false);
    strict_1.default.equal((0, index_1.canReporterWithdraw)("resolved"), false);
    strict_1.default.equal((0, index_1.canTransitionPlaceReportStatus)("withdrawn", "under_review", trusted), false);
});
// ---- 20-24: dedup, had kadar, bukti, snapshot ----
(0, node_test_1.default)("20. laporan berulang yang sama dideduplikasi", async () => {
    const s = store(LOOSE);
    const first = await s.submit((0, fixtures_1.submissionInput)(), fixtures_1.REPORTER, fixtures_1.T);
    const second = await s.submit((0, fixtures_1.submissionInput)(), fixtures_1.REPORTER, fixtures_1.T + 2000);
    strict_1.default.equal(second.deduplicated, true);
    strict_1.default.equal(second.submission.submissionId, first.submission.submissionId);
    const mine = await s.listOwnSubmissions(fixtures_1.REPORTER, { limit: 50 });
    strict_1.default.equal(mine.items.length, 1);
});
(0, node_test_1.default)("21. nilai cadangan berbeza mencipta laporan baharu", async () => {
    const s = store(LOOSE);
    const a = await s.submit((0, fixtures_1.submissionInput)(), fixtures_1.REPORTER, fixtures_1.T);
    const b = await s.submit((0, fixtures_1.submissionInput)({ proposedValues: { phone: "+60312340000" } }), fixtures_1.REPORTER, fixtures_1.T + 2000);
    strict_1.default.equal(b.deduplicated, false);
    strict_1.default.notEqual(b.submission.submissionId, a.submission.submissionId);
    strict_1.default.notEqual(a.submission.dedupKey, b.submission.dedupKey);
});
(0, node_test_1.default)("21b. hash cadangan bebas susunan senarai", () => {
    strict_1.default.equal((0, index_1.proposalHash)({ cuisineTagIds: ["malay", "thai"] }), (0, index_1.proposalHash)({ cuisineTagIds: ["thai", "malay"] }));
    strict_1.default.notEqual((0, index_1.proposalHash)({ phone: "a" }), (0, index_1.proposalHash)({ phone: "b" }));
});
(0, node_test_1.default)("21c. penghantaran ditarik balik tidak menyekat laporan baharu", async () => {
    const s = store(LOOSE);
    const first = await s.submit((0, fixtures_1.submissionInput)(), fixtures_1.REPORTER, fixtures_1.T);
    await s.withdraw(first.submission.submissionId, fixtures_1.REPORTER, fixtures_1.T + 1000);
    const again = await s.submit((0, fixtures_1.submissionInput)(), fixtures_1.REPORTER, fixtures_1.T + 5000);
    strict_1.default.equal(again.deduplicated, false, "laporan sah masa hadapan tidak disekat");
});
(0, node_test_1.default)("22. had kadar menyekat spam", async () => {
    const limits = (0, index_1.withCorrectionLimits)({ maxReportsPerPlacePerDay: 2, cooldownSeconds: 0 });
    const s = store(limits);
    await s.submit((0, fixtures_1.submissionInput)({ proposedValues: { phone: "+60300000001" } }), fixtures_1.REPORTER, fixtures_1.T);
    await s.submit((0, fixtures_1.submissionInput)({ proposedValues: { phone: "+60300000002" } }), fixtures_1.REPORTER, fixtures_1.T + 1000);
    await strict_1.default.rejects(() => s.submit((0, fixtures_1.submissionInput)({ proposedValues: { phone: "+60300000003" } }), fixtures_1.REPORTER, fixtures_1.T + 2000), /rate_limited/);
});
(0, node_test_1.default)("22b. cooldown dan had terbuka dinilai secara tulen", () => {
    const base = (0, fixtures_1.submissionInput)();
    const existing = [{
            ...base, submissionId: "s1", submittedBy: fixtures_1.REPORTER, submittedAt: fixtures_1.T, status: "queued",
        }];
    const cooling = (0, index_1.evaluateRateLimit)({ submittedBy: fixtures_1.REPORTER, placeId: "PLACE-MOCK-0001", now: fixtures_1.T + 1000, userSubmissions: existing }, (0, index_1.withCorrectionLimits)({ cooldownSeconds: 60 }));
    strict_1.default.equal(cooling.allowed, false);
    strict_1.default.ok(cooling.reasons.includes("cooldown_active"));
    strict_1.default.ok(cooling.retryAfter > fixtures_1.T);
    const later = (0, index_1.evaluateRateLimit)({ submittedBy: fixtures_1.REPORTER, placeId: "PLACE-MOCK-0001", now: fixtures_1.T + 2 * fixtures_1.DAY, userSubmissions: existing }, (0, index_1.withCorrectionLimits)({ cooldownSeconds: 60 }));
    strict_1.default.equal(later.allowed, true);
});
(0, node_test_1.default)("23. bukti baharu ditambah dengan selamat", async () => {
    const s = store(LOOSE);
    const { submission } = await s.submit((0, fixtures_1.submissionInput)(), fixtures_1.REPORTER, fixtures_1.T);
    const updated = await s.appendEvidence(submission.submissionId, (0, fixtures_1.evidence)({ evidenceId: "ev_extra" }), fixtures_1.REPORTER, fixtures_1.T + 5000);
    strict_1.default.equal(updated.evidence.length, 1);
    const audit = await s.listAudit(submission.submissionId, fixtures_1.REVIEWER, { limit: 50 });
    strict_1.default.ok(audit.items.some((a) => a.action === "evidence_added"));
    // Pengguna lain tidak boleh menambah bukti.
    await strict_1.default.rejects(() => s.appendEvidence(submission.submissionId, (0, fixtures_1.evidence)({ evidenceId: "x" }), fixtures_1.OTHER_REPORTER, fixtures_1.T), /forbidden/);
});
(0, node_test_1.default)("24. snapshot asal kekal IMMUTABLE", async () => {
    const s = store(LOOSE);
    const { submission } = await s.submit((0, fixtures_1.submissionInput)(), fixtures_1.REPORTER, fixtures_1.T);
    const before = s.snapshotHash(submission.submissionId);
    await s.appendEvidence(submission.submissionId, (0, fixtures_1.evidence)({ evidenceId: "e2" }), fixtures_1.REPORTER, fixtures_1.T + 1000);
    await s.assignReviewer(submission.submissionId, "reviewer_1", fixtures_1.REVIEWER, fixtures_1.T + 2000);
    await s.recordDecision({
        submissionId: submission.submissionId, decision: "reject", reasonCode: "insufficient_evidence",
        actor: fixtures_1.REVIEWER, now: fixtures_1.T + 3000,
    });
    strict_1.default.equal(s.snapshotHash(submission.submissionId), before, "snapshot tidak pernah ditulis ganti");
    // Mutasi salinan yang dikembalikan tidak menjejaskan simpanan.
    const copy = await s.getForReview(submission.submissionId, fixtures_1.REVIEWER);
    copy.originalSnapshot.title = "DIUBAH";
    strict_1.default.equal(s.snapshotHash(submission.submissionId), before);
});
// ---- 25: privasi ----
(0, node_test_1.default)("25. identiti pelapor tersembunyi daripada paparan selamat-awam", async () => {
    const s = store(LOOSE);
    const { submission } = await s.submit((0, fixtures_1.submissionInput)(), fixtures_1.REPORTER, fixtures_1.T);
    const mine = await s.getOwnSubmission(submission.submissionId, fixtures_1.REPORTER);
    strict_1.default.ok(mine);
    strict_1.default.equal((0, index_1.containsForbiddenPublicField)(mine), null, "tiada medan terlarang");
    strict_1.default.equal(mine.submittedBy, undefined);
    strict_1.default.equal(mine.reviewedBy, undefined);
    // Pengguna LAIN tidak boleh membaca laporan ini.
    await strict_1.default.rejects(() => s.getOwnSubmission(submission.submissionId, fixtures_1.OTHER_REPORTER), /forbidden/);
    // Paparan penyemak menganonimkan pelapor.
    const reviewerView = await s.getForReview(submission.submissionId, fixtures_1.REVIEWER);
    strict_1.default.equal(reviewerView.submittedBy, undefined);
    strict_1.default.ok(reviewerView.reporterHandle.startsWith("reporter_"));
    strict_1.default.equal(reviewerView.reporterHandle.includes(fixtures_1.REPORTER), false);
});
(0, node_test_1.default)("25b. pengendali pelapor deterministik tetapi tidak boleh dipulihkan", async () => {
    const s = store(LOOSE);
    const a = await s.submit((0, fixtures_1.submissionInput)(), fixtures_1.REPORTER, fixtures_1.T);
    const handle1 = s.reporterHandleFor(a.submission.submissionId);
    const view = (0, index_1.toReviewerVisibleSubmission)({ ...a.submission });
    strict_1.default.equal(view.reporterHandle, handle1);
});
// ---- 26-29: peraturan keselamatan & kategori ----
(0, node_test_1.default)("26. laporan halal pengguna TIDAK boleh mensijilkan", async () => {
    const rule = (0, index_1.getCategoryRule)("wrong_halal_status");
    strict_1.default.equal(rule.safetySensitive, true);
    strict_1.default.equal(rule.automaticActionForbidden, true);
    strict_1.default.equal(rule.allowsExactProposedValue, false);
    strict_1.default.equal(rule.adminReviewMandatory, true);
    strict_1.default.equal((0, index_1.decisionGrantsVerifiedSafety)(), false);
    const s = store(LOOSE);
    const { submission } = await s.submit((0, fixtures_1.halalInput)(), fixtures_1.REPORTER, fixtures_1.T);
    await s.assignReviewer(submission.submissionId, "safety_1", fixtures_1.REVIEWER, fixtures_1.T + 1000);
    const decision = await s.recordDecision({
        submissionId: submission.submissionId,
        decision: "accept_for_staging",
        reasonCode: "evidence_plausible",
        acceptedFields: ["halalEvidence"],
        actor: fixtures_1.REVIEWER,
        now: fixtures_1.T + 2000,
    });
    // Penerimaan mencipta CADANGAN STAGING sahaja — tiada pensijilan.
    strict_1.default.ok(decision.stagingRecordId);
    const proposals = s.listStagingProposals();
    strict_1.default.equal(proposals[0].published, false);
    strict_1.default.equal(proposals[0].mockOnly, true);
    const reviewed = await s.getForReview(submission.submissionId, fixtures_1.REVIEWER);
    strict_1.default.equal(reviewed.status, "accepted_for_staging");
    strict_1.default.notEqual(reviewed.status, "resolved");
});
(0, node_test_1.default)("27. laporan alergen tidak boleh menanda selamat", async () => {
    const rule = (0, index_1.getCategoryRule)("wrong_allergen_information");
    strict_1.default.equal(rule.automaticActionForbidden, true);
    strict_1.default.equal(rule.allowsExactProposedValue, false);
    strict_1.default.ok((0, index_1.safetySensitiveCategories)().includes("unsafe_allergen_claim"));
    const r = (0, index_1.validateReportCategoryRequirements)("wrong_allergen_information", {
        proposal: (0, fixtures_1.allergenInput)().proposedValues,
        evidence: (0, fixtures_1.allergenInput)().evidence,
        affectedFields: ["allergenEvidence"],
    });
    strict_1.default.equal(r.valid, true);
    strict_1.default.ok(r.warnings.includes("automatic_action_forbidden_for_this_category"));
    strict_1.default.ok(r.warnings.includes("safety_sensitive_requires_trusted_review"));
});
(0, node_test_1.default)("28. laporan penutupan memerlukan pemerhatian/bukti", () => {
    const withoutEvidence = (0, index_1.validateReportCategoryRequirements)("permanently_closed", {
        proposal: { businessStatus: "permanently_closed" },
        evidence: [],
        affectedFields: ["businessStatus"],
    });
    strict_1.default.equal(withoutEvidence.valid, false);
    strict_1.default.ok(withoutEvidence.errors.some((e) => e.startsWith("minimum_evidence_required")));
    strict_1.default.ok(withoutEvidence.errors.includes("observation_date_required"));
    const withoutDate = (0, index_1.validateReportCategoryRequirements)("permanently_closed", {
        proposal: { businessStatus: "permanently_closed" },
        evidence: [(0, fixtures_1.evidence)({ observedAt: undefined })],
        affectedFields: ["businessStatus"],
    });
    strict_1.default.ok(withoutDate.errors.includes("observation_date_required"));
    strict_1.default.equal((0, index_1.validatePlaceCorrectionSubmission)((0, fixtures_1.closureInput)()).valid, true);
});
(0, node_test_1.default)("29. laporan pendua memerlukan kedai sasaran", () => {
    const missing = (0, index_1.validateReportCategoryRequirements)("duplicate_place", {
        proposal: {},
        evidence: [],
        affectedFields: ["duplicateTargetPlaceId"],
    });
    strict_1.default.equal(missing.valid, false);
    strict_1.default.ok(missing.errors.includes("duplicate_target_place_required"));
    strict_1.default.equal((0, index_1.validatePlaceCorrectionSubmission)((0, fixtures_1.duplicateInput)()).valid, true);
});
(0, node_test_1.default)("29b. keputusan pendua memerlukan penghantaran sasaran", () => {
    strict_1.default.equal((0, index_1.validateReviewDecision)("mark_duplicate", { reasonCode: "dup" }).valid, false);
    strict_1.default.equal((0, index_1.validateReviewDecision)("mark_duplicate", { reasonCode: "dup", duplicateOfSubmissionId: "sub_1" }).valid, true);
    strict_1.default.equal((0, index_1.validateReviewDecision)("reject", { reasonCode: "" }).valid, false);
    strict_1.default.equal((0, index_1.validateReviewDecision)("request_more_evidence", { reasonCode: "need" }).valid, false);
    strict_1.default.equal((0, index_1.validateReviewDecision)("confirm_closure_report", { reasonCode: "ok", acceptedFields: ["businessStatus"] }).valid, false, "memerlukan ringkasan bukti");
});
// ---- 30-32: penerimaan hanya mencipta staging; tiada penerbitan ----
(0, node_test_1.default)("30. laporan diterima hanya mencipta rujukan staging", async () => {
    const s = store(LOOSE);
    const { submission } = await s.submit((0, fixtures_1.submissionInput)(), fixtures_1.REPORTER, fixtures_1.T);
    await s.assignReviewer(submission.submissionId, "reviewer_1", fixtures_1.REVIEWER, fixtures_1.T + 1000);
    const decision = await s.recordDecision({
        submissionId: submission.submissionId,
        decision: "accept_for_staging",
        reasonCode: "verified_by_reviewer",
        acceptedFields: ["phone"],
        actor: fixtures_1.REVIEWER,
        now: fixtures_1.T + 2000,
    });
    strict_1.default.ok(decision.stagingRecordId);
    const proposal = s.listStagingProposals().find((p) => p.stagingProposalId === decision.stagingRecordId);
    strict_1.default.equal(proposal.published, false);
    strict_1.default.deepEqual(proposal.acceptedFields, ["phone"]);
    const audit = await s.listAudit(submission.submissionId, fixtures_1.REVIEWER, { limit: 50 });
    strict_1.default.ok(audit.items.some((a) => a.action === "staging_reference_created"));
});
(0, node_test_1.default)("31. tiada rekod canonical diubah suai oleh modul ini", () => {
    const names = new Set(Object.getOwnPropertyNames(index_1.InMemoryCorrectionStore.prototype));
    for (const forbidden of [
        "updateCanonicalPlace", "writePlaceRegistry", "publish", "publishSubmission",
        "deleteSubmission", "hardDelete", "purgeAudit", "certifyHalal", "markAllergenSafe",
    ]) {
        strict_1.default.equal(names.has(forbidden), false, forbidden);
    }
    const src = index_1.InMemoryCorrectionStore.toString();
    strict_1.default.equal(src.includes("place_registry"), false);
    strict_1.default.equal(src.includes("places_cache"), false);
});
(0, node_test_1.default)("32. tiada penerbitan berlaku daripada laporan", async () => {
    const s = store(LOOSE);
    const { submission } = await s.submit((0, fixtures_1.closureInput)(), fixtures_1.REPORTER, fixtures_1.T);
    await s.assignReviewer(submission.submissionId, "reviewer_1", fixtures_1.REVIEWER, fixtures_1.T + 1000);
    await s.recordDecision({
        submissionId: submission.submissionId,
        decision: "confirm_closure_report",
        reasonCode: "field_confirmed",
        acceptedFields: ["businessStatus"],
        evidenceSummary: "Storefront photo shows closure notice.",
        actor: fixtures_1.REVIEWER,
        now: fixtures_1.T + 2000,
    });
    for (const proposal of s.listStagingProposals())
        strict_1.default.equal(proposal.published, false);
    const reviewed = await s.getForReview(submission.submissionId, fixtures_1.REVIEWER);
    strict_1.default.equal(reviewed.status, "accepted_for_staging");
    // Tiada medan penerbitan wujud pada penghantaran.
    strict_1.default.equal(reviewed.publicationStatus, undefined);
});
// ---- audit append-only ----
(0, node_test_1.default)("audit adalah append-only dan mengekalkan identiti pelaku dipercayai", async () => {
    const s = store(LOOSE);
    const { submission } = await s.submit((0, fixtures_1.submissionInput)(), fixtures_1.REPORTER, fixtures_1.T);
    await s.assignReviewer(submission.submissionId, "reviewer_1", fixtures_1.REVIEWER, fixtures_1.T + 1000);
    const audit = await s.listAudit(submission.submissionId, fixtures_1.REVIEWER, { limit: 50 });
    const actions = audit.items.map((a) => a.action);
    strict_1.default.ok(actions.includes("submitted"));
    strict_1.default.ok(actions.includes("queued"));
    strict_1.default.ok(actions.includes("assigned"));
    // Entri pelapor tidak pernah membawa ID pelaku dipercayai.
    for (const entry of audit.items) {
        if (entry.actorType === "reporter")
            strict_1.default.equal(entry.trustedActorId, undefined);
        if (entry.actorType === "trusted_reviewer")
            strict_1.default.ok(entry.trustedActorId);
        strict_1.default.ok(entry.reasonCode.length > 0);
    }
    const names = new Set(Object.getOwnPropertyNames(index_1.InMemoryCorrectionStore.prototype));
    strict_1.default.equal(names.has("updateAudit"), false);
    strict_1.default.equal(names.has("deleteAudit"), false);
});
(0, node_test_1.default)("bukti: EXIF mesti dibuang; sijil memberi amaran", () => {
    const withExif = (0, index_1.validatePlaceReportEvidence)((0, fixtures_1.evidence)({ fileMetadata: { fileName: "a.jpg", mimeType: "image/jpeg", byteSize: 10, exifStripped: false } }));
    strict_1.default.equal(withExif.valid, false);
    strict_1.default.ok(withExif.errors.includes("evidence_exif_must_be_stripped"));
    const cert = (0, index_1.validatePlaceReportEvidence)((0, fixtures_1.evidence)({ evidenceType: "certificate_photo", status: "accepted" }));
    strict_1.default.ok(cert.warnings.includes("certificate_photo_requires_manual_verification"));
    const badLink = (0, index_1.validatePlaceReportEvidence)((0, fixtures_1.evidence)({ evidenceType: "website_link", sourceReference: "nope", fileMetadata: undefined }));
    strict_1.default.equal(badLink.valid, false);
    strict_1.default.ok(badLink.errors.includes("invalid_evidence_url"));
});
(0, node_test_1.default)("kategori auto-tindakan-dilarang meliputi semua kategori keselamatan", () => {
    const forbidden = new Set((0, index_1.autoActionForbiddenCategories)());
    for (const category of (0, index_1.safetySensitiveCategories)()) {
        strict_1.default.ok(forbidden.has(category), `${category} mesti melarang tindakan automatik`);
    }
});
(0, node_test_1.default)("dedup key stabil merentas susunan medan", () => {
    const a = (0, index_1.dedupKeyFor)({
        placeId: "p", category: "wrong_phone", affectedFields: ["phone"],
        submittedBy: fixtures_1.REPORTER, proposal: { phone: "+601", notes: "x" },
    });
    const b = (0, index_1.dedupKeyFor)({
        placeId: "p", category: "wrong_phone", affectedFields: ["phone"],
        submittedBy: fixtures_1.REPORTER, proposal: { notes: "x", phone: "+601" },
    });
    strict_1.default.equal(a, b);
    strict_1.default.equal((0, index_1.findOpenDuplicate)([], a).isDuplicate, false);
});
(0, node_test_1.default)("paparan pelapor menyatakan tindakan seterusnya bila bukti diminta", async () => {
    const s = store(LOOSE);
    const { submission } = await s.submit((0, fixtures_1.submissionInput)(), fixtures_1.REPORTER, fixtures_1.T);
    await s.assignReviewer(submission.submissionId, "reviewer_1", fixtures_1.REVIEWER, fixtures_1.T + 1000);
    await s.recordDecision({
        submissionId: submission.submissionId,
        decision: "request_more_evidence",
        reasonCode: "need_photo",
        requiredEvidence: ["storefront_photo"],
        actor: fixtures_1.REVIEWER,
        now: fixtures_1.T + 2000,
    });
    const view = await s.getOwnSubmission(submission.submissionId, fixtures_1.REPORTER);
    strict_1.default.equal(view.status, "needs_more_evidence");
    strict_1.default.equal(view.requiredNextAction, "add_more_evidence");
    strict_1.default.equal(view.canWithdraw, true);
    strict_1.default.equal((0, index_1.containsForbiddenPublicField)(view), null);
});
(0, node_test_1.default)("snapshot pelapor menyatakan apa yang dilihat (sourceMode dikekalkan)", async () => {
    const s = store(LOOSE);
    const { submission } = await s.submit((0, fixtures_1.submissionInput)({ originalSnapshot: (0, fixtures_1.snapshot)({ sourceMode: "sample" }) }), fixtures_1.REPORTER, fixtures_1.T);
    const stored = await s.getForReview(submission.submissionId, fixtures_1.REVIEWER);
    strict_1.default.equal(stored.originalSnapshot.sourceMode, "sample");
    strict_1.default.equal(stored.sourceMode, "sample");
});
(0, node_test_1.default)("paparan pelapor menolak akses silang pengguna melalui helper tulen", () => {
    const fake = {
        ...(0, fixtures_1.submissionInput)(),
        submissionId: "s", submittedBy: fixtures_1.REPORTER, submittedAt: fixtures_1.T, status: "queued",
        originalSnapshot: (0, fixtures_1.snapshot)(), auditTrail: [], evidence: [], affectedFields: [],
    };
    strict_1.default.throws(() => (0, index_1.toReporterVisibleSubmission)(fake, fixtures_1.OTHER_REPORTER), /forbidden/);
});
