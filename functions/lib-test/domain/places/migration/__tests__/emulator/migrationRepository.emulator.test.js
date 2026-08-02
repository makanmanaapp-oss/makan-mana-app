"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.12 — ujian repository migrasi Firestore terhadap EMULATOR sahaja.
 * Jalankan: npm run test:emulator.
 *
 * Ujian ini membuktikan tuntutan keselamatan fasa dengan data sebenar:
 * rekod legasi kekal, alias ditanda dan bukan dipadam, audit hanya-tambah,
 * dan TIADA koleksi produksi disentuh.
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const firestoreMigrationRepository_1 = require("../../firestoreMigrationRepository");
const index_1 = require("../../index");
const fixtures_1 = require("../fixtures");
const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator)";
let app;
let seq = 0;
function db() {
    if (!app)
        app = (0, app_1.initializeApp)({ projectId: process.env.GCLOUD_PROJECT ?? "demo-mm" });
    return (0, firestore_1.getFirestore)(app);
}
function store() {
    return new firestoreMigrationRepository_1.FirestoreMigrationStore(db());
}
/** Bina pelan diluluskan yang unik bagi setiap ujian. */
function approvedPlan(suffix) {
    const records = (0, index_1.buildLegacyInventory)([
        (0, fixtures_1.legacyRecord)({
            legacyDocumentPath: `place_details/EMU_${suffix}`,
            legacyPlaceId: `EMU_${suffix}`,
            providerPlaceId: `EMU_${suffix}`,
        }),
        (0, fixtures_1.referencedRecord)(),
    ], fixtures_1.T);
    const built = (0, index_1.buildLegacyMigrationPlan)({ batchId: `EMU-BATCH-${suffix}`, records, createdBy: "emulator-tester" }, fixtures_1.T);
    return {
        plan: { ...built.plan, status: "approved_for_emulator" },
        candidates: built.candidates,
    };
}
(0, node_test_1.default)("emulator: inventori disimpan dan dibaca semula", { skip }, async () => {
    const s = store();
    const records = (0, index_1.buildLegacyInventory)([(0, fixtures_1.legacyRecord)()], fixtures_1.T);
    await s.saveInventory(records);
    const back = await s.getInventoryRecord(records[0].legacyRecordId);
    strict_1.default.ok(back);
    strict_1.default.equal(back.legacyDocumentPath, records[0].legacyDocumentPath);
    strict_1.default.equal(back.rawContentHash, records[0].rawContentHash);
});
(0, node_test_1.default)("emulator: pelan disimpan, diluluskan, kemudian dilaksanakan", { skip }, async () => {
    const s = store();
    const { plan, candidates } = approvedPlan(`plan_${seq++}`);
    // Simpan sebagai dry_run_completed supaya peralihan kelulusan sah.
    await s.savePlan({ ...plan, status: "dry_run_completed" });
    const approved = await s.approveForEmulator(plan.migrationPlanId, "owner", fixtures_1.T);
    strict_1.default.ok(approved);
    strict_1.default.equal(approved.status, "approved_for_emulator");
    strict_1.default.equal(approved.targetCollectionMode, "emulator_only");
    const checkpoint = (0, index_1.createCheckpoint)(plan.migrationPlanId, plan.batchId, fixtures_1.T);
    const result = (0, index_1.executeMigrationPlanInEmulator)({ plan: approved, candidates, checkpoint, actorId: "owner" }, fixtures_1.T);
    strict_1.default.equal(result.ok, true);
    await s.saveCanonicalRecords(result.canonicalRecords);
    await s.saveAliases(result.aliases);
    await s.saveCheckpoint(result.checkpoint);
    await s.appendAudit(result.audit);
    const canonical = await s.listCanonicalRecords();
    strict_1.default.ok(canonical.length > 0);
    strict_1.default.ok(canonical.every((r) => r.emulatorOnly === true));
    strict_1.default.ok(canonical.every((r) => r.published === false));
});
(0, node_test_1.default)("emulator: audit adalah hanya-tambah", { skip }, async () => {
    const s = store();
    const planId = `MPL-audit-${seq++}`;
    await s.appendAudit([
        { auditId: `${planId}-1`, action: "plan_built", migrationPlanId: planId,
            actorType: "system", reasonCode: "first", at: fixtures_1.T },
    ]);
    await s.appendAudit([
        { auditId: `${planId}-1`, action: "plan_blocked", migrationPlanId: planId,
            actorType: "system", reasonCode: "overwrite_attempt", at: fixtures_1.T + 1 },
    ]);
    const entries = await s.listAudit(planId);
    strict_1.default.equal(entries.length, 1);
    strict_1.default.equal(entries[0].reasonCode, "first", "entri asal tidak boleh ditulis ganti");
});
(0, node_test_1.default)("emulator: alias ditanda rolled_back, tidak pernah dipadam", { skip }, async () => {
    const s = store();
    const { plan, candidates } = approvedPlan(`rb_${seq++}`);
    const result = (0, index_1.executeMigrationPlanInEmulator)({
        plan,
        candidates,
        checkpoint: (0, index_1.createCheckpoint)(plan.migrationPlanId, plan.batchId, fixtures_1.T),
        actorId: "owner",
    }, fixtures_1.T);
    await s.saveAliases(result.aliases);
    const beforeCount = (await s.listAliases()).length;
    const applied = (0, index_1.applyRollback)(result.rollbackPlan, result.aliases, result.rewrites, fixtures_1.T + 1000);
    await s.markRolledBack(applied.plan.createdAliasIds, fixtures_1.T + 1000);
    await s.deactivateCanonicalRecords(applied.deactivatedCanonicalIds);
    const after = await s.listAliases();
    strict_1.default.equal(after.length, beforeCount, "tiada alias dipadam");
    const rolled = after.filter((a) => applied.plan.createdAliasIds.includes(a.aliasId));
    strict_1.default.ok(rolled.length > 0);
    strict_1.default.ok(rolled.every((a) => a.status === "rolled_back"));
});
(0, node_test_1.default)("emulator: pelaksanaan berulang tidak menghasilkan pendua", { skip }, async () => {
    const s = store();
    const { plan, candidates } = approvedPlan(`idem_${seq++}`);
    const first = (0, index_1.executeMigrationPlanInEmulator)({
        plan,
        candidates,
        checkpoint: (0, index_1.createCheckpoint)(plan.migrationPlanId, plan.batchId, fixtures_1.T),
        actorId: "owner",
    }, fixtures_1.T);
    await s.saveCanonicalRecords(first.canonicalRecords);
    const afterFirst = (await s.listCanonicalRecords()).length;
    const second = (0, index_1.executeMigrationPlanInEmulator)({
        plan,
        candidates,
        checkpoint: first.checkpoint,
        existingCanonicalIds: first.canonicalRecords.map((r) => r.canonicalPlaceId),
        actorId: "owner",
    }, fixtures_1.T + 1000);
    await s.saveCanonicalRecords(second.canonicalRecords);
    strict_1.default.equal((await s.listCanonicalRecords()).length, afterFirst);
    strict_1.default.equal(second.canonicalRecords.length, 0);
});
(0, node_test_1.default)("emulator: penanda emulator disimpan, penanda produksi tidak pernah dicipta", { skip }, async () => {
    const s = store();
    const summary = {
        candidatesExecuted: 1, aliasesCreated: 2, referencesRewritten: 0,
        heldCandidates: 0, legacyRecordsDeleted: 0, productionWrites: 0,
    };
    const forbidden = (0, index_1.createCompletionMarker)({
        migrationPlanId: `MPL-marker-${seq}`, environment: "production",
        canonicalDataVersion: "1", aliasVersion: "1", referenceRewriteVersion: "1",
        validationSummary: summary, approvedBy: "owner", status: "production_complete",
    }, fixtures_1.T);
    strict_1.default.equal(forbidden.ok, false);
    strict_1.default.equal(forbidden.marker, null);
    const allowed = (0, index_1.createCompletionMarker)({
        migrationPlanId: `MPL-marker-${seq++}`, environment: "emulator",
        canonicalDataVersion: "1", aliasVersion: "1", referenceRewriteVersion: "1",
        validationSummary: summary, approvedBy: "owner", status: "emulator_complete",
    }, fixtures_1.T);
    strict_1.default.ok(allowed.marker);
    await s.saveMarker(allowed.marker);
    const markers = await s.listMarkers();
    strict_1.default.ok(markers.every((m) => m.environment === "emulator"));
    strict_1.default.ok(markers.every((m) => m.status !== "production_complete"));
});
(0, node_test_1.default)("emulator: tiada koleksi produksi ditulis oleh migrasi", { skip }, async () => {
    const s = store();
    const { plan, candidates } = approvedPlan(`clean_${seq++}`);
    const result = (0, index_1.executeMigrationPlanInEmulator)({
        plan,
        candidates,
        checkpoint: (0, index_1.createCheckpoint)(plan.migrationPlanId, plan.batchId, fixtures_1.T),
        actorId: "owner",
    }, fixtures_1.T);
    await s.saveCanonicalRecords(result.canonicalRecords);
    await s.saveAliases(result.aliases);
    // Koleksi produksi sebenar mesti kekal tidak disentuh oleh modul ini.
    for (const collection of ["place_registry", "places_cache", "place_details"]) {
        const snap = await db().collection(collection).get();
        strict_1.default.equal(snap.size, 0, `${collection} tidak sepatutnya ditulis`);
    }
    // Pemeriksaan sumber: repository migrasi tidak pernah menyebut koleksi ini.
    const source = (0, node_fs_1.readFileSync)((0, node_path_1.resolve)(process.cwd(), "src/domain/places/migration/firestoreMigrationRepository.ts"), "utf8");
    for (const forbidden of ["place_registry", "places_cache", "place_details"]) {
        strict_1.default.equal(source.includes(`collection("${forbidden}")`), false, `repository tidak sepatutnya menulis ${forbidden}`);
    }
    // Tiada panggilan padam langsung dalam repository.
    strict_1.default.equal(/\.delete\(\)/.test(source), false, "tiada padam dibenarkan");
});
