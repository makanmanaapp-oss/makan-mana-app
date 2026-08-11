/**
 * Phase 1.12 — ujian unit asas migrasi legasi.
 *
 * Meliputi Part T item 1-49 yang boleh diuji tanpa emulator/Flutter.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRollback,
  buildInventoryRecord,
  buildLegacyInventory,
  buildLegacyMigrationPlan,
  buildMigrationCandidate,
  buildRewritePreview,
  candidateIsExecutable,
  checkAliasProposal,
  checkpointChecksum,
  comparePlaceReads,
  completeCheckpoint,
  createCheckpoint,
  createCompletionMarker,
  emptyReferenceImpact,
  executeMigrationPlanInEmulator,
  inventoryHash,
  markAliasRolledBack,
  markCheckpointCorrupt,
  pauseCheckpoint,
  productionCanonicalReadAllowed,
  recordCandidate,
  remainingCandidates,
  resolveLegacyPlaceId,
  resumeCheckpoint,
  scanReferenceImpact,
  summarizeComparisons,
  verifyCheckpoint,
  buildAliasProposal,
  aliasProposalsFor,
  InMemoryMigrationStore,
  type ComparablePlaceView,
  type LegacyAliasMapping,
  type LegacyPlaceInventoryRecord,
} from "../index";
import {
  DAY,
  T,
  branchRecords,
  legacyRecord,
  nameOnlyRecord,
  pointer,
  referencedRecord,
} from "./fixtures";

function inventoryOf(inputs: ReturnType<typeof legacyRecord>[]) {
  return buildLegacyInventory(inputs, T);
}

function planFor(inputs: ReturnType<typeof legacyRecord>[], batchId = "BATCH-1") {
  return buildLegacyMigrationPlan(
    { batchId, records: inventoryOf(inputs), createdBy: "tester" },
    T,
  );
}

// ---- 1-4: inventori legasi -------------------------------------------------

test("1. inventori menangkap ID stabil dan ID rekod deterministik", () => {
  const record = buildInventoryRecord(legacyRecord(), T);
  assert.equal(record.legacyPlaceId, "ChIJ_mock_alpha");
  assert.equal(record.providerPlaceId, "ChIJ_mock_alpha");
  assert.equal(record.inventoryStatus, "eligible");
  // ID deterministik: bina semula memberi ID yang sama.
  assert.equal(buildInventoryRecord(legacyRecord(), T + DAY).legacyRecordId,
    record.legacyRecordId);
});

test("2. inventori mengekalkan laluan sumber legasi", () => {
  const record = buildInventoryRecord(legacyRecord(), T);
  assert.equal(record.legacyDocumentPath, "place_details/ChIJ_mock_alpha");
  assert.equal(record.legacyCollection, "place_details");
});

test("3. inventori tidak mengubah input legasi", () => {
  const input = legacyRecord();
  const before = JSON.stringify(input);
  buildInventoryRecord(input, T);
  assert.equal(JSON.stringify(input), before);
});

test("3b. cincang kandungan mengabaikan masa tetapi mengesan perubahan data", () => {
  const a = buildInventoryRecord(legacyRecord(), T);
  const b = buildInventoryRecord(legacyRecord(), T + 90 * DAY);
  assert.equal(a.rawContentHash, b.rawContentHash);
  const c = buildInventoryRecord(legacyRecord({ displayName: "Berubah" }), T);
  assert.notEqual(a.rawContentHash, c.rawContentHash);
});

test("4. identiti yang hilang menjadi tahan", () => {
  const record = buildInventoryRecord(nameOnlyRecord(), T);
  assert.equal(record.inventoryStatus, "ambiguous");
  assert.ok(record.warnings.includes("no_stable_identity_beyond_name"));

  const candidate = buildMigrationCandidate(
    {
      records: [record],
      referenceImpact: emptyReferenceImpact(record.legacyPlaceId, T),
    },
    T,
  );
  assert.ok(candidate.holdReasons.includes("name_only_match"));
  assert.equal(candidateIsExecutable(candidate), false);
});

// ---- 5-11: identiti, cawangan, alias --------------------------------------

test("5. padanan nama-sahaja ditahan dan tidak pernah boleh dilaksanakan", () => {
  const { candidates } = planFor([nameOnlyRecord()]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].migrationDecision, "insufficient_identity");
  assert.ok(candidates[0].holdReasons.includes("name_only_match"));
});

test("6. ID pembekal tepat memetakan dengan selamat", () => {
  const { candidates, plan } = planFor([legacyRecord()]);
  assert.equal(candidates[0].migrationDecision, "ready");
  assert.equal(candidates[0].holdReasons.length, 0);
  assert.equal(plan.canonicalSnapshotsToCreate.length, 1);
});

test("7. telefon sama + koordinat hampir menghasilkan calon boleh disemak", () => {
  const near = legacyRecord({
    legacyDocumentPath: "places_cache/near_twin",
    legacyPlaceId: "legacy_near_twin",
    providerPlaceId: undefined,
    lat: 3.15951,
    lng: 101.71231,
  });
  const { candidates } = planFor([legacyRecord(), near]);
  const twin = candidates.find((c) => c.legacyPlaceIds.includes("legacy_near_twin"))!;
  // Ada koordinat sah → bukan nama-sahaja; ia sedia atau perlu semakan,
  // tetapi TIDAK PERNAH digabungkan secara senyap dengan yang asal.
  assert.notEqual(twin.proposedCanonicalPlaceId, candidates[0].proposedCanonicalPlaceId);
});

test("8. konflik cawangan menyekat migrasi", () => {
  const { candidates } = planFor(branchRecords());
  const conflicted = candidates.filter(
    (c) => c.migrationDecision === "branch_conflict",
  );
  assert.equal(conflicted.length, 1, "cawangan kedua mesti berkonflik");
  assert.ok(conflicted[0].holdReasons.includes("branch_conflict"));
  assert.equal(candidateIsExecutable(conflicted[0]), false);
});

test("9. perlanggaran alias menyekat migrasi", () => {
  const existing: LegacyAliasMapping[] = [
    buildAliasProposal(
      {
        aliasType: "google_place_id",
        legacyValue: "ChIJ_mock_alpha",
        canonicalPlaceId: "PLC-someone-else",
        sourceLegacyRecordId: "LEG-x",
        migrationPlanId: "MPL-x",
      },
      T,
    ),
  ];
  const check = checkAliasProposal(
    {
      aliasType: "google_place_id",
      legacyValue: "ChIJ_mock_alpha",
      canonicalPlaceId: "PLC-different",
      sourceLegacyRecordId: "LEG-y",
      migrationPlanId: "MPL-y",
    },
    existing,
  );
  assert.equal(check.ok, false);
  assert.equal(check.code, "alias_collision");
  assert.equal(check.existingCanonicalPlaceId, "PLC-someone-else");
});

test("9b. alias sedia ada diterima pakai, tidak pernah ditulis ganti", () => {
  const existing: LegacyAliasMapping[] = [
    buildAliasProposal(
      {
        aliasType: "google_place_id",
        legacyValue: "ChIJ_mock_alpha",
        canonicalPlaceId: "PLC-original",
        sourceLegacyRecordId: "LEG-x",
        migrationPlanId: "MPL-x",
      },
      T,
    ),
  ];
  const { plan, candidates } = buildLegacyMigrationPlan(
    {
      batchId: "BATCH-existing",
      records: inventoryOf([legacyRecord()]),
      existingAliases: existing,
      createdBy: "tester",
    },
    T,
  );
  // Perancang MENERIMA PAKAI pemetaan sedia ada dan bukannya mencipta yang baharu.
  assert.equal(candidates[0].migrationDecision, "already_mapped");
  assert.equal(candidates[0].proposedCanonicalPlaceId, "PLC-original");
  assert.equal(candidateIsExecutable(candidates[0]), false, "tiada kerja baharu");
  assert.equal(plan.canonicalSnapshotsToCreate.length, 0);
  // Alias asal masih menyelesai ke tempat asalnya — tiada tulis ganti senyap.
  assert.equal(
    resolveLegacyPlaceId("ChIJ_mock_alpha", existing).canonicalPlaceId,
    "PLC-original",
  );
});

test("10. alias bulat gagal dengan selamat", () => {
  const aliases: LegacyAliasMapping[] = [
    buildAliasProposal(
      { aliasType: "internal_place_id", legacyValue: "A", canonicalPlaceId: "B",
        sourceLegacyRecordId: "L", migrationPlanId: "M" }, T),
    buildAliasProposal(
      { aliasType: "internal_place_id", legacyValue: "B", canonicalPlaceId: "A",
        sourceLegacyRecordId: "L", migrationPlanId: "M" }, T),
  ];
  assert.equal(resolveLegacyPlaceId("A", aliases).status, "circular");
});

test("11. alias tidak diketahui memulangkan not_found eksplisit", () => {
  assert.equal(resolveLegacyPlaceId("never_seen", []).status, "not_found");
});

test("11b. alias tidak boleh menunjuk kepada cawangan adik-beradik", () => {
  const check = checkAliasProposal(
    { aliasType: "google_place_id", legacyValue: "ChIJ_ali_bangi",
      canonicalPlaceId: "PLC-shah-alam", sourceLegacyRecordId: "L",
      migrationPlanId: "M" },
    [],
    { siblingBranchIds: ["PLC-shah-alam"] },
  );
  assert.equal(check.ok, false);
  assert.equal(check.code, "sibling_branch_target");
});

test("11c. setiap ID legasi dikekalkan sebagai alias", () => {
  const proposals = aliasProposalsFor(
    {
      legacyDocumentIds: ["place_details/x"],
      googlePlaceIds: ["ChIJ_x"],
      internalPlaceIds: ["LEG-x"],
      deepLinkPlaceIds: ["ChIJ_x"],
      providerPlaceIds: ["ChIJ_x"],
      merchantIds: ["SSM-123"],
    },
    "PLC-target",
    "LEG-x",
    "MPL-1",
  );
  const types = new Set(proposals.map((p) => p.aliasType));
  for (const expected of [
    "legacy_document_id", "google_place_id", "internal_place_id",
    "deep_link_place_id", "provider_place_id", "merchant_id",
  ]) {
    assert.ok(types.has(expected as never), `alias ${expected} hilang`);
  }
});

// ---- 12-16: kesan rujukan --------------------------------------------------

test("12-15. rujukan dikira dan yang kritikal ditandakan", () => {
  const record = buildInventoryRecord(referencedRecord(), T);
  const impact = scanReferenceImpact(
    record.legacyPlaceId,
    record.referencedBy,
    T,
  );
  assert.equal(impact.favoriteReferenceCount, 2);
  assert.equal(impact.mealReferenceCount, 1);
  assert.equal(impact.historyReferenceCount, 1);
  assert.equal(impact.suggestionReferenceCount, 1);
  assert.equal(impact.sessionReferenceCount, 1);
  assert.equal(impact.deepLinkReferenceCount, 1);
  assert.equal(impact.correctionReferenceCount, 1);
  // favorites(2) + meals(1) + deep link(1) = 4 kritikal.
  assert.equal(impact.criticalReferences, 4);
  assert.equal(impact.migrationRisk, "high");
});

test("16. laluan rujukan tidak diketahui menaikkan amaran", () => {
  const impact = scanReferenceImpact(
    "legacy_x",
    [pointer("other", "mystery_collection/doc_1")],
    T,
  );
  assert.ok(impact.warnings.includes("unknown_reference_path"));
  assert.deepEqual(impact.otherReferencePaths, ["mystery_collection/doc_1"]);
  assert.equal(impact.migrationRisk, "medium");
});

test("16b. imbasan rujukan terikat", () => {
  const many = Array.from({ length: 12 }, (_, i) =>
    pointer("favorite", `users/u${i}/favorites/p`),
  );
  const impact = scanReferenceImpact("legacy_x", many, T, {
    maxReferencesPerPlace: 5,
    maxUnknownPathsRecorded: 5,
  });
  assert.ok(impact.warnings.includes("reference_scan_truncated"));
  assert.equal(impact.totalReferences, 5);
});

// ---- 17-20: determinisme ---------------------------------------------------

test("17. cincang calon deterministik", () => {
  const a = planFor([legacyRecord()]).candidates[0];
  const b = buildLegacyMigrationPlan(
    { batchId: "BATCH-1", records: inventoryOf([legacyRecord()]), createdBy: "other" },
    T + 5 * DAY,
  ).candidates[0];
  assert.equal(a.contentHash, b.contentHash);
});

test("18-19. cincang pelan deterministik dan dry-run idempoten", () => {
  const a = planFor([legacyRecord(), referencedRecord()]).plan;
  const b = planFor([legacyRecord(), referencedRecord()]).plan;
  assert.equal(a.contentHash, b.contentHash);
  assert.equal(a.migrationPlanId, b.migrationPlanId);
  assert.deepEqual(a.dryRunSummary, b.dryRunSummary);
});

test("19b. susunan input tidak mengubah cincang pelan", () => {
  const a = planFor([legacyRecord(), referencedRecord()]).plan;
  const b = planFor([referencedRecord(), legacyRecord()]).plan;
  assert.equal(a.contentHash, b.contentHash);
});

test("20. kandungan legasi yang berubah mengubah cincang pelan", () => {
  const a = planFor([legacyRecord()]).plan;
  const b = planFor([legacyRecord({ address: "Alamat baharu" })]).plan;
  assert.notEqual(a.contentHash, b.contentHash);
});

test("20b. ringkasan dry-run mengesahkan sifar tulisan produksi", () => {
  const { plan } = planFor([legacyRecord()]);
  assert.equal(plan.dryRunSummary.zeroProductionWritesConfirmed, true);
  assert.equal(plan.targetCollectionMode, "emulator_only");
});

// ---- 21-26: pelaksanaan emulator ------------------------------------------

function approvedPlan(inputs: ReturnType<typeof legacyRecord>[]) {
  const { plan, candidates } = planFor(inputs);
  return {
    plan: { ...plan, status: "approved_for_emulator" as const },
    candidates,
  };
}

test("21. calon sedia memasuki pelan", () => {
  const { plan, candidates } = planFor([legacyRecord()]);
  assert.ok(plan.candidateIds.includes(candidates[0].candidateId));
  assert.equal(plan.dryRunSummary.readyCandidates, 1);
});

test("22. calon yang ditahan tidak boleh dilaksanakan", () => {
  const { plan, candidates } = approvedPlan([legacyRecord(), nameOnlyRecord()]);
  const checkpoint = createCheckpoint(plan.migrationPlanId, plan.batchId, T);
  const result = executeMigrationPlanInEmulator(
    { plan, candidates, checkpoint, actorId: "tester" },
    T,
  );
  assert.equal(result.ok, true);
  assert.equal(result.heldCandidateIds.length, 1);
  // Hanya rekod yang sedia dicipta.
  assert.equal(result.canonicalRecords.length, 1);
});

test("23-25. pelaksanaan emulator mencipta canonical + alias, legasi kekal", () => {
  const { plan, candidates } = approvedPlan([referencedRecord()]);
  const checkpoint = createCheckpoint(plan.migrationPlanId, plan.batchId, T);
  const result = executeMigrationPlanInEmulator(
    { plan, candidates, checkpoint, actorId: "tester" },
    T,
  );
  assert.equal(result.ok, true);
  assert.equal(result.canonicalRecords.length, 1);
  assert.equal(result.canonicalRecords[0].emulatorOnly, true);
  assert.equal(result.canonicalRecords[0].published, false);
  assert.ok(result.aliases.length > 0);
  assert.ok(result.aliases.every((a) => a.status === "active"));
  // Tiada operasi padam bagi data legasi wujud dalam hasil.
  assert.equal(result.deletedLegacyData, false);
  assert.equal(result.wroteProductionData, false);
});

test("26. pelaksanaan berulang idempoten", () => {
  const { plan, candidates } = approvedPlan([referencedRecord()]);
  const first = executeMigrationPlanInEmulator(
    {
      plan,
      candidates,
      checkpoint: createCheckpoint(plan.migrationPlanId, plan.batchId, T),
      actorId: "tester",
    },
    T,
  );
  const second = executeMigrationPlanInEmulator(
    {
      plan,
      candidates,
      checkpoint: first.checkpoint,
      existingCanonicalIds: first.canonicalRecords.map((r) => r.canonicalPlaceId),
      actorId: "tester",
    },
    T + DAY,
  );
  assert.equal(second.ok, true);
  assert.equal(second.canonicalRecords.length, 0, "tiada rekod pendua");
  assert.equal(second.aliases.length, 0);
  assert.deepEqual(
    second.skippedAlreadyProcessed,
    first.checkpoint.processedCandidateIds,
  );
});

test("26b. pelan yang belum diluluskan enggan dilaksanakan", () => {
  const { plan, candidates } = planFor([legacyRecord()]);
  const result = executeMigrationPlanInEmulator(
    {
      plan,
      candidates,
      checkpoint: createCheckpoint(plan.migrationPlanId, plan.batchId, T),
      actorId: "tester",
    },
    T,
  );
  assert.equal(result.ok, false);
  assert.equal(result.refusalCode, "plan_not_executable");
});

// ---- 27-29: checkpoint -----------------------------------------------------

test("27-28. jeda dan sambung semula checkpoint berfungsi", () => {
  let cp = createCheckpoint("MPL-1", "BATCH-1", T);
  cp = recordCandidate(cp, "MCD-a", "succeeded", T);
  cp = pauseCheckpoint(cp, T);
  assert.equal(cp.status, "paused");
  assert.deepEqual(remainingCandidates(cp, ["MCD-a", "MCD-b"]), ["MCD-b"]);

  cp = resumeCheckpoint(cp, T + 1000);
  cp = recordCandidate(cp, "MCD-b", "succeeded", T + 1000);
  cp = completeCheckpoint(cp, T + 2000);
  assert.equal(cp.status, "completed");
  assert.equal(cp.processedCount, 2);
  assert.equal(verifyCheckpoint(cp).ok, true);
});

test("28b. merekod calon yang sama dua kali tidak mengubah kiraan", () => {
  let cp = createCheckpoint("MPL-1", "BATCH-1", T);
  cp = recordCandidate(cp, "MCD-a", "succeeded", T);
  const after = recordCandidate(cp, "MCD-a", "succeeded", T + 1000);
  assert.deepEqual(after, cp);
});

test("29. checkpoint rosak gagal dengan selamat", () => {
  let cp = createCheckpoint("MPL-1", "BATCH-1", T);
  cp = recordCandidate(cp, "MCD-a", "succeeded", T);
  const tampered = { ...cp, succeededCount: 99 };
  assert.equal(verifyCheckpoint(tampered).ok, false);
  assert.equal(verifyCheckpoint(tampered).reason, "checksum_mismatch");

  // Pelaksanaan enggan berjalan ke atas checkpoint yang rosak.
  const { plan, candidates } = approvedPlan([legacyRecord()]);
  const result = executeMigrationPlanInEmulator(
    { plan, candidates, checkpoint: tampered, actorId: "tester" },
    T,
  );
  assert.equal(result.ok, false);
  assert.equal(result.refusalCode, "checkpoint_corrupt");
  assert.equal(markCheckpointCorrupt(tampered, T).status, "corrupt");
});

test("29b. checksum tidak bergantung kepada susunan atau masa", () => {
  const a = checkpointChecksum({
    migrationPlanId: "MPL-1", batchId: "B", processedCandidateIds: ["b", "a"],
    succeededCount: 2, heldCount: 0, failedCount: 0,
  });
  const b = checkpointChecksum({
    migrationPlanId: "MPL-1", batchId: "B", processedCandidateIds: ["a", "b"],
    succeededCount: 2, heldCount: 0, failedCount: 0,
  });
  assert.equal(a, b);
});

// ---- 30-32: rollback -------------------------------------------------------

test("30-32. rollback mengekalkan audit, memulihkan rujukan, alias ditanda", () => {
  const { plan, candidates } = approvedPlan([referencedRecord()]);
  const executed = executeMigrationPlanInEmulator(
    {
      plan,
      candidates,
      checkpoint: createCheckpoint(plan.migrationPlanId, plan.batchId, T),
      actorId: "tester",
    },
    T,
  );
  const rollback = executed.rollbackPlan!;
  assert.equal(rollback.status, "prepared");
  assert.ok(rollback.validationChecks.every((c) => c.passed));
  assert.ok(rollback.rollbackSteps.every((s) => s.destructive === false));

  const applied = applyRollback(rollback, executed.aliases, executed.rewrites, T + DAY);
  assert.equal(applied.plan.status, "executed");
  // Alias DITANDA rolled_back, bukan dipadam.
  assert.ok(applied.aliases.every((a) => a.status === "rolled_back"));
  assert.equal(applied.aliases.length, executed.aliases.length);
  assert.ok(applied.rewrites.every((r) => r.status === "rolled_back"));
  // Audit pelaksanaan kekal tidak tersentuh.
  assert.ok(executed.audit.length > 0);

  // Selepas rollback, ID legasi tidak lagi menyelesai → pembaca jatuh balik.
  assert.equal(
    resolveLegacyPlaceId("ChIJ_mock_referenced", applied.aliases).status,
    "not_found",
  );
});

test("32b. rollback idempoten", () => {
  const alias = buildAliasProposal(
    { aliasType: "google_place_id", legacyValue: "X", canonicalPlaceId: "PLC-1",
      sourceLegacyRecordId: "L", migrationPlanId: "M" }, T);
  const rolled = markAliasRolledBack(alias, T);
  assert.deepEqual(markAliasRolledBack(rolled, T + DAY).status, "rolled_back");
});

// ---- 33-36: bacaan bayangan ------------------------------------------------

function view(overrides: Partial<ComparablePlaceView> = {}): ComparablePlaceView {
  return {
    placeId: "ChIJ_mock_alpha",
    title: "Nasi Kandar Semarak",
    address: "Lot 12, Jalan Ampang",
    lat: 3.1595,
    lng: 101.7123,
    ratingState: "rating_shown",
    reviewCountState: "count_shown",
    priceState: "price_provider_band",
    hoursState: "open_now",
    businessState: "status_active",
    imageState: "image_present",
    halalState: "halal_unknown",
    tagIds: ["cuisine_mamak"],
    ...overrides,
  };
}

test("34. paparan yang sepadan menghasilkan perbandingan bersih", () => {
  const comparison = comparePlaceReads(
    view(),
    view(),
    { legacySource: "legacy_place_summary", canonicalSource: "canonical_stub" },
    T,
  );
  assert.equal(comparison.identityMatch, true);
  assert.equal(comparison.severity, "match");
  assert.equal(comparison.comparisonVersion, "1.12.0");
});

test("35. perbandingan bayangan mengesan ketidakpadanan rating", () => {
  const comparison = comparePlaceReads(
    view(),
    view({ ratingState: "rating_hidden" }),
    { legacySource: "legacy", canonicalSource: "canonical" },
    T,
  );
  const rating = comparison.fieldComparisons.find((f) => f.field === "ratingState")!;
  assert.equal(rating.match, false);
  assert.equal(rating.severity, "warning");
  assert.equal(comparison.severity, "warning");
});

test("36. perbandingan bayangan mengesan ketidakpadanan waktu", () => {
  const comparison = comparePlaceReads(
    view(),
    view({ hoursState: "hours_unknown" }),
    { legacySource: "legacy", canonicalSource: "canonical" },
    T,
  );
  assert.equal(
    comparison.fieldComparisons.find((f) => f.field === "hoursState")!.match,
    false,
  );
});

test("36b. ketidakpadanan tajuk/koordinat adalah kritikal", () => {
  const comparison = comparePlaceReads(
    view(),
    view({ title: "Kedai Lain", lat: 3.5 }),
    { legacySource: "legacy", canonicalSource: "canonical" },
    T,
  );
  assert.equal(comparison.identityMatch, false);
  assert.equal(comparison.severity, "critical");
});

test("36c. ringkasan perbandingan mengagregat mengikut medan", () => {
  const summary = summarizeComparisons([
    comparePlaceReads(view(), view(), { legacySource: "l", canonicalSource: "c" }, T),
    comparePlaceReads(
      view(), view({ ratingState: "rating_hidden" }),
      { legacySource: "l", canonicalSource: "c" }, T,
    ),
  ]);
  assert.equal(summary.totalCompared, 2);
  assert.equal(summary.mismatches, 1);
  assert.equal(summary.mismatchesByField.ratingState, 1);
});

// ---- 44-45: penanda penyiapan ---------------------------------------------

const okSummary = {
  candidatesExecuted: 1,
  aliasesCreated: 4,
  referencesRewritten: 2,
  heldCandidates: 0,
  legacyRecordsDeleted: 0 as const,
  productionWrites: 0 as const,
};

test("44. penanda penyiapan produksi dilarang", () => {
  for (const status of ["production_ready", "production_complete"] as const) {
    const result = createCompletionMarker(
      {
        migrationPlanId: "MPL-1", environment: "production",
        canonicalDataVersion: "1", aliasVersion: "1", referenceRewriteVersion: "1",
        validationSummary: okSummary, approvedBy: "owner", status,
      },
      T,
    );
    assert.equal(result.ok, false, status);
    assert.equal(result.refusalCode, "forbidden_status_in_this_phase");
    assert.equal(result.marker, null);
  }
});

test("45. penanda penyiapan emulator dibenarkan", () => {
  const result = createCompletionMarker(
    {
      migrationPlanId: "MPL-1", environment: "emulator",
      canonicalDataVersion: "1", aliasVersion: "1", referenceRewriteVersion: "1",
      validationSummary: okSummary, approvedBy: "owner", status: "emulator_complete",
    },
    T,
  );
  assert.equal(result.ok, true);
  assert.equal(result.marker?.status, "emulator_complete");
});

test("45b. penanda ditolak apabila calon masih ditahan", () => {
  const result = createCompletionMarker(
    {
      migrationPlanId: "MPL-1", environment: "emulator",
      canonicalDataVersion: "1", aliasVersion: "1", referenceRewriteVersion: "1",
      validationSummary: { ...okSummary, heldCandidates: 2 },
      approvedBy: "owner", status: "emulator_complete",
    },
    T,
  );
  assert.equal(result.ok, false);
  assert.equal(result.refusalCode, "held_candidates_present");
});

test("45c. bacaan canonical produksi tidak pernah dibenarkan dalam fasa ini", () => {
  const marker = createCompletionMarker(
    {
      migrationPlanId: "MPL-1", environment: "emulator",
      canonicalDataVersion: "1", aliasVersion: "1", referenceRewriteVersion: "1",
      validationSummary: okSummary, approvedBy: "owner", status: "emulator_complete",
    },
    T,
  ).marker!;
  assert.equal(productionCanonicalReadAllowed([marker]), false);
});

// ---- Pratonton penulisan semula + stor ------------------------------------

test("pratonton penulisan semula mengekalkan nilai legasi", () => {
  const record = buildInventoryRecord(referencedRecord(), T);
  const preview = buildRewritePreview(
    record.referencedBy, record.legacyPlaceId, "PLC-target", T,
  );
  assert.ok(preview.rewrites.every((r) => r.aliasPreserved));
  assert.ok(preview.rewrites.every((r) => r.status === "preview"));
  // Favorites/meals/deep links adalah wajib.
  const required = preview.rewrites.filter((r) => r.required);
  assert.equal(required.length, 4);
});

test("laluan rujukan tidak diketahui ditahan, bukan dipratonton", () => {
  const preview = buildRewritePreview(
    [pointer("other", "mystery/doc")], "legacy_x", "PLC-x", T,
  );
  assert.equal(preview.rewrites.length, 0);
  assert.equal(preview.unresolved.length, 1);
  assert.equal(preview.unresolved[0].reason, "unknown_reference_path");
});

test("stor migrasi tidak mempunyai operasi padam legasi", () => {
  const store = new InMemoryMigrationStore();
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(store));
  for (const method of methods) {
    assert.equal(
      /^delete(Legacy|Inventory|Place|Cache)/.test(method), false,
      `kaedah padam legasi ${method} tidak sepatutnya wujud`,
    );
  }
  assert.equal(store.emulatorOnly, true);
});

test("stor mengklon pada sempadan dan audit hanya-tambah", async () => {
  const store = new InMemoryMigrationStore();
  const records: LegacyPlaceInventoryRecord[] = inventoryOf([legacyRecord()]);
  await store.saveInventory(records);
  const fetched = await store.listInventory();
  (fetched[0] as { displayName: string }).displayName = "DIUBAH";
  const again = await store.listInventory();
  assert.equal(again[0].displayName, "Nasi Kandar Semarak");

  await store.appendAudit([
    { auditId: "MAU-1", action: "plan_built", migrationPlanId: "MPL-1",
      actorType: "system", reasonCode: "test", at: T },
  ]);
  await store.appendAudit([
    { auditId: "MAU-1", action: "plan_blocked", migrationPlanId: "MPL-1",
      actorType: "system", reasonCode: "duplicate", at: T + 1 },
  ]);
  const audit = await store.listAudit("MPL-1");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, "plan_built");
});

test("cincang inventori mengesan sebarang perubahan data legasi", () => {
  const a = inventoryHash(inventoryOf([legacyRecord(), referencedRecord()]));
  const b = inventoryHash(inventoryOf([referencedRecord(), legacyRecord()]));
  assert.equal(a, b, "susunan tidak penting");
  const c = inventoryHash(inventoryOf([legacyRecord({ rating: 1.0 }), referencedRecord()]));
  assert.notEqual(a, c);
});
