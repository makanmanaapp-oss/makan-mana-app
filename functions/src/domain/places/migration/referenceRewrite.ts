/**
 * Phase 1.12 Part H — pratonton penulisan semula rujukan.
 *
 * Dalam fasa ini ini adalah PRATONTON. Pelaksanaan hanya dibenarkan dalam
 * emulator untuk ujian. Nilai legasi SENTIASA dikekalkan bersama ID canonical
 * — tiada penggantian merosakkan tanpa metadata sandaran.
 */
import { EpochMillis } from "../common";
import { hashCanonical } from "../staging/hashing";
import { LegacyReferencePointer } from "./legacyInventory";
import { ReferenceKind, RewriteStatus, RewriteType } from "./migrationTypes";

export interface ReferenceRewritePlan {
  rewriteId: string;
  sourcePath: string;
  sourceDocumentId: string;
  fieldPath: string;
  legacyPlaceId: string;
  canonicalPlaceId: string;
  /**
   * true = nilai legasi kekal dalam dokumen bersama ID canonical.
   * Ini SENTIASA benar dalam fasa ini — tanpa ia, rollback mustahil.
   */
  aliasPreserved: boolean;
  rewriteType: RewriteType;
  /** Rujukan kritikal adalah wajib: pelan tidak boleh melangkauinya. */
  required: boolean;
  status: RewriteStatus;
  reason: string;
  createdAt: EpochMillis;
}

const KIND_TO_TYPE: Readonly<Record<ReferenceKind, RewriteType>> = {
  favorite: "favorite_reference",
  meal: "meal_reference",
  history: "history_reference",
  suggestion: "suggestion_reference",
  session: "session_reference",
  deep_link: "deep_link_reference",
  correction: "correction_reference",
  other: "other_reference",
};

/** Rujukan yang MESTI ditulis semula supaya data pengguna tidak pecah. */
const REQUIRED_TYPES: readonly RewriteType[] = [
  "favorite_reference",
  "meal_reference",
  "deep_link_reference",
];

function documentIdOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function buildReferenceRewrite(
  pointer: LegacyReferencePointer,
  legacyPlaceId: string,
  canonicalPlaceId: string,
  now: EpochMillis,
): ReferenceRewritePlan {
  const rewriteType = KIND_TO_TYPE[pointer.kind];
  const known = pointer.kind !== "other";
  return {
    rewriteId: `RWR-${hashCanonical({
      path: pointer.path,
      fieldPath: pointer.fieldPath,
      legacyPlaceId,
    }).slice(0, 24)}`,
    sourcePath: pointer.path,
    sourceDocumentId: documentIdOf(pointer.path),
    fieldPath: pointer.fieldPath,
    legacyPlaceId,
    canonicalPlaceId,
    // Nilai legasi tidak pernah dibuang — inilah yang menjadikan rollback selamat.
    aliasPreserved: true,
    rewriteType,
    required: REQUIRED_TYPES.includes(rewriteType),
    // Laluan yang tidak dikenali tidak boleh dipratonton sebagai boleh ditulis.
    status: known ? "preview" : "held",
    reason: known ? "preview_only_no_production_write" : "unknown_reference_path",
    createdAt: now,
  };
}

export interface RewritePreviewResult {
  rewrites: ReferenceRewritePlan[];
  /** Rujukan yang tidak dapat dipetakan dengan selamat. */
  unresolved: ReferenceRewritePlan[];
}

/**
 * Bina pratonton bagi semua penunjuk yang mengarah kepada satu ID legasi.
 * Output diisih supaya pelan deterministik.
 */
export function buildRewritePreview(
  pointers: readonly LegacyReferencePointer[],
  legacyPlaceId: string,
  canonicalPlaceId: string,
  now: EpochMillis,
): RewritePreviewResult {
  const rewrites = pointers
    .map((p) => buildReferenceRewrite(p, legacyPlaceId, canonicalPlaceId, now))
    .sort((a, b) => a.rewriteId.localeCompare(b.rewriteId));
  return {
    rewrites: rewrites.filter((r) => r.status === "preview"),
    unresolved: rewrites.filter((r) => r.status === "held"),
  };
}

/**
 * Tandakan penulisan semula sebagai dilaksanakan dalam emulator. Nilai legasi
 * kekal — hanya statusnya berubah.
 */
export function markRewriteAppliedInEmulator(
  rewrite: ReferenceRewritePlan,
): ReferenceRewritePlan {
  return {
    ...rewrite,
    status: "applied_in_emulator",
    reason: "emulator_only_execution",
  };
}

export function markRewriteRolledBack(
  rewrite: ReferenceRewritePlan,
): ReferenceRewritePlan {
  return {
    ...rewrite,
    status: "rolled_back",
    reason: "restored_from_preserved_legacy_value",
  };
}
