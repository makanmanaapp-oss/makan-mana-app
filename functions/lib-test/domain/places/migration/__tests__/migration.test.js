"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.12 — ujian unit asas migrasi legasi.
 *
 * Meliputi Part T item 1-49 yang boleh diuji tanpa emulator/Flutter.
 */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
function inventoryOf(inputs) {
    return (0, index_1.buildLegacyInventory)(inputs, fixtures_1.T);
}
function planFor(inputs, batchId = "BATCH-1") {
    return (0, index_1.buildLegacyMigrationPlan)({ batchId, records: inventoryOf(inputs), createdBy: "tester" }, fixtures_1.T);
}
// ---- 1-4: inventori legasi -------------------------------------------------
(0, node_test_1.default)("1. inventori menangkap ID stabil dan ID rekod deterministik", () => {
    const record = (0, index_1.buildInventoryRecord)((0, fixtures_1.legacyRecord)(), fixtures_1.T);
    strict_1.default.equal(record.legacyPlaceId, "ChIJ_mock_alpha");
    strict_1.default.equal(record.providerPlaceId, "ChIJ_mock_alpha");
    strict_1.default.equal(record.inventoryStatus, "eligible");
    // ID deterministik: bina semula memberi ID yang sama.
    strict_1.default.equal((0, index_1.buildInventoryRecord)((0, fixtures_1.legacyRecord)(), fixtures_1.T + fixtures_1.DAY).legacyRecordId, record.legacyRecordId);
});
(0, node_test_1.default)("2. inventori mengekalkan laluan sumber legasi", () => {
    const record = (0, index_1.buildInventoryRecord)((0, fixtures_1.legacyRecord)(), fixtures_1.T);
    strict_1.default.equal(record.legacyDocumentPath, "place_details/ChIJ_mock_alpha");
    strict_1.default.equal(record.legacyCollection, "place_details");
});
(0, node_test_1.default)("3. inventori tidak mengubah input legasi", () => {
    const input = (0, fixtures_1.legacyRecord)();
    const before = JSON.stringify(input);
    (0, index_1.buildInventoryRecord)(input, fixtures_1.T);
    strict_1.default.equal(JSON.stringify(input), before);
});
(0, node_test_1.default)("3b. cincang kandungan mengabaikan masa tetapi mengesan perubahan data", () => {
    const a = (0, index_1.buildInventoryRecord)((0, fixtures_1.legacyRecord)(), fixtures_1.T);
    const b = (0, index_1.buildInventoryRecord)((0, fixtures_1.legacyRecord)(), fixtures_1.T + 90 * fixtures_1.DAY);
    strict_1.default.equal(a.rawContentHash, b.rawContentHash);
    const c = (0, index_1.buildInventoryRecord)((0, fixtures_1.legacyRecord)({ displayName: "Berubah" }), fixtures_1.T);
    strict_1.default.notEqual(a.rawContentHash, c.rawContentHash);
});
(0, node_test_1.default)("4. identiti yang hilang menjadi tahan", () => {
    const record = (0, index_1.buildInventoryRecord)((0, fixtures_1.nameOnlyRecord)(), fixtures_1.T);
    strict_1.default.equal(record.inventoryStatus, "ambiguous");
    strict_1.default.ok(record.warnings.includes("no_stable_identity_beyond_name"));
    const candidate = (0, index_1.buildMigrationCandidate)({
        records: [record],
        referenceImpact: (0, index_1.emptyReferenceImpact)(record.legacyPlaceId, fixtures_1.T),
    }, fixtures_1.T);
    strict_1.default.ok(candidate.holdReasons.includes("name_only_match"));
    strict_1.default.equal((0, index_1.candidateIsExecutable)(candidate), false);
});
// ---- 5-11: identiti, cawangan, alias --------------------------------------
(0, node_test_1.default)("5. padanan nama-sahaja ditahan dan tidak pernah boleh dilaksanakan", () => {
    const { candidates } = planFor([(0, fixtures_1.nameOnlyRecord)()]);
    strict_1.default.equal(candidates.length, 1);
    strict_1.default.equal(candidates[0].migrationDecision, "insufficient_identity");
    strict_1.default.ok(candidates[0].holdReasons.includes("name_only_match"));
});
(0, node_test_1.default)("6. ID pembekal tepat memetakan dengan selamat", () => {
    const { candidates, plan } = planFor([(0, fixtures_1.legacyRecord)()]);
    strict_1.default.equal(candidates[0].migrationDecision, "ready");
    strict_1.default.equal(candidates[0].holdReasons.length, 0);
    strict_1.default.equal(plan.canonicalSnapshotsToCreate.length, 1);
});
(0, node_test_1.default)("7. telefon sama + koordinat hampir menghasilkan calon boleh disemak", () => {
    const near = (0, fixtures_1.legacyRecord)({
        legacyDocumentPath: "places_cache/near_twin",
        legacyPlaceId: "legacy_near_twin",
        providerPlaceId: undefined,
        lat: 3.15951,
        lng: 101.71231,
    });
    const { candidates } = planFor([(0, fixtures_1.legacyRecord)(), near]);
    const twin = candidates.find((c) => c.legacyPlaceIds.includes("legacy_near_twin"));
    // Ada koordinat sah → bukan nama-sahaja; ia sedia atau perlu semakan,
    // tetapi TIDAK PERNAH digabungkan secara senyap dengan yang asal.
    strict_1.default.notEqual(twin.proposedCanonicalPlaceId, candidates[0].proposedCanonicalPlaceId);
});
(0, node_test_1.default)("8. konflik cawangan menyekat migrasi", () => {
    const { candidates } = planFor((0, fixtures_1.branchRecords)());
    const conflicted = candidates.filter((c) => c.migrationDecision === "branch_conflict");
    strict_1.default.equal(conflicted.length, 1, "cawangan kedua mesti berkonflik");
    strict_1.default.ok(conflicted[0].holdReasons.includes("branch_conflict"));
    strict_1.default.equal((0, index_1.candidateIsExecutable)(conflicted[0]), false);
});
(0, node_test_1.default)("9. perlanggaran alias menyekat migrasi", () => {
    const existing = [
        (0, index_1.buildAliasProposal)({
            aliasType: "google_place_id",
            legacyValue: "ChIJ_mock_alpha",
            canonicalPlaceId: "PLC-someone-else",
            sourceLegacyRecordId: "LEG-x",
            migrationPlanId: "MPL-x",
        }, fixtures_1.T),
    ];
    const check = (0, index_1.checkAliasProposal)({
        aliasType: "google_place_id",
        legacyValue: "ChIJ_mock_alpha",
        canonicalPlaceId: "PLC-different",
        sourceLegacyRecordId: "LEG-y",
        migrationPlanId: "MPL-y",
    }, existing);
    strict_1.default.equal(check.ok, false);
    strict_1.default.equal(check.code, "alias_collision");
    strict_1.default.equal(check.existingCanonicalPlaceId, "PLC-someone-else");
});
(0, node_test_1.default)("9b. alias sedia ada diterima pakai, tidak pernah ditulis ganti", () => {
    const existing = [
        (0, index_1.buildAliasProposal)({
            aliasType: "google_place_id",
            legacyValue: "ChIJ_mock_alpha",
            canonicalPlaceId: "PLC-original",
            sourceLegacyRecordId: "LEG-x",
            migrationPlanId: "MPL-x",
        }, fixtures_1.T),
    ];
    const { plan, candidates } = (0, index_1.buildLegacyMigrationPlan)({
        batchId: "BATCH-existing",
        records: inventoryOf([(0, fixtures_1.legacyRecord)()]),
        existingAliases: existing,
        createdBy: "tester",
    }, fixtures_1.T);
    // Perancang MENERIMA PAKAI pemetaan sedia ada dan bukannya mencipta yang baharu.
    strict_1.default.equal(candidates[0].migrationDecision, "already_mapped");
    strict_1.default.equal(candidates[0].proposedCanonicalPlaceId, "PLC-original");
    strict_1.default.equal((0, index_1.candidateIsExecutable)(candidates[0]), false, "tiada kerja baharu");
    strict_1.default.equal(plan.canonicalSnapshotsToCreate.length, 0);
    // Alias asal masih menyelesai ke tempat asalnya — tiada tulis ganti senyap.
    strict_1.default.equal((0, index_1.resolveLegacyPlaceId)("ChIJ_mock_alpha", existing).canonicalPlaceId, "PLC-original");
});
(0, node_test_1.default)("10. alias bulat gagal dengan selamat", () => {
    const aliases = [
        (0, index_1.buildAliasProposal)({ aliasType: "internal_place_id", legacyValue: "A", canonicalPlaceId: "B",
            sourceLegacyRecordId: "L", migrationPlanId: "M" }, fixtures_1.T),
        (0, index_1.buildAliasProposal)({ aliasType: "internal_place_id", legacyValue: "B", canonicalPlaceId: "A",
            sourceLegacyRecordId: "L", migrationPlanId: "M" }, fixtures_1.T),
    ];
    strict_1.default.equal((0, index_1.resolveLegacyPlaceId)("A", aliases).status, "circular");
});
(0, node_test_1.default)("11. alias tidak diketahui memulangkan not_found eksplisit", () => {
    strict_1.default.equal((0, index_1.resolveLegacyPlaceId)("never_seen", []).status, "not_found");
});
(0, node_test_1.default)("11b. alias tidak boleh menunjuk kepada cawangan adik-beradik", () => {
    const check = (0, index_1.checkAliasProposal)({ aliasType: "google_place_id", legacyValue: "ChIJ_ali_bangi",
        canonicalPlaceId: "PLC-shah-alam", sourceLegacyRecordId: "L",
        migrationPlanId: "M" }, [], { siblingBranchIds: ["PLC-shah-alam"] });
    strict_1.default.equal(check.ok, false);
    strict_1.default.equal(check.code, "sibling_branch_target");
});
(0, node_test_1.default)("11c. setiap ID legasi dikekalkan sebagai alias", () => {
    const proposals = (0, index_1.aliasProposalsFor)({
        legacyDocumentIds: ["place_details/x"],
        googlePlaceIds: ["ChIJ_x"],
        internalPlaceIds: ["LEG-x"],
        deepLinkPlaceIds: ["ChIJ_x"],
        providerPlaceIds: ["ChIJ_x"],
        merchantIds: ["SSM-123"],
    }, "PLC-target", "LEG-x", "MPL-1");
    const types = new Set(proposals.map((p) => p.aliasType));
    for (const expected of [
        "legacy_document_id", "google_place_id", "internal_place_id",
        "deep_link_place_id", "provider_place_id", "merchant_id",
    ]) {
        strict_1.default.ok(types.has(expected), `alias ${expected} hilang`);
    }
});
// ---- 12-16: kesan rujukan --------------------------------------------------
(0, node_test_1.default)("12-15. rujukan dikira dan yang kritikal ditandakan", () => {
    const record = (0, index_1.buildInventoryRecord)((0, fixtures_1.referencedRecord)(), fixtures_1.T);
    const impact = (0, index_1.scanReferenceImpact)(record.legacyPlaceId, record.referencedBy, fixtures_1.T);
    strict_1.default.equal(impact.favoriteReferenceCount, 2);
    strict_1.default.equal(impact.mealReferenceCount, 1);
    strict_1.default.equal(impact.historyReferenceCount, 1);
    strict_1.default.equal(impact.suggestionReferenceCount, 1);
    strict_1.default.equal(impact.sessionReferenceCount, 1);
    strict_1.default.equal(impact.deepLinkReferenceCount, 1);
    strict_1.default.equal(impact.correctionReferenceCount, 1);
    // favorites(2) + meals(1) + deep link(1) = 4 kritikal.
    strict_1.default.equal(impact.criticalReferences, 4);
    strict_1.default.equal(impact.migrationRisk, "high");
});
(0, node_test_1.default)("16. laluan rujukan tidak diketahui menaikkan amaran", () => {
    const impact = (0, index_1.scanReferenceImpact)("legacy_x", [(0, fixtures_1.pointer)("other", "mystery_collection/doc_1")], fixtures_1.T);
    strict_1.default.ok(impact.warnings.includes("unknown_reference_path"));
    strict_1.default.deepEqual(impact.otherReferencePaths, ["mystery_collection/doc_1"]);
    strict_1.default.equal(impact.migrationRisk, "medium");
});
(0, node_test_1.default)("16b. imbasan rujukan terikat", () => {
    const many = Array.from({ length: 12 }, (_, i) => (0, fixtures_1.pointer)("favorite", `users/u${i}/favorites/p`));
    const impact = (0, index_1.scanReferenceImpact)("legacy_x", many, fixtures_1.T, {
        maxReferencesPerPlace: 5,
        maxUnknownPathsRecorded: 5,
    });
    strict_1.default.ok(impact.warnings.includes("reference_scan_truncated"));
    strict_1.default.equal(impact.totalReferences, 5);
});
// ---- 17-20: determinisme ---------------------------------------------------
(0, node_test_1.default)("17. cincang calon deterministik", () => {
    const a = planFor([(0, fixtures_1.legacyRecord)()]).candidates[0];
    const b = (0, index_1.buildLegacyMigrationPlan)({ batchId: "BATCH-1", records: inventoryOf([(0, fixtures_1.legacyRecord)()]), createdBy: "other" }, fixtures_1.T + 5 * fixtures_1.DAY).candidates[0];
    strict_1.default.equal(a.contentHash, b.contentHash);
});
(0, node_test_1.default)("18-19. cincang pelan deterministik dan dry-run idempoten", () => {
    const a = planFor([(0, fixtures_1.legacyRecord)(), (0, fixtures_1.referencedRecord)()]).plan;
    const b = planFor([(0, fixtures_1.legacyRecord)(), (0, fixtures_1.referencedRecord)()]).plan;
    strict_1.default.equal(a.contentHash, b.contentHash);
    strict_1.default.equal(a.migrationPlanId, b.migrationPlanId);
    strict_1.default.deepEqual(a.dryRunSummary, b.dryRunSummary);
});
(0, node_test_1.default)("19b. susunan input tidak mengubah cincang pelan", () => {
    const a = planFor([(0, fixtures_1.legacyRecord)(), (0, fixtures_1.referencedRecord)()]).plan;
    const b = planFor([(0, fixtures_1.referencedRecord)(), (0, fixtures_1.legacyRecord)()]).plan;
    strict_1.default.equal(a.contentHash, b.contentHash);
});
(0, node_test_1.default)("20. kandungan legasi yang berubah mengubah cincang pelan", () => {
    const a = planFor([(0, fixtures_1.legacyRecord)()]).plan;
    const b = planFor([(0, fixtures_1.legacyRecord)({ address: "Alamat baharu" })]).plan;
    strict_1.default.notEqual(a.contentHash, b.contentHash);
});
(0, node_test_1.default)("20b. ringkasan dry-run mengesahkan sifar tulisan produksi", () => {
    const { plan } = planFor([(0, fixtures_1.legacyRecord)()]);
    strict_1.default.equal(plan.dryRunSummary.zeroProductionWritesConfirmed, true);
    strict_1.default.equal(plan.targetCollectionMode, "emulator_only");
});
// ---- 21-26: pelaksanaan emulator ------------------------------------------
function approvedPlan(inputs) {
    const { plan, candidates } = planFor(inputs);
    return {
        plan: { ...plan, status: "approved_for_emulator" },
        candidates,
    };
}
(0, node_test_1.default)("21. calon sedia memasuki pelan", () => {
    const { plan, candidates } = planFor([(0, fixtures_1.legacyRecord)()]);
    strict_1.default.ok(plan.candidateIds.includes(candidates[0].candidateId));
    strict_1.default.equal(plan.dryRunSummary.readyCandidates, 1);
});
(0, node_test_1.default)("22. calon yang ditahan tidak boleh dilaksanakan", () => {
    const { plan, candidates } = approvedPlan([(0, fixtures_1.legacyRecord)(), (0, fixtures_1.nameOnlyRecord)()]);
    const checkpoint = (0, index_1.createCheckpoint)(plan.migrationPlanId, plan.batchId, fixtures_1.T);
    const result = (0, index_1.executeMigrationPlanInEmulator)({ plan, candidates, checkpoint, actorId: "tester" }, fixtures_1.T);
    strict_1.default.equal(result.ok, true);
    strict_1.default.equal(result.heldCandidateIds.length, 1);
    // Hanya rekod yang sedia dicipta.
    strict_1.default.equal(result.canonicalRecords.length, 1);
});
(0, node_test_1.default)("23-25. pelaksanaan emulator mencipta canonical + alias, legasi kekal", () => {
    const { plan, candidates } = approvedPlan([(0, fixtures_1.referencedRecord)()]);
    const checkpoint = (0, index_1.createCheckpoint)(plan.migrationPlanId, plan.batchId, fixtures_1.T);
    const result = (0, index_1.executeMigrationPlanInEmulator)({ plan, candidates, checkpoint, actorId: "tester" }, fixtures_1.T);
    strict_1.default.equal(result.ok, true);
    strict_1.default.equal(result.canonicalRecords.length, 1);
    strict_1.default.equal(result.canonicalRecords[0].emulatorOnly, true);
    strict_1.default.equal(result.canonicalRecords[0].published, false);
    strict_1.default.ok(result.aliases.length > 0);
    strict_1.default.ok(result.aliases.every((a) => a.status === "active"));
    // Tiada operasi padam bagi data legasi wujud dalam hasil.
    strict_1.default.equal(result.deletedLegacyData, false);
    strict_1.default.equal(result.wroteProductionData, false);
});
(0, node_test_1.default)("26. pelaksanaan berulang idempoten", () => {
    const { plan, candidates } = approvedPlan([(0, fixtures_1.referencedRecord)()]);
    const first = (0, index_1.executeMigrationPlanInEmulator)({
        plan,
        candidates,
        checkpoint: (0, index_1.createCheckpoint)(plan.migrationPlanId, plan.batchId, fixtures_1.T),
        actorId: "tester",
    }, fixtures_1.T);
    const second = (0, index_1.executeMigrationPlanInEmulator)({
        plan,
        candidates,
        checkpoint: first.checkpoint,
        existingCanonicalIds: first.canonicalRecords.map((r) => r.canonicalPlaceId),
        actorId: "tester",
    }, fixtures_1.T + fixtures_1.DAY);
    strict_1.default.equal(second.ok, true);
    strict_1.default.equal(second.canonicalRecords.length, 0, "tiada rekod pendua");
    strict_1.default.equal(second.aliases.length, 0);
    strict_1.default.deepEqual(second.skippedAlreadyProcessed, first.checkpoint.processedCandidateIds);
});
(0, node_test_1.default)("26b. pelan yang belum diluluskan enggan dilaksanakan", () => {
    const { plan, candidates } = planFor([(0, fixtures_1.legacyRecord)()]);
    const result = (0, index_1.executeMigrationPlanInEmulator)({
        plan,
        candidates,
        checkpoint: (0, index_1.createCheckpoint)(plan.migrationPlanId, plan.batchId, fixtures_1.T),
        actorId: "tester",
    }, fixtures_1.T);
    strict_1.default.equal(result.ok, false);
    strict_1.default.equal(result.refusalCode, "plan_not_executable");
});
// ---- 27-29: checkpoint -----------------------------------------------------
(0, node_test_1.default)("27-28. jeda dan sambung semula checkpoint berfungsi", () => {
    let cp = (0, index_1.createCheckpoint)("MPL-1", "BATCH-1", fixtures_1.T);
    cp = (0, index_1.recordCandidate)(cp, "MCD-a", "succeeded", fixtures_1.T);
    cp = (0, index_1.pauseCheckpoint)(cp, fixtures_1.T);
    strict_1.default.equal(cp.status, "paused");
    strict_1.default.deepEqual((0, index_1.remainingCandidates)(cp, ["MCD-a", "MCD-b"]), ["MCD-b"]);
    cp = (0, index_1.resumeCheckpoint)(cp, fixtures_1.T + 1000);
    cp = (0, index_1.recordCandidate)(cp, "MCD-b", "succeeded", fixtures_1.T + 1000);
    cp = (0, index_1.completeCheckpoint)(cp, fixtures_1.T + 2000);
    strict_1.default.equal(cp.status, "completed");
    strict_1.default.equal(cp.processedCount, 2);
    strict_1.default.equal((0, index_1.verifyCheckpoint)(cp).ok, true);
});
(0, node_test_1.default)("28b. merekod calon yang sama dua kali tidak mengubah kiraan", () => {
    let cp = (0, index_1.createCheckpoint)("MPL-1", "BATCH-1", fixtures_1.T);
    cp = (0, index_1.recordCandidate)(cp, "MCD-a", "succeeded", fixtures_1.T);
    const after = (0, index_1.recordCandidate)(cp, "MCD-a", "succeeded", fixtures_1.T + 1000);
    strict_1.default.deepEqual(after, cp);
});
(0, node_test_1.default)("29. checkpoint rosak gagal dengan selamat", () => {
    let cp = (0, index_1.createCheckpoint)("MPL-1", "BATCH-1", fixtures_1.T);
    cp = (0, index_1.recordCandidate)(cp, "MCD-a", "succeeded", fixtures_1.T);
    const tampered = { ...cp, succeededCount: 99 };
    strict_1.default.equal((0, index_1.verifyCheckpoint)(tampered).ok, false);
    strict_1.default.equal((0, index_1.verifyCheckpoint)(tampered).reason, "checksum_mismatch");
    // Pelaksanaan enggan berjalan ke atas checkpoint yang rosak.
    const { plan, candidates } = approvedPlan([(0, fixtures_1.legacyRecord)()]);
    const result = (0, index_1.executeMigrationPlanInEmulator)({ plan, candidates, checkpoint: tampered, actorId: "tester" }, fixtures_1.T);
    strict_1.default.equal(result.ok, false);
    strict_1.default.equal(result.refusalCode, "checkpoint_corrupt");
    strict_1.default.equal((0, index_1.markCheckpointCorrupt)(tampered, fixtures_1.T).status, "corrupt");
});
(0, node_test_1.default)("29b. checksum tidak bergantung kepada susunan atau masa", () => {
    const a = (0, index_1.checkpointChecksum)({
        migrationPlanId: "MPL-1", batchId: "B", processedCandidateIds: ["b", "a"],
        succeededCount: 2, heldCount: 0, failedCount: 0,
    });
    const b = (0, index_1.checkpointChecksum)({
        migrationPlanId: "MPL-1", batchId: "B", processedCandidateIds: ["a", "b"],
        succeededCount: 2, heldCount: 0, failedCount: 0,
    });
    strict_1.default.equal(a, b);
});
// ---- 30-32: rollback -------------------------------------------------------
(0, node_test_1.default)("30-32. rollback mengekalkan audit, memulihkan rujukan, alias ditanda", () => {
    const { plan, candidates } = approvedPlan([(0, fixtures_1.referencedRecord)()]);
    const executed = (0, index_1.executeMigrationPlanInEmulator)({
        plan,
        candidates,
        checkpoint: (0, index_1.createCheckpoint)(plan.migrationPlanId, plan.batchId, fixtures_1.T),
        actorId: "tester",
    }, fixtures_1.T);
    const rollback = executed.rollbackPlan;
    strict_1.default.equal(rollback.status, "prepared");
    strict_1.default.ok(rollback.validationChecks.every((c) => c.passed));
    strict_1.default.ok(rollback.rollbackSteps.every((s) => s.destructive === false));
    const applied = (0, index_1.applyRollback)(rollback, executed.aliases, executed.rewrites, fixtures_1.T + fixtures_1.DAY);
    strict_1.default.equal(applied.plan.status, "executed");
    // Alias DITANDA rolled_back, bukan dipadam.
    strict_1.default.ok(applied.aliases.every((a) => a.status === "rolled_back"));
    strict_1.default.equal(applied.aliases.length, executed.aliases.length);
    strict_1.default.ok(applied.rewrites.every((r) => r.status === "rolled_back"));
    // Audit pelaksanaan kekal tidak tersentuh.
    strict_1.default.ok(executed.audit.length > 0);
    // Selepas rollback, ID legasi tidak lagi menyelesai → pembaca jatuh balik.
    strict_1.default.equal((0, index_1.resolveLegacyPlaceId)("ChIJ_mock_referenced", applied.aliases).status, "not_found");
});
(0, node_test_1.default)("32b. rollback idempoten", () => {
    const alias = (0, index_1.buildAliasProposal)({ aliasType: "google_place_id", legacyValue: "X", canonicalPlaceId: "PLC-1",
        sourceLegacyRecordId: "L", migrationPlanId: "M" }, fixtures_1.T);
    const rolled = (0, index_1.markAliasRolledBack)(alias, fixtures_1.T);
    strict_1.default.deepEqual((0, index_1.markAliasRolledBack)(rolled, fixtures_1.T + fixtures_1.DAY).status, "rolled_back");
});
// ---- 33-36: bacaan bayangan ------------------------------------------------
function view(overrides = {}) {
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
(0, node_test_1.default)("34. paparan yang sepadan menghasilkan perbandingan bersih", () => {
    const comparison = (0, index_1.comparePlaceReads)(view(), view(), { legacySource: "legacy_place_summary", canonicalSource: "canonical_stub" }, fixtures_1.T);
    strict_1.default.equal(comparison.identityMatch, true);
    strict_1.default.equal(comparison.severity, "match");
    strict_1.default.equal(comparison.comparisonVersion, "1.12.0");
});
(0, node_test_1.default)("35. perbandingan bayangan mengesan ketidakpadanan rating", () => {
    const comparison = (0, index_1.comparePlaceReads)(view(), view({ ratingState: "rating_hidden" }), { legacySource: "legacy", canonicalSource: "canonical" }, fixtures_1.T);
    const rating = comparison.fieldComparisons.find((f) => f.field === "ratingState");
    strict_1.default.equal(rating.match, false);
    strict_1.default.equal(rating.severity, "warning");
    strict_1.default.equal(comparison.severity, "warning");
});
(0, node_test_1.default)("36. perbandingan bayangan mengesan ketidakpadanan waktu", () => {
    const comparison = (0, index_1.comparePlaceReads)(view(), view({ hoursState: "hours_unknown" }), { legacySource: "legacy", canonicalSource: "canonical" }, fixtures_1.T);
    strict_1.default.equal(comparison.fieldComparisons.find((f) => f.field === "hoursState").match, false);
});
(0, node_test_1.default)("36b. ketidakpadanan tajuk/koordinat adalah kritikal", () => {
    const comparison = (0, index_1.comparePlaceReads)(view(), view({ title: "Kedai Lain", lat: 3.5 }), { legacySource: "legacy", canonicalSource: "canonical" }, fixtures_1.T);
    strict_1.default.equal(comparison.identityMatch, false);
    strict_1.default.equal(comparison.severity, "critical");
});
(0, node_test_1.default)("36c. ringkasan perbandingan mengagregat mengikut medan", () => {
    const summary = (0, index_1.summarizeComparisons)([
        (0, index_1.comparePlaceReads)(view(), view(), { legacySource: "l", canonicalSource: "c" }, fixtures_1.T),
        (0, index_1.comparePlaceReads)(view(), view({ ratingState: "rating_hidden" }), { legacySource: "l", canonicalSource: "c" }, fixtures_1.T),
    ]);
    strict_1.default.equal(summary.totalCompared, 2);
    strict_1.default.equal(summary.mismatches, 1);
    strict_1.default.equal(summary.mismatchesByField.ratingState, 1);
});
// ---- 44-45: penanda penyiapan ---------------------------------------------
const okSummary = {
    candidatesExecuted: 1,
    aliasesCreated: 4,
    referencesRewritten: 2,
    heldCandidates: 0,
    legacyRecordsDeleted: 0,
    productionWrites: 0,
};
(0, node_test_1.default)("44. penanda penyiapan produksi dilarang", () => {
    for (const status of ["production_ready", "production_complete"]) {
        const result = (0, index_1.createCompletionMarker)({
            migrationPlanId: "MPL-1", environment: "production",
            canonicalDataVersion: "1", aliasVersion: "1", referenceRewriteVersion: "1",
            validationSummary: okSummary, approvedBy: "owner", status,
        }, fixtures_1.T);
        strict_1.default.equal(result.ok, false, status);
        strict_1.default.equal(result.refusalCode, "forbidden_status_in_this_phase");
        strict_1.default.equal(result.marker, null);
    }
});
(0, node_test_1.default)("45. penanda penyiapan emulator dibenarkan", () => {
    const result = (0, index_1.createCompletionMarker)({
        migrationPlanId: "MPL-1", environment: "emulator",
        canonicalDataVersion: "1", aliasVersion: "1", referenceRewriteVersion: "1",
        validationSummary: okSummary, approvedBy: "owner", status: "emulator_complete",
    }, fixtures_1.T);
    strict_1.default.equal(result.ok, true);
    strict_1.default.equal(result.marker?.status, "emulator_complete");
});
(0, node_test_1.default)("45b. penanda ditolak apabila calon masih ditahan", () => {
    const result = (0, index_1.createCompletionMarker)({
        migrationPlanId: "MPL-1", environment: "emulator",
        canonicalDataVersion: "1", aliasVersion: "1", referenceRewriteVersion: "1",
        validationSummary: { ...okSummary, heldCandidates: 2 },
        approvedBy: "owner", status: "emulator_complete",
    }, fixtures_1.T);
    strict_1.default.equal(result.ok, false);
    strict_1.default.equal(result.refusalCode, "held_candidates_present");
});
(0, node_test_1.default)("45c. bacaan canonical produksi tidak pernah dibenarkan dalam fasa ini", () => {
    const marker = (0, index_1.createCompletionMarker)({
        migrationPlanId: "MPL-1", environment: "emulator",
        canonicalDataVersion: "1", aliasVersion: "1", referenceRewriteVersion: "1",
        validationSummary: okSummary, approvedBy: "owner", status: "emulator_complete",
    }, fixtures_1.T).marker;
    strict_1.default.equal((0, index_1.productionCanonicalReadAllowed)([marker]), false);
});
// ---- Pratonton penulisan semula + stor ------------------------------------
(0, node_test_1.default)("pratonton penulisan semula mengekalkan nilai legasi", () => {
    const record = (0, index_1.buildInventoryRecord)((0, fixtures_1.referencedRecord)(), fixtures_1.T);
    const preview = (0, index_1.buildRewritePreview)(record.referencedBy, record.legacyPlaceId, "PLC-target", fixtures_1.T);
    strict_1.default.ok(preview.rewrites.every((r) => r.aliasPreserved));
    strict_1.default.ok(preview.rewrites.every((r) => r.status === "preview"));
    // Favorites/meals/deep links adalah wajib.
    const required = preview.rewrites.filter((r) => r.required);
    strict_1.default.equal(required.length, 4);
});
(0, node_test_1.default)("laluan rujukan tidak diketahui ditahan, bukan dipratonton", () => {
    const preview = (0, index_1.buildRewritePreview)([(0, fixtures_1.pointer)("other", "mystery/doc")], "legacy_x", "PLC-x", fixtures_1.T);
    strict_1.default.equal(preview.rewrites.length, 0);
    strict_1.default.equal(preview.unresolved.length, 1);
    strict_1.default.equal(preview.unresolved[0].reason, "unknown_reference_path");
});
(0, node_test_1.default)("stor migrasi tidak mempunyai operasi padam legasi", () => {
    const store = new index_1.InMemoryMigrationStore();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(store));
    for (const method of methods) {
        strict_1.default.equal(/^delete(Legacy|Inventory|Place|Cache)/.test(method), false, `kaedah padam legasi ${method} tidak sepatutnya wujud`);
    }
    strict_1.default.equal(store.emulatorOnly, true);
});
(0, node_test_1.default)("stor mengklon pada sempadan dan audit hanya-tambah", async () => {
    const store = new index_1.InMemoryMigrationStore();
    const records = inventoryOf([(0, fixtures_1.legacyRecord)()]);
    await store.saveInventory(records);
    const fetched = await store.listInventory();
    fetched[0].displayName = "DIUBAH";
    const again = await store.listInventory();
    strict_1.default.equal(again[0].displayName, "Nasi Kandar Semarak");
    await store.appendAudit([
        { auditId: "MAU-1", action: "plan_built", migrationPlanId: "MPL-1",
            actorType: "system", reasonCode: "test", at: fixtures_1.T },
    ]);
    await store.appendAudit([
        { auditId: "MAU-1", action: "plan_blocked", migrationPlanId: "MPL-1",
            actorType: "system", reasonCode: "duplicate", at: fixtures_1.T + 1 },
    ]);
    const audit = await store.listAudit("MPL-1");
    strict_1.default.equal(audit.length, 1);
    strict_1.default.equal(audit[0].action, "plan_built");
});
(0, node_test_1.default)("cincang inventori mengesan sebarang perubahan data legasi", () => {
    const a = (0, index_1.inventoryHash)(inventoryOf([(0, fixtures_1.legacyRecord)(), (0, fixtures_1.referencedRecord)()]));
    const b = (0, index_1.inventoryHash)(inventoryOf([(0, fixtures_1.referencedRecord)(), (0, fixtures_1.legacyRecord)()]));
    strict_1.default.equal(a, b, "susunan tidak penting");
    const c = (0, index_1.inventoryHash)(inventoryOf([(0, fixtures_1.legacyRecord)({ rating: 1.0 }), (0, fixtures_1.referencedRecord)()]));
    strict_1.default.notEqual(a, c);
});
