"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.legacyContentHash = legacyContentHash;
exports.legacyRecordId = legacyRecordId;
exports.buildInventoryRecord = buildInventoryRecord;
exports.buildLegacyInventory = buildLegacyInventory;
exports.groupByLegacyPlaceId = groupByLegacyPlaceId;
exports.inventoryHash = inventoryHash;
/**
 * Phase 1.12 Part A — inventori kedai legasi (BACA SAHAJA).
 *
 * Inventori memerhati data legasi dan merekod apa yang dilihatnya. Ia TIDAK
 * PERNAH menulis, mengubah suai atau memadam dokumen legasi. Setiap rekod
 * membawa laluan dokumen asalnya supaya jejak balik sentiasa mungkin.
 */
const common_1 = require("../common");
const hashing_1 = require("../staging/hashing");
/**
 * Medan yang menyumbang kepada cincang kandungan. Masa penemuan SENGAJA
 * dikecualikan supaya mengimbas semula data yang sama menghasilkan cincang
 * yang sama (dry-run mesti idempoten).
 */
function hashableContent(input) {
    return {
        legacyCollection: input.legacyCollection,
        legacyDocumentPath: input.legacyDocumentPath,
        legacyPlaceId: input.legacyPlaceId,
        providerPlaceId: input.providerPlaceId,
        displayName: input.displayName,
        address: input.address,
        lat: input.lat,
        lng: input.lng,
        phone: input.phone,
        website: input.website,
        rating: input.rating,
        reviewCount: input.reviewCount,
        priceEstimate: input.priceEstimate,
        isOpen: input.isOpen,
    };
}
function legacyContentHash(input) {
    return (0, hashing_1.hashCanonical)(hashableContent(input));
}
/** ID rekod inventori deterministik — laluan dokumen ialah kunci semula jadi. */
function legacyRecordId(input) {
    return `LEG-${(0, hashing_1.hashCanonical)({
        path: input.legacyDocumentPath,
        placeId: input.legacyPlaceId,
    }).slice(0, 24)}`;
}
/**
 * Kelayakan awal. Identiti stabil bermakna sekurang-kurangnya satu pengenal
 * yang BUKAN nama: ID pembekal, ID tempat legasi, atau koordinat sah.
 * Nama sahaja tidak pernah mencukupi.
 */
function assessStatus(input, warnings) {
    const hasProviderId = (0, common_1.isNonEmptyString)(input.providerPlaceId);
    const hasLegacyId = (0, common_1.isNonEmptyString)(input.legacyPlaceId);
    const hasCoordinates = input.lat !== undefined &&
        input.lng !== undefined &&
        (0, common_1.isValidLatLng)(input.lat, input.lng);
    if (!hasLegacyId) {
        warnings.push("missing_legacy_place_id");
        return "blocked";
    }
    if (!(0, common_1.isNonEmptyString)(input.displayName)) {
        warnings.push("missing_display_name");
        return "incomplete";
    }
    if (input.lat !== undefined || input.lng !== undefined) {
        if (!hasCoordinates) {
            warnings.push("invalid_coordinates");
            return "incomplete";
        }
    }
    if (!hasProviderId && !hasCoordinates) {
        // Tiada pengenal stabil selain nama → tidak boleh dipetakan dengan selamat.
        warnings.push("no_stable_identity_beyond_name");
        return "ambiguous";
    }
    return "eligible";
}
/** Bina satu rekod inventori. Tulen: tiada I/O, masa disuntik. */
function buildInventoryRecord(input, now) {
    const warnings = [];
    const status = assessStatus(input, warnings);
    if (input.rating !== undefined && (input.rating < 0 || input.rating > 5)) {
        warnings.push("rating_out_of_range");
    }
    if (input.reviewCount !== undefined && input.reviewCount < 0) {
        warnings.push("negative_review_count");
    }
    return {
        legacyRecordId: legacyRecordId(input),
        legacyCollection: input.legacyCollection,
        legacyDocumentPath: input.legacyDocumentPath,
        legacyPlaceId: input.legacyPlaceId,
        providerPlaceId: input.providerPlaceId,
        displayName: input.displayName ?? "",
        address: input.address,
        lat: input.lat,
        lng: input.lng,
        phone: input.phone,
        website: input.website,
        rating: input.rating,
        reviewCount: input.reviewCount,
        priceEstimate: input.priceEstimate,
        isOpen: input.isOpen,
        source: input.source ?? "unknown",
        referencedBy: [...(input.referencedBy ?? [])],
        firstSeenAt: input.firstSeenAt,
        lastSeenAt: input.lastSeenAt,
        rawContentHash: legacyContentHash(input),
        inventoryStatus: status,
        warnings,
        createdAt: now,
    };
}
/**
 * Bina inventori penuh. Rekod diisih mengikut ID supaya output deterministik
 * tanpa mengira susunan input.
 */
function buildLegacyInventory(inputs, now) {
    return inputs
        .map((input) => buildInventoryRecord(input, now))
        .sort((a, b) => a.legacyRecordId.localeCompare(b.legacyRecordId));
}
/**
 * Kumpulkan rekod inventori mengikut ID tempat legasi. Satu ID tempat boleh
 * muncul dalam beberapa koleksi (cache + details + rujukan).
 */
function groupByLegacyPlaceId(records) {
    const map = new Map();
    for (const record of records) {
        const list = map.get(record.legacyPlaceId) ?? [];
        list.push(record);
        map.set(record.legacyPlaceId, list);
    }
    return map;
}
/** Cincang inventori keseluruhan — mengesan sebarang perubahan data legasi. */
function inventoryHash(records) {
    return (0, hashing_1.hashCanonical)([...records]
        .map((r) => ({ id: r.legacyRecordId, hash: r.rawContentHash }))
        .sort((a, b) => a.id.localeCompare(b.id)));
}
