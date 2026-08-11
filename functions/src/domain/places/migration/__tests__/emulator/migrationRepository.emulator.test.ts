/**
 * Phase 1.12 — ujian repository migrasi Firestore terhadap EMULATOR sahaja.
 * Jalankan: npm run test:emulator.
 *
 * Ujian ini membuktikan tuntutan keselamatan fasa dengan data sebenar:
 * rekod legasi kekal, alias ditanda dan bukan dipadam, audit hanya-tambah,
 * dan TIADA koleksi produksi disentuh.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { FirestoreMigrationStore } from "../../firestoreMigrationRepository";
import {
  buildLegacyInventory,
  buildLegacyMigrationPlan,
  createCheckpoint,
  executeMigrationPlanInEmulator,
  applyRollback,
  createCompletionMarker,
} from "../../index";
import { T, legacyRecord, referencedRecord } from "../fixtures";

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator)";

let app: App | undefined;
let seq = 0;

function db() {
  if (!app) app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-mm" });
  return getFirestore(app);
}

function store(): FirestoreMigrationStore {
  return new FirestoreMigrationStore(db());
}

/** Bina pelan diluluskan yang unik bagi setiap ujian. */
function approvedPlan(suffix: string) {
  const records = buildLegacyInventory(
    [
      legacyRecord({
        legacyDocumentPath: `place_details/EMU_${suffix}`,
        legacyPlaceId: `EMU_${suffix}`,
        providerPlaceId: `EMU_${suffix}`,
      }),
      referencedRecord(),
    ],
    T,
  );
  const built = buildLegacyMigrationPlan(
    { batchId: `EMU-BATCH-${suffix}`, records, createdBy: "emulator-tester" },
    T,
  );
  return {
    plan: { ...built.plan, status: "approved_for_emulator" as const },
    candidates: built.candidates,
  };
}

test("emulator: inventori disimpan dan dibaca semula", { skip }, async () => {
  const s = store();
  const records = buildLegacyInventory([legacyRecord()], T);
  await s.saveInventory(records);
  const back = await s.getInventoryRecord(records[0].legacyRecordId);
  assert.ok(back);
  assert.equal(back.legacyDocumentPath, records[0].legacyDocumentPath);
  assert.equal(back.rawContentHash, records[0].rawContentHash);
});

test("emulator: pelan disimpan, diluluskan, kemudian dilaksanakan", { skip }, async () => {
  const s = store();
  const { plan, candidates } = approvedPlan(`plan_${seq++}`);
  // Simpan sebagai dry_run_completed supaya peralihan kelulusan sah.
  await s.savePlan({ ...plan, status: "dry_run_completed" });
  const approved = await s.approveForEmulator(plan.migrationPlanId, "owner", T);
  assert.ok(approved);
  assert.equal(approved.status, "approved_for_emulator");
  assert.equal(approved.targetCollectionMode, "emulator_only");

  const checkpoint = createCheckpoint(plan.migrationPlanId, plan.batchId, T);
  const result = executeMigrationPlanInEmulator(
    { plan: approved, candidates, checkpoint, actorId: "owner" },
    T,
  );
  assert.equal(result.ok, true);

  await s.saveCanonicalRecords(result.canonicalRecords);
  await s.saveAliases(result.aliases);
  await s.saveCheckpoint(result.checkpoint);
  await s.appendAudit(result.audit);

  const canonical = await s.listCanonicalRecords();
  assert.ok(canonical.length > 0);
  assert.ok(canonical.every((r) => r.emulatorOnly === true));
  assert.ok(canonical.every((r) => r.published === false));
});

test("emulator: audit adalah hanya-tambah", { skip }, async () => {
  const s = store();
  const planId = `MPL-audit-${seq++}`;
  await s.appendAudit([
    { auditId: `${planId}-1`, action: "plan_built", migrationPlanId: planId,
      actorType: "system", reasonCode: "first", at: T },
  ]);
  await s.appendAudit([
    { auditId: `${planId}-1`, action: "plan_blocked", migrationPlanId: planId,
      actorType: "system", reasonCode: "overwrite_attempt", at: T + 1 },
  ]);
  const entries = await s.listAudit(planId);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].reasonCode, "first", "entri asal tidak boleh ditulis ganti");
});

test("emulator: alias ditanda rolled_back, tidak pernah dipadam", { skip }, async () => {
  const s = store();
  const { plan, candidates } = approvedPlan(`rb_${seq++}`);
  const result = executeMigrationPlanInEmulator(
    {
      plan,
      candidates,
      checkpoint: createCheckpoint(plan.migrationPlanId, plan.batchId, T),
      actorId: "owner",
    },
    T,
  );
  await s.saveAliases(result.aliases);
  const beforeCount = (await s.listAliases()).length;

  const applied = applyRollback(
    result.rollbackPlan!, result.aliases, result.rewrites, T + 1000,
  );
  await s.markRolledBack(applied.plan.createdAliasIds, T + 1000);
  await s.deactivateCanonicalRecords(applied.deactivatedCanonicalIds);

  const after = await s.listAliases();
  assert.equal(after.length, beforeCount, "tiada alias dipadam");
  const rolled = after.filter((a) => applied.plan.createdAliasIds.includes(a.aliasId));
  assert.ok(rolled.length > 0);
  assert.ok(rolled.every((a) => a.status === "rolled_back"));
});

test("emulator: pelaksanaan berulang tidak menghasilkan pendua", { skip }, async () => {
  const s = store();
  const { plan, candidates } = approvedPlan(`idem_${seq++}`);
  const first = executeMigrationPlanInEmulator(
    {
      plan,
      candidates,
      checkpoint: createCheckpoint(plan.migrationPlanId, plan.batchId, T),
      actorId: "owner",
    },
    T,
  );
  await s.saveCanonicalRecords(first.canonicalRecords);
  const afterFirst = (await s.listCanonicalRecords()).length;

  const second = executeMigrationPlanInEmulator(
    {
      plan,
      candidates,
      checkpoint: first.checkpoint,
      existingCanonicalIds: first.canonicalRecords.map((r) => r.canonicalPlaceId),
      actorId: "owner",
    },
    T + 1000,
  );
  await s.saveCanonicalRecords(second.canonicalRecords);
  assert.equal((await s.listCanonicalRecords()).length, afterFirst);
  assert.equal(second.canonicalRecords.length, 0);
});

test("emulator: penanda emulator disimpan, penanda produksi tidak pernah dicipta", { skip }, async () => {
  const s = store();
  const summary = {
    candidatesExecuted: 1, aliasesCreated: 2, referencesRewritten: 0,
    heldCandidates: 0, legacyRecordsDeleted: 0 as const, productionWrites: 0 as const,
  };
  const forbidden = createCompletionMarker(
    {
      migrationPlanId: `MPL-marker-${seq}`, environment: "production",
      canonicalDataVersion: "1", aliasVersion: "1", referenceRewriteVersion: "1",
      validationSummary: summary, approvedBy: "owner", status: "production_complete",
    },
    T,
  );
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.marker, null);

  const allowed = createCompletionMarker(
    {
      migrationPlanId: `MPL-marker-${seq++}`, environment: "emulator",
      canonicalDataVersion: "1", aliasVersion: "1", referenceRewriteVersion: "1",
      validationSummary: summary, approvedBy: "owner", status: "emulator_complete",
    },
    T,
  );
  assert.ok(allowed.marker);
  await s.saveMarker(allowed.marker);
  const markers = await s.listMarkers();
  assert.ok(markers.every((m) => m.environment === "emulator"));
  assert.ok(markers.every((m) => m.status !== "production_complete"));
});

test("emulator: tiada koleksi produksi ditulis oleh migrasi", { skip }, async () => {
  const s = store();
  const { plan, candidates } = approvedPlan(`clean_${seq++}`);
  const result = executeMigrationPlanInEmulator(
    {
      plan,
      candidates,
      checkpoint: createCheckpoint(plan.migrationPlanId, plan.batchId, T),
      actorId: "owner",
    },
    T,
  );
  await s.saveCanonicalRecords(result.canonicalRecords);
  await s.saveAliases(result.aliases);

  // Koleksi produksi sebenar mesti kekal tidak disentuh oleh modul ini.
  for (const collection of ["place_registry", "places_cache", "place_details"]) {
    const snap = await db().collection(collection).get();
    assert.equal(snap.size, 0, `${collection} tidak sepatutnya ditulis`);
  }

  // Pemeriksaan sumber: repository migrasi tidak pernah menyebut koleksi ini.
  const source = readFileSync(
    resolve(process.cwd(), "src/domain/places/migration/firestoreMigrationRepository.ts"),
    "utf8",
  );
  for (const forbidden of ["place_registry", "places_cache", "place_details"]) {
    assert.equal(
      source.includes(`collection("${forbidden}")`), false,
      `repository tidak sepatutnya menulis ${forbidden}`,
    );
  }
  // Tiada panggilan padam langsung dalam repository.
  assert.equal(/\.delete\(\)/.test(source), false, "tiada padam dibenarkan");
});
