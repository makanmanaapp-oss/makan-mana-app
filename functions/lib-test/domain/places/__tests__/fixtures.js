"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.placeWithUnknownHours = exports.placeWithUnknownPrice = exports.placeWithUnknownRating = exports.mergedAliasPlace = exports.communityUnverifiedPlace = exports.draftPlace = exports.permanentlyClosedPlace = exports.partiallyCompletePlace = exports.completeVerifiedPlace = exports.fieldProvenanceFixture = exports.basicTagSet = exports.communitySourceReference = exports.merchantSourceReference = exports.providerSourceReference = exports.DAY = exports.T = void 0;
exports.makeBasePlace = makeBasePlace;
/**
 * Phase 1.2 — fixtures ujian deterministik untuk domain canonical place.
 * Data rekaan (bukan pengguna/kedai produksi sebenar). Masa = pemalar T.
 */
const index_1 = require("../index");
/** Titik masa tetap (epoch ms) untuk semua fixture. */
exports.T = 1_700_000_000_000;
exports.DAY = 86_400_000;
exports.providerSourceReference = {
    sourceType: "provider",
    sourceRecordId: "prov_rec_001",
    providerName: "google_places",
    providerPlaceId: "ChIJ_fixture_0001",
    fetchedAt: exports.T,
    expiresAt: exports.T + 7 * exports.DAY,
};
exports.merchantSourceReference = {
    sourceType: "merchant",
    sourceRecordId: "merch_rec_001",
    verifiedAt: exports.T,
};
exports.communitySourceReference = {
    sourceType: "community",
    sourceRecordId: "comm_rec_001",
};
exports.basicTagSet = {
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
exports.fieldProvenanceFixture = {
    displayName: {
        value: "Warung Fixture Satu",
        sourceType: "provider",
        evidenceLevel: "verified",
        confidence: 0.95,
        fetchedAt: exports.T,
    },
    rating: {
        value: 4.5,
        sourceType: "provider",
        evidenceLevel: "reported",
        confidence: 0.6,
        fetchedAt: exports.T,
    },
};
const highCompleteness = (0, index_1.calculatePlaceCompleteness)({
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
const lowCompleteness = (0, index_1.calculatePlaceCompleteness)({
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
function makeBasePlace() {
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
        providerRefs: [exports.providerSourceReference],
        displaySnapshot: {
            name: "Warung Fixture Satu",
            address: "Fixture St 1",
            approvedAt: exports.T,
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
        tagSet: exports.basicTagSet,
        safetyEvidence: {
            halal: { state: "unknown", evidenceLevel: "unknown" },
            dietaryReported: [],
            allergenReported: [],
            allergenEvidenceLevel: "unknown",
        },
        provenance: exports.fieldProvenanceFixture,
        completeness: highCompleteness,
        freshness: {
            businessStatus: {
                fetchedAt: exports.T,
                staleAfter: exports.T + 3_600_000,
                expiresAt: exports.T + 7 * exports.DAY,
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
                createdAt: exports.T,
                reason: "legacy_google_place_id",
            },
        ],
        createdAt: exports.T,
        updatedAt: exports.T,
        publishedAt: exports.T,
        publishedVersion: 1,
    };
}
exports.completeVerifiedPlace = makeBasePlace();
exports.partiallyCompletePlace = {
    ...makeBasePlace(),
    placeId: "mm_place_0002",
    verificationStatus: "source_verified",
    completeness: lowCompleteness,
};
exports.permanentlyClosedPlace = {
    ...makeBasePlace(),
    placeId: "mm_place_0003",
    status: "permanently_closed",
};
exports.draftPlace = {
    ...makeBasePlace(),
    placeId: "mm_place_0004",
    publicationStatus: "draft",
};
exports.communityUnverifiedPlace = {
    ...makeBasePlace(),
    placeId: "mm_place_0005",
    status: "community_unverified",
    verificationStatus: "community_reported",
};
exports.mergedAliasPlace = {
    ...makeBasePlace(),
    placeId: "mm_place_0006",
    mergeState: {
        mergeStatus: "merged",
        duplicateOf: "mm_place_0001",
        mergedAt: exports.T,
        mergedBy: "admin_fixture",
        preservedSourceRefs: [exports.providerSourceReference],
    },
};
exports.placeWithUnknownRating = (() => {
    const p = makeBasePlace();
    p.placeId = "mm_place_0007";
    p.quality = { rating: undefined, reviewCount: undefined };
    return p;
})();
exports.placeWithUnknownPrice = (() => {
    const p = makeBasePlace();
    p.placeId = "mm_place_0008";
    p.commercial = { priceState: "unknown" };
    return p;
})();
exports.placeWithUnknownHours = (() => {
    const p = makeBasePlace();
    p.placeId = "mm_place_0009";
    p.hours = { hoursState: "unknown" };
    return p;
})();
