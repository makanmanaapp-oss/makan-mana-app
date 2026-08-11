/**
 * Phase 1.2 — fixtures ujian deterministik untuk domain canonical place.
 * Data rekaan (bukan pengguna/kedai produksi sebenar). Masa = pemalar T.
 */
import {
  CanonicalPlace,
  CanonicalTagSet,
  FieldProvenanceMap,
  PlaceCompleteness,
  SourceReference,
  calculatePlaceCompleteness,
} from "../index";

/** Titik masa tetap (epoch ms) untuk semua fixture. */
export const T = 1_700_000_000_000;
export const DAY = 86_400_000;

export const providerSourceReference: SourceReference = {
  sourceType: "provider",
  sourceRecordId: "prov_rec_001",
  providerName: "google_places",
  providerPlaceId: "ChIJ_fixture_0001",
  fetchedAt: T,
  expiresAt: T + 7 * DAY,
};

export const merchantSourceReference: SourceReference = {
  sourceType: "merchant",
  sourceRecordId: "merch_rec_001",
  verifiedAt: T,
};

export const communitySourceReference: SourceReference = {
  sourceType: "community",
  sourceRecordId: "comm_rec_001",
};

export const basicTagSet: CanonicalTagSet = {
  tags: [
    {
      tagId: "restaurant",
      family: "place_type",
      evidenceLevel: "verified",
      confidence: 0.9,
      sourceType: "makanmana",
    },
    {
      tagId: "malay",
      family: "cuisine",
      evidenceLevel: "reported",
      confidence: 0.7,
      sourceType: "community",
      sourceRecordId: "comm_rec_001",
    },
  ],
};

export const fieldProvenanceFixture: FieldProvenanceMap = {
  displayName: {
    value: "Warung Fixture Satu",
    sourceType: "provider",
    evidenceLevel: "verified",
    confidence: 0.95,
    fetchedAt: T,
  },
  rating: {
    value: 4.5,
    sourceType: "provider",
    evidenceLevel: "reported",
    confidence: 0.6,
    fetchedAt: T,
  },
};

const highCompleteness: PlaceCompleteness = calculatePlaceCompleteness({
  identityCompleteness: 0.9,
  locationCompleteness: 0.95,
  displayCompleteness: 0.9,
  commercialCompleteness: 0.85,
  hoursCompleteness: 0.9,
  qualityCompleteness: 0.9,
  tagCompleteness: 0.85,
  provenanceCompleteness: 0.9,
  safetyEvidenceCompleteness: 0.5,
});

const lowCompleteness: PlaceCompleteness = calculatePlaceCompleteness({
  identityCompleteness: 0.5,
  locationCompleteness: 0.5,
  displayCompleteness: 0.5,
  commercialCompleteness: 0.5,
  hoursCompleteness: 0.5,
  qualityCompleteness: 0.5,
  tagCompleteness: 0.5,
  provenanceCompleteness: 0.5,
  safetyEvidenceCompleteness: 0.3,
});

/** Kilang asas — kedai canonical SAH & LENGKAP. */
export function makeBasePlace(): CanonicalPlace {
  return {
    placeId: "mm_place_0001",
    status: "active",
    verificationStatus: "admin_verified",
    publicationStatus: "published",
    identity: {
      canonicalName: "Warung Fixture Satu",
      normalizedName: "warung fixture satu",
      alternateNames: ["Warung Fixture 1"],
      branchName: "SS2",
    },
    location: {
      lat: 3.1189,
      lng: 101.6252,
      address: "Fixture St 1",
      locality: "Petaling Jaya",
      state: "Selangor",
      countryCode: "MY",
      postalCode: "47300",
    },
    contacts: { phones: ["+60312345678"], website: "https://example.test" },
    providerRefs: [providerSourceReference],
    displaySnapshot: {
      name: "Warung Fixture Satu",
      address: "Fixture St 1",
      approvedAt: T,
      approvedBy: "admin_fixture",
    },
    media: {
      canonicalMediaId: "media_001",
      items: [
        {
          mediaId: "media_001",
          url: "https://example.test/img.jpg",
          status: "approved",
          sourceType: "provider",
          isFallback: false,
        },
      ],
    },
    commercial: {
      priceState: "verified",
      priceBandId: "moderate",
      averageSpend: 18,
      currency: "MYR",
    },
    hours: {
      hoursState: "known",
      periods: [{ openMinuteOfWeek: 600, closeMinuteOfWeek: 1320 }],
    },
    quality: { rating: 4.5, reviewCount: 230, ratingSource: "provider" },
    tagSet: basicTagSet,
    safetyEvidence: {
      halal: { state: "unknown", evidenceLevel: "unknown" },
      dietaryReported: [],
      allergenReported: [],
      allergenEvidenceLevel: "unknown",
    },
    provenance: fieldProvenanceFixture,
    completeness: highCompleteness,
    freshness: {
      businessStatus: {
        fetchedAt: T,
        staleAfter: T + 3_600_000,
        expiresAt: T + 7 * DAY,
        state: "fresh",
      },
    },
    mergeState: { mergeStatus: "none", preservedSourceRefs: [] },
    aliases: [
      {
        aliasId: "alias_google_001",
        canonicalPlaceId: "mm_place_0001",
        aliasType: "google_place_id",
        sourceType: "provider",
        sourceRecordId: "ChIJ_fixture_0001",
        createdAt: T,
        reason: "legacy_google_place_id",
      },
    ],
    createdAt: T,
    updatedAt: T,
    publishedAt: T,
    publishedVersion: 1,
  };
}

export const completeVerifiedPlace: CanonicalPlace = makeBasePlace();

export const partiallyCompletePlace: CanonicalPlace = {
  ...makeBasePlace(),
  placeId: "mm_place_0002",
  verificationStatus: "source_verified",
  completeness: lowCompleteness,
};

export const permanentlyClosedPlace: CanonicalPlace = {
  ...makeBasePlace(),
  placeId: "mm_place_0003",
  status: "permanently_closed",
};

export const draftPlace: CanonicalPlace = {
  ...makeBasePlace(),
  placeId: "mm_place_0004",
  publicationStatus: "draft",
};

export const communityUnverifiedPlace: CanonicalPlace = {
  ...makeBasePlace(),
  placeId: "mm_place_0005",
  status: "community_unverified",
  verificationStatus: "community_reported",
};

export const mergedAliasPlace: CanonicalPlace = {
  ...makeBasePlace(),
  placeId: "mm_place_0006",
  mergeState: {
    mergeStatus: "merged",
    duplicateOf: "mm_place_0001",
    mergedAt: T,
    mergedBy: "admin_fixture",
    preservedSourceRefs: [providerSourceReference],
  },
};

export const placeWithUnknownRating: CanonicalPlace = (() => {
  const p = makeBasePlace();
  p.placeId = "mm_place_0007";
  p.quality = { rating: undefined, reviewCount: undefined };
  return p;
})();

export const placeWithUnknownPrice: CanonicalPlace = (() => {
  const p = makeBasePlace();
  p.placeId = "mm_place_0008";
  p.commercial = { priceState: "unknown" };
  return p;
})();

export const placeWithUnknownHours: CanonicalPlace = (() => {
  const p = makeBasePlace();
  p.placeId = "mm_place_0009";
  p.hours = { hoursState: "unknown" };
  return p;
})();
