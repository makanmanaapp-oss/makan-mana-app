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
  // Publications/heads are NOT batch-tagged (production shape), so delete by
  // reconstructed doc id. Registry/aliases ARE tagged; also cover perturbation
  // variants (_dup, _b, OUTSIDE) so consecutive runs (which reuse batch ids)
  // never see stale docs.
  for (const batchId of seededBatches) {
    const del: Promise<unknown>[] = [];
    for (let i = 0; i < 25; i++) {
      del.push(
        d.collection("place_registry").doc(`${batchId}_PLC_${i}`).delete(),
        d.collection("place_registry").doc(`${batchId}_PLC_${i}_dup`).delete(),
        d.collection("place_publications").doc(`${batchId}_PUB_${i}`).delete(),
        d.collection("place_publications").doc(`${batchId}_PUB_${i}_b`).delete(),
        d.collection("place_publication_heads").doc(`${batchId}_PLC_${i}`).delete(),
        d.collection("place_publication_heads").doc(`${batchId}_PLC_${i}_b`).delete(),
        d.collection("place_migration_aliases").doc(`${batchId}_ALS_${i}`).delete(),
        d.collection("place_migration_audit").doc(`${batchId}_MAU_${i}`).delete(),
      );
    }
    del.push(
      d.collection("place_publications").doc(`${batchId}_OUTSIDE_PUB`).delete(),
      d.collection("place_publication_heads").doc(`${batchId}_OUTSIDE_PLC`).delete(),
      d.collection("place_migration_batches").doc(batchId).delete(),
      d.collection("place_migration_audit").doc(closureAuditId(batchId)).delete(),
      d.collection("place_details").doc(`${batchId}_legacy`).delete(),
      d.collection("places_cache").doc(`${batchId}_cache`).delete(),
    );
    await Promise.all(del);
  }
});

/**
 * Seed a pilot in the DEPLOYED production shape:
 *  - registry docs ARE batch-tagged (migrationBatchId);
 *  - publications link only by `placeId` (NO migrationBatchId), doc id = pubId;
 *  - heads link by `placeId` (NO migrationBatchId), doc id = placeId, and carry
 *    `activePublicationId` referencing their place's publication;
 *  - aliases ARE batch-tagged; audit carries `batchId`.
 *
 * `mutate` lets a test perturb exactly one place's shape to exercise a single
 * failure mode. Returns the batchId.
 */
interface SeedMutation {
  /** Skip writing the publication for place index i. */
  dropPublication?: number;
  /** Write a second publication for place index i (duplicate). */
  dupPublication?: number;
  /** Skip writing the head for place index i. */
  dropHead?: number;
  /** Write a second head doc for place index i (duplicate). */
  dupHead?: number;
  /** Point place i's head at a non-existent publication (dangling). */
  danglingHead?: number;
  /** Point place i's head at place j's publication (wrong place). */
  wrongPlaceHead?: [number, number];
  /** Write place i's head with an empty activePublicationId (missing active). */
  missingActive?: number;
  /** Give place i two registry docs with the same canonicalPlaceId (dup). */
  dupCanonical?: number;
  /** Put a mismatched migrationBatchId on place i's publication. */
  mismatchedBatchPub?: number;
  /** Seed one extra publication+head for a place OUTSIDE the registry set. */
  outsideExtra?: boolean;
}

async function seedPilot(mut: SeedMutation = {}): Promise<string> {
  const batchId = `PMB-emu-${suffix++}-${PILOT_BATCH_ID.slice(-8)}`;
  seededBatches.push(batchId);
  const d = db();
  const batch = d.batch();
  const PLC = (i: number) => `${batchId}_PLC_${i}`;
  const PUB = (i: number) => `${batchId}_PUB_${i}`;

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
    // Registry — batch-tagged anchor.
    batch.set(d.collection("place_registry").doc(PLC(i)), {
      canonicalPlaceId: PLC(i), migrationBatchId: batchId, displayName: `Mock ${i}`,
    });
    if (mut.dupCanonical === i) {
      // Second registry doc with the SAME canonicalPlaceId (different doc id).
      batch.set(d.collection("place_registry").doc(`${PLC(i)}_dup`), {
        canonicalPlaceId: PLC(i), migrationBatchId: batchId, displayName: `Mock ${i} dup`,
      });
    }

    // Publication — linked by placeId, NO batch field (production shape).
    if (mut.dropPublication !== i) {
      const pub: Record<string, unknown> = {
        publicationId: PUB(i), placeId: PLC(i), versionNumber: 1, publicationStatus: "published",
      };
      if (mut.mismatchedBatchPub === i) pub["migrationBatchId"] = "SOME-OTHER-BATCH";
      batch.set(d.collection("place_publications").doc(PUB(i)), pub);
    }
    if (mut.dupPublication === i) {
      batch.set(d.collection("place_publications").doc(`${PUB(i)}_b`), {
        publicationId: `${PUB(i)}_b`, placeId: PLC(i), versionNumber: 2, publicationStatus: "published",
      });
    }

    // Head — linked by placeId, references active publication.
    if (mut.dropHead !== i) {
      let active = PUB(i);
      if (mut.danglingHead === i) active = `${PUB(i)}_MISSING`;
      if (mut.missingActive === i) active = "";
      if (mut.wrongPlaceHead && mut.wrongPlaceHead[0] === i) active = PUB(mut.wrongPlaceHead[1]);
      batch.set(d.collection("place_publication_heads").doc(PLC(i)), {
        placeId: PLC(i), activePublicationId: active, updatedAt: 1,
      });
    }
    if (mut.dupHead === i) {
      batch.set(d.collection("place_publication_heads").doc(`${PLC(i)}_b`), {
        placeId: PLC(i), activePublicationId: PUB(i), updatedAt: 1,
      });
    }

    batch.set(d.collection("place_migration_aliases").doc(`${batchId}_ALS_${i}`), {
      aliasDocId: `${batchId}_ALS_${i}`, canonicalPlaceId: PLC(i), migrationBatchId: batchId,
    });
    batch.set(d.collection("place_migration_audit").doc(`${batchId}_MAU_${i}`), {
      auditId: `${batchId}_MAU_${i}`, action: "production_canonical_created", batchId,
    });
  }

  if (mut.outsideExtra) {
    // A publication + head for a place NOT in the registry set — must be ignored.
    batch.set(d.collection("place_publications").doc(`${batchId}_OUTSIDE_PUB`), {
      publicationId: `${batchId}_OUTSIDE_PUB`, placeId: `${batchId}_OUTSIDE_PLC`, versionNumber: 1,
    });
    batch.set(d.collection("place_publication_heads").doc(`${batchId}_OUTSIDE_PLC`), {
      placeId: `${batchId}_OUTSIDE_PLC`, activePublicationId: `${batchId}_OUTSIDE_PUB`, updatedAt: 1,
    });
  }

  await batch.commit();
  return batchId;
}

/** Backwards-compatible alias for the existing A2 tests. */
async function seedValidPilot(): Promise<string> {
  return seedPilot();
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

// ---------------------------------------------------------------------------
// A2.1 — production membership resolution (publications/heads untagged).
// ---------------------------------------------------------------------------

async function evidenceFor(batchId: string) {
  return gatherClosureEvidence(db(), batchId, {
    projectId: EXPECTED_PROJECT_ID, legacySourceUnchanged: true,
  });
}

test("A2.1-1/2/3/4. untagged data → 25 pubs, 25 heads, total 126, eligible", { skip }, async () => {
  const batchId = await seedPilot();
  const ev = await evidenceFor(batchId);
  assert.equal(ev.observed.publicationCount, 25, "publications by placeId membership");
  assert.equal(ev.observed.publicationHeadCount, 25, "heads by placeId membership");
  assert.equal(ev.observed.writeTotal, 126, "25+25+25+25+25+1");
  assert.deepEqual(ev.membershipBlockers, []);
  const dry = await applyPilotClosure(db(), req(batchId, false), ev, T, target(batchId));
  assert.equal(dry.decision.eligible, true);
  assert.equal(dry.decision.mutationRequired, true);
  assert.equal(dry.wrote, false);
});

test("A2.1-5. missing publication fails", { skip }, async () => {
  const batchId = await seedPilot({ dropPublication: 7 });
  const ev = await evidenceFor(batchId);
  assert.equal(ev.observed.publicationCount, 24);
  assert.ok(ev.membershipBlockers!.includes("missing_publication"));
  assert.equal((await applyPilotClosure(db(), req(batchId, false), ev, T, target(batchId))).decision.eligible, false);
});

test("A2.1-6. duplicate publication fails", { skip }, async () => {
  const batchId = await seedPilot({ dupPublication: 3 });
  const ev = await evidenceFor(batchId);
  assert.ok(ev.membershipBlockers!.includes("duplicate_publication"));
  assert.equal((await applyPilotClosure(db(), req(batchId, false), ev, T, target(batchId))).decision.eligible, false);
});

test("A2.1-7. missing head fails", { skip }, async () => {
  const batchId = await seedPilot({ dropHead: 12 });
  const ev = await evidenceFor(batchId);
  assert.equal(ev.observed.publicationHeadCount, 24);
  assert.ok(ev.membershipBlockers!.includes("missing_head"));
  assert.equal((await applyPilotClosure(db(), req(batchId, false), ev, T, target(batchId))).decision.eligible, false);
});

test("A2.1-8. duplicate head fails", { skip }, async () => {
  const batchId = await seedPilot({ dupHead: 5 });
  const ev = await evidenceFor(batchId);
  assert.ok(ev.membershipBlockers!.includes("duplicate_head"));
  assert.equal((await applyPilotClosure(db(), req(batchId, false), ev, T, target(batchId))).decision.eligible, false);
});

test("A2.1-9. dangling head (points to a missing publication) fails", { skip }, async () => {
  const batchId = await seedPilot({ danglingHead: 9 });
  const ev = await evidenceFor(batchId);
  assert.ok(ev.membershipBlockers!.includes("dangling_head"));
  assert.equal((await applyPilotClosure(db(), req(batchId, false), ev, T, target(batchId))).decision.eligible, false);
});

test("A2.1-10. wrong-place head (points to another place's publication) fails", { skip }, async () => {
  const batchId = await seedPilot({ wrongPlaceHead: [2, 4] });
  const ev = await evidenceFor(batchId);
  assert.ok(ev.membershipBlockers!.includes("wrong_place_head"));
  assert.equal((await applyPilotClosure(db(), req(batchId, false), ev, T, target(batchId))).decision.eligible, false);
});

test("A2.1-11. missing active publication (empty activePublicationId) fails", { skip }, async () => {
  const batchId = await seedPilot({ missingActive: 6 });
  const ev = await evidenceFor(batchId);
  assert.ok(ev.membershipBlockers!.includes("missing_active_publication"));
  assert.equal((await applyPilotClosure(db(), req(batchId, false), ev, T, target(batchId))).decision.eligible, false);
});

test("A2.1-12. duplicate registry canonical id fails", { skip }, async () => {
  const batchId = await seedPilot({ dupCanonical: 1 });
  const ev = await evidenceFor(batchId);
  assert.ok(ev.membershipBlockers!.includes("duplicate_canonical_id"));
  assert.equal((await applyPilotClosure(db(), req(batchId, false), ev, T, target(batchId))).decision.eligible, false);
});

test("A2.1-13. records outside the pilot registry are ignored (still 25/25, eligible)", { skip }, async () => {
  const batchId = await seedPilot({ outsideExtra: true });
  const ev = await evidenceFor(batchId);
  assert.equal(ev.observed.publicationCount, 25, "outside publication not counted");
  assert.equal(ev.observed.publicationHeadCount, 25, "outside head not counted");
  assert.deepEqual(ev.membershipBlockers, []);
  assert.equal((await applyPilotClosure(db(), req(batchId, false), ev, T, target(batchId))).decision.eligible, true);
});

test("A2.1-14. optional mismatched batch field on a publication fails", { skip }, async () => {
  const batchId = await seedPilot({ mismatchedBatchPub: 8 });
  const ev = await evidenceFor(batchId);
  assert.ok(ev.membershipBlockers!.includes("mismatched_optional_batch"));
  assert.equal((await applyPilotClosure(db(), req(batchId, false), ev, T, target(batchId))).decision.eligible, false);
});

test("A2.1-15. dry run over valid untagged data performs zero writes", { skip }, async () => {
  const batchId = await seedPilot();
  const ev = await evidenceFor(batchId);
  const dry = await applyPilotClosure(db(), req(batchId, false), ev, T, target(batchId));
  assert.equal(dry.wrote, false);
  assert.equal(dry.writeCount, 0);
  const doc = (await db().collection("place_migration_batches").doc(batchId).get()).data()!;
  assert.equal(doc.verificationResult, "pending_post_write");
});

test("A2.1-16. execute permits only one batch update + one audit event", { skip }, async () => {
  const batchId = await seedPilot();
  const result = await applyPilotClosure(db(), req(batchId, true), await evidenceFor(batchId), T, target(batchId));
  assert.equal(result.wrote, true);
  assert.equal(result.writeCount, 2);
  assert.equal(result.resultingBatch?.verificationResult, "verified");
  const doc = (await db().collection("place_migration_batches").doc(batchId).get()).data()!;
  assert.equal(doc.globalCompletion, false);
  assert.equal(doc.rollbackStatus, "available");
  // Counts unchanged after execute (membership still 25/25).
  const after = await evidenceFor(batchId);
  assert.equal(after.observed.publicationCount, 25);
  assert.equal(after.observed.publicationHeadCount, 25);
});

test("A2.1-17. second dry run after execute → alreadyVerified, no mutation", { skip }, async () => {
  const batchId = await seedPilot();
  await applyPilotClosure(db(), req(batchId, true), await evidenceFor(batchId), T, target(batchId));
  const second = await applyPilotClosure(db(), req(batchId, false), await evidenceFor(batchId), T + 1000, target(batchId));
  assert.equal(second.decision.alreadyVerified, true);
  assert.equal(second.decision.mutationRequired, false);
  assert.equal(second.wrote, false);
});
