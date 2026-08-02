/**
 * Phase 1.14A — KONTRAK storan bukti pembetulan (SEDIA UNTUK MASA DEPAN).
 *
 * Muat naik bukti LANGSUNG belum dibina/di-deploy. Modul ini mentakrifkan
 * kontrak selamat + pengesah supaya rules Storan dan callable boleh disemak
 * lebih awal. TIADA I/O di sini.
 *
 * KESELAMATAN: hanya jenis imej disokong; had saiz/bilangan ketat; tiada URL
 * awam secara lalai; metadata sahaja disimpan (bukan kandungan mentah dalam
 * Firestore).
 */
export const ALLOWED_EVIDENCE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;
export type AllowedEvidenceMime = (typeof ALLOWED_EVIDENCE_MIME)[number];

export const EVIDENCE_LIMITS = {
  maxBytes: 8 * 1024 * 1024, // 8 MB setiap fail
  maxFilesPerSubmission: 5,
  minBytes: 64,
} as const;

export const EVIDENCE_MODERATION_STATUSES = [
  "pending_scan",
  "approved",
  "rejected",
  "quarantined",
] as const;
export type EvidenceModerationStatus = (typeof EVIDENCE_MODERATION_STATUSES)[number];

/** Metadata bukti yang DISIMPAN (bukan kandungan). Tiada URL awam lalai. */
export interface EvidenceStorageMetadata {
  ownerUid: string;
  submissionId: string;
  storagePath: string;
  contentType: AllowedEvidenceMime;
  byteSize: number;
  checksumSha256: string;
  uploadedAt: number;
  moderationStatus: EvidenceModerationStatus;
}

export interface EvidenceValidationResult {
  valid: boolean;
  errors: string[];
}

/** Sahkan metadata SATU fail bukti terhadap kontrak. TULEN. */
export function validateEvidenceMetadata(
  meta: Partial<EvidenceStorageMetadata>,
): EvidenceValidationResult {
  const errors: string[] = [];
  if (!meta.ownerUid) errors.push("owner_required");
  if (!meta.submissionId) errors.push("submission_required");
  if (!meta.storagePath || !meta.storagePath.startsWith(`corrections/${meta.submissionId ?? ""}/`)) {
    errors.push("invalid_storage_path");
  }
  if (!meta.contentType || !(ALLOWED_EVIDENCE_MIME as readonly string[]).includes(meta.contentType)) {
    errors.push("unsupported_content_type");
  }
  if (meta.byteSize === undefined || meta.byteSize < EVIDENCE_LIMITS.minBytes) {
    errors.push("file_too_small");
  } else if (meta.byteSize > EVIDENCE_LIMITS.maxBytes) {
    errors.push("file_too_large");
  }
  if (!meta.checksumSha256 || meta.checksumSha256.length < 32) errors.push("invalid_checksum");
  return {valid: errors.length === 0, errors};
}

/** Sahkan bilangan fail per penghantaran. */
export function validateEvidenceCount(count: number): EvidenceValidationResult {
  return count <= EVIDENCE_LIMITS.maxFilesPerSubmission
    ? {valid: true, errors: []}
    : {valid: false, errors: ["too_many_files"]};
}
