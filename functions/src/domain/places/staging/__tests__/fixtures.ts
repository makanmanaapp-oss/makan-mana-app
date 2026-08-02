/** Phase 1.3 — fixtures staging deterministik (data rekaan). */
import {
  NormalizedPlaceCandidate,
  PlaceImportBatch,
  PlaceSourceSnapshot,
  PlaceStagingRecord,
  hashRawPayload,
  validateNormalizedCandidate,
} from "../index";
import { SourceType } from "../../placeEnums";

export const T = 1_700_000_000_000;
export const DAY = 86_400_000;

function snapshot(
  id: string,
  sourceType: SourceType,
  sourceRecordId: string,
): PlaceSourceSnapshot {
  return {
    snapshotId: id,
    importBatchId: "batch_0001",
    sourceType,
    sourceRecordId,
    rawPayloadHash: hashRawPayload({ sourceRecordId, sourceType }),
    importedAt: T,
    fetchedAt: T,
    createdBy: "svc_import",
    createdAt: T,
  };
}

export const validProviderSnapshot = snapshot("snap_prov", "provider", "prov_1");
export const validOwnerUploadSnapshot = snapshot("snap_owner", "owner_upload", "owner_1");
export const validMerchantSnapshot = snapshot("snap_merch", "merchant", "merch_1");
export const validCommunitySnapshot = snapshot("snap_comm", "community", "comm_1");

export const validImportBatch: PlaceImportBatch = {
  importBatchId: "batch_0001",
  sourceType: "provider",
  sourceName: "fixture-provider",
  importedBy: "svc_import",
  importedAt: T,
  recordCount: 1,
  processingStatus: "created",
  validationSummary: {
    totalRecords: 1,
    validRecords: 1,
    invalidRecords: 0,
    warningRecords: 0,
    duplicateCandidateRecords: 0,
  },
  createdAt: T,
  updatedAt: T,
};

export function makeValidCandidate(
  over: Partial<NormalizedPlaceCandidate> = {},
): NormalizedPlaceCandidate {
  return {
    candidateId: "cand_0001",
    sourceSnapshotId: "snap_prov",
    importBatchId: "batch_0001",
    proposedIdentity: {
      canonicalName: "Warung Uji Satu",
      normalizedName: "warung uji satu",
      alternateNames: [],
    },
    proposedLocation: { lat: 3.1189, lng: 101.6252, address: "Uji St 1" },
    proposedContacts: { phones: ["+60312345678"] },
    proposedDisplay: { name: "Warung Uji Satu", address: "Uji St 1" },
    proposedCommercial: { priceState: "verified", priceBandId: "moderate" },
    proposedHours: {
      hoursState: "known",
      periods: [{ openMinuteOfWeek: 600, closeMinuteOfWeek: 1320 }],
    },
    proposedQuality: { rating: 4.4, reviewCount: 120, ratingSource: "provider" },
    proposedTags: {
      tags: [
        {
          tagId: "restaurant",
          family: "place_type",
          evidenceLevel: "reported",
          confidence: 0.7,
          sourceType: "provider",
        },
      ],
    },
    proposedSafetyEvidence: {
      halal: { state: "unknown", evidenceLevel: "unknown" },
      dietaryReported: [],
      allergenReported: [],
      allergenEvidenceLevel: "unknown",
    },
    fieldEvidence: {},
    normalizationWarnings: [],
    normalizationErrors: [],
    candidateConfidence: 0.8,
    createdAt: T,
    updatedAt: T,
    ...over,
  };
}

export const missingNameCandidate = makeValidCandidate({
  candidateId: "cand_noname",
  proposedIdentity: { canonicalName: "", normalizedName: "", alternateNames: [] },
  proposedDisplay: { name: "" },
});

export const unknownRatingCandidate = makeValidCandidate({
  candidateId: "cand_norating",
  proposedQuality: { rating: undefined, reviewCount: undefined },
});

export const unknownPriceCandidate = makeValidCandidate({
  candidateId: "cand_noprice",
  proposedCommercial: { priceState: "unknown" },
});

export const unknownHoursCandidate = makeValidCandidate({
  candidateId: "cand_nohours",
  proposedHours: { hoursState: "unknown" },
});

export const invalidHalalClaimCandidate = makeValidCandidate({
  candidateId: "cand_halal",
  proposedSafetyEvidence: {
    halal: { state: "certified", evidenceLevel: "unknown" }, // dakwaan > bukti
    dietaryReported: [],
    allergenReported: [],
    allergenEvidenceLevel: "unknown",
  },
});

export const allergenUnknownCandidate = makeValidCandidate({
  candidateId: "cand_allergen",
  proposedSafetyEvidence: {
    halal: { state: "unknown", evidenceLevel: "unknown" },
    dietaryReported: [],
    allergenReported: [], // kosong — TIDAK boleh disimpul "selamat"
    allergenEvidenceLevel: "unknown",
  },
});

function stagingRecord(
  id: string,
  candidate: NormalizedPlaceCandidate,
  reviewStatus: PlaceStagingRecord["reviewStatus"],
  over: Partial<PlaceStagingRecord> = {},
): PlaceStagingRecord {
  return {
    stagingRecordId: id,
    importBatchId: "batch_0001",
    sourceSnapshotId: candidate.sourceSnapshotId,
    candidate,
    reviewStatus,
    validationResult: validateNormalizedCandidate(candidate, { now: T, snapshotExists: true }),
    duplicateCandidates: [],
    auditTrail: [],
    createdAt: T,
    updatedAt: T,
    ...over,
  };
}

export const validStagingRecord = stagingRecord(
  "stg_valid",
  makeValidCandidate(),
  "needs_review",
);

export const duplicateCandidateStagingRecord = stagingRecord(
  "stg_dup",
  makeValidCandidate({ candidateId: "cand_dup" }),
  "duplicate_candidate",
  {
    duplicateCandidates: [
      { confidence: 0.85, reason: "provider_id_match", candidatePlaceId: "mm_place_x" },
    ],
  },
);

export const rejectedStagingRecord = stagingRecord(
  "stg_rej",
  makeValidCandidate({ candidateId: "cand_rej" }),
  "rejected",
  { rejectionReason: "low_quality" },
);

export const approvedNotPublishedStagingRecord = stagingRecord(
  "stg_appr",
  makeValidCandidate({ candidateId: "cand_appr" }),
  "approved",
  { reviewedBy: "admin_fixture", reviewedAt: T, approvalDecision: "approve" },
);

/** Raw payloads terkawal untuk ujian normalisasi (dua susunan kunci setara). */
export const rawProviderPayload: Record<string, unknown> = {
  name: "Kedai Normalize",
  lat: 3.2,
  lng: 101.7,
  phone: "+60311112222",
  address: "Jalan Normalize 3",
  priceState: "verified",
  rating: 4.2,
  reviewCount: 88,
  placeTypeTagId: "restaurant",
  cuisineTagId: "malay",
  hasHours: true,
};

export const rawProviderPayloadReordered: Record<string, unknown> = {
  hasHours: true,
  cuisineTagId: "malay",
  placeTypeTagId: "restaurant",
  reviewCount: 88,
  rating: 4.2,
  priceState: "verified",
  address: "Jalan Normalize 3",
  phone: "+60311112222",
  lng: 101.7,
  lat: 3.2,
  name: "Kedai Normalize",
};
