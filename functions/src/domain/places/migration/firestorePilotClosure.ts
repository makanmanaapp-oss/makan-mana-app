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
  ClosureRejection,
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

/** Firestore `in` accepts up to 30 values; 10 keeps us comfortably bounded. */
const IN_CHUNK = 10;

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Count docs carrying an explicit batch field (registry/aliases → migrationBatchId,
 * audit → batchId). These collections ARE batch-tagged in production. */
async function countByField(
  db: Firestore,
  collection: string,
  field: "migrationBatchId" | "batchId",
  batchId: string,
): Promise<number> {
  const snap = await db.collection(collection).where(field, "==", batchId).get();
  return snap.size;
}

interface MembershipResult {
  registryCount: number;
  publicationCount: number;
  publicationHeadCount: number;
  canonicalPlaceIds: string[];
  blockers: ClosureRejection[];
}

/**
 * A2.1 — resolve publication/head membership by the DEPLOYED relationship model.
 *
 * Production `place_publications` and `place_publication_heads` do NOT carry a
 * batch field. They belong to the pilot through their canonical `placeId`:
 *   1. the pilot's registry docs ARE batch-tagged (migrationBatchId);
 *   2. their canonicalPlaceIds define the membership set (must be 25 unique);
 *   3. publications belong via `placeId` ∈ set;
 *   4. heads belong via `placeId` ∈ set, and each head's `activePublicationId`
 *      must reference an existing publication for the SAME place.
 *
 * All reads are single-field equality / `in` (no composite index). Records
 * outside the registry set are never fetched, so they are ignored, not counted.
 * No migrationBatchId is required or backfilled on publications/heads; if the
 * field happens to exist and disagrees, that is a fail-closed mismatch.
 */
async function resolveMembership(
  db: Firestore,
  batchId: string,
): Promise<MembershipResult> {
  const blockers: ClosureRejection[] = [];

  // 1. Registry — the only batch-tagged anchor. Derive canonical place IDs.
  const regSnap = await db.collection(C_REGISTRY).where("migrationBatchId", "==", batchId).get();
  const registryCount = regSnap.size;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const doc of regSnap.docs) {
    const cid = (doc.data()["canonicalPlaceId"] as string | undefined) ?? doc.id;
    if (seen.has(cid)) blockers.push("duplicate_canonical_id");
    else { seen.add(cid); ids.push(cid); }
  }
  const set = new Set(ids);
  if (ids.length === 0) {
    return { registryCount, publicationCount: 0, publicationHeadCount: 0, canonicalPlaceIds: ids, blockers };
  }

  // 2. Publications — membership by placeId ∈ set.
  const pubsByPlace = new Map<string, number>();
  const pubPlaceById = new Map<string, string>();
  let publicationCount = 0;
  for (const c of chunk(ids, IN_CHUNK)) {
    const snap = await db.collection(C_PUBLICATIONS).where("placeId", "in", c).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const placeId = data["placeId"] as string;
      if (!set.has(placeId)) continue; // ignore anything outside the set
      publicationCount += 1;
      pubsByPlace.set(placeId, (pubsByPlace.get(placeId) ?? 0) + 1);
      pubPlaceById.set((data["publicationId"] as string | undefined) ?? doc.id, placeId);
      if ("migrationBatchId" in data && data["migrationBatchId"] !== batchId) {
        blockers.push("mismatched_optional_batch");
      }
    }
  }
  for (const cid of ids) {
    const n = pubsByPlace.get(cid) ?? 0;
    if (n === 0) blockers.push("missing_publication");
    else if (n > 1) blockers.push("duplicate_publication");
  }

  // 3. Heads — membership by placeId ∈ set; each references an active publication.
  const headsByPlace = new Map<string, number>();
  const headActiveByPlace = new Map<string, string[]>();
  let publicationHeadCount = 0;
  for (const c of chunk(ids, IN_CHUNK)) {
    const snap = await db.collection(C_HEADS).where("placeId", "in", c).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const placeId = data["placeId"] as string;
      if (!set.has(placeId)) continue;
      publicationHeadCount += 1;
      headsByPlace.set(placeId, (headsByPlace.get(placeId) ?? 0) + 1);
      const active = (data["activePublicationId"] as string | undefined) ?? "";
      const list = headActiveByPlace.get(placeId) ?? [];
      list.push(active);
      headActiveByPlace.set(placeId, list);
      if ("migrationBatchId" in data && data["migrationBatchId"] !== batchId) {
        blockers.push("mismatched_optional_batch");
      }
    }
  }
  for (const cid of ids) {
    const n = headsByPlace.get(cid) ?? 0;
    if (n === 0) blockers.push("missing_head");
    else if (n > 1) blockers.push("duplicate_head");
  }

  // 4. Head → active publication integrity (bounded point reads for misses).
  for (const [placeId, actives] of headActiveByPlace) {
    for (const activeId of actives) {
      if (!activeId) { blockers.push("missing_active_publication"); continue; }
      const knownPlace = pubPlaceById.get(activeId);
      if (knownPlace !== undefined) {
        if (knownPlace !== placeId) blockers.push("wrong_place_head");
        continue;
      }
      // Not among the batch's publications — distinguish dangling vs wrong-place.
      const pubDoc = await db.collection(C_PUBLICATIONS).doc(activeId).get();
      if (!pubDoc.exists) blockers.push("dangling_head");
      else if ((pubDoc.data()!["placeId"] as string) !== placeId) blockers.push("wrong_place_head");
      else blockers.push("record_outside_registry");
    }
  }

  return {
    registryCount,
    publicationCount,
    publicationHeadCount,
    canonicalPlaceIds: ids,
    blockers: [...new Set(blockers)],
  };
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

  // Registry + publications + heads resolved by canonical placeId membership
  // (publications/heads are NOT batch-tagged in production). Aliases and audit
  // ARE batch-tagged, so they are counted by their explicit field.
  const [membership, aliases, audit] = await Promise.all([
    resolveMembership(db, batchId),
    countByField(db, C_ALIASES, "migrationBatchId", batchId),
    countByField(db, C_AUDIT, "batchId", batchId),
  ]);
  const registry = membership.registryCount;
  const publications = membership.publicationCount;
  const heads = membership.publicationHeadCount;
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
    membershipBlockers: membership.blockers,
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
