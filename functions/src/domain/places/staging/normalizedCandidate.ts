/** Phase 1.3 — calon dinormalkan (BUKAN lagi CanonicalPlace). */
import { EpochMillis } from "../common";
import { FieldProvenanceMap } from "../placeProvenance";
import { PlaceContacts, PlaceIdentity } from "../placeIdentity";
import { PlaceCommercialData } from "../placeCommercial";
import { PlaceHoursData } from "../placeHours";
import { PlaceQualityData } from "../placeQuality";
import { PlaceSafetyEvidence } from "../placeSafetyEvidence";
import { CanonicalTagSet } from "../placeTags";

/** Lokasi dicadang — lat/lng PILIHAN (calon mungkin belum ada koordinat). */
export interface ProposedLocation {
  lat?: number;
  lng?: number;
  address?: string;
  locality?: string;
  state?: string;
  countryCode?: string;
  postalCode?: string;
}

export interface ProposedDisplay {
  name: string;
  address?: string;
}

/**
 * Calon dinormalkan daripada satu snapshot sumber. Nilai tidak diketahui
 * KEKAL eksplisit: rating/reviewCount undefined, priceState/hoursState
 * "unknown". Halal TIDAK dinaik taraf melebihi bukti sumber; keselamatan
 * alahan TIDAK diandaikan daripada ketiadaan data.
 */
export interface NormalizedPlaceCandidate {
  candidateId: string;
  sourceSnapshotId: string;
  importBatchId?: string;
  proposedIdentity: PlaceIdentity;
  proposedLocation: ProposedLocation;
  proposedContacts: PlaceContacts;
  proposedDisplay: ProposedDisplay;
  proposedCommercial: PlaceCommercialData;
  proposedHours: PlaceHoursData;
  proposedQuality: PlaceQualityData;
  proposedTags: CanonicalTagSet;
  proposedSafetyEvidence: PlaceSafetyEvidence;
  fieldEvidence: FieldProvenanceMap;
  normalizationWarnings: string[];
  normalizationErrors: string[];
  candidateConfidence: number; // 0..1
  createdAt: EpochMillis;
  updatedAt: EpochMillis;
}

/**
 * Medan penerbitan DILARANG hadir dalam input staging (rekod staging tidak
 * boleh membawa keadaan penerbitan). Digunakan oleh pengesahan.
 */
export const FORBIDDEN_PUBLICATION_FIELDS = [
  "publicationStatus",
  "publishedAt",
  "publishedVersion",
] as const;
