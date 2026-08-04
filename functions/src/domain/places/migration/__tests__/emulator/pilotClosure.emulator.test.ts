/**
 * Phase A2 Part 3 — ujian penutupan pilot terhadap EMULATOR sahaja.
 * Jalankan: npm run test:emulator.
 *
 * Membuktikan laluan-tulis dengan data sebenar: execute mengalihkan
 * pending_post_write → verified, menambah SATU audit, tidak menyentuh koleksi
 * lain, idempoten, dan dry-run menulis sifar. Tiada kelayakan produksi digunakan.
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

import {
  EXPECTED_PROJECT_ID,
  PILOT_BATCH_ID,
  ClosureRequest,
  ClosureTarget,
  closureAuditId,
} from "../../pilotClosure";
import {
  gatherClosureEvidence,
  applyPilotClosure,
} from "../../firestorePilotClosure";

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator)";
const T = 1767571200000;

// Dedicated emulator namespace. node --test runs test files concurrently
// against ONE shared emulator; sibling tests assert place_registry is globally
// empty. Isolating this file in its own project namespace keeps our seeded
// registry/publication/alias docs invisible to them. The LOGICAL project the
// closure evaluator checks is still EXPECTED_PROJECT_ID (injected via target()).
const CLOSURE_APP_PROJECT = "demo-mm-a2-closure";
let app: App | undefined;
function db(): Firestore {
  if (!app) app = initializeApp({ projectId: CLOSURE_APP_PROJECT }, "a2-closure");
  return getFirestore(app);
}

let suffix = 0;

/** Batch id sintetik → sasaran jangkaan diinjeksi supaya laluan-tulis berjalan
 * (CLI produksi tetap terkunci keras ke PILOT_BATCH_ID). */
function target(batchId: string): ClosureTarget {
  return { projectId: EXPECTED_PROJECT_ID, batchId };
}

/** Bersihkan SEMUA dokumen yang diseed supaya koleksi kongsi (place_registry,
 * dll.) tidak tercemar untuk ujian emulator jiran. */
const seededBatches: string[] = [];
after(async () => {
  if (!EMU) return;
  const d = db();
  for (const batchId of seededBatches) {
    for (const coll of ["place_registry", "place_publications", "place_publication_heads", "place_migration_aliases"]) {
      const snap = await d.collection(coll).where("migrationBatchId", "==", batchId).get();
      await Promise.all(snap.docs.map((doc) => doc.ref.delete()));
    }
    const audits = await d.collection("place_migration_audit").where("batchId", "==", batchId).get();
    await Promise.all(audits.docs.map((doc) => doc.ref.delete()));
    await Promise.all([
      d.collection("place_migration_batches").doc(batchId).delete(),
      d.collection("place_migration_audit").doc(closureAuditId(batchId)).delete(),
      d.collection("place_details").doc(`${batchId}_legacy`).delete(),
      d.collection("places_cache").doc(`${batchId}_cache`).delete(),
    ]);
  }
});

/**
 * Seed a valid pilot: one batch + 25/25/25/25/25 across registry, publications,
 * heads, aliases and audit, all tagged with the batch id. Returns the batchId.
 */
async function seedValidPilot(): Promise<string> {
  const batchId = `PMB-emu-${suffix++}-${PILOT_BATCH_ID.slice(-8)}`;
  seededBatches.push(batchId);
  const d = db();
  const batch = d.batch();

  batch.set(d.collection("place_migration_batches").doc(batchId), {
    batchId,
    manifestChecksum: "925c3b83",
    candidateChecksum: "f8906c6c",
    sourceCount: 25,
    migratedCount: 25,
    backupReference: "gs://mm-backups/pilot",
    migrationVersion: "1.14E.1",
    verificationResult: "pending_post_write",
    rollbackStatus: "available",
    globalCompletion: false,
  });

  for (let i = 0; i < 25; i++) {
    batch.set(d.collection("place_registry").doc(`${batchId}_PLC_${i}`), {
      canonicalPlaceId: `${batchId}_PLC_${i}`, migrationBatchId: batchId, displayName: `Mock ${i}`,
    });
    batch.set(d.collection("place_publications").doc(`${batchId}_PUB_${i}`), {
      publicationId: `${batchId}_PUB_${i}`, migrationBatchId: batchId,
    });
    batch.set(d.collection("place_publication_heads").doc(`${batchId}_HEAD_${i}`), {
      placeId: `${batchId}_PLC_${i}`, migrationBatchId: batchId,
    });
    batch.set(d.collection("place_migration_aliases").doc(`${batchId}_ALS_${i}`), {
      aliasDocId: `${batchId}_ALS_${i}`, migrationBatchId: batchId,
    });
    batch.set(d.collection("place_migration_audit").doc(`${batchId}_MAU_${i}`), {
      auditId: `${batchId}_MAU_${i}`, action: "production_canonical_created", batchId,
    });
  }
  await batch.commit();
  return batchId;
}

function req(batchId: string, execute: boolean): ClosureRequest {
  return {
    projectId: EXPECTED_PROJECT_ID,
    batchId,
    confirmBatchId: batchId,
    execute,
    sourceCommit: "emulatorcommit",
    actorId: "owner:test",
    evidenceReference: "docs/PLACE_DATA_A1_CONTROLLED_PILOT_CLOSURE_PLAN.md",
  };
}

async function countTagged(collection: string, batchId: string): Promise<number> {
  const snap = await db().collection(collection).where("migrationBatchId", "==", batchId).get();
  return snap.size;
}

test("2-5. execute moves pending -> verified, keeps flags, appends one audit", { skip }, async () => {
  const batchId = await seedValidPilot();
  const evidence = await gatherClosureEvidence(db(), batchId, { projectId: EXPECTED_PROJECT_ID, legacySourceUnchanged: true });
  const result = await applyPilotClosure(db(), req(batchId, true), evidence, T, target(batchId));

  assert.equal(result.wrote, true);
  assert.equal(result.decision.eligible, true);
  // 2. pending -> verified
  assert.equal(result.resultingBatch?.verificationResult, "verified");
  // 3 + 4. globalCompletion + rollbackStatus unchanged
  const doc = (await db().collection("place_migration_batches").doc(batchId).get()).data()!;
  assert.equal(doc.globalCompletion, false);
  assert.equal(doc.rollbackStatus, "available");
  // 5. exactly one audit event, with the deterministic id
  const auditId = closureAuditId(batchId);
  const audit = await db().collection("place_migration_audit").doc(auditId).get();
  assert.equal(audit.exists, true);
  assert.equal(audit.data()!.action, "pilot_verification_completed");
  assert.equal(audit.data()!.globalCompletion, false);
  assert.equal(audit.data()!.migrationWritePerformed, false);
});

test("6 + 26. repeated execution is idempotent and does not duplicate audit", { skip }, async () => {
  const batchId = await seedValidPilot();
  const first = await applyPilotClosure(
    db(), req(batchId, true),
    await gatherClosureEvidence(db(), batchId, { projectId: EXPECTED_PROJECT_ID, legacySourceUnchanged: true }),
    T, target(batchId),
  );
  assert.equal(first.wrote, true);

  const second = await applyPilotClosure(
    db(), req(batchId, true),
    await gatherClosureEvidence(db(), batchId, { projectId: EXPECTED_PROJECT_ID, legacySourceUnchanged: true }),
    T + 1000, target(batchId),
  );
  assert.equal(second.decision.alreadyVerified, true);
  assert.equal(second.wrote, false);
  assert.equal(second.resultingBatch?.verificationResult, "verified");

  // Exactly one audit event for this batch's closure action. Single-field
  // query + in-memory filter so no composite index is ever required.
  const audits = await db().collection("place_migration_audit")
    .where("batchId", "==", batchId)
    .get();
  const closureAudits = audits.docs.filter(
    (doc) => doc.data().action === "pilot_verification_completed",
  );
  assert.equal(closureAudits.length, 1);
});

test("20-24. no canonical/publication/head/alias/legacy record changes", { skip }, async () => {
  const batchId = await seedValidPilot();
  // Seed a couple of legacy docs to prove they are untouched.
  await db().collection("place_details").doc(`${batchId}_legacy`).set({ placeId: `${batchId}_legacy`, name: "Legacy" });
  await db().collection("places_cache").doc(`${batchId}_cache`).set({ cacheId: `${batchId}_cache` });

  const before = {
    registry: await countTagged("place_registry", batchId),
    pub: await countTagged("place_publications", batchId),
    head: await countTagged("place_publication_heads", batchId),
    alias: await countTagged("place_migration_aliases", batchId),
    details: (await db().collection("place_details").doc(`${batchId}_legacy`).get()).data(),
    cache: (await db().collection("places_cache").doc(`${batchId}_cache`).get()).data(),
  };

  await applyPilotClosure(
    db(), req(batchId, true),
    await gatherClosureEvidence(db(), batchId, { projectId: EXPECTED_PROJECT_ID, legacySourceUnchanged: true }),
    T, target(batchId),
  );

  assert.equal(await countTagged("place_registry", batchId), before.registry);
  assert.equal(await countTagged("place_publications", batchId), before.pub);
  assert.equal(await countTagged("place_publication_heads", batchId), before.head);
  assert.equal(await countTagged("place_migration_aliases", batchId), before.alias);
  assert.deepEqual((await db().collection("place_details").doc(`${batchId}_legacy`).get()).data(), before.details);
  assert.deepEqual((await db().collection("places_cache").doc(`${batchId}_cache`).get()).data(), before.cache);
});

test("25. exactly one batch doc changed; write count is 2 (batch + audit)", { skip }, async () => {
  const batchId = await seedValidPilot();
  const result = await applyPilotClosure(
    db(), req(batchId, true),
    await gatherClosureEvidence(db(), batchId, { projectId: EXPECTED_PROJECT_ID, legacySourceUnchanged: true }),
    T, target(batchId),
  );
  // One batch field-update + one audit create = 2 writes, nothing else.
  assert.equal(result.writeCount, 2);
});

test("27. dry run produces zero writes", { skip }, async () => {
  const batchId = await seedValidPilot();
  const evidence = await gatherClosureEvidence(db(), batchId, { projectId: EXPECTED_PROJECT_ID, legacySourceUnchanged: true });
  const result = await applyPilotClosure(db(), req(batchId, false), evidence, T, target(batchId));

  assert.equal(result.wrote, false);
  assert.equal(result.writeCount, 0);
  assert.equal(result.decision.eligible, true);
  assert.equal(result.decision.mutationRequired, true);
  // Batch still pending; no audit written.
  const doc = (await db().collection("place_migration_batches").doc(batchId).get()).data()!;
  assert.equal(doc.verificationResult, "pending_post_write");
  const audit = await db().collection("place_migration_audit").doc(closureAuditId(batchId)).get();
  assert.equal(audit.exists, false);
});

test("execute against a tampered batch (bad counts) is refused with zero writes", { skip }, async () => {
  const batchId = await seedValidPilot();
  // Delete one registry doc so the count becomes 24.
  await db().collection("place_registry").doc(`${batchId}_PLC_0`).delete();
  const evidence = await gatherClosureEvidence(db(), batchId, { projectId: EXPECTED_PROJECT_ID, legacySourceUnchanged: true });
  const result = await applyPilotClosure(db(), req(batchId, true), evidence, T, target(batchId));

  assert.equal(result.decision.eligible, false);
  assert.ok(result.decision.blockers.includes("registry_count_mismatch"));
  assert.equal(result.wrote, false);
  const doc = (await db().collection("place_migration_batches").doc(batchId).get()).data()!;
  assert.equal(doc.verificationResult, "pending_post_write");
});
