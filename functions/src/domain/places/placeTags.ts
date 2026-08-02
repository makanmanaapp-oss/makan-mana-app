/** Phase 1.2 — kontrak tag canonical + evidence (bukan senarai taksonomi penuh). */
import { EpochMillis } from "./common";
import { EvidenceLevel, SourceType } from "./placeEnums";

/** Keluarga tag canonical (rujuk PDF Appendix B). */
export const TAG_FAMILIES = [
  "place_type",
  "cuisine",
  "dish",
  "meal_slot",
  "mood_support",
  "service",
  "ambience",
  "health",
  "dietary",
  "allergen",
  "halal_evidence",
  "spice",
  "portion",
  "speed",
  "price",
] as const;
export type TagFamily = (typeof TAG_FAMILIES)[number];

/**
 * Satu tag berbukti. `tagId` mesti ID kanonikal bebas bahasa (bukan label
 * terjemah). Tag keselamatan tidak boleh dicipta dari satu kata kunci ulasan
 * kabur — dikuatkuasa peraturan evidence pada fasa admin (1.5/1.8).
 */
export interface CanonicalTagEvidence {
  tagId: string;
  family: TagFamily;
  evidenceLevel: EvidenceLevel;
  confidence: number; // 0..1
  sourceType: SourceType;
  sourceRecordId?: string;
  verifiedAt?: EpochMillis;
  approvedBy?: string;
}

export interface CanonicalTagSet {
  tags: CanonicalTagEvidence[];
}
