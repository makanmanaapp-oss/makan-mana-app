"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenericProviderNormalizer = void 0;
/**
 * Phase 1.3 — asas saluran normalisasi (tulen). HANYA adapter generik/provider
 * terkawal (cukup untuk fixture). Parser Google/CSV/PDF penuh = fasa kemudian.
 * TIDAK PERNAH mereka harga/rating/waktu/halal/alahan.
 */
const common_1 = require("../common");
const placeCommercial_1 = require("../placeCommercial");
const hashing_1 = require("./hashing");
function str(v) {
    if (typeof v !== "string")
        return undefined;
    const s = v.trim();
    return s.length > 0 ? s : undefined;
}
function normalizeName(name) {
    return name.toLowerCase().replace(/\s+/g, " ").trim();
}
/** Adapter generik: memetakan raw terkawal → calon sedar-bukti. Deterministik. */
class GenericProviderNormalizer {
    normalize(input) {
        const { snapshot, raw, now, candidateId } = input;
        const errors = [];
        const warnings = [];
        const name = str(raw.name) ?? str(raw.displayName);
        if (!name)
            errors.push("missing_name");
        const safeName = name ?? "";
        const location = {};
        if ((0, common_1.isFiniteNumber)(raw.lat) && (0, common_1.isFiniteNumber)(raw.lng) && (0, common_1.isValidLatLng)(raw.lat, raw.lng)) {
            location.lat = raw.lat;
            location.lng = raw.lng;
        }
        else {
            warnings.push("missing_or_invalid_coordinates");
        }
        const address = str(raw.address);
        if (address)
            location.address = address;
        const phones = [];
        const phone = str(raw.phone);
        if (phone)
            phones.push(phone);
        const website = str(raw.website);
        // Harga: hanya guna keadaan sah yang DIBERI — jangan reka.
        const priceState = placeCommercial_1.PRICE_DISPLAY_STATES.includes(raw.priceState)
            ? raw.priceState
            : "unknown";
        if (priceState === "unknown")
            warnings.push("price_unknown");
        // Waktu: hanya "known" bila sumber sahkan; jika tidak "unknown".
        const hoursKnown = raw.hasHours === true;
        if (!hoursKnown)
            warnings.push("hours_unknown");
        // Rating/ulasan: kekal undefined bila tiada/tidak sah.
        const rating = (0, common_1.isFiniteNumber)(raw.rating) && raw.rating >= 0 && raw.rating <= 5
            ? raw.rating
            : undefined;
        const reviewCount = (0, common_1.isFiniteNumber)(raw.reviewCount) && raw.reviewCount >= 0
            ? Math.floor(raw.reviewCount)
            : undefined;
        const tags = [];
        for (const [key, family] of [
            ["placeTypeTagId", "place_type"],
            ["cuisineTagId", "cuisine"],
        ]) {
            const id = str(raw[key]);
            if (id && (0, common_1.isCanonicalId)(id)) {
                tags.push({
                    tagId: id,
                    family,
                    evidenceLevel: "reported",
                    confidence: 0.6,
                    sourceType: snapshot.sourceType,
                    sourceRecordId: snapshot.sourceRecordId,
                });
            }
            else if (id && !(0, common_1.isCanonicalId)(id)) {
                warnings.push(`non_canonical_tag_dropped:${key}`);
            }
        }
        // Keyakinan deterministik ikut kehadiran medan.
        let confidence = 0.3;
        if (name)
            confidence += 0.1;
        if (location.lat !== undefined)
            confidence += 0.25;
        if (phones.length > 0)
            confidence += 0.1;
        if (rating !== undefined)
            confidence += 0.15;
        if (priceState === "verified")
            confidence += 0.1;
        if (tags.length > 0)
            confidence += 0.1;
        confidence = (0, common_1.clamp01)(Math.round(confidence * 100) / 100);
        const candidate = {
            candidateId,
            sourceSnapshotId: snapshot.snapshotId,
            importBatchId: snapshot.importBatchId,
            proposedIdentity: {
                canonicalName: safeName,
                normalizedName: normalizeName(safeName),
                alternateNames: [],
            },
            proposedLocation: location,
            proposedContacts: { phones, website },
            proposedDisplay: { name: safeName, address },
            proposedCommercial: { priceState },
            proposedHours: { hoursState: hoursKnown ? "known" : "unknown" },
            proposedQuality: { rating, reviewCount, ratingSource: rating !== undefined ? snapshot.sourceType : undefined },
            proposedTags: { tags },
            proposedSafetyEvidence: {
                halal: { state: "unknown", evidenceLevel: "unknown" },
                dietaryReported: [],
                allergenReported: [],
                allergenEvidenceLevel: "unknown",
            },
            fieldEvidence: {
                displayName: {
                    value: safeName,
                    sourceType: snapshot.sourceType,
                    sourceRecordId: snapshot.sourceRecordId,
                    evidenceLevel: "reported",
                    confidence: 0.7,
                    fetchedAt: snapshot.fetchedAt,
                },
                ...(rating !== undefined
                    ? {
                        rating: {
                            value: rating,
                            sourceType: snapshot.sourceType,
                            evidenceLevel: "reported",
                            confidence: 0.6,
                            fetchedAt: snapshot.fetchedAt,
                        },
                    }
                    : {}),
            },
            normalizationWarnings: warnings,
            normalizationErrors: errors,
            candidateConfidence: confidence,
            createdAt: now,
            updatedAt: now,
        };
        return {
            candidate,
            errors,
            warnings,
            candidateHash: (0, hashing_1.hashNormalizedCandidate)({
                ...candidate,
                createdAt: 0,
                updatedAt: 0,
            }),
        };
    }
}
exports.GenericProviderNormalizer = GenericProviderNormalizer;
