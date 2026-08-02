"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.7 Part R — discovery (34-38), metrik & kesihatan (42-49),
 * cache (50-52), dan pengasingan produksi (58-59).
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
function store() {
    let t = fixtures_1.T;
    return new index_1.InMemoryCoverageStore({ now: () => (t += 1000) });
}
async function addPlace(s, placeId, location, extra = {}) {
    const place = (0, fixtures_1.makePlace)({ placeId, location, ...extra });
    const v = (0, fixtures_1.makePublication)(place);
    await s.indexPublishedPlaceIntoCoverage({
        publicationHead: (0, fixtures_1.head)(placeId, v.publicationId),
        publicationVersion: v,
        canonicalLocation: location,
        context: { now: fixtures_1.T },
        actor: fixtures_1.ADMIN,
    });
    return v;
}
function source(s) {
    return {
        listMembershipsByCells: (c) => s.listMembershipsByCells(c),
        getCoverageVersions: (c) => s.getCoverageVersions(c),
        getActivePublication: (p) => s.getActivePublicationSnapshot(p),
    };
}
const baseReq = { lat: fixtures_1.CENTER.lat, lng: fixtures_1.CENTER.lng, radiusMeters: 1000, now: fixtures_1.T + 1000 };
// 34. Liputan kosong → respons kosong yang JUJUR.
(0, node_test_1.default)("34. liputan kosong memulangkan respons kosong (tiada kedai dummy)", async () => {
    const s = store();
    const r = await (0, index_1.getPublishedPlacesByArea)(baseReq, source(s));
    strict_1.default.deepEqual(r.places, []);
    strict_1.default.equal(r.sourceMode, "empty_coverage");
    strict_1.default.equal(r.coverageIncomplete, true);
    strict_1.default.ok(r.warnings.includes("empty_coverage"));
    strict_1.default.equal(r.nextPageToken, undefined);
});
// 35. Liputan kosong MENGANTRIKAN discovery.
(0, node_test_1.default)("35. liputan kosong mengantrikan discovery", async () => {
    const s = store();
    const queued = [];
    const r = await (0, index_1.getPublishedPlacesByArea)(baseReq, source(s), {
        onDiscoveryNeeded: (cells, reason) => queued.push({ cells, reason }),
    });
    strict_1.default.equal(r.discoveryQueued, true);
    strict_1.default.equal(queued.length, 1);
    strict_1.default.equal(queued[0].reason, "empty_coverage");
    strict_1.default.ok(queued[0].cells.length > 0);
});
// 36. Bacaan kawasan TIDAK menunggu discovery.
(0, node_test_1.default)("36. bacaan kawasan memulangkan hasil diluluskan tanpa menunggu discovery", async () => {
    const s = store();
    for (let i = 0; i < 20; i++) {
        await addPlace(s, `mm_d${i}`, (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 20 + i * 10, 0));
    }
    let discoveryRan = false;
    const r = await (0, index_1.getPublishedPlacesByArea)({ ...baseReq, maxResults: 20 }, source(s), { onDiscoveryNeeded: () => (discoveryRan = true) });
    strict_1.default.equal(r.places.length, 20, "20 kedai diluluskan dipulangkan SERTA-MERTA");
    strict_1.default.equal(r.sourceMode, "approved_database");
    strict_1.default.equal(r.coverageIncomplete, false);
    strict_1.default.equal(discoveryRan, false, "liputan sihat → tiada discovery diperlukan");
});
// 37. Kegagalan discovery MENGEKALKAN hasil yang diluluskan.
(0, node_test_1.default)("37. kegagalan discovery tidak memusnahkan liputan diluluskan", async () => {
    const s = store();
    await addPlace(s, "mm_keep", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 40, 0));
    const r = await (0, index_1.getPublishedPlacesByArea)(baseReq, source(s), {
        minimumPlacesForComplete: 5, // paksa "partial" supaya discovery dicuba
        onDiscoveryNeeded: () => {
            throw new Error("provider down");
        },
    });
    strict_1.default.deepEqual(r.places.map((p) => p.placeId), ["mm_keep"]);
    strict_1.default.equal(r.discoveryQueued, false);
    strict_1.default.ok(r.warnings.includes("discovery_enqueue_failed"));
    strict_1.default.equal(r.sourceMode, "partial_coverage");
});
// 38. Permintaan discovery yang sama IDEMPOTEN.
(0, node_test_1.default)("38. enqueue discovery idempoten pada sel+sebab yang sama", async () => {
    const s = store();
    const req = (0, index_1.buildDiscoveryRequest)({
        cellId: "w283b8",
        neighboringCellIds: ["w283b9"],
        reason: "empty_coverage",
        requestedAt: fixtures_1.T,
        requestedBySystem: "area_read",
        priority: 1,
    });
    const a = await s.enqueueDiscovery(req, fixtures_1.ADMIN);
    const b = await s.enqueueDiscovery((0, index_1.buildDiscoveryRequest)({
        cellId: "w283b8",
        neighboringCellIds: ["w283b9"],
        reason: "empty_coverage",
        requestedAt: fixtures_1.T + 60_000, // masa berbeza
        requestedBySystem: "scheduler", // sistem berbeza
        priority: 3,
    }), fixtures_1.ADMIN);
    strict_1.default.equal(a.requestId, b.requestId);
    strict_1.default.equal(b.requestedAt, fixtures_1.T, "entri asal dikekalkan");
    const list = await s.listQueue(undefined, { limit: 10 });
    strict_1.default.equal(list.items.length, 1);
    // Sebab berbeza → permintaan berbeza.
    strict_1.default.notEqual((0, index_1.discoveryIdempotencyKey)("w283b8", "empty_coverage", "none"), (0, index_1.discoveryIdempotencyKey)("w283b8", "stale_coverage", "none"));
});
(0, node_test_1.default)("38b. peralihan status baris gilir dikawal + cuba semula selepas gagal", async () => {
    const s = store();
    const req = (0, index_1.buildDiscoveryRequest)({
        cellId: "w283bx",
        neighboringCellIds: [],
        reason: "low_coverage",
        requestedAt: fixtures_1.T,
        requestedBySystem: "area_read",
        priority: 2,
    });
    await s.enqueueDiscovery(req, fixtures_1.ADMIN);
    const processing = await s.transitionDiscoveryStatus(req.requestId, "processing", fixtures_1.ADMIN);
    strict_1.default.equal(processing.attemptCount, 1);
    const failed = await s.transitionDiscoveryStatus(req.requestId, "failed", fixtures_1.ADMIN, "provider_timeout");
    strict_1.default.equal(failed.lastErrorCode, "provider_timeout");
    // Gagal boleh dibaris-gilirkan semula.
    strict_1.default.equal((0, index_1.canTransitionDiscoveryStatus)("failed", "queued"), true);
    strict_1.default.equal((0, index_1.canTransitionDiscoveryStatus)("queued", "completed"), false);
    strict_1.default.equal((0, index_1.canTransitionDiscoveryStatus)("completed", "queued"), false);
});
(0, node_test_1.default)("permintaan discovery tidak mengandungi data peribadi pengguna", () => {
    const req = (0, index_1.buildDiscoveryRequest)({
        cellId: "w283b8",
        neighboringCellIds: [],
        reason: "user_area_request",
        requestedAt: fixtures_1.T,
        requestedBySystem: "area_read",
        priority: 1,
    });
    const keys = Object.keys(req);
    for (const forbidden of ["uid", "userId", "lat", "lng", "email"]) {
        strict_1.default.equal(keys.includes(forbidden), false, `${forbidden} tidak dibenarkan`);
    }
    strict_1.default.equal(req.requestedBySystem, "area_read"); // sistem, bukan pengguna
});
// ---- Metrik (42-45) ----
async function metricsFor(s, cellId) {
    const memberships = await s.listMembershipsByCells([cellId]);
    const versions = new Map(await Promise.all(memberships.map(async (m) => {
        const v = await s.getActivePublicationSnapshot(m.placeId);
        return [m.publicationId, v];
    })));
    return (0, index_1.computeCoverageMetrics)({
        cellId,
        memberships,
        versionsByPublicationId: versions,
        coverageVersion: (await s.getCoverageVersions([cellId]))[cellId],
        now: fixtures_1.T,
    });
}
// 42. Metrik mengira kedai yang diterbitkan aktif.
(0, node_test_1.default)("42. metrik mengira kedai diterbitkan aktif + kategori/masakan", async () => {
    const s = store();
    await addPlace(s, "mm_m1", fixtures_1.CENTER, {
        placeTypes: ["restaurant"],
        cuisines: ["malay"],
    });
    await addPlace(s, "mm_m2", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 30, 0), {
        placeTypes: ["cafe"],
        cuisines: ["western"],
    });
    const home = (await s.getMembership("mm_m1")).homeCellId;
    const m = await metricsFor(s, home);
    strict_1.default.equal(m.activePublishedPlaces, 2);
    strict_1.default.equal(m.placeTypeCounts.restaurant, 1);
    strict_1.default.equal(m.placeTypeCounts.cafe, 1);
    strict_1.default.equal(m.cuisineCounts.malay, 1);
    strict_1.default.ok(m.sourceTypeCounts.provider >= 1);
    strict_1.default.equal(m.cellId, home);
});
// 43/44. Metrik mengenal pasti waktu & harga tidak diketahui.
(0, node_test_1.default)("43/44. metrik mengenal pasti waktu & harga tidak diketahui", async () => {
    const s = store();
    await addPlace(s, "mm_u1", fixtures_1.CENTER, { hoursUnknown: true, priceUnknown: true });
    await addPlace(s, "mm_u2", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 30, 0));
    const home = (await s.getMembership("mm_u1")).homeCellId;
    const m = await metricsFor(s, home);
    strict_1.default.equal(m.activePublishedPlaces, 2);
    strict_1.default.equal(m.unknownHoursCount, 1);
    strict_1.default.equal(m.unknownPriceCount, 1);
});
(0, node_test_1.default)("metrik mengira imej yang hilang", async () => {
    const s = store();
    await addPlace(s, "mm_noimg", fixtures_1.CENTER, { noImage: true });
    const home = (await s.getMembership("mm_noimg")).homeCellId;
    const m = await metricsFor(s, home);
    strict_1.default.equal(m.missingImageCount, 1);
});
// 45. Metrik TIDAK mengandungi data peribadi pengguna.
(0, node_test_1.default)("45. metrik tidak mengandungi data peribadi pengguna", async () => {
    const s = store();
    await addPlace(s, "mm_priv", fixtures_1.CENTER);
    const home = (await s.getMembership("mm_priv")).homeCellId;
    const m = await metricsFor(s, home);
    const serialized = JSON.stringify(m);
    for (const forbidden of index_1.FORBIDDEN_METRIC_FIELDS) {
        strict_1.default.equal(Object.prototype.hasOwnProperty.call(m, forbidden), false, `${forbidden} tidak dibenarkan dalam metrik`);
        strict_1.default.equal(serialized.includes(`"${forbidden}"`), false, `${forbidden} muncul dalam metrik bersiri`);
    }
});
// ---- Kesihatan liputan (46-49) ----
function metrics(over = {}) {
    return {
        cellId: "w283b8",
        activePublishedPlaces: 20,
        placeTypeCounts: { restaurant: 10, cafe: 10 },
        cuisineCounts: { malay: 8, western: 6, japanese: 6 },
        mealSlotCounts: {},
        sourceTypeCounts: { provider: 20 },
        stalePlaceCount: 0,
        expiredCriticalCount: 0,
        duplicateCandidateCount: 0,
        missingImageCount: 0,
        unknownPriceCount: 0,
        unknownHoursCount: 0,
        lastComputedAt: fixtures_1.T,
        coverageVersion: (0, index_1.coverageVersionFromMembers)([]),
        ...over,
    };
}
// 46. Kesihatan liputan SIHAT.
(0, node_test_1.default)("46. kesihatan liputan healthy", () => {
    const r = (0, index_1.evaluateCoverageHealth)(metrics(), index_1.DEFAULT_COVERAGE_HEALTH_CONFIG, fixtures_1.T);
    strict_1.default.equal(r.healthState, "healthy");
    strict_1.default.equal(r.incomplete, false);
    strict_1.default.equal(r.discoveryRequired, false);
});
// 47. Kesihatan liputan RENDAH.
(0, node_test_1.default)("47. kesihatan liputan low", () => {
    const r = (0, index_1.evaluateCoverageHealth)(metrics({ activePublishedPlaces: 2, cuisineCounts: { malay: 2 } }), index_1.DEFAULT_COVERAGE_HEALTH_CONFIG, fixtures_1.T);
    strict_1.default.equal(r.healthState, "low");
    strict_1.default.equal(r.incomplete, true);
    strict_1.default.equal(r.discoveryRequired, true);
    strict_1.default.ok(r.reasons.includes("below_minimum_places"));
});
(0, node_test_1.default)("47b. kepelbagaian masakan rendah juga 'low'", () => {
    const r = (0, index_1.evaluateCoverageHealth)(metrics({ cuisineCounts: { malay: 20 } }), index_1.DEFAULT_COVERAGE_HEALTH_CONFIG, fixtures_1.T);
    strict_1.default.equal(r.healthState, "low");
    strict_1.default.ok(r.reasons.includes("low_cuisine_diversity"));
});
// 48. Kesihatan liputan KOSONG.
(0, node_test_1.default)("48. kesihatan liputan empty", () => {
    const r = (0, index_1.evaluateCoverageHealth)(metrics({ activePublishedPlaces: 0, placeTypeCounts: {}, cuisineCounts: {} }), index_1.DEFAULT_COVERAGE_HEALTH_CONFIG, fixtures_1.T);
    strict_1.default.equal(r.healthState, "empty");
    strict_1.default.equal(r.discoveryRequired, true);
    strict_1.default.equal(r.priority, 1);
});
// 49. Kesihatan liputan BASI.
(0, node_test_1.default)("49. kesihatan liputan stale bila terlalu lama", () => {
    const old = fixtures_1.T - index_1.DEFAULT_COVERAGE_HEALTH_CONFIG.maxCoverageAgeMs - 1;
    const r = (0, index_1.evaluateCoverageHealth)(metrics({ lastComputedAt: old }), index_1.DEFAULT_COVERAGE_HEALTH_CONFIG, fixtures_1.T);
    strict_1.default.equal(r.healthState, "stale");
    strict_1.default.equal(r.refreshRequired, true);
});
(0, node_test_1.default)("kesihatan critical bila terlalu banyak bukti kritikal luput", () => {
    const r = (0, index_1.evaluateCoverageHealth)(metrics({ expiredCriticalCount: 10 }), // 10/20 = 0.5 > 0.25
    index_1.DEFAULT_COVERAGE_HEALTH_CONFIG, fixtures_1.T);
    strict_1.default.equal(r.healthState, "critical");
    strict_1.default.equal(r.refreshRequired, true);
});
(0, node_test_1.default)("kesihatan adequate antara minimum dan sasaran", () => {
    const r = (0, index_1.evaluateCoverageHealth)(metrics({ activePublishedPlaces: 8 }), index_1.DEFAULT_COVERAGE_HEALTH_CONFIG, fixtures_1.T);
    strict_1.default.equal(r.healthState, "adequate");
    strict_1.default.equal(r.discoveryRequired, true);
});
(0, node_test_1.default)("sasaran 100 tempat BUKAN peraturan per-sel (boleh dikonfigurasi)", () => {
    // Sasaran per-sel lalai kecil; kolam 9 sel melebihi 100 tempat.
    strict_1.default.ok(index_1.DEFAULT_COVERAGE_HEALTH_CONFIG.targetPlacesForHealthyCell < 100);
    strict_1.default.ok(index_1.DEFAULT_COVERAGE_HEALTH_CONFIG.targetPlacesForHealthyCell * 9 > 100);
    // Boleh dikonfigurasi.
    const strict = {
        ...index_1.DEFAULT_COVERAGE_HEALTH_CONFIG,
        targetPlacesForHealthyCell: 50,
    };
    strict_1.default.equal((0, index_1.evaluateCoverageHealth)(metrics({ activePublishedPlaces: 20 }), strict, fixtures_1.T)
        .healthState, "adequate");
});
// ---- Cache (50-52) ----
// 50. Kunci cache TERMASUK versi liputan.
(0, node_test_1.default)("50. kunci cache termasuk versi kolam liputan", () => {
    const common = {
        centerCellId: "w283b8",
        radiusMeters: 1000,
        filters: {},
    };
    const k1 = (0, index_1.buildAreaCacheKey)({ ...common, publicationPoolVersion: "cpv_aaa" });
    const k2 = (0, index_1.buildAreaCacheKey)({ ...common, publicationPoolVersion: "cpv_bbb" });
    strict_1.default.notEqual(k1, k2, "versi liputan berbeza → kunci berbeza");
});
// 51. Koordinat mentah BUKAN kunci cache tunggal.
(0, node_test_1.default)("51. koordinat mentah bukan kunci cache; kunci dikongsi dalam sel", () => {
    const poolVersion = (0, index_1.combinedCoverageVersion)({ w283b8: "cv_x" });
    // Dua pengguna pada koordinat BERBEZA tetapi dalam sel & baldi yang sama
    // menghasilkan kunci yang SAMA — inilah yang membolehkan perkongsian.
    const k1 = (0, index_1.buildAreaCacheKey)({
        centerCellId: "w283b8",
        radiusMeters: 800,
        filters: {},
        publicationPoolVersion: poolVersion,
    });
    const k2 = (0, index_1.buildAreaCacheKey)({
        centerCellId: "w283b8",
        radiusMeters: 950, // baldi sama (1000)
        filters: {},
        publicationPoolVersion: poolVersion,
    });
    strict_1.default.equal(k1, k2);
    strict_1.default.equal((0, index_1.radiusBucket)(800), (0, index_1.radiusBucket)(950));
    // Kunci tidak mengandungi koordinat mentah.
    strict_1.default.equal(k1.includes("3.11"), false);
    strict_1.default.equal(k1.includes("101.6"), false);
    // Penapis berbeza → kunci berbeza.
    strict_1.default.notEqual(k1, (0, index_1.buildAreaCacheKey)({
        centerCellId: "w283b8",
        radiusMeters: 800,
        filters: { requiredCuisineTags: ["malay"] },
        publicationPoolVersion: poolVersion,
    }));
});
// 52. Cache TIDAK SAH selepas versi berubah.
(0, node_test_1.default)("52. entri cache tidak boleh digunakan selepas versi liputan berubah", async () => {
    const s = store();
    const entry = (0, index_1.buildAreaCacheEntry)({
        centerCellId: "w283b8",
        queriedCellIds: ["w283b8"],
        radiusMeters: 1000,
        filters: {},
        publicationPoolVersion: "cpv_old",
        placeIds: ["mm_1"],
        publicationIds: ["pub_1"],
        generatedAt: fixtures_1.T,
        sourceMode: "approved_database",
    });
    await s.putCacheEntry(entry, fixtures_1.ADMIN);
    strict_1.default.equal((0, index_1.isCacheEntryUsable)(entry, "cpv_old", fixtures_1.T + 1000), true);
    strict_1.default.equal((0, index_1.isCacheEntryUsable)(entry, "cpv_new", fixtures_1.T + 1000), false);
    // Juga luput mengikut TTL.
    strict_1.default.equal((0, index_1.isCacheEntryUsable)(entry, "cpv_old", fixtures_1.T + index_1.AREA_CACHE_TTL_MS + 1), false);
    const removed = await s.invalidateByCoverageVersion("w283b8", "cpv_new");
    strict_1.default.equal(removed, 1);
    strict_1.default.equal(await s.getCacheEntry(entry.cacheKey), null);
});
// ---- 58/59. Pengasingan produksi ----
(0, node_test_1.default)("58/59. repository liputan tiada operasi place_registry / publish mobile", () => {
    const s = store();
    const names = new Set([
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(s)),
        ...Object.keys(s),
    ]);
    for (const forbidden of [
        "writePlaceRegistry",
        "publishToMobile",
        "publishToProduction",
        "callGooglePlaces",
        "fetchFromProvider",
        "deletePublication",
        "hardDelete",
    ]) {
        strict_1.default.equal(names.has(forbidden), false, `${forbidden} tidak boleh wujud`);
    }
    const src = index_1.InMemoryCoverageStore.toString();
    strict_1.default.equal(src.includes("place_registry"), false);
    strict_1.default.equal(src.includes("places_cache"), false);
    strict_1.default.equal(src.includes("place_details"), false);
});
