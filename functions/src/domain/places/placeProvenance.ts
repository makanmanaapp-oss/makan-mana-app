/** Phase 1.2 — provenance peringkat MEDAN (FieldEvidence). */
import { EpochMillis } from "./common";
import { EvidenceLevel, SourceType } from "./placeEnums";

/**
 * Bukti untuk satu medan. `confidence` mesti terikat 0..1 dan `sourceType`
 * mesti sentiasa hadir. `evidenceLevel: "unknown"` kekal eksplisit — kami
 * TIDAK mendakwa nilai bila bukti lemah.
 */
export interface FieldEvidence<T> {
  value: T;
  sourceType: SourceType;
  sourceRecordId?: string;
  evidenceLevel: EvidenceLevel;
  confidence: number; // 0..1
  fetchedAt?: EpochMillis;
  verifiedAt?: EpochMillis;
  expiresAt?: EpochMillis;
  approvedBy?: string;
}

/** Medan yang boleh membawa provenance tersendiri. */
export const PROVENANCE_FIELDS = [
  "displayName",
  "address",
  "coordinates",
  "phone",
  "website",
  "price",
  "rating",
  "reviewCount",
  "openingHours",
  "businessStatus",
  "halalEvidence",
  "dietaryEvidence",
  "allergenEvidence",
  "media",
  "tags",
] as const;
export type ProvenanceField = (typeof PROVENANCE_FIELDS)[number];

/** Peta provenance per-medan (semua pilihan; additive). */
export type FieldProvenanceMap = {
  [K in ProvenanceField]?: FieldEvidence<unknown>;
};
