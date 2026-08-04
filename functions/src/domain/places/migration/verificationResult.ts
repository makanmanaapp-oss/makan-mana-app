/**
 * Phase A2 — kontrak `verificationResult` tunggal & berwibawa.
 *
 * Satu tempat mentakrif nilai `verificationResult` yang sah pada dokumen
 * `place_migration_batches`, peralihan yang dibenarkan, dan cara ia
 * di-serialisasi/dihurai. Skrip migrasi produksi menulis literal
 * `"pending_post_write"` (functions/scripts/placeProductionMigration.ts:235);
 * kontrak ini menjadikan set nilai itu eksplisit dan boleh disahkan tanpa
 * mencipta enum selari.
 *
 * PRINSIP:
 *  - `verified` bermakna pengesahan pasca-tulis SATU batch lulus — BUKAN
 *    keseluruhan migrasi legasi selesai;
 *  - `globalCompletion` dan `rollbackStatus` adalah bebas dan TIDAK PERNAH
 *    diubah oleh peralihan verificationResult;
 *  - nilai tidak dikenali DITOLAK, tidak pernah diandaikan.
 */
import { EpochMillis } from "../common";

// ---------------------------------------------------------------------------
// Nilai kontrak (satu sumber kebenaran)
// ---------------------------------------------------------------------------

export const VERIFICATION_RESULTS = [
  "pending_post_write",
  "verified",
  "verification_failed",
] as const;

export type VerificationResult = (typeof VERIFICATION_RESULTS)[number];

/** Makna rasmi setiap nilai (untuk dokumentasi + paparan laporan). */
export const VERIFICATION_RESULT_MEANINGS: Readonly<Record<VerificationResult, string>> = {
  pending_post_write:
    "Production migration writes completed, but post-write verification has not been formally completed.",
  verified:
    "Post-write verification completed successfully for the specific migration batch.",
  verification_failed:
    "Post-write verification ran but at least one required verification gate failed.",
};

/**
 * Nilai lalai yang ditulis oleh migrasi produksi sejurus selepas tulisan
 * selesai. Kontrak mesti kekal serasi ke belakang dengan dokumen pilot sedia
 * ada yang memegang nilai ini.
 */
export const INITIAL_VERIFICATION_RESULT: VerificationResult = "pending_post_write";

// ---------------------------------------------------------------------------
// Pengesah masa jalan
// ---------------------------------------------------------------------------

/** Type guard: adakah `v` salah satu nilai kontrak yang sah? */
export function isVerificationResult(v: unknown): v is VerificationResult {
  return typeof v === "string" &&
    (VERIFICATION_RESULTS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Serialisasi / penghuraian
// ---------------------------------------------------------------------------

/** Serialisasi: nilai kontrak → rentetan yang disimpan (identiti, tetapi
 * dikuatkuasakan jenis supaya pemanggil tidak boleh menulis nilai luar set). */
export function serializeVerificationResult(value: VerificationResult): string {
  return value;
}

/**
 * Hurai satu nilai yang disimpan kepada nilai kontrak. Nilai tidak dikenali
 * (termasuk `undefined`, `null`, nombor, atau rentetan lama yang tidak sah)
 * MELEMPAR — kita tidak pernah menganggap keadaan.
 */
export function parseVerificationResult(raw: unknown): VerificationResult {
  if (!isVerificationResult(raw)) {
    throw new VerificationResultError(
      "unknown_verification_result",
      `Unknown verificationResult: ${JSON.stringify(raw)}`,
    );
  }
  return raw;
}

/** Varian tidak-melempar untuk laluan yang memilih mengendalikan ralat. */
export function tryParseVerificationResult(raw: unknown): VerificationResult | null {
  return isVerificationResult(raw) ? raw : null;
}

// ---------------------------------------------------------------------------
// Pengesah peralihan
// ---------------------------------------------------------------------------

/**
 * Peralihan yang dibenarkan melalui laluan penutupan NORMAL.
 *
 * Nota sengaja:
 *  - `verified` dan `verification_failed` adalah keadaan terminal untuk laluan
 *    normal — pemulihan daripada `verification_failed` memerlukan aliran kerja
 *    pemulihan eksplisit yang berasingan, BUKAN peralihan penutupan biasa;
 *  - `verified -> pending_post_write` tidak pernah dibenarkan melalui penutupan
 *    (itu akan menyembunyikan pengesahan yang telah berlaku).
 */
const NORMAL_CLOSURE_TRANSITIONS: Readonly<Record<VerificationResult, readonly VerificationResult[]>> = {
  pending_post_write: ["verified", "verification_failed"],
  verified: [],
  verification_failed: [],
};

export const VERIFICATION_TRANSITION_REJECTIONS = [
  "unknown_source_value",
  "unknown_target_value",
  "no_op_transition",
  "reopen_forbidden",
  "verified_to_failed_forbidden_normal",
  "recovery_requires_explicit_workflow",
  "global_completion_mutation_forbidden",
  "rollback_status_mutation_forbidden",
] as const;
export type VerificationTransitionRejection =
  (typeof VERIFICATION_TRANSITION_REJECTIONS)[number];

export interface TransitionCheck {
  readonly allowed: boolean;
  readonly rejection: VerificationTransitionRejection | null;
}

const OK: TransitionCheck = { allowed: true, rejection: null };
const reject = (rejection: VerificationTransitionRejection): TransitionCheck => ({
  allowed: false,
  rejection,
});

/**
 * Adakah peralihan `from -> to` dibenarkan melalui laluan penutupan normal?
 *
 * `intendedGlobalCompletionChange` / `intendedRollbackStatusChange` menyatakan
 * sama ada pemanggil berhasrat menyentuh medan bebas itu. Sebarang niat
 * sedemikian DITOLAK di sini — verificationResult tidak pernah menggerakkannya.
 */
export function checkVerificationTransition(
  from: unknown,
  to: unknown,
  opts: {
    intendedGlobalCompletionChange?: boolean;
    intendedRollbackStatusChange?: boolean;
  } = {},
): TransitionCheck {
  if (opts.intendedGlobalCompletionChange) {
    return reject("global_completion_mutation_forbidden");
  }
  if (opts.intendedRollbackStatusChange) {
    return reject("rollback_status_mutation_forbidden");
  }
  if (!isVerificationResult(from)) return reject("unknown_source_value");
  if (!isVerificationResult(to)) return reject("unknown_target_value");
  if (from === to) return reject("no_op_transition");

  const allowedTargets = NORMAL_CLOSURE_TRANSITIONS[from];
  if (allowedTargets.includes(to)) return OK;

  // Klasifikasi penolakan tertentu untuk mesej yang jujur.
  if (from === "verified" && to === "pending_post_write") {
    return reject("reopen_forbidden");
  }
  if (from === "verified" && to === "verification_failed") {
    return reject("verified_to_failed_forbidden_normal");
  }
  if (from === "verification_failed" && to === "verified") {
    return reject("recovery_requires_explicit_workflow");
  }
  if (to === "pending_post_write") {
    return reject("reopen_forbidden");
  }
  return reject("recovery_requires_explicit_workflow");
}

export function canTransitionVerification(from: unknown, to: unknown): boolean {
  return checkVerificationTransition(from, to).allowed;
}

/** Melempar apabila peralihan tidak dibenarkan (untuk laluan penguatkuasaan). */
export function assertVerificationTransition(
  from: unknown,
  to: unknown,
  opts?: {
    intendedGlobalCompletionChange?: boolean;
    intendedRollbackStatusChange?: boolean;
  },
): void {
  const check = checkVerificationTransition(from, to, opts);
  if (!check.allowed) {
    throw new VerificationResultError(
      check.rejection ?? "recovery_requires_explicit_workflow",
      `Rejected verificationResult transition ${JSON.stringify(from)} -> ${JSON.stringify(to)}: ${check.rejection}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Ralat bertaip
// ---------------------------------------------------------------------------

export class VerificationResultError extends Error {
  constructor(
    readonly code: "unknown_verification_result" | VerificationTransitionRejection,
    message: string,
  ) {
    super(message);
    this.name = "VerificationResultError";
  }
}

// ---------------------------------------------------------------------------
// Bahagian batch yang relevan dengan kontrak (subset dibaca-sahaja)
// ---------------------------------------------------------------------------

/**
 * Medan batch yang kontrak ini menyentuh. Ini SUBSET dokumen
 * `place_migration_batches` sebenar; ia sengaja tidak menduplikasi keseluruhan
 * checkpoint (yang ditakrif oleh skrip migrasi), hanya medan yang tatakelakuan
 * penutupan bergantung padanya.
 */
export interface VerificationBatchView {
  batchId: string;
  verificationResult: VerificationResult;
  globalCompletion: boolean;
  rollbackStatus: string;
}

/**
 * Baca `verificationResult` daripada dokumen batch mentah dengan selamat.
 * Serasi ke belakang: dokumen pilot sedia ada memegang `"pending_post_write"`
 * dan dihurai tanpa perubahan.
 */
export function readVerificationResult(
  batchDoc: Record<string, unknown>,
): VerificationResult {
  return parseVerificationResult(batchDoc["verificationResult"]);
}

/**
 * Hasilkan medan yang akan ditulis untuk satu peralihan yang disahkan.
 * `globalCompletion` dan `rollbackStatus` SENGAJA tidak disertakan — mereka
 * tidak pernah disentuh oleh peralihan ini.
 */
export function verificationTransitionPatch(
  from: VerificationResult,
  to: VerificationResult,
  at: EpochMillis,
): { verificationResult: VerificationResult; verifiedAt?: EpochMillis } {
  assertVerificationTransition(from, to);
  return to === "verified"
    ? { verificationResult: to, verifiedAt: at }
    : { verificationResult: to };
}
