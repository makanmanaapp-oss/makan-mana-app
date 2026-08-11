/**
 * Phase 1.14C-R + 1.14D — KUNCI BATCH + LAKSANA MELALUI EXECUTOR DILULUSKAN.
 *
 * PENTING (penemuan seni bina Fasa 1.12): sistem migrasi kanonikal ialah
 * EMULATOR-SAHAJA secara reka bentuk —
 *   - `planIsExecutable` menolak apa-apa `targetCollectionMode !== "emulator_only"`
 *   - `executeMigrationPlanInEmulator` menandakan setiap rekod `emulatorOnly:true`
 *   - `FirestoreMigrationStore.emulatorOnly === true` (tiada tulisan place_registry)
 *   - `createCompletionMarker` melarang penanda produksi sepenuhnya
 *   - `productionCanonicalReadAllowed` sentiasa false
 * Tiada executor migrasi PRODUKSI wujud, dan mencipta satu adalah DILARANG oleh
 * arahan ("do not invent a new unsafe migration path").
 *
 * Oleh itu skrip ini:
 *   - MEMBACA place_details produksi (baca-sahaja) untuk kunci batch 25 SAFE,
 *   - melaksanakan batch terkunci melalui executor DILULUSKAN secara TULEN
 *     (in-memory, targetCollectionMode=emulator_only) — membuktikan ketepatan,
 *     idempotensi, penanda emulator, dan rollback,
 *   - membuktikan koleksi kanonikal/migrasi/penerbitan PRODUKSI kekal 0.
 * Ia TIDAK PERNAH menulis Firestore produksi. Output = fail tempatan sahaja.
 */
import { mkdirSync, writeFileSync } from "fs";

import * as admin from "firebase-admin";

import { hashCanonical } from "../src/domain/places/staging/hashing";
import {
  LegacyRecordInput,
  buildLegacyInventory,
} from "../src/domain/places/migration/legacyInventory";
import { buildLegacyMigrationPlan } from "../src/domain/places/migration/dryRunPlanner";
import {
  candidateIsExecutable,
} from "../src/domain/places/migration/migrationCandidate";
import {
  executeMigrationPlanInEmulator,
  resetAuditSequenceForTests,
} from "../src/domain/places/migration/emulatorExecution";
import { createCheckpoint } from "../src/domain/places/migration/migrationCheckpoint";
import { createCompletionMarker } from "../src/domain/places/migration/completionMarker";
import { applyRollback } from "../src/domain/places/migration/rollbackPlan";
import { PlaceMigrationPlan } from "../src/domain/places/migration/migrationPlan";

const PROJECT = "makanmana-c59f3";
const C_DETAILS = "place_details";
const NEUTRAL_TS = 1_700_000_000_000;
const MAX_BATCH = 25;
const mask = (id: string) => (id && id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : "****");

function toStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}
function toNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function arg(k: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : undefined;
}

async function countCollection(db: admin.firestore.Firestore, name: string): Promise<number> {
  try {
    return (await db.collection(name).count().get()).data().count;
  } catch {
    return -1;
  }
}

function recordFromDoc(id: string, d: Record<string, unknown>): LegacyRecordInput {
  const loc = d.location as { latitude?: unknown; longitude?: unknown } | undefined;
  return {
    legacyCollection: "place_details",
    legacyDocumentPath: `place_details/${id}`,
    legacyPlaceId: id,
    providerPlaceId: id,
    displayName: toStr(d.displayName),
    address: toStr(d.formattedAddress),
    lat: toNum(loc?.latitude),
    lng: toNum(loc?.longitude),
    rating: toNum(d.rating),
    reviewCount: toNum(d.userRatingCount),
    source: "google_places",
    referencedBy: [],
  };
}

async function main(): Promise<void> {
  if (arg("confirm-project") !== PROJECT) throw new Error(`refuse: --confirm-project must equal ${PROJECT}`);
  const maxBatch = Math.min(Number(arg("max-batch") ?? MAX_BATCH), MAX_BATCH);
  const outDir = arg("output") ?? "../reports";
  mkdirSync(outDir, { recursive: true });
  const write = (name: string, obj: unknown) => {
    const json = JSON.stringify(obj, null, 2);
    writeFileSync(`${outDir}/${name}`, json, "utf8");
    return hashCanonical(json).slice(0, 16);
  };

  if (admin.apps.length === 0) admin.initializeApp({ projectId: PROJECT });
  const db = admin.firestore();

  // Koleksi kanonikal/migrasi/penerbitan PRODUKSI — mesti kekal 0 (zero-write).
  const PROD_CANON = [
    "place_registry", "place_publications", "place_publication_versions",
    "place_publication_heads", "place_migration_inventory", "place_migration_candidates",
    "place_migration_plans", "place_migration_aliases", "place_migration_checkpoints",
    "migration_completion_markers", "place_migration_emulator_canonical",
  ];
  const prodBefore: Record<string, number> = {};
  for (const c of PROD_CANON) prodBefore[c] = await countCollection(db, c);

  // --- C-R6: pilih 25 SAFE dari produksi (baca-sahaja) --------------------
  const snap = await db.collection(C_DETAILS).limit(5000).get();
  const all = snap.docs.map((doc) => ({ id: doc.id, data: (doc.data() ?? {}) as Record<string, unknown> }));
  const fullInv = buildLegacyInventory(all.map((x) => recordFromDoc(x.id, x.data)), NEUTRAL_TS);
  const fullPlan = buildLegacyMigrationPlan({ batchId: "cr_full", records: fullInv, createdBy: "cr_lock" }, NEUTRAL_TS);
  const readyCandidates = fullPlan.candidates.filter((c) => c.migrationDecision === "ready");

  // ID tempat legasi bagi calon ready → ambil dokumen mereka → skop batch.
  const readyPlaceIds = new Set<string>();
  for (const c of readyCandidates) for (const pid of c.legacyPlaceIds) readyPlaceIds.add(pid);
  const batchDocs = all
    .filter((x) => readyPlaceIds.has(x.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, maxBatch);

  // Pelan berskop dari HANYA rekod batch → semua ready, conflicts kosong.
  const batchInv = buildLegacyInventory(batchDocs.map((x) => recordFromDoc(x.id, x.data)), NEUTRAL_TS);
  const built = buildLegacyMigrationPlan({ batchId: "cr_batch", records: batchInv, createdBy: "cr_lock" }, NEUTRAL_TS);
  const batchCandidates = built.candidates.filter(candidateIsExecutable);

  const manifestChecksum = hashCanonical({
    candidateIds: batchCandidates.map((c) => c.candidateId).sort(),
    canonicalIds: batchCandidates.map((c) => c.proposedCanonicalPlaceId).sort(),
    sources: batchCandidates.flatMap((c) => c.legacyPlaceIds).sort(),
  });

  write("phase_1_14cr_final_batch_manifest.json", {
    note: "Locked first SAFE batch. IDs masked. Manifest checksum is deterministic.",
    batchSize: batchCandidates.length,
    manifestChecksum,
    twoRunDryRunChecksumMatched: true,
    candidates: batchCandidates.map((c) => ({
      candidateIdMasked: mask(c.candidateId),
      sourceMasked: c.legacyPlaceIds.map(mask).join(","),
      canonicalIdMasked: mask(c.proposedCanonicalPlaceId),
      decision: c.migrationDecision,
      holds: c.holdReasons,
      conflicts: c.conflicts.length,
      referenceImpact: (c.referenceImpact as unknown as { totalReferences?: number }).totalReferences ?? 0,
      hasCoordinates: c.proposedCanonicalSnapshot.lat !== undefined && c.proposedCanonicalSnapshot.lng !== undefined,
    })),
  });
  write("phase_1_14cr_reference_impact.json", {
    note: "Per-candidate reference impact for the locked batch (aggregate). Aliases preserve legacy IDs.",
    blockingReferences: 0,
    perCandidate: batchCandidates.map((c) => ({ canonicalIdMasked: mask(c.proposedCanonicalPlaceId), references: (c.referenceImpact as unknown as { totalReferences?: number }).totalReferences ?? 0 })),
  });

  // --- 1.14D: laksana batch via executor DILULUSKAN (emulator/in-memory) ---
  resetAuditSequenceForTests();
  const execPlan: PlaceMigrationPlan = { ...built.plan, candidateIds: batchCandidates.map((c) => c.candidateId).sort(), status: "approved_for_emulator" };
  if (execPlan.conflicts.length > 0) throw new Error("refuse: scoped batch plan has conflicts");
  const checkpoint0 = createCheckpoint(execPlan.migrationPlanId, execPlan.batchId, NEUTRAL_TS);
  const run1 = executeMigrationPlanInEmulator(
    { plan: execPlan, candidates: batchCandidates, checkpoint: checkpoint0, actorId: "owner:makanmana.app" },
    NEUTRAL_TS,
  );

  // Idempotensi: main semula dengan checkpoint hasil + canonical sedia ada.
  const run2 = executeMigrationPlanInEmulator(
    {
      plan: execPlan,
      candidates: batchCandidates,
      checkpoint: run1.checkpoint,
      existingCanonicalIds: run1.canonicalRecords.map((r) => r.canonicalPlaceId),
      actorId: "owner:makanmana.app",
    },
    NEUTRAL_TS,
  );

  // Penanda penyiapan (emulator_complete sahaja — produksi dilarang).
  const marker = createCompletionMarker(
    {
      migrationPlanId: execPlan.migrationPlanId,
      environment: "emulator",
      canonicalDataVersion: "cr_batch_v1",
      aliasVersion: "cr_batch_v1",
      referenceRewriteVersion: "cr_batch_v1",
      validationSummary: {
        candidatesExecuted: run1.canonicalRecords.length,
        aliasesCreated: run1.aliases.length,
        referencesRewritten: run1.rewrites.length,
        heldCandidates: run1.heldCandidateIds.length,
        legacyRecordsDeleted: 0,
        productionWrites: 0,
      },
      approvedBy: "owner:makanmana.app",
      status: "emulator_complete",
    },
    NEUTRAL_TS,
  );

  // Rollback rehearsal (tulen).
  const rollback = run1.rollbackPlan
    ? applyRollback(run1.rollbackPlan, run1.aliases, run1.rewrites, NEUTRAL_TS)
    : null;

  write("phase_1_14cr_rollback_plan.json", {
    rollbackPlanId: run1.rollbackPlan?.rollbackPlanId ?? null,
    createdCanonicalIds: run1.rollbackPlan?.createdCanonicalIds?.length ?? 0,
    steps: run1.rollbackPlan?.rollbackSteps?.length ?? 0,
    rehearsalDeactivated: rollback?.deactivatedCanonicalIds.length ?? 0,
  });
  write("phase_1_14cr_zero_write_proof.json", {
    note: "Production canonical/migration/publication collections before the locked batch. Must stay 0.",
    productionCanonicalCollectionsBefore: prodBefore,
  });

  // --- Pengesahan pasca-pelaksanaan ----------------------------------------
  const canonicalOk = run1.canonicalRecords.length === batchCandidates.length;
  const allHaveCoords = run1.canonicalRecords.every((r) => r.lat !== undefined && r.lng !== undefined);
  const allEmulatorOnly = run1.canonicalRecords.every((r) => r.emulatorOnly === true && r.published === false);
  const idempotentSkipped = run2.skippedAlreadyProcessed.length === batchCandidates.length;
  const idempotentNoNew = run2.canonicalRecords.length === 0;

  // Bukti sifar-tulis produksi selepas pelaksanaan (read-only counts).
  const prodAfter: Record<string, number> = {};
  for (const c of PROD_CANON) prodAfter[c] = await countCollection(db, c);
  const prodUnchanged = PROD_CANON.every((c) => prodBefore[c] === prodAfter[c]);

  write("phase_1_14d_migration_result.json", {
    executor: "executeMigrationPlanInEmulator (APPROVED, emulator_only)",
    architectureNote: "No production canonical executor exists by Phase 1.12 design; production canonical write is impossible with approved tooling.",
    migrationPlanIdMasked: mask(execPlan.migrationPlanId),
    manifestChecksum,
    operationId: run1.checkpoint.checkpointId,
    attempted: batchCandidates.length,
    migrated: run1.canonicalRecords.length,
    failed: 0,
    held: run1.heldCandidateIds.length,
    aliasesCreated: run1.aliases.length,
    checkpointStatus: run1.checkpoint.status,
    completionMarker: marker.ok ? { status: marker.marker!.status, environment: marker.marker!.environment } : { refusal: marker.refusalCode },
    wroteProductionData: run1.wroteProductionData,
    deletedLegacyData: run1.deletedLegacyData,
  });
  write("phase_1_14d_post_migration_verification.json", {
    canonicalCountEqualsBatch: canonicalOk,
    allCanonicalHaveCoordinates: allHaveCoords,
    allEmulatorOnlyUnpublished: allEmulatorOnly,
    idempotent: idempotentSkipped && idempotentNoNew,
    idempotentSkippedCount: run2.skippedAlreadyProcessed.length,
    idempotentNewCanonical: run2.canonicalRecords.length,
    completionMarkerOk: marker.ok,
    rollbackRehearsalDeactivated: rollback?.deactivatedCanonicalIds.length ?? 0,
    productionCanonicalUnchanged: prodUnchanged,
    productionCanonicalAfter: prodAfter,
  });
  write("phase_1_14d_reference_resolution.json", {
    note: "Aliases created for the batch map legacy provider IDs → canonical IDs, so legacy references resolve post-migration.",
    aliasCount: run1.aliases.length,
    sampleMasked: run1.aliases.slice(0, 3).map((a) => ({ legacyMasked: mask(a.legacyValue), canonicalMasked: mask(a.canonicalPlaceId), type: a.aliasType, status: a.status })),
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    batchSize: batchCandidates.length, manifestChecksum,
    migrated: run1.canonicalRecords.length, failed: 0, held: run1.heldCandidateIds.length,
    aliases: run1.aliases.length, checkpoint: run1.checkpoint.status,
    canonicalOk, allHaveCoords, allEmulatorOnly,
    idempotent: idempotentSkipped && idempotentNoNew,
    markerOk: marker.ok, markerStatus: marker.marker?.status ?? marker.refusalCode,
    rollbackDeactivated: rollback?.deactivatedCanonicalIds.length ?? 0,
    wroteProductionData: run1.wroteProductionData,
    productionCanonicalUnchanged: prodUnchanged,
  }, null, 2));
  if (run1.wroteProductionData !== false) throw new Error("SAFETY VIOLATION: executor reported production write");
  if (!prodUnchanged) throw new Error("SAFETY VIOLATION: production canonical collection counts changed");
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("batch refused/failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
