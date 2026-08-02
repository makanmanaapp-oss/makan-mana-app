/**
 * Phase 1.2 — bukti keselamatan (halal/diet/alahan) SEBAGAI DATA sahaja.
 * Formula keselamatan/pemilihan dibuat dalam Part 2 (tidak disentuh).
 * Wording jujur dikuatkuasa pada lapisan kad (Phase 1.9).
 */
import { EvidenceLevel, HalalEvidenceState, SourceType } from "./placeEnums";

export interface HalalEvidence {
  state: HalalEvidenceState;
  evidenceLevel: EvidenceLevel;
  sourceType?: SourceType;
}

export interface PlaceSafetyEvidence {
  halal: HalalEvidence;
  /** ID tag dietary canonical yang DILAPORKAN (bukan dijamin). */
  dietaryReported: string[];
  /** ID tag allergen canonical yang DILAPORKAN (bukan "selamat"). */
  allergenReported: string[];
  allergenEvidenceLevel: EvidenceLevel;
}
