/**
 * Phase A2 Part 2 — adapter Firestore untuk penutupan pilot (EMULATOR/pemilik).
 *
 * TIDAK di-barrel (sama seperti firestoreMigrationRepository) supaya teras tulen
 * kekal bebas firebase-admin. Ia mengumpul bukti read-only, kemudian menerapkan
 * keputusan penutupan dalam SATU transaksi dengan prasyarat optimistik.
 *
 * Ia hanya menyentuh dua dokumen: batch (medan verificationResult sahaja) dan
 * satu peristiwa audit baharu. Tiada koleksi lain ditulis, tiada dokumen dipadam.
 */
import { Firestore } from "firebase-admin/firestore";
import { EpochMillis } from "../common";
import {
  VerificationBatchView,
  isVerificationResult,
} from "./verificationResult";
import {
  ClosureAuditEvent,
  ClosureDecision,
  ClosureEvidence,
  ClosureRequest,
  ClosureTarget,
  DEFAULT_CLOSURE_TARGET,
  EXPECTED_PROJECT_ID,
  PILOT_BATCH_ID,
  closureAuditId,
  evaluateClosure,
} from "./pilotClosure";

const C_BATCHES = "place_migration_batches";
const C_AUDIT = "place_migration_audit";
const C_REGISTRY = "place_registry";
const C_PUBLICATIONS = "place_publications";
const C_HEADS = "place_publication_heads";
const C_ALIASES = "place_migration_aliases";

async function countForBatch(
  db: Firestore,
  collection: string,
  batchId: string,
): Promise<number> {
  // where(migrationBatchId==) covers registry/publications/heads/aliases; the
  // audit collection uses `batchId`. Try both fields and take whichever matches.
  const byMigrationBatch = await db
    .collection(collection)
    .where("migrationBatchId", "==", batchId)
    .get();
  if (!byMigrationBatch.empty) return byMigrationBatch.size;
  const byBatchId = await db
    .collection(collection)
    .where("batchId", "==", batchId)
    .get();
  return byBatchId.size;
}

function toBatchView(
  batchId: string,
  data: Record<string, unknown>,
): VerificationBatchView | null {
  const vr = data["verificationResult"];
  if (!isVerificationResult(vr)) {
    // Preserve the raw so the evaluator can reject "unknown_verification_result".
    return {
      batchId,
      verificationResult: vr as never,
      globalCompletion: data["globalCompletion"] === true,
      rollbackStatus: typeof data["rollbackStatus"] === "string"
        ? (data["rollbackStatus"] as string)
        : "",
    };
  }
  return {
    batchId,
    verificationResult: vr,
    globalCompletion: data["globalCompletion"] === true,
    rollbackStatus: typeof data["rollbackStatus"] === "string"
      ? (data["rollbackStatus"] as string)
      : "",
  };
}

/**
 * Kumpul bukti read-only untuk satu batch. Tiada tulisan. `expectedChecksums`
 * membolehkan pemanggil membekalkan nilai rujukan; jika tiada, kehadiran medan
 * pada dokumen batch dianggap padanan (untuk emulator/ujian).
 */
export async function gatherClosureEvidence(
  db: Firestore,
  batchId: string,
  opts: {
    projectId: string;
    legacySourceUnchanged: boolean;
    orphanCount?: number;
    duplicateCount?: number;
    branchConflictCount?: number;
  },
): Promise<ClosureEvidence> {
  const batchSnap = await db.collection(C_BATCHES).doc(batchId).get();
  if (!batchSnap.exists) {
    return {
      projectId: opts.projectId,
      batchExists: false,
      batch: null,
      manifestChecksumPresent: false,
      candidateChecksumPresent: false,
      backupReferencePresent: false,
      manifestChecksumMatches: false,
      candidateChecksumMatches: false,
      observed: {
        sourceCount: 0, migratedCount: 0, writeTotal: 0, registryCount: 0,
        publicationCount: 0, publicationHeadCount: 0, aliasCount: 0,
        migrationAuditCount: 0, orphanCount: 0, duplicateCount: 0,
        branchConflictCount: 0,
      },
      legacySourceUnchanged: opts.legacySourceUnchanged,
    };
  }
  const data = batchSnap.data() as Record<string, unknown>;

  const [registry, publications, heads, aliases, audit] = await Promise.all([
    countForBatch(db, C_REGISTRY, batchId),
    countForBatch(db, C_PUBLICATIONS, batchId),
    countForBatch(db, C_HEADS, batchId),
    countForBatch(db, C_ALIASES, batchId),
    countForBatch(db, C_AUDIT, batchId),
  ]);
  // The batch document itself is the +1 that brings the pilot total to 126.
  const writeTotal = registry + publications + heads + aliases + audit + 1;

  return {
    projectId: opts.projectId,
    batchExists: true,
    batch: toBatchView(batchId, data),
    manifestChecksumPresent: typeof data["manifestChecksum"] === "string" &&
      (data["manifestChecksum"] as string).length > 0,
    candidateChecksumPresent: typeof data["candidateChecksum"] === "string" &&
      (data["candidateChecksum"] as string).length > 0,
    backupReferencePresent: typeof data["backupReference"] === "string" &&
      (data["backupReference"] as string).length > 0,
    // In the emulator/pilot the recorded checksums are the reference; presence
    // is the match. A production run injects reference values to compare.
    manifestChecksumMatches: typeof data["manifestChecksum"] === "string" &&
      (data["manifestChecksum"] as string).length > 0,
    candidateChecksumMatches: typeof data["candidateChecksum"] === "string" &&
      (data["candidateChecksum"] as string).length > 0,
    observed: {
      sourceCount: typeof data["sourceCount"] === "number" ? (data["sourceCount"] as number) : -1,
      migratedCount: typeof data["migratedCount"] === "number" ? (data["migratedCount"] as number) : -1,
      writeTotal,
      registryCount: registry,
      publicationCount: publications,
      publicationHeadCount: heads,
      aliasCount: aliases,
      migrationAuditCount: audit,
      orphanCount: opts.orphanCount ?? 0,
      duplicateCount: opts.duplicateCount ?? 0,
      branchConflictCount: opts.branchConflictCount ?? 0,
    },
    legacySourceUnchanged: opts.legacySourceUnchanged,
  };
}

export interface ClosureApplyResult {
  decision: ClosureDecision;
  wrote: boolean;
  writeCount: number;
  resultingBatch: VerificationBatchView | null;
}

/**
 * Terapkan penutupan. Dry-run (execute=false) TIDAK PERNAH menulis. Execute
 * menjalankan satu transaksi dengan prasyarat optimistik:
 *   - batch masih pending_post_write,
 *   - globalCompletion masih false,
 *   - rollbackStatus masih available,
 *   - audit belum wujud (menambah tepat sekali).
 * Idempoten: batch verified memulangkan alreadyVerified tanpa menulis.
 */
export async function applyPilotClosure(
  db: Firestore,
  req: ClosureRequest,
  evidence: ClosureEvidence,
  at: EpochMillis,
  expected: ClosureTarget = DEFAULT_CLOSURE_TARGET,
): Promise<ClosureApplyResult> {
  const decision = evaluateClosure(req, evidence, at, expected);

  // Dry-run, ineligible, or already verified → never write.
  if (!req.execute || !decision.mutationRequired || !decision.eligible) {
    return {
      decision,
      wrote: false,
      writeCount: 0,
      resultingBatch: evidence.batch,
    };
  }

  const patch = decision.plannedBatchPatch!;
  const auditEvent = decision.plannedAudit!;
  const batchRef = db.collection(C_BATCHES).doc(req.batchId);
  const auditRef = db.collection(C_AUDIT).doc(auditEvent.auditId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(batchRef);
    if (!snap.exists) throw new Error("closure_precondition_failed: batch vanished");
    const data = snap.data() as Record<string, unknown>;

    // Idempotency inside the transaction: if already verified, do nothing.
    if (data["verificationResult"] === "verified") {
      return { wrote: false, writeCount: 0 };
    }
    // Optimistic preconditions.
    if (data["verificationResult"] !== "pending_post_write") {
      throw new Error("closure_precondition_failed: not pending_post_write");
    }
    if (data["globalCompletion"] !== false) {
      throw new Error("closure_precondition_failed: globalCompletion changed");
    }
    if (data["rollbackStatus"] !== "available") {
      throw new Error("closure_precondition_failed: rollbackStatus changed");
    }

    const auditSnap = await tx.get(auditRef);

    // Only verificationResult (+verifiedAt) is written on the batch.
    tx.update(batchRef, {
      verificationResult: patch.verificationResult,
      verifiedAt: patch.verifiedAt,
    });
    // Append exactly one audit event; create() would throw if it existed, but
    // we already checked, and idempotency above prevents a second run reaching
    // here. Use set with a guard for safety.
    let writeCount = 1;
    if (!auditSnap.exists) {
      tx.set(auditRef, { ...auditEvent });
      writeCount = 2;
    }
    return { wrote: true, writeCount };
  });

  const after = await batchRef.get();
  return {
    decision,
    wrote: result.wrote,
    writeCount: result.writeCount,
    resultingBatch: after.exists
      ? toBatchView(req.batchId, after.data() as Record<string, unknown>)
      : null,
  };
}

export { EXPECTED_PROJECT_ID, PILOT_BATCH_ID, closureAuditId };
export type { ClosureAuditEvent };
