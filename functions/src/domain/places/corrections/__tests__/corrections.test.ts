/**
 * Phase 1.11 Part V — ujian unit pembetulan/laporan (1-32 bahagian backend).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  autoActionForbiddenCategories,
  canReporterWithdraw,
  canTransitionPlaceReportStatus,
  containsForbiddenPublicField,
  dedupKeyFor,
  DEFAULT_CORRECTION_LIMITS,
  decisionGrantsVerifiedSafety,
  evaluateRateLimit,
  findOpenDuplicate,
  getCategoryRule,
  InMemoryCorrectionStore,
  isSyntacticallyValidUrl,
  proposalHash,
  safetySensitiveCategories,
  toReporterVisibleSubmission,
  toReviewerVisibleSubmission,
  validateCorrectionProposal,
  validatePlaceCorrectionSubmission,
  validatePlaceReportEvidence,
  validateReportCategoryRequirements,
  validateReviewDecision,
  withCorrectionLimits,
} from "../index";
import {
  allergenInput, closureInput, duplicateInput, evidence, halalInput, OTHER_REPORTER,
  REPORTER, REVIEWER, snapshot, submissionInput, T, DAY,
} from "./fixtures";

/** Stor dalam-ingatan tidak memegang jam: masa disuntik pada setiap panggilan. */
function store(limits = DEFAULT_CORRECTION_LIMITS) {
  return new InMemoryCorrectionStore(limits);
}
/** Had longgar supaya ujian tidak terhalang oleh cooldown. */
const LOOSE = withCorrectionLimits({ cooldownSeconds: 0, maxReportsPerPlacePerDay: 100, maxOpenReportsPerUser: 100 });

// ---- 1-12: pengesahan ----

test("1. penghantaran pembetulan sah lulus", () => {
  const r = validatePlaceCorrectionSubmission(submissionInput());
  assert.equal(r.valid, true, r.errors.join(","));
});

test("2. placeId tiada gagal", () => {
  const r = validatePlaceCorrectionSubmission(submissionInput({ placeId: "" }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("place_id_required"));
});

test("3. snapshot asal tiada gagal", () => {
  const r = validatePlaceCorrectionSubmission(submissionInput({ originalSnapshot: undefined }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("original_snapshot_required"));
});

test("4. pembetulan kosong gagal", () => {
  const r = validatePlaceCorrectionSubmission(submissionInput({ proposedValues: {} }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("empty_correction"));
  assert.equal(validateCorrectionProposal({}).valid, false);
});

test("5. kategori tidak disokong gagal", () => {
  const r = validatePlaceCorrectionSubmission(submissionInput({ category: "not_a_category" }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("unsupported_category"));
});

test("6. koordinat tidak sah gagal", () => {
  const r = validateCorrectionProposal({ coordinates: { lat: 99, lng: 0 } });
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("invalid_coordinates"));
  assert.equal(validateCorrectionProposal({ movedToCoordinates: { lat: 0, lng: 999 } }).valid, false);
});

test("7. URL tidak sah gagal", () => {
  assert.equal(isSyntacticallyValidUrl("https://ok.example.test"), true);
  assert.equal(isSyntacticallyValidUrl("javascript:alert(1)"), false);
  assert.equal(isSyntacticallyValidUrl("bukan-url"), false);
  assert.equal(validateCorrectionProposal({ website: "bukan-url" }).valid, false);
});

test("8. penerangan terlalu panjang/pendek gagal", () => {
  const long = "x".repeat(DEFAULT_CORRECTION_LIMITS.maxDescriptionLength + 1);
  assert.ok(validatePlaceCorrectionSubmission(submissionInput({ description: long })).errors.includes("description_too_long"));
  assert.ok(validatePlaceCorrectionSubmission(submissionInput({ description: "pendek" })).errors.includes("description_too_short"));
});

test("9. terlalu banyak item bukti gagal", () => {
  const many = Array.from({ length: DEFAULT_CORRECTION_LIMITS.maxEvidenceItems + 1 }, (_, i) =>
    evidence({ evidenceId: `ev_${i}` }));
  const r = validatePlaceCorrectionSubmission(submissionInput({ evidence: many }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("too_many_evidence_items"));
});

test("10. pengguna tidak boleh menetapkan penyemak", () => {
  for (const field of ["assignedReviewer", "reviewedBy"]) {
    const r = validatePlaceCorrectionSubmission(submissionInput({ [field]: "admin_1" }));
    assert.equal(r.valid, false, field);
    assert.ok(r.errors.some((e) => e.includes("reviewer") || e.includes(field)), field);
  }
});

test("11. pengguna tidak boleh menetapkan keadaan diluluskan", () => {
  const r = validatePlaceCorrectionSubmission(submissionInput({ approvalState: "approved" }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("client_cannot_set_approved_state"));
});

test("12. pengguna tidak boleh menetapkan keadaan penerbitan/pengesahan", () => {
  assert.ok(validatePlaceCorrectionSubmission(submissionInput({ publicationStatus: "published" })).errors
    .includes("client_cannot_set_publication_or_verification_state"));
  assert.ok(validatePlaceCorrectionSubmission(submissionInput({ verificationStatus: "admin_verified" })).errors
    .includes("client_cannot_set_publication_or_verification_state"));
  assert.ok(validatePlaceCorrectionSubmission(submissionInput({ status: "accepted_for_staging" })).errors
    .some((e) => e.startsWith("client_cannot_set_status")));
});

test("12b. medan tidak disokong gagal", () => {
  const r = validateCorrectionProposal({ notAField: "x" } as never);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.startsWith("unsupported_field")));
});

// ---- 13-19: mesin keadaan ----

const reporter = { actorType: "reporter" as const, actorId: REPORTER };
const trusted = { actorType: "trusted_reviewer" as const, actorId: REVIEWER.actorUid, reasonCode: "review" };

test("13. draft → submitted dibenarkan (pelapor)", () => {
  assert.equal(canTransitionPlaceReportStatus("draft", "submitted", reporter), true);
});
test("14. submitted → queued dibenarkan (sistem/dipercayai)", () => {
  assert.equal(canTransitionPlaceReportStatus("submitted", "queued", trusted), true);
  assert.equal(canTransitionPlaceReportStatus("submitted", "queued", reporter), false);
});
test("15. queued → under_review dibenarkan", () => {
  assert.equal(canTransitionPlaceReportStatus("queued", "under_review", trusted), true);
});
test("16. under_review → accepted_for_staging dibenarkan", () => {
  assert.equal(canTransitionPlaceReportStatus("under_review", "accepted_for_staging", trusted), true);
});
test("17. draft → resolved DILARANG", () => {
  assert.equal(canTransitionPlaceReportStatus("draft", "resolved", trusted), false);
  assert.equal(canTransitionPlaceReportStatus("draft", "accepted_for_staging", trusted), false);
  assert.equal(canTransitionPlaceReportStatus("submitted", "resolved", trusted), false);
});
test("18. rejected → accepted DILARANG tanpa reopen", () => {
  assert.equal(canTransitionPlaceReportStatus("rejected", "accepted_for_staging", trusted), false);
  assert.equal(canTransitionPlaceReportStatus("rejected", "queued", trusted), false);
  assert.equal(
    canTransitionPlaceReportStatus("rejected", "queued", { ...trusted, reasonCode: "reopen" }),
    true,
  );
});
test("19. penarikan balik hanya untuk status dibenarkan", () => {
  assert.equal(canReporterWithdraw("submitted"), true);
  assert.equal(canReporterWithdraw("queued"), true);
  assert.equal(canReporterWithdraw("needs_more_evidence"), true);
  assert.equal(canReporterWithdraw("under_review"), false);
  assert.equal(canReporterWithdraw("resolved"), false);
  assert.equal(canTransitionPlaceReportStatus("withdrawn", "under_review", trusted), false);
});

// ---- 20-24: dedup, had kadar, bukti, snapshot ----

test("20. laporan berulang yang sama dideduplikasi", async () => {
  const s = store(LOOSE);
  const first = await s.submit(submissionInput(), REPORTER, T);
  const second = await s.submit(submissionInput(), REPORTER, T + 2000);
  assert.equal(second.deduplicated, true);
  assert.equal(second.submission.submissionId, first.submission.submissionId);
  const mine = await s.listOwnSubmissions(REPORTER, { limit: 50 });
  assert.equal(mine.items.length, 1);
});

test("21. nilai cadangan berbeza mencipta laporan baharu", async () => {
  const s = store(LOOSE);
  const a = await s.submit(submissionInput(), REPORTER, T);
  const b = await s.submit(
    submissionInput({ proposedValues: { phone: "+60312340000" } }),
    REPORTER,
    T + 2000,
  );
  assert.equal(b.deduplicated, false);
  assert.notEqual(b.submission.submissionId, a.submission.submissionId);
  assert.notEqual(a.submission.dedupKey, b.submission.dedupKey);
});

test("21b. hash cadangan bebas susunan senarai", () => {
  assert.equal(
    proposalHash({ cuisineTagIds: ["malay", "thai"] }),
    proposalHash({ cuisineTagIds: ["thai", "malay"] }),
  );
  assert.notEqual(proposalHash({ phone: "a" }), proposalHash({ phone: "b" }));
});

test("21c. penghantaran ditarik balik tidak menyekat laporan baharu", async () => {
  const s = store(LOOSE);
  const first = await s.submit(submissionInput(), REPORTER, T);
  await s.withdraw(first.submission.submissionId, REPORTER, T + 1000);
  const again = await s.submit(submissionInput(), REPORTER, T + 5000);
  assert.equal(again.deduplicated, false, "laporan sah masa hadapan tidak disekat");
});

test("22. had kadar menyekat spam", async () => {
  const limits = withCorrectionLimits({ maxReportsPerPlacePerDay: 2, cooldownSeconds: 0 });
  const s = store(limits);
  await s.submit(submissionInput({ proposedValues: { phone: "+60300000001" } }), REPORTER, T);
  await s.submit(submissionInput({ proposedValues: { phone: "+60300000002" } }), REPORTER, T + 1000);
  await assert.rejects(
    () => s.submit(submissionInput({ proposedValues: { phone: "+60300000003" } }), REPORTER, T + 2000),
    /rate_limited/,
  );
});

test("22b. cooldown dan had terbuka dinilai secara tulen", () => {
  const base = submissionInput();
  const existing = [{
    ...base, submissionId: "s1", submittedBy: REPORTER, submittedAt: T, status: "queued",
  }] as never as Parameters<typeof evaluateRateLimit>[0]["userSubmissions"];
  const cooling = evaluateRateLimit(
    { submittedBy: REPORTER, placeId: "PLACE-MOCK-0001", now: T + 1000, userSubmissions: existing },
    withCorrectionLimits({ cooldownSeconds: 60 }),
  );
  assert.equal(cooling.allowed, false);
  assert.ok(cooling.reasons.includes("cooldown_active"));
  assert.ok(cooling.retryAfter! > T);
  const later = evaluateRateLimit(
    { submittedBy: REPORTER, placeId: "PLACE-MOCK-0001", now: T + 2 * DAY, userSubmissions: existing },
    withCorrectionLimits({ cooldownSeconds: 60 }),
  );
  assert.equal(later.allowed, true);
});

test("23. bukti baharu ditambah dengan selamat", async () => {
  const s = store(LOOSE);
  const { submission } = await s.submit(submissionInput(), REPORTER, T);
  const updated = await s.appendEvidence(
    submission.submissionId,
    evidence({ evidenceId: "ev_extra" }),
    REPORTER,
    T + 5000,
  );
  assert.equal(updated.evidence.length, 1);
  const audit = await s.listAudit(submission.submissionId, REVIEWER, { limit: 50 });
  assert.ok(audit.items.some((a) => a.action === "evidence_added"));
  // Pengguna lain tidak boleh menambah bukti.
  await assert.rejects(
    () => s.appendEvidence(submission.submissionId, evidence({ evidenceId: "x" }), OTHER_REPORTER, T),
    /forbidden/,
  );
});

test("24. snapshot asal kekal IMMUTABLE", async () => {
  const s = store(LOOSE);
  const { submission } = await s.submit(submissionInput(), REPORTER, T);
  const before = s.snapshotHash(submission.submissionId);

  await s.appendEvidence(submission.submissionId, evidence({ evidenceId: "e2" }), REPORTER, T + 1000);
  await s.assignReviewer(submission.submissionId, "reviewer_1", REVIEWER, T + 2000);
  await s.recordDecision({
    submissionId: submission.submissionId, decision: "reject", reasonCode: "insufficient_evidence",
    actor: REVIEWER, now: T + 3000,
  });
  assert.equal(s.snapshotHash(submission.submissionId), before, "snapshot tidak pernah ditulis ganti");

  // Mutasi salinan yang dikembalikan tidak menjejaskan simpanan.
  const copy = await s.getForReview(submission.submissionId, REVIEWER);
  copy!.originalSnapshot.title = "DIUBAH";
  assert.equal(s.snapshotHash(submission.submissionId), before);
});

// ---- 25: privasi ----

test("25. identiti pelapor tersembunyi daripada paparan selamat-awam", async () => {
  const s = store(LOOSE);
  const { submission } = await s.submit(submissionInput(), REPORTER, T);

  const mine = await s.getOwnSubmission(submission.submissionId, REPORTER);
  assert.ok(mine);
  assert.equal(containsForbiddenPublicField(mine), null, "tiada medan terlarang");
  assert.equal((mine as unknown as Record<string, unknown>).submittedBy, undefined);
  assert.equal((mine as unknown as Record<string, unknown>).reviewedBy, undefined);

  // Pengguna LAIN tidak boleh membaca laporan ini.
  await assert.rejects(() => s.getOwnSubmission(submission.submissionId, OTHER_REPORTER), /forbidden/);

  // Paparan penyemak menganonimkan pelapor.
  const reviewerView = await s.getForReview(submission.submissionId, REVIEWER);
  assert.equal((reviewerView as unknown as Record<string, unknown>).submittedBy, undefined);
  assert.ok(reviewerView!.reporterHandle.startsWith("reporter_"));
  assert.equal(reviewerView!.reporterHandle.includes(REPORTER), false);
});

test("25b. pengendali pelapor deterministik tetapi tidak boleh dipulihkan", async () => {
  const s = store(LOOSE);
  const a = await s.submit(submissionInput(), REPORTER, T);
  const handle1 = s.reporterHandleFor(a.submission.submissionId);
  const view = toReviewerVisibleSubmission({ ...a.submission });
  assert.equal(view.reporterHandle, handle1);
});

// ---- 26-29: peraturan keselamatan & kategori ----

test("26. laporan halal pengguna TIDAK boleh mensijilkan", async () => {
  const rule = getCategoryRule("wrong_halal_status");
  assert.equal(rule.safetySensitive, true);
  assert.equal(rule.automaticActionForbidden, true);
  assert.equal(rule.allowsExactProposedValue, false);
  assert.equal(rule.adminReviewMandatory, true);
  assert.equal(decisionGrantsVerifiedSafety(), false);

  const s = store(LOOSE);
  const { submission } = await s.submit(halalInput(), REPORTER, T);
  await s.assignReviewer(submission.submissionId, "safety_1", REVIEWER, T + 1000);
  const decision = await s.recordDecision({
    submissionId: submission.submissionId,
    decision: "accept_for_staging",
    reasonCode: "evidence_plausible",
    acceptedFields: ["halalEvidence"],
    actor: REVIEWER,
    now: T + 2000,
  });
  // Penerimaan mencipta CADANGAN STAGING sahaja — tiada pensijilan.
  assert.ok(decision.stagingRecordId);
  const proposals = s.listStagingProposals();
  assert.equal(proposals[0].published, false);
  assert.equal(proposals[0].mockOnly, true);
  const reviewed = await s.getForReview(submission.submissionId, REVIEWER);
  assert.equal(reviewed!.status, "accepted_for_staging");
  assert.notEqual(reviewed!.status as string, "resolved");
});

test("27. laporan alergen tidak boleh menanda selamat", async () => {
  const rule = getCategoryRule("wrong_allergen_information");
  assert.equal(rule.automaticActionForbidden, true);
  assert.equal(rule.allowsExactProposedValue, false);
  assert.ok(safetySensitiveCategories().includes("unsafe_allergen_claim"));
  const r = validateReportCategoryRequirements("wrong_allergen_information", {
    proposal: allergenInput().proposedValues,
    evidence: allergenInput().evidence,
    affectedFields: ["allergenEvidence"],
  });
  assert.equal(r.valid, true);
  assert.ok(r.warnings.includes("automatic_action_forbidden_for_this_category"));
  assert.ok(r.warnings.includes("safety_sensitive_requires_trusted_review"));
});

test("28. laporan penutupan memerlukan pemerhatian/bukti", () => {
  const withoutEvidence = validateReportCategoryRequirements("permanently_closed", {
    proposal: { businessStatus: "permanently_closed" },
    evidence: [],
    affectedFields: ["businessStatus"],
  });
  assert.equal(withoutEvidence.valid, false);
  assert.ok(withoutEvidence.errors.some((e) => e.startsWith("minimum_evidence_required")));
  assert.ok(withoutEvidence.errors.includes("observation_date_required"));

  const withoutDate = validateReportCategoryRequirements("permanently_closed", {
    proposal: { businessStatus: "permanently_closed" },
    evidence: [evidence({ observedAt: undefined })],
    affectedFields: ["businessStatus"],
  });
  assert.ok(withoutDate.errors.includes("observation_date_required"));

  assert.equal(validatePlaceCorrectionSubmission(closureInput()).valid, true);
});

test("29. laporan pendua memerlukan kedai sasaran", () => {
  const missing = validateReportCategoryRequirements("duplicate_place", {
    proposal: {},
    evidence: [],
    affectedFields: ["duplicateTargetPlaceId"],
  });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.includes("duplicate_target_place_required"));
  assert.equal(validatePlaceCorrectionSubmission(duplicateInput()).valid, true);
});

test("29b. keputusan pendua memerlukan penghantaran sasaran", () => {
  assert.equal(validateReviewDecision("mark_duplicate", { reasonCode: "dup" }).valid, false);
  assert.equal(
    validateReviewDecision("mark_duplicate", { reasonCode: "dup", duplicateOfSubmissionId: "sub_1" }).valid,
    true,
  );
  assert.equal(validateReviewDecision("reject", { reasonCode: "" }).valid, false);
  assert.equal(validateReviewDecision("request_more_evidence", { reasonCode: "need" }).valid, false);
  assert.equal(
    validateReviewDecision("confirm_closure_report", { reasonCode: "ok", acceptedFields: ["businessStatus"] }).valid,
    false,
    "memerlukan ringkasan bukti",
  );
});

// ---- 30-32: penerimaan hanya mencipta staging; tiada penerbitan ----

test("30. laporan diterima hanya mencipta rujukan staging", async () => {
  const s = store(LOOSE);
  const { submission } = await s.submit(submissionInput(), REPORTER, T);
  await s.assignReviewer(submission.submissionId, "reviewer_1", REVIEWER, T + 1000);
  const decision = await s.recordDecision({
    submissionId: submission.submissionId,
    decision: "accept_for_staging",
    reasonCode: "verified_by_reviewer",
    acceptedFields: ["phone"],
    actor: REVIEWER,
    now: T + 2000,
  });
  assert.ok(decision.stagingRecordId);
  const proposal = s.listStagingProposals().find((p) => p.stagingProposalId === decision.stagingRecordId)!;
  assert.equal(proposal.published, false);
  assert.deepEqual(proposal.acceptedFields, ["phone"]);
  const audit = await s.listAudit(submission.submissionId, REVIEWER, { limit: 50 });
  assert.ok(audit.items.some((a) => a.action === "staging_reference_created"));
});

test("31. tiada rekod canonical diubah suai oleh modul ini", () => {
  const names = new Set(Object.getOwnPropertyNames(InMemoryCorrectionStore.prototype));
  for (const forbidden of [
    "updateCanonicalPlace", "writePlaceRegistry", "publish", "publishSubmission",
    "deleteSubmission", "hardDelete", "purgeAudit", "certifyHalal", "markAllergenSafe",
  ]) {
    assert.equal(names.has(forbidden), false, forbidden);
  }
  const src = InMemoryCorrectionStore.toString();
  assert.equal(src.includes("place_registry"), false);
  assert.equal(src.includes("places_cache"), false);
});

test("32. tiada penerbitan berlaku daripada laporan", async () => {
  const s = store(LOOSE);
  const { submission } = await s.submit(closureInput(), REPORTER, T);
  await s.assignReviewer(submission.submissionId, "reviewer_1", REVIEWER, T + 1000);
  await s.recordDecision({
    submissionId: submission.submissionId,
    decision: "confirm_closure_report",
    reasonCode: "field_confirmed",
    acceptedFields: ["businessStatus"],
    evidenceSummary: "Storefront photo shows closure notice.",
    actor: REVIEWER,
    now: T + 2000,
  });
  for (const proposal of s.listStagingProposals()) assert.equal(proposal.published, false);
  const reviewed = await s.getForReview(submission.submissionId, REVIEWER);
  assert.equal(reviewed!.status, "accepted_for_staging");
  // Tiada medan penerbitan wujud pada penghantaran.
  assert.equal((reviewed as unknown as Record<string, unknown>).publicationStatus, undefined);
});

// ---- audit append-only ----

test("audit adalah append-only dan mengekalkan identiti pelaku dipercayai", async () => {
  const s = store(LOOSE);
  const { submission } = await s.submit(submissionInput(), REPORTER, T);
  await s.assignReviewer(submission.submissionId, "reviewer_1", REVIEWER, T + 1000);
  const audit = await s.listAudit(submission.submissionId, REVIEWER, { limit: 50 });
  const actions = audit.items.map((a) => a.action);
  assert.ok(actions.includes("submitted"));
  assert.ok(actions.includes("queued"));
  assert.ok(actions.includes("assigned"));
  // Entri pelapor tidak pernah membawa ID pelaku dipercayai.
  for (const entry of audit.items) {
    if (entry.actorType === "reporter") assert.equal(entry.trustedActorId, undefined);
    if (entry.actorType === "trusted_reviewer") assert.ok(entry.trustedActorId);
    assert.ok(entry.reasonCode.length > 0);
  }
  const names = new Set(Object.getOwnPropertyNames(InMemoryCorrectionStore.prototype));
  assert.equal(names.has("updateAudit"), false);
  assert.equal(names.has("deleteAudit"), false);
});

test("bukti: EXIF mesti dibuang; sijil memberi amaran", () => {
  const withExif = validatePlaceReportEvidence(
    evidence({ fileMetadata: { fileName: "a.jpg", mimeType: "image/jpeg", byteSize: 10, exifStripped: false } }),
  );
  assert.equal(withExif.valid, false);
  assert.ok(withExif.errors.includes("evidence_exif_must_be_stripped"));

  const cert = validatePlaceReportEvidence(
    evidence({ evidenceType: "certificate_photo", status: "accepted" }),
  );
  assert.ok(cert.warnings.includes("certificate_photo_requires_manual_verification"));

  const badLink = validatePlaceReportEvidence(
    evidence({ evidenceType: "website_link", sourceReference: "nope", fileMetadata: undefined }),
  );
  assert.equal(badLink.valid, false);
  assert.ok(badLink.errors.includes("invalid_evidence_url"));
});

test("kategori auto-tindakan-dilarang meliputi semua kategori keselamatan", () => {
  const forbidden = new Set(autoActionForbiddenCategories());
  for (const category of safetySensitiveCategories()) {
    assert.ok(forbidden.has(category), `${category} mesti melarang tindakan automatik`);
  }
});

test("dedup key stabil merentas susunan medan", () => {
  const a = dedupKeyFor({
    placeId: "p", category: "wrong_phone", affectedFields: ["phone"],
    submittedBy: REPORTER, proposal: { phone: "+601", notes: "x" },
  });
  const b = dedupKeyFor({
    placeId: "p", category: "wrong_phone", affectedFields: ["phone"],
    submittedBy: REPORTER, proposal: { notes: "x", phone: "+601" },
  });
  assert.equal(a, b);
  assert.equal(findOpenDuplicate([], a).isDuplicate, false);
});

test("paparan pelapor menyatakan tindakan seterusnya bila bukti diminta", async () => {
  const s = store(LOOSE);
  const { submission } = await s.submit(submissionInput(), REPORTER, T);
  await s.assignReviewer(submission.submissionId, "reviewer_1", REVIEWER, T + 1000);
  await s.recordDecision({
    submissionId: submission.submissionId,
    decision: "request_more_evidence",
    reasonCode: "need_photo",
    requiredEvidence: ["storefront_photo"],
    actor: REVIEWER,
    now: T + 2000,
  });
  const view = await s.getOwnSubmission(submission.submissionId, REPORTER);
  assert.equal(view!.status, "needs_more_evidence");
  assert.equal(view!.requiredNextAction, "add_more_evidence");
  assert.equal(view!.canWithdraw, true);
  assert.equal(containsForbiddenPublicField(view), null);
});

test("snapshot pelapor menyatakan apa yang dilihat (sourceMode dikekalkan)", async () => {
  const s = store(LOOSE);
  const { submission } = await s.submit(
    submissionInput({ originalSnapshot: snapshot({ sourceMode: "sample" }) }),
    REPORTER,
    T,
  );
  const stored = await s.getForReview(submission.submissionId, REVIEWER);
  assert.equal(stored!.originalSnapshot.sourceMode, "sample");
  assert.equal(stored!.sourceMode, "sample");
});

test("paparan pelapor menolak akses silang pengguna melalui helper tulen", () => {
  const fake = {
    ...submissionInput(),
    submissionId: "s", submittedBy: REPORTER, submittedAt: T, status: "queued",
    originalSnapshot: snapshot(), auditTrail: [], evidence: [], affectedFields: [],
  } as never as Parameters<typeof toReporterVisibleSubmission>[0];
  assert.throws(() => toReporterVisibleSubmission(fake, OTHER_REPORTER), /forbidden/);
});
