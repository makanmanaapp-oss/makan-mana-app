/** Phase 1.2 — kontrak CanonicalPlace (himpunan). Additive; belum dipakai app. */
import { EpochMillis } from "./common";
import {
  PlaceStatus,
  PublicationStatus,
  VerificationStatus,
} from "./placeEnums";
import {
  ApprovedDisplaySnapshot,
  PlaceContacts,
  PlaceIdentity,
  PlaceLocation,
} from "./placeIdentity";
import { SourceReference } from "./placeSource";
import { FieldProvenanceMap } from "./placeProvenance";
import { CanonicalTagSet } from "./placeTags";
import { PlaceMediaSet } from "./placeMedia";
import { PlaceCommercialData } from "./placeCommercial";
import { PlaceHoursData } from "./placeHours";
import { PlaceQualityData } from "./placeQuality";
import { PlaceSafetyEvidence } from "./placeSafetyEvidence";
import { PlaceCompleteness } from "./placeCompleteness";
import { PlaceFreshness } from "./placeFreshness";
import { MergeState, PlaceAlias } from "./placeMerge";

/**
 * Rekod kedai canonical MakanMana — satu identiti pusat + snapshot sumber +
 * intelligence. Nested interfaces eksplisit (bukan satu map tanpa jenis).
 */
export interface CanonicalPlace {
  placeId: string;
  status: PlaceStatus;
  verificationStatus: VerificationStatus;
  publicationStatus: PublicationStatus;

  identity: PlaceIdentity;
  location: PlaceLocation;
  contacts: PlaceContacts;
  providerRefs: SourceReference[];

  displaySnapshot: ApprovedDisplaySnapshot;
  media: PlaceMediaSet;
  commercial: PlaceCommercialData;
  hours: PlaceHoursData;
  quality: PlaceQualityData;

  tagSet: CanonicalTagSet;
  safetyEvidence: PlaceSafetyEvidence;
  provenance: FieldProvenanceMap;
  completeness: PlaceCompleteness;
  freshness: PlaceFreshness;

  mergeState: MergeState;
  aliases: PlaceAlias[];

  createdAt: EpochMillis;
  updatedAt: EpochMillis;
  publishedAt?: EpochMillis;
  publishedVersion?: number;
}
