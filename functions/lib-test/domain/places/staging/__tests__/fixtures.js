"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rawProviderPayloadReordered = exports.rawProviderPayload = exports.approvedNotPublishedStagingRecord = exports.rejectedStagingRecord = exports.duplicateCandidateStagingRecord = exports.validStagingRecord = exports.allergenUnknownCandidate = exports.invalidHalalClaimCandidate = exports.unknownHoursCandidate = exports.unknownPriceCandidate = exports.unknownRatingCandidate = exports.missingNameCandidate = exports.validImportBatch = exports.validCommunitySnapshot = exports.validMerchantSnapshot = exports.validOwnerUploadSnapshot = exports.validProviderSnapshot = exports.DAY = exports.T = void 0;
exports.makeValidCandidate = makeValidCandidate;
/** Phase 1.3 — fixtures staging deterministik (data rekaan). */
const index_1 = require("../index");
exports.T = 1_700_000_000_000;
exports.DAY = 86_400_000;
function snapshot(id, sourceType, sourceRecordId) {
    return {
        snapshotId: id,
        importBatchId: "batch_0001",
        sourceType,
        sourceRecordId,
        rawPayloadHash: (0, index_1.hashRawPayload)({ sourceRecordId, sourceType }),
        importedAt: exports.T,
        fetchedAt: exports.T,
        createdBy: "svc_import",
        createdAt: exports.T,
    };
}
exports.validProviderSnapshot = snapshot("snap_prov", "provider", "prov_1");
exports.validOwnerUploadSnapshot = snapshot("snap_owner", "owner_upload", "owner_1");
exports.validMerchantSnapshot = snapshot("snap_merch", "merchant", "merch_1");
exports.validCommunitySnapshot = snapshot("snap_comm", "community", "comm_1");
exports.validImportBatch = {
    importBatchId: "batch_0001",
    sourceType: "provider",
    sourceName: "fixture-provider",
    importedBy: "svc_import",
    importedAt: exports.T,
    recordCount: 1,
    processingStatus: "created",
    validationSummary: {
        totalRecords: 1,
        validRecords: 1,
        invalidRecords: 0,
        warningRecords: 0,
        duplicateCandidateRecords: 0,
    },
    createdAt: exports.T,
    updatedAt: exports.T,
};
function makeValidCandidate(over = {}) {
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
        createdAt: exports.T,
        updatedAt: exports.T,
        ...over,
    };
}
exports.missingNameCandidate = makeValidCandidate({
    candidateId: "cand_noname",
    proposedIdentity: { canonicalName: "", normalizedName: "", alternateNames: [] },
    proposedDisplay: { name: "" },
});
exports.unknownRatingCandidate = makeValidCandidate({
    candidateId: "cand_norating",
    proposedQuality: { rating: undefined, reviewCount: undefined },
});
exports.unknownPriceCandidate = makeValidCandidate({
    candidateId: "cand_noprice",
    proposedCommercial: { priceState: "unknown" },
});
exports.unknownHoursCandidate = makeValidCandidate({
    candidateId: "cand_nohours",
    proposedHours: { hoursState: "unknown" },
});
exports.invalidHalalClaimCandidate = makeValidCandidate({
    candidateId: "cand_halal",
    proposedSafetyEvidence: {
        halal: { state: "certified", evidenceLevel: "unknown" }, // dakwaan > bukti
        dietaryReported: [],
        allergenReported: [],
        allergenEvidenceLevel: "unknown",
    },
});
exports.allergenUnknownCandidate = makeValidCandidate({
    candidateId: "cand_allergen",
    proposedSafetyEvidence: {
        halal: { state: "unknown", evidenceLevel: "unknown" },
        dietaryReported: [],
        allergenReported: [], // kosong — TIDAK boleh disimpul "selamat"
        allergenEvidenceLevel: "unknown",
    },
});
function stagingRecord(id, candidate, reviewStatus, over = {}) {
    return {
        stagingRecordId: id,
        importBatchId: "batch_0001",
        sourceSnapshotId: candidate.sourceSnapshotId,
        candidate,
        reviewStatus,
        validationResult: (0, index_1.validateNormalizedCandidate)(candidate, { now: exports.T, snapshotExists: true }),
        duplicateCandidates: [],
        auditTrail: [],
        createdAt: exports.T,
        updatedAt: exports.T,
        ...over,
    };
}
exports.validStagingRecord = stagingRecord("stg_valid", makeValidCandidate(), "needs_review");
exports.duplicateCandidateStagingRecord = stagingRecord("stg_dup", makeValidCandidate({ candidateId: "cand_dup" }), "duplicate_candidate", {
    duplicateCandidates: [
        { confidence: 0.85, reason: "provider_id_match", candidatePlaceId: "mm_place_x" },
    ],
});
exports.rejectedStagingRecord = stagingRecord("stg_rej", makeValidCandidate({ candidateId: "cand_rej" }), "rejected", { rejectionReason: "low_quality" });
exports.approvedNotPublishedStagingRecord = stagingRecord("stg_appr", makeValidCandidate({ candidateId: "cand_appr" }), "approved", { reviewedBy: "admin_fixture", reviewedAt: exports.T, approvalDecision: "approve" });
/** Raw payloads terkawal untuk ujian normalisasi (dua susunan kunci setara). */
exports.rawProviderPayload = {
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
exports.rawProviderPayloadReordered = {
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
