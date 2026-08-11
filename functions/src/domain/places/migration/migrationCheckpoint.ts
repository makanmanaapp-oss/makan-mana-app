/**
 * Phase 1.12 Part I — checkpoint, jeda dan sambung semula.
 *
 * Checkpoint mesti selamat untuk dimain semula. Identiti checkpoint TIDAK
 * PERNAH bergantung pada jam dinding sahaja — ia berdasarkan pelan, kelompok
 * dan set calon yang telah diproses, supaya sambung semula adalah deterministik
 * dan calon yang sama tidak pernah dilaksanakan dua kali.
 */
import { EpochMillis } from "../common";
import { hashCanonical } from "../staging/hashing";
import { CheckpointStatus } from "./migrationTypes";

export interface MigrationCheckpoint {
  checkpointId: string;
  migrationPlanId: string;
  batchId: string;
  lastProcessedCandidateId: string | null;
  /** Calon yang sudah selesai — sumber kebenaran untuk idempotensi. */
  processedCandidateIds: string[];
  processedCount: number;
  succeededCount: number;
  heldCount: number;
  failedCount: number;
  checksum: string;
  status: CheckpointStatus;
  createdAt: EpochMillis;
  updatedAt: EpochMillis;
}

/** ID checkpoint deterministik: satu checkpoint bagi setiap pelan + kelompok. */
export function checkpointId(migrationPlanId: string, batchId: string): string {
  return `CKP-${hashCanonical({ migrationPlanId, batchId }).slice(0, 24)}`;
}

/**
 * Checksum melindungi integriti checkpoint. Ia meliputi identiti pelan dan
 * SET calon yang telah diproses (diisih) — bukan susunan atau masa.
 */
export function checkpointChecksum(input: {
  migrationPlanId: string;
  batchId: string;
  processedCandidateIds: readonly string[];
  succeededCount: number;
  heldCount: number;
  failedCount: number;
}): string {
  return hashCanonical({
    migrationPlanId: input.migrationPlanId,
    batchId: input.batchId,
    processedCandidateIds: [...input.processedCandidateIds].sort(),
    succeededCount: input.succeededCount,
    heldCount: input.heldCount,
    failedCount: input.failedCount,
  });
}

export function createCheckpoint(
  migrationPlanId: string,
  batchId: string,
  now: EpochMillis,
): MigrationCheckpoint {
  const base = {
    migrationPlanId,
    batchId,
    processedCandidateIds: [] as string[],
    succeededCount: 0,
    heldCount: 0,
    failedCount: 0,
  };
  return {
    checkpointId: checkpointId(migrationPlanId, batchId),
    ...base,
    lastProcessedCandidateId: null,
    processedCount: 0,
    checksum: checkpointChecksum(base),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

export type CandidateOutcome = "succeeded" | "held" | "failed";

/**
 * Rekod satu calon. Memainkan semula calon yang sama tidak mengubah apa-apa —
 * inilah yang menjadikan pelaksanaan berulang idempoten.
 */
export function recordCandidate(
  checkpoint: MigrationCheckpoint,
  candidateId: string,
  outcome: CandidateOutcome,
  now: EpochMillis,
): MigrationCheckpoint {
  if (checkpoint.processedCandidateIds.includes(candidateId)) {
    return checkpoint;
  }
  const processedCandidateIds = [...checkpoint.processedCandidateIds, candidateId];
  const succeededCount =
    checkpoint.succeededCount + (outcome === "succeeded" ? 1 : 0);
  const heldCount = checkpoint.heldCount + (outcome === "held" ? 1 : 0);
  const failedCount = checkpoint.failedCount + (outcome === "failed" ? 1 : 0);

  return {
    ...checkpoint,
    lastProcessedCandidateId: candidateId,
    processedCandidateIds,
    processedCount: processedCandidateIds.length,
    succeededCount,
    heldCount,
    failedCount,
    checksum: checkpointChecksum({
      migrationPlanId: checkpoint.migrationPlanId,
      batchId: checkpoint.batchId,
      processedCandidateIds,
      succeededCount,
      heldCount,
      failedCount,
    }),
    status: "running",
    updatedAt: now,
  };
}

export function pauseCheckpoint(
  checkpoint: MigrationCheckpoint,
  now: EpochMillis,
): MigrationCheckpoint {
  return { ...checkpoint, status: "paused", updatedAt: now };
}

export function resumeCheckpoint(
  checkpoint: MigrationCheckpoint,
  now: EpochMillis,
): MigrationCheckpoint {
  return { ...checkpoint, status: "running", updatedAt: now };
}

export function completeCheckpoint(
  checkpoint: MigrationCheckpoint,
  now: EpochMillis,
): MigrationCheckpoint {
  return { ...checkpoint, status: "completed", updatedAt: now };
}

/**
 * Sahkan integriti checkpoint. Checksum yang tidak sepadan bermakna checkpoint
 * telah diusik atau rosak — kita GAGAL DENGAN SELAMAT dan bukannya menyambung
 * semula ke atas keadaan yang tidak dipercayai.
 */
export function verifyCheckpoint(checkpoint: MigrationCheckpoint): {
  ok: boolean;
  reason: string | null;
} {
  const expected = checkpointChecksum({
    migrationPlanId: checkpoint.migrationPlanId,
    batchId: checkpoint.batchId,
    processedCandidateIds: checkpoint.processedCandidateIds,
    succeededCount: checkpoint.succeededCount,
    heldCount: checkpoint.heldCount,
    failedCount: checkpoint.failedCount,
  });
  if (expected !== checkpoint.checksum) {
    return { ok: false, reason: "checksum_mismatch" };
  }
  if (checkpoint.processedCount !== checkpoint.processedCandidateIds.length) {
    return { ok: false, reason: "processed_count_mismatch" };
  }
  const tallied =
    checkpoint.succeededCount + checkpoint.heldCount + checkpoint.failedCount;
  if (tallied !== checkpoint.processedCount) {
    return { ok: false, reason: "outcome_tally_mismatch" };
  }
  return { ok: true, reason: null };
}

export function markCheckpointCorrupt(
  checkpoint: MigrationCheckpoint,
  now: EpochMillis,
): MigrationCheckpoint {
  return { ...checkpoint, status: "corrupt", updatedAt: now };
}

/** Calon yang masih perlu diproses (sambung semula bermula di sini). */
export function remainingCandidates(
  checkpoint: MigrationCheckpoint,
  allCandidateIds: readonly string[],
): string[] {
  const done = new Set(checkpoint.processedCandidateIds);
  return allCandidateIds.filter((id) => !done.has(id));
}
