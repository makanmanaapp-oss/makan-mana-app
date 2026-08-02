/** Phase 1.2 — rujukan sumber (provenance peringkat rekod). */
import { EpochMillis } from "./common";
import { SourceType } from "./placeEnums";

/**
 * Satu rujukan sumber. Menukar format data TIDAK menghapuskan asal sumber —
 * setiap snapshot mengekalkan provenance walaupun app memapar format seragam.
 */
export interface SourceReference {
  sourceType: SourceType;
  sourceRecordId: string;
  providerName?: string;
  providerPlaceId?: string;
  fetchedAt?: EpochMillis;
  verifiedAt?: EpochMillis;
  expiresAt?: EpochMillis;
  licenseId?: string;
  attribution?: string;
}
