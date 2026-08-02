"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_QUERIED_CELLS = void 0;
exports.getCoverageCellId = getCoverageCellId;
exports.getCoverageCellCenter = getCoverageCellCenter;
exports.getCoverageCellBounds = getCoverageCellBounds;
exports.getNeighboringCoverageCells = getNeighboringCoverageCells;
exports.getSearchableCellIds = getSearchableCellIds;
exports.resolutionForRadius = resolutionForRadius;
exports.getQueryCellIds = getQueryCellIds;
exports.makeEmptyCoverageCell = makeEmptyCoverageCell;
const geohash_1 = require("./geohash");
// ---------------------------------------------------------------------------
// Part B — helper ID sel TULEN
// ---------------------------------------------------------------------------
/**
 * ID sel stabil untuk koordinat. MELEMPAR `InvalidCoordinateError` bila
 * lat/lng tidak sah. Koordinat mentah TIDAK PERNAH menjadi ID.
 */
function getCoverageCellId(lat, lng, resolution = geohash_1.DEFAULT_CELL_RESOLUTION) {
    return (0, geohash_1.encodeGeohash)(lat, lng, resolution);
}
function getCoverageCellCenter(cellId) {
    return (0, geohash_1.decodeGeohashCenter)(cellId);
}
function getCoverageCellBounds(cellId) {
    return (0, geohash_1.decodeGeohashBounds)(cellId);
}
/**
 * Lapan jiran, susunan tetap N, NE, E, SE, S, SW, W, NW.
 * Sel PUSAT DIKECUALIKAN secara konsisten (didokumenkan) — pemanggil yang
 * memerlukan pusat menambahnya sendiri melalui `getSearchableCellIds`.
 */
function getNeighboringCoverageCells(cellId) {
    return (0, geohash_1.geohashNeighbors)(cellId);
}
/**
 * Sel yang perlu dibaca untuk satu carian: pusat DAHULU, kemudian jiran
 * dalam susunan tetap. Tiada pendua. TERBATAS pada 9 sel untuk radius yang
 * muat dalam satu sel, berkembang secara terkawal untuk radius besar.
 */
function getSearchableCellIds(cellId) {
    return [cellId, ...getNeighboringCoverageCells(cellId)];
}
/** Had mutlak bilangan sel yang boleh disoal dalam satu bacaan kawasan. */
exports.MAX_QUERIED_CELLS = 49;
/**
 * Pilih resolusi sel yang sesuai untuk radius yang diminta, supaya cincin
 * jiran 3×3 sentiasa meliputi radius sepenuhnya tanpa meletup bilangan sel.
 * Deterministik dan tidak menggunakan masa.
 */
function resolutionForRadius(radiusMeters, maxResolution = geohash_1.DEFAULT_CELL_RESOLUTION) {
    let best = maxResolution;
    for (let r = maxResolution; r >= 1; r--) {
        if ((0, geohash_1.approxCellWidthMeters)(r) >= radiusMeters)
            return r;
        best = r;
    }
    return best;
}
/**
 * Sel yang perlu disoal untuk (lat, lng, radius). Menggunakan resolusi yang
 * cukup kasar supaya cincin 3×3 meliputi radius; hasil sentiasa TERBATAS oleh
 * `MAX_QUERIED_CELLS`.
 *
 * NOTA PENTING: ini hanyalah PENAPIS KASAR. Jarak Haversine tepat MESTI
 * dikira selepas ini (Part H langkah 8) — sel bukan pengganti jarak.
 */
function getQueryCellIds(lat, lng, radiusMeters, resolution = geohash_1.DEFAULT_CELL_RESOLUTION) {
    const chosen = resolutionForRadius(radiusMeters, resolution);
    const centerCellId = getCoverageCellId(lat, lng, chosen);
    const cellIds = getSearchableCellIds(centerCellId).slice(0, exports.MAX_QUERIED_CELLS);
    return { cellIds, resolution: chosen, centerCellId };
}
/** Bina rekod sel kosong yang sah (dipakai repository semasa upsert). */
function makeEmptyCoverageCell(cellId, now, coverageVersion) {
    const bounds = getCoverageCellBounds(cellId);
    const center = getCoverageCellCenter(cellId);
    return {
        cellId,
        cellSystem: geohash_1.CELL_SYSTEM,
        cellResolution: cellId.length,
        centerLat: center.lat,
        centerLng: center.lng,
        boundingBox: bounds,
        neighboringCellIds: getNeighboringCoverageCells(cellId),
        activePlaceCount: 0,
        publishedPlaceIds: [],
        coverageVersion,
        freshnessSummary: {
            overallState: "unknown",
            staleCount: 0,
            expiredCriticalCount: 0,
        },
        categoryCoverage: {},
        cuisineCoverage: {},
        sourceCoverage: {},
        createdAt: now,
        updatedAt: now,
    };
}
