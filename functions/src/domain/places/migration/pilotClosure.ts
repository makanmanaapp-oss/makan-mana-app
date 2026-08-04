/**
 * Phase A2 Part 2 — TERAS alat penutupan pilot (TULEN, dry-run lalai).
 *
 * Modul ini SENGAJA tidak mengimport firebase-admin/firestore. Ia menilai bukti
 * yang telah dibaca (read-only) dan mengembalikan satu keputusan: sama ada satu
 * batch pilot layak beralih daripada `pending_post_write` kepada `verified`, dan
 * jika ya, patch tepat + satu peristiwa audit yang serasi untuk ditambah.
 *
 * I/O sebenar (baca bukti + tulis transaksi) hidup dalam
 * `firestorePilotClosure.ts` dan skrip CLI — bukan di sini. Ini menjadikan teras
 * mustahil untuk menulis dan mudah diuji.
 *
 * KESELAMATAN:
 *  - hanya SATU batch pilot dinamakan; tiada wildcard, tiada berbilang batch;
 *  - satu-satunya hasil kejayaan ialah verified + globalCompletion tidak berubah
 *    (false) + rollbackStatus tidak berubah (available);
 *  - `verificationResult` sahaja yang ditulis pada batch, plus SATU audit;
 *  - dry-run tidak pernah menulis; larian berulang ke atas batch verified
 *    memulangkan alreadyVerified=true, mutationRequired=false.
 */
import { EpochMillis } from "../common";
import { hashCanonical } from "../staging/hashing";
import {
  VerificationBatchView,
  VerificationResult,
  assertVerificationTransition,
  isVerificationResult,
} from "./verificationResult";

// ---------------------------------------------------------------------------
// Sasaran pilot yang dijangka (tetap; dikunci oleh spesifikasi A1/A2)
// ---------------------------------------------------------------------------

export const EXPECTED_PROJECT_ID = "makanmana-c59f3";
export const PILOT_BATCH_ID = "PMB-925c3b83df84ce7016e99f1f";

/** Kiraan yang dijangka bagi batch pilot. */
export const PILOT_EXPECTED = {
  sourceCount: 25,
  migratedCount: 25,
  writeTotal: 126,
  registryCount: 25,
  publicationCount: 25,
  publicationHeadCount: 25,
  aliasCount: 25,
  migrationAuditCount: 25,
  orphanCount: 0,
  duplicateCount: 0,
  branchConflictCount: 0,
} as const;

/** Sumber komit dibawa ke dalam audit (disuntik oleh pemanggil/CLI). */
export const CLOSURE_AUDIT_ACTION = "pilot_verification_completed";

// ---------------------------------------------------------------------------
// Bukti (dikumpul read-only oleh adapter, dinilai di sini)
// ---------------------------------------------------------------------------

export interface ClosureEvidence {
  projectId: string;
  batchExists: boolean;
  batch: VerificationBatchView | null;
  /** Bukti checksum/manifest pada dokumen batch. */
  manifestChecksumPresent: boolean;
  candidateChecksumPresent: boolean;
  backupReferencePresent: boolean;
  manifestChecksumMatches: boolean;
  candidateChecksumMatches: boolean;
  /** Kiraan silang-koleksi diperhati (read-only). */
  observed: {
    sourceCount: number;
    migratedCount: number;
    writeTotal: number;
    registryCount: number;
    publicationCount: number;
    publicationHeadCount: number;
    aliasCount: number;
    migrationAuditCount: number;
    orphanCount: number;
    duplicateCount: number;
    branchConflictCount: number;
  };
  /** Sumber legasi kekal tidak berubah menurut kontrak migrasi. */
  legacySourceUnchanged: boolean;
  /**
   * A2.1 — penolakan integriti keahlian yang dikira oleh penghimpun bukti
   * (adapter Firestore) daripada perhubungan sebenar yang digunakan produksi:
   * publications/heads diselesaikan mengikut canonical placeId, bukan medan
   * batch. Kosong = tiada isu integriti. Penilai menambahnya kepada blockers.
   */
  membershipBlockers?: ClosureRejection[];
}

export interface ClosureRequest {
  projectId: string;
  batchId: string;
  /** Wajib sepadan `batchId` sebagai pengesahan eksplisit. */
  confirmBatchId: string;
  execute: boolean;
  /** Komit sumber yang menjalankan penutupan (untuk audit). */
  sourceCommit: string;
  actorId: string;
  evidenceReference: string;
}

export const CLOSURE_REJECTIONS = [
  "wrong_project",
  "wrong_batch",
  "batch_confirmation_mismatch",
  "wildcard_or_multiple_batch",
  "batch_missing",
  "unknown_verification_result",
  "not_pending_post_write",
  "already_failed",
  "global_completion_not_false",
  "rollback_status_not_available",
  "source_count_mismatch",
  "migrated_count_mismatch",
  "write_total_mismatch",
  "registry_count_mismatch",
  "publication_count_mismatch",
  "publication_head_count_mismatch",
  "alias_count_mismatch",
  "migration_audit_count_mismatch",
  "orphan_detected",
  "duplicate_detected",
  "branch_conflict_detected",
  "manifest_checksum_missing",
  "manifest_checksum_mismatch",
  "candidate_checksum_missing",
  "candidate_checksum_mismatch",
  "backup_reference_missing",
  "legacy_source_changed",
  // A2.1 — production membership integrity (publications/heads are NOT
  // batch-tagged in production; membership is resolved by canonical placeId).
  "duplicate_canonical_id",
  "missing_publication",
  "duplicate_publication",
  "missing_head",
  "duplicate_head",
  "dangling_head",
  "wrong_place_head",
  "missing_active_publication",
  "record_outside_registry",
  "mismatched_optional_batch",
] as const;
export type ClosureRejection = (typeof CLOSURE_REJECTIONS)[number];

// ---------------------------------------------------------------------------
// Peristiwa audit (serasi dengan skema place_migration_audit sedia ada)
// ---------------------------------------------------------------------------

/**
 * Bentuk audit sepadan dokumen yang ditulis oleh skrip migrasi produksi:
 * { auditId, action, batchId, actorType, at, ... }. Kami TIDAK mencipta koleksi
 * atau bentuk selari.
 */
export interface ClosureAuditEvent {
  auditId: string;
  action: typeof CLOSURE_AUDIT_ACTION;
  batchId: string;
  actorType: "owner";
  /** Semantik yang direkod. */
  verificationResult: Extract<VerificationResult, "verified">;
  globalCompletion: false;
  migrationWritePerformed: false;
  evidenceReference: string;
  sourceCommit: string;
  at: EpochMillis;
}

/** ID audit deterministik → menambah dua kali tidak pernah menduplikasi. */
export function closureAuditId(batchId: string): string {
  return `MAU-${hashCanonical({ action: CLOSURE_AUDIT_ACTION, batchId }).slice(0, 24)}`;
}

export function buildClosureAuditEvent(
  req: ClosureRequest,
  at: EpochMillis,
): ClosureAuditEvent {
  return {
    auditId: closureAuditId(req.batchId),
    action: CLOSURE_AUDIT_ACTION,
    batchId: req.batchId,
    actorType: "owner",
    verificationResult: "verified",
    globalCompletion: false,
    migrationWritePerformed: false,
    evidenceReference: req.evidenceReference,
    sourceCommit: req.sourceCommit,
    at,
  };
}

// ---------------------------------------------------------------------------
// Keputusan
// ---------------------------------------------------------------------------

export interface ClosureDecision {
  /** true = batch sudah verified sebelum larian ini. */
  alreadyVerified: boolean;
  /** true = satu tulisan diperlukan untuk mencapai verified. */
  mutationRequired: boolean;
  /** true = bukti lulus setiap gate (layak untuk verified). */
  eligible: boolean;
  blockers: ClosureRejection[];
  /** Patch yang akan ditulis pada batch (hanya bila mutationRequired). */
  plannedBatchPatch: { verificationResult: "verified"; verifiedAt: EpochMillis } | null;
  plannedAudit: ClosureAuditEvent | null;
}

/**
 * Sasaran yang dijangka. Lalai ialah projek + batch pilot sebenar. Boleh
 * ditimpa dalam UJIAN EMULATOR sahaja supaya batch sintetik boleh menjalankan
 * laluan-tulis; laluan CLI produksi tetap terkunci keras melalui
 * `assertSafeClosureInvocation`.
 */
export interface ClosureTarget {
  projectId: string;
  batchId: string;
}

export const DEFAULT_CLOSURE_TARGET: ClosureTarget = {
  projectId: EXPECTED_PROJECT_ID,
  batchId: PILOT_BATCH_ID,
};

/**
 * Sahkan bentuk permintaan sahaja (projek, batch, pengesahan, tiada wildcard).
 * Ini memisahkan penolakan "bentuk permintaan salah" daripada penolakan bukti.
 */
export function validateClosureRequest(
  req: ClosureRequest,
  expected: ClosureTarget = DEFAULT_CLOSURE_TARGET,
): ClosureRejection[] {
  const errs: ClosureRejection[] = [];
  if (req.projectId !== expected.projectId) errs.push("wrong_project");
  if (req.batchId !== expected.batchId) errs.push("wrong_batch");
  if (req.confirmBatchId !== req.batchId) errs.push("batch_confirmation_mismatch");
  if (/[*,\s]/.test(req.batchId) || req.batchId.includes("..")) {
    errs.push("wildcard_or_multiple_batch");
  }
  return errs;
}

/**
 * Nilai bukti terhadap sasaran pilot yang dijangka. TULEN.
 *
 * Perhatian penting: keputusan hanya "eligible" apabila SETIAP gate lulus.
 * Sebarang ketidakpadanan menjadi blocker dan penutupan ditolak.
 */
export function evaluateClosure(
  req: ClosureRequest,
  evidence: ClosureEvidence,
  at: EpochMillis,
  expected: ClosureTarget = DEFAULT_CLOSURE_TARGET,
): ClosureDecision {
  const blockers: ClosureRejection[] = [...validateClosureRequest(req, expected)];

  // Projek bukti mesti sepadan juga (adapter membaca dari projek tertentu).
  if (evidence.projectId !== expected.projectId) blockers.push("wrong_project");

  if (!evidence.batchExists || evidence.batch === null) {
    blockers.push("batch_missing");
    return deny(blockers);
  }

  const batch = evidence.batch;
  if (!isVerificationResult(batch.verificationResult)) {
    blockers.push("unknown_verification_result");
    return deny(blockers);
  }

  // Idempotensi: batch yang sudah verified → tiada mutasi.
  if (batch.verificationResult === "verified") {
    return {
      alreadyVerified: true,
      mutationRequired: false,
      eligible: true,
      blockers: [],
      plannedBatchPatch: null,
      plannedAudit: null,
    };
  }

  if (batch.verificationResult === "verification_failed") {
    // Penutupan verified normal tidak boleh memulihkan batch yang gagal.
    blockers.push("already_failed");
  } else if (batch.verificationResult !== "pending_post_write") {
    blockers.push("not_pending_post_write");
  }

  // Medan bebas mesti kekal pada nilai selamatnya.
  if (batch.globalCompletion !== false) blockers.push("global_completion_not_false");
  if (batch.rollbackStatus !== "available") blockers.push("rollback_status_not_available");

  // Kiraan silang-koleksi.
  const o = evidence.observed;
  const e = PILOT_EXPECTED;
  if (o.sourceCount !== e.sourceCount) blockers.push("source_count_mismatch");
  if (o.migratedCount !== e.migratedCount) blockers.push("migrated_count_mismatch");
  if (o.writeTotal !== e.writeTotal) blockers.push("write_total_mismatch");
  if (o.registryCount !== e.registryCount) blockers.push("registry_count_mismatch");
  if (o.publicationCount !== e.publicationCount) blockers.push("publication_count_mismatch");
  if (o.publicationHeadCount !== e.publicationHeadCount) {
    blockers.push("publication_head_count_mismatch");
  }
  if (o.aliasCount !== e.aliasCount) blockers.push("alias_count_mismatch");
  if (o.migrationAuditCount !== e.migrationAuditCount) {
    blockers.push("migration_audit_count_mismatch");
  }
  if (o.orphanCount !== e.orphanCount) blockers.push("orphan_detected");
  if (o.duplicateCount !== e.duplicateCount) blockers.push("duplicate_detected");
  if (o.branchConflictCount !== e.branchConflictCount) {
    blockers.push("branch_conflict_detected");
  }

  // Bukti checksum/manifest/backup.
  if (!evidence.manifestChecksumPresent) blockers.push("manifest_checksum_missing");
  else if (!evidence.manifestChecksumMatches) blockers.push("manifest_checksum_mismatch");
  if (!evidence.candidateChecksumPresent) blockers.push("candidate_checksum_missing");
  else if (!evidence.candidateChecksumMatches) blockers.push("candidate_checksum_mismatch");
  if (!evidence.backupReferencePresent) blockers.push("backup_reference_missing");

  // Sumber legasi mesti tidak berubah.
  if (!evidence.legacySourceUnchanged) blockers.push("legacy_source_changed");

  // A2.1 — penolakan integriti keahlian (dikira oleh adapter daripada
  // perhubungan placeId sebenar). Fail-closed: mana-mana satu menyekat.
  if (evidence.membershipBlockers && evidence.membershipBlockers.length > 0) {
    blockers.push(...evidence.membershipBlockers);
  }

  if (blockers.length > 0) return deny(blockers);

  // Semua gate lulus → rancang peralihan verified. Kuatkuasa peralihan sekali
  // lagi melalui kontrak (belt-and-braces).
  assertVerificationTransition("pending_post_write", "verified");
  return {
    alreadyVerified: false,
    mutationRequired: true,
    eligible: true,
    blockers: [],
    plannedBatchPatch: { verificationResult: "verified", verifiedAt: at },
    plannedAudit: buildClosureAuditEvent(req, at),
  };
}

function deny(blockers: ClosureRejection[]): ClosureDecision {
  return {
    alreadyVerified: false,
    mutationRequired: false,
    eligible: false,
    blockers: [...new Set(blockers)],
    plannedBatchPatch: null,
    plannedAudit: null,
  };
}

// ---------------------------------------------------------------------------
// Laporan tertapis (tidak pernah mencetak kelayakan atau dokumen penuh)
// ---------------------------------------------------------------------------

const mask = (id: string): string =>
  id && id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : "****";

export interface RedactedClosureReport {
  mode: "dry-run" | "execute";
  projectId: string;
  batchIdMasked: string;
  alreadyVerified: boolean;
  mutationRequired: boolean;
  eligible: boolean;
  blockers: ClosureRejection[];
  wrote: boolean;
  writeCount: number;
  resultingVerificationResult: VerificationResult | null;
  globalCompletion: false;
  rollbackStatus: string | null;
  auditIdMasked: string | null;
  note: string;
}

export function renderRedactedReport(
  req: ClosureRequest,
  decision: ClosureDecision,
  applied: { wrote: boolean; writeCount: number; resultingBatch: VerificationBatchView | null },
): RedactedClosureReport {
  return {
    mode: req.execute ? "execute" : "dry-run",
    projectId: req.projectId,
    batchIdMasked: mask(req.batchId),
    alreadyVerified: decision.alreadyVerified,
    mutationRequired: decision.mutationRequired,
    eligible: decision.eligible,
    blockers: decision.blockers,
    wrote: applied.wrote,
    writeCount: applied.writeCount,
    resultingVerificationResult: applied.resultingBatch?.verificationResult ?? null,
    globalCompletion: false,
    rollbackStatus: applied.resultingBatch?.rollbackStatus ?? null,
    auditIdMasked: decision.plannedAudit ? mask(decision.plannedAudit.auditId) : null,
    note: req.execute
      ? "Executed against emulator/authorized target only. verificationResult is the only batch field changed; exactly one audit event appended."
      : "DRY RUN — no data modified.",
  };
}

// ---------------------------------------------------------------------------
// CLI helpers (guard + hurai argumen) — TIADA I/O
// ---------------------------------------------------------------------------

export interface ClosureArgs {
  projectId?: string;
  batchId?: string;
  confirmBatchId?: string;
  execute: boolean;
  sourceCommit?: string;
  evidenceReference?: string;
}

export function parseClosureArgs(argv: readonly string[]): ClosureArgs {
  const args: ClosureArgs = { execute: false };
  for (const a of argv) {
    const [k, v] = a.includes("=") ? a.split("=", 2) : [a, ""];
    switch (k) {
      case "--confirm-project": args.projectId = v; break;
      case "--batch": args.batchId = v; break;
      case "--confirm-batch": args.confirmBatchId = v; break;
      case "--execute": args.execute = true; break;
      case "--source-commit": args.sourceCommit = v; break;
      case "--evidence-reference": args.evidenceReference = v; break;
    }
  }
  return args;
}

/**
 * Melempar apabila pemanggilan tidak selamat. Menguatkuasa: projek tepat, batch
 * tepat, pengesahan batch sepadan, tiada wildcard/berbilang batch.
 */
export function assertSafeClosureInvocation(
  args: ClosureArgs,
  expectedProject = EXPECTED_PROJECT_ID,
): void {
  if (args.projectId !== expectedProject) {
    throw new Error(`refused: --confirm-project=${expectedProject} is required; got '${args.projectId ?? ""}'`);
  }
  if (args.batchId !== PILOT_BATCH_ID) {
    throw new Error(`refused: --batch=${PILOT_BATCH_ID} is required (single pilot batch only)`);
  }
  if (args.confirmBatchId !== args.batchId) {
    throw new Error("refused: --confirm-batch must exactly match --batch");
  }
  if (/[*,\s]/.test(args.batchId) || args.batchId.includes("..")) {
    throw new Error("refused: wildcard or multiple-batch execution is not allowed");
  }
  if (args.execute && !args.sourceCommit) {
    throw new Error("refused: --source-commit is required for --execute (audit provenance)");
  }
}

export function toClosureRequest(args: ClosureArgs, actorId: string): ClosureRequest {
  return {
    projectId: args.projectId ?? "",
    batchId: args.batchId ?? "",
    confirmBatchId: args.confirmBatchId ?? "",
    execute: args.execute,
    sourceCommit: args.sourceCommit ?? "unknown",
    actorId,
    evidenceReference: args.evidenceReference ?? "docs/PLACE_DATA_A1_CONTROLLED_PILOT_CLOSURE_PLAN.md",
  };
}

export function banner(projectId: string, execute: boolean): string {
  return [
    "============================================================",
    `  PILOT CLOSURE — ${execute ? "EXECUTE" : "DRY RUN"}`,
    `  PROJECT: ${projectId}`,
    `  BATCH:   ${mask(PILOT_BATCH_ID)}`,
    "  Only verificationResult changes; globalCompletion stays false.",
    execute ? "  A single audit event will be appended." : "  NO DATA WILL BE MODIFIED",
    "============================================================",
  ].join("\n");
}
