"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AREA_CACHE_TTL_MS = exports.RADIUS_BUCKETS_M = void 0;
exports.radiusBucket = radiusBucket;
exports.filterHash = filterHash;
exports.buildAreaCacheKey = buildAreaCacheKey;
exports.buildAreaCacheEntry = buildAreaCacheEntry;
exports.isCacheEntryUsable = isCacheEntryUsable;
const hashing_1 = require("../staging/hashing");
/**
 * Baldi radius (meter). Radius sebenar dibundarkan KE ATAS ke baldi terdekat
 * untuk kunci cache; penapisan jarak TEPAT tetap berlaku selepas cache dibaca,
 * jadi pembundaran ini tidak pernah memulangkan kedai di luar radius.
 */
exports.RADIUS_BUCKETS_M = [500, 1000, 2000, 3000, 5000, 10_000, 20_000];
function radiusBucket(radiusMeters) {
    for (const b of exports.RADIUS_BUCKETS_M) {
        if (radiusMeters <= b)
            return b;
    }
    return exports.RADIUS_BUCKETS_M[exports.RADIUS_BUCKETS_M.length - 1];
}
/** Hash penapis — bebas susunan (senarai diisih dahulu). */
function filterHash(filters) {
    return (0, hashing_1.hashCanonical)({
        placeTypes: [...(filters.requiredPlaceTypes ?? [])].sort(),
        cuisines: [...(filters.requiredCuisineTags ?? [])].sort(),
        includeTemporarilyClosed: filters.includeTemporarilyClosed === true,
    }).slice(0, 16);
}
/**
 * Bina kunci cache. Komponen: sel pusat + baldi radius + hash penapis +
 * versi kolam liputan. Perubahan versi liputan menghasilkan kunci BERBEZA,
 * jadi entri lama tidak pernah dipulangkan selepas liputan berubah.
 */
function buildAreaCacheKey(params) {
    const bucket = radiusBucket(params.radiusMeters);
    const fh = filterHash(params.filters);
    const digest = (0, hashing_1.hashCanonical)({
        cell: params.centerCellId,
        bucket,
        filters: fh,
        pool: params.publicationPoolVersion,
    }).slice(0, 32);
    return `ac_${params.centerCellId}_${bucket}_${fh}_${digest}`;
}
/** TTL lalai cache kawasan (emulator sahaja) — 15 minit. */
exports.AREA_CACHE_TTL_MS = 15 * 60 * 1000;
function buildAreaCacheEntry(params) {
    const bucket = radiusBucket(params.radiusMeters);
    return {
        cacheKey: buildAreaCacheKey({
            centerCellId: params.centerCellId,
            radiusMeters: params.radiusMeters,
            filters: params.filters,
            publicationPoolVersion: params.publicationPoolVersion,
        }),
        centerCellId: params.centerCellId,
        queriedCellIds: [...params.queriedCellIds],
        radiusBucket: bucket,
        filterHash: filterHash(params.filters),
        publicationPoolVersion: params.publicationPoolVersion,
        placeIds: [...params.placeIds],
        publicationIds: [...params.publicationIds],
        generatedAt: params.generatedAt,
        expiresAt: params.generatedAt + (params.ttlMs ?? exports.AREA_CACHE_TTL_MS),
        sourceMode: params.sourceMode,
    };
}
/** Entri sah HANYA bila belum luput DAN versi kolam masih sepadan. */
function isCacheEntryUsable(entry, currentPoolVersion, now) {
    if (entry.publicationPoolVersion !== currentPoolVersion)
        return false;
    return now < entry.expiresAt;
}
