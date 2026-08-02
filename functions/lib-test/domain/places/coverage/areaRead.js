"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidAreaRequestError = exports.MAX_AREA_RADIUS_M = exports.DEFAULT_AREA_RESULTS = exports.MAX_AREA_RESULTS = void 0;
exports.compareBrowseOrder = compareBrowseOrder;
exports.getPublishedPlacesByArea = getPublishedPlacesByArea;
exports.centerCellForRequest = centerCellForRequest;
/**
 * Phase 1.7 Part H, I & N — ENJIN BACAAN KAWASAN TEPAT.
 *
 * PERATURAN TIDAK BOLEH DIRUNDING #1: carian sel TIDAK PERNAH menggantikan
 * pengiraan jarak tepat. Sel hanyalah penapis kasar; setiap calon melalui
 * Haversine dan dibuang jika di luar radius sebenar.
 *
 * INI BUKAN RANKING CADANGAN AKHIR. Tiada skor mood, Food Memory, bajet atau
 * Fit dikira di sini (itu Part 2).
 */
const common_1 = require("../common");
const geo_1 = require("../dedup/geo");
const displayState_1 = require("../publication/displayState");
const hashing_1 = require("../staging/hashing");
const coverageCell_1 = require("./coverageCell");
const coverageVersion_1 = require("./coverageVersion");
const geohash_1 = require("./geohash");
/** Had keras bilangan hasil per halaman. */
exports.MAX_AREA_RESULTS = 50;
exports.DEFAULT_AREA_RESULTS = 20;
/** Radius maksimum yang dibenarkan (meter). */
exports.MAX_AREA_RADIUS_M = 20_000;
class InvalidAreaRequestError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "InvalidAreaRequestError";
    }
}
exports.InvalidAreaRequestError = InvalidAreaRequestError;
function encodeCursor(c) {
    return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}
function decodeCursor(token) {
    try {
        const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
        if (typeof parsed.poolVersion !== "string" ||
            typeof parsed.requestHash !== "string" ||
            typeof parsed.lastPlaceId !== "string" ||
            typeof parsed.offset !== "number") {
            throw new Error("shape");
        }
        return parsed;
    }
    catch {
        throw new InvalidAreaRequestError("invalid_page_token", "page token tidak sah");
    }
}
/** Hash permintaan yang menentukan identiti set hasil (tanpa maxResults). */
function requestHashOf(req, cellIds) {
    return (0, hashing_1.hashCanonical)({
        cells: [...cellIds].sort(),
        radius: req.radiusMeters,
        placeTypes: [...(req.requiredPlaceTypes ?? [])].sort(),
        cuisines: [...(req.requiredCuisineTags ?? [])].sort(),
        includeTemporarilyClosed: req.includeTemporarilyClosed === true,
    }).slice(0, 24);
}
// ---------------------------------------------------------------------------
// Part I — isihan browse DETERMINISTIK (bukan ranking cadangan)
// ---------------------------------------------------------------------------
/**
 * Susunan: (1) jarak menaik, (2) completeness menurun, (3) keyakinan bukti
 * rating menurun, (4) placeId menaik sebagai pemutus seri MUKTAMAD.
 *
 * TIADA pemberat mood, Food Memory, bajet atau Fit — Part 2 memiliki itu.
 */
function compareBrowseOrder(a, b) {
    if (a.distanceMeters !== b.distanceMeters) {
        return a.distanceMeters - b.distanceMeters;
    }
    if (a.completenessScore !== b.completenessScore) {
        return b.completenessScore - a.completenessScore;
    }
    if (a.ratingEvidenceConfidence !== b.ratingEvidenceConfidence) {
        return b.ratingEvidenceConfidence - a.ratingEvidenceConfidence;
    }
    return a.placeId < b.placeId ? -1 : a.placeId > b.placeId ? 1 : 0;
}
/** Keyakinan bukti rating daripada provenance (0 bila tiada rating). */
function ratingEvidenceConfidence(v) {
    const q = v.snapshot.place.quality;
    if (typeof q.rating !== "number" || typeof q.reviewCount !== "number")
        return 0;
    const prov = v.snapshot.place.provenance.rating;
    return typeof prov?.confidence === "number" ? prov.confidence : 0;
}
function tagIdsByFamily(v, family) {
    return v.snapshot.place.tagSet.tags
        .filter((t) => t.family === family)
        .map((t) => t.tagId);
}
function project(snapshot, fields) {
    if (!fields || fields.length === 0)
        return snapshot;
    const out = {};
    for (const f of fields) {
        if (f in snapshot)
            out[f] = snapshot[f];
    }
    return out;
}
function validateRequest(req) {
    if (!(0, common_1.isValidLatLng)(req.lat, req.lng)) {
        throw new InvalidAreaRequestError("invalid_coordinates", "lat/lng tidak sah");
    }
    if (!Number.isFinite(req.radiusMeters) ||
        req.radiusMeters <= 0 ||
        req.radiusMeters > exports.MAX_AREA_RADIUS_M) {
        throw new InvalidAreaRequestError("invalid_radius", `radius mesti 0 < r <= ${exports.MAX_AREA_RADIUS_M}`);
    }
    if (req.maxResults !== undefined &&
        (!Number.isInteger(req.maxResults) || req.maxResults <= 0)) {
        throw new InvalidAreaRequestError("invalid_max_results", "maxResults tidak sah");
    }
}
/**
 * Bacaan kawasan — 13 langkah saluran paip (Part H).
 *
 * Discovery TIDAK PERNAH menyekat: bila liputan kosong/rendah kami memanggil
 * `onDiscoveryNeeded` secara segerak-tetapi-tidak-menunggu (hanya menambah
 * ke baris gilir) dan tetap memulangkan hasil yang telah diluluskan.
 */
async function getPublishedPlacesByArea(req, source, options = {}) {
    // 1. Sahkan permintaan.
    validateRequest(req);
    const warnings = [];
    const maxResults = Math.min(req.maxResults ?? exports.DEFAULT_AREA_RESULTS, exports.MAX_AREA_RESULTS);
    // 2-3. Sel pusat + jiran TERBATAS.
    const { cellIds } = (0, coverageCell_1.getQueryCellIds)(req.lat, req.lng, req.radiusMeters, req.resolution ?? geohash_1.DEFAULT_CELL_RESOLUTION);
    const queriedCellIds = cellIds.slice(0, coverageCell_1.MAX_QUERIED_CELLS);
    const coverageVersions = await source.getCoverageVersions(queriedCellIds);
    const poolVersion = (0, coverageVersion_1.combinedCoverageVersion)(coverageVersions);
    const reqHash = requestHashOf(req, queriedCellIds);
    // Token halaman: tolak bila versi liputan ATAU bentuk permintaan berubah.
    let cursor;
    if (req.pageToken) {
        const c = decodeCursor(req.pageToken);
        if (c.poolVersion !== poolVersion) {
            throw new InvalidAreaRequestError("stale_page_token", "coverage version berubah — page token tidak lagi sah");
        }
        if (c.requestHash !== reqHash) {
            throw new InvalidAreaRequestError("page_token_request_mismatch", "page token milik permintaan lain");
        }
        cursor = c;
    }
    // 4. Muat keahlian.
    const memberships = await source.listMembershipsByCells(queriedCellIds);
    // 5. Nyahduplikasi mengikut placeId KANONIKAL (keahlian sama boleh muncul
    //    dalam beberapa sel yang disoal).
    const byPlace = new Map();
    for (const m of memberships) {
        const existing = byPlace.get(m.placeId);
        // Kekalkan versi penerbitan TERTINGGI bila berlaku pertindihan.
        if (!existing || m.publicationVersion > existing.publicationVersion) {
            byPlace.set(m.placeId, m);
        }
    }
    const results = [];
    for (const m of byPlace.values()) {
        // Keahlian yang disekat tidak pernah dipapar.
        if (m.eligibilityState === "blocked")
            continue;
        // 6. Selesaikan kepala penerbitan AKTIF.
        const version = await source.getActivePublication(m.placeId);
        if (!version)
            continue; // tiada kepala aktif → tiada data awam
        // 7. Kecualikan status/penerbitan yang disekat (semakan LANGSUNG, bukan
        //    bergantung pada keahlian yang mungkin basi).
        if (version.publicationStatus !== "published")
            continue;
        if (!version.eligibilitySnapshot.eligible)
            continue;
        if (version.eligibilitySnapshot.criticalExpiredFieldIds.length > 0)
            continue;
        const place = version.snapshot.place;
        const business = (0, displayState_1.deriveBusinessDisplayState)(place.status);
        if (business.blockedFromPublic)
            continue;
        if (place.status === "permanently_closed")
            continue;
        if (place.status === "temporarily_closed" &&
            req.includeTemporarilyClosed !== true) {
            continue;
        }
        if (place.mergeState.mergeStatus === "merged" ||
            place.mergeState.mergeStatus === "superseded") {
            continue;
        }
        // 8. Jarak Haversine TEPAT (sel BUKAN pengganti jarak).
        const distanceMeters = (0, geo_1.haversineMeters)(req.lat, req.lng, m.lat, m.lng);
        // 9. Tapis mengikut radius SEBENAR.
        if (distanceMeters > req.radiusMeters)
            continue;
        // 10. Penapis jenis tempat / masakan (pilihan).
        const placeTypeTagIds = tagIdsByFamily(version, "place_type");
        const cuisineTagIds = tagIdsByFamily(version, "cuisine");
        if (req.requiredPlaceTypes?.length &&
            !req.requiredPlaceTypes.some((t) => placeTypeTagIds.includes(t))) {
            continue;
        }
        if (req.requiredCuisineTags?.length &&
            !req.requiredCuisineTags.some((t) => cuisineTagIds.includes(t))) {
            continue;
        }
        results.push({
            placeId: m.placeId,
            publicationId: version.publicationId,
            publicationVersion: version.versionNumber,
            distanceMeters: Math.round(distanceMeters * 100) / 100,
            lat: m.lat,
            lng: m.lng,
            placeStatus: place.status,
            completenessScore: version.eligibilitySnapshot.completenessScore,
            ratingEvidenceConfidence: ratingEvidenceConfidence(version),
            placeTypeTagIds,
            cuisineTagIds,
            snapshot: project(version.snapshot, req.requestedFields),
            warnings: [...version.warnings],
        });
    }
    // 11. Isihan browse DETERMINISTIK.
    results.sort(compareBrowseOrder);
    // 12. Penomboran TERBATAS berasaskan kursor.
    let startIndex = 0;
    if (cursor) {
        const idx = results.findIndex((r) => r.placeId === cursor.lastPlaceId);
        startIndex = idx >= 0 ? idx + 1 : cursor.offset;
    }
    const pageItems = results.slice(startIndex, startIndex + maxResults);
    const hasMore = startIndex + maxResults < results.length;
    const nextPageToken = hasMore && pageItems.length > 0
        ? encodeCursor({
            poolVersion,
            requestHash: reqHash,
            lastPlaceId: pageItems[pageItems.length - 1].placeId,
            offset: startIndex + pageItems.length,
        })
        : undefined;
    // Kesihatan liputan → discovery (TIDAK menyekat bacaan).
    const minComplete = options.minimumPlacesForComplete ?? 5;
    const totalApproved = results.length;
    let sourceMode;
    let coverageIncomplete = false;
    let discoveryQueued = false;
    if (totalApproved === 0) {
        sourceMode = "empty_coverage";
        coverageIncomplete = true;
        warnings.push("empty_coverage");
    }
    else if (totalApproved < minComplete) {
        sourceMode = "partial_coverage";
        coverageIncomplete = true;
        warnings.push("partial_coverage");
    }
    else {
        sourceMode = "approved_database";
    }
    if (coverageIncomplete && options.onDiscoveryNeeded) {
        try {
            // Enqueue sahaja — kami TIDAK menunggu discovery, dan kegagalannya
            // TIDAK PERNAH memusnahkan hasil yang telah diluluskan.
            options.onDiscoveryNeeded(queriedCellIds, totalApproved === 0 ? "empty_coverage" : "low_coverage");
            discoveryQueued = true;
        }
        catch {
            warnings.push("discovery_enqueue_failed");
        }
    }
    // 13. Pulangkan snapshot yang diluluskan sahaja.
    return {
        places: pageItems,
        nextPageToken,
        queriedCellIds,
        coverageVersions,
        sourceMode,
        coverageIncomplete,
        discoveryQueued,
        warnings,
        generatedAt: req.now,
    };
}
/** Didedahkan untuk ujian: sel pusat bagi permintaan. */
function centerCellForRequest(req) {
    return (0, coverageCell_1.getQueryCellIds)(req.lat, req.lng, req.radiusMeters, req.resolution ?? geohash_1.DEFAULT_CELL_RESOLUTION).centerCellId;
}
