"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.7 Part S — SENARIO EMAS (A-J).
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const geo_1 = require("../../dedup/geo");
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
// A. Pengguna A mencari kawasan yang sudah ada liputan diluluskan.
(0, node_test_1.default)("A. pengguna A membaca kolam diluluskan sedia ada tanpa menunggu pembekal", async () => {
    const s = store();
    for (let i = 0; i < 8; i++) {
        await addPlace(s, `mm_a${i}`, (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 30 + i * 25, 0));
    }
    let providerCalled = false;
    const r = await (0, index_1.getPublishedPlacesByArea)({ lat: fixtures_1.CENTER.lat, lng: fixtures_1.CENTER.lng, radiusMeters: 1000, now: fixtures_1.T + 1000 }, source(s), { onDiscoveryNeeded: () => (providerCalled = true) });
    strict_1.default.equal(r.places.length, 8);
    strict_1.default.equal(r.sourceMode, "approved_database");
    strict_1.default.equal(providerCalled, false, "tiada penantian pembekal diperlukan");
});
// B. Pengguna B memasuki kawasan yang SAMA.
(0, node_test_1.default)("B. pengguna B menggunakan semula kolam & versi penerbitan yang sama", async () => {
    const s = store();
    for (let i = 0; i < 6; i++) {
        await addPlace(s, `mm_b${i}`, (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 30 + i * 25, 0));
    }
    // Pengguna A di satu koordinat; pengguna B beberapa meter jauh.
    const userA = { lat: fixtures_1.CENTER.lat, lng: fixtures_1.CENTER.lng, radiusMeters: 1000, now: fixtures_1.T + 1000 };
    const bLoc = (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 15, 15);
    const userB = { lat: bLoc.lat, lng: bLoc.lng, radiusMeters: 1000, now: fixtures_1.T + 2000 };
    const rA = await (0, index_1.getPublishedPlacesByArea)(userA, source(s));
    const rB = await (0, index_1.getPublishedPlacesByArea)(userB, source(s));
    // Sel yang disoal dan versi liputan adalah SAMA → kolam dikongsi.
    strict_1.default.deepEqual(rA.queriedCellIds, rB.queriedCellIds);
    strict_1.default.deepEqual(rA.coverageVersions, rB.coverageVersions);
    strict_1.default.deepEqual(rA.places.map((p) => p.publicationId).sort(), rB.places.map((p) => p.publicationId).sort(), "versi penerbitan yang sama digunakan semula");
});
// C. 20 kedai diluluskan + discovery dibaris-gilirkan.
(0, node_test_1.default)("C. 20 kedai dipulangkan serta-merta; discovery berlaku berasingan", async () => {
    const s = store();
    for (let i = 0; i < 20; i++) {
        await addPlace(s, `mm_c${String(i).padStart(2, "0")}`, (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 20 + i * 8, 0));
    }
    const enqueued = [];
    const r = await (0, index_1.getPublishedPlacesByArea)({ lat: fixtures_1.CENTER.lat, lng: fixtures_1.CENTER.lng, radiusMeters: 1000, maxResults: 20, now: fixtures_1.T + 1000 }, source(s), {
        // Paksa "tidak lengkap" walaupun ada 20, untuk membuktikan discovery
        // berjalan BERASINGAN tanpa menyekat hasil.
        minimumPlacesForComplete: 50,
        onDiscoveryNeeded: (cells) => enqueued.push(...cells),
    });
    strict_1.default.equal(r.places.length, 20, "20 dipulangkan SERTA-MERTA");
    strict_1.default.equal(r.discoveryQueued, true);
    strict_1.default.ok(enqueued.length > 0, "discovery dibaris-gilirkan secara berasingan");
    // Baris gilir sebenar boleh menerima permintaan itu (idempoten).
    const req = (0, index_1.buildDiscoveryRequest)({
        cellId: enqueued[0],
        neighboringCellIds: enqueued.slice(1),
        reason: "low_coverage",
        requestedAt: fixtures_1.T,
        requestedBySystem: "area_read",
        priority: 2,
    });
    await s.enqueueDiscovery(req, fixtures_1.ADMIN);
    await s.enqueueDiscovery(req, fixtures_1.ADMIN);
    const q = await s.listQueue("queued", { limit: 10 });
    strict_1.default.equal(q.items.length, 1);
});
// D. Restoran sel JIRAN dalam radius tepat.
(0, node_test_1.default)("D. restoran sel jiran dalam radius tepat DISERTAKAN", async () => {
    const s = store();
    const homeCell = (0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng);
    let neighborLoc;
    for (let d = 100; d <= 900 && !neighborLoc; d += 50) {
        for (const [n, e] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
            const loc = (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, n, e);
            if ((0, index_1.getCoverageCellId)(loc.lat, loc.lng) !== homeCell) {
                neighborLoc = loc;
                break;
            }
        }
    }
    strict_1.default.ok(neighborLoc, "prasyarat: jumpa lokasi sel jiran");
    await addPlace(s, "mm_d_neighbor", neighborLoc);
    const dist = (0, geo_1.haversineMeters)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng, neighborLoc.lat, neighborLoc.lng);
    const r = await (0, index_1.getPublishedPlacesByArea)({
        lat: fixtures_1.CENTER.lat,
        lng: fixtures_1.CENTER.lng,
        radiusMeters: Math.ceil(dist) + 50,
        now: fixtures_1.T + 1000,
    }, source(s));
    strict_1.default.deepEqual(r.places.map((p) => p.placeId), ["mm_d_neighbor"]);
});
// E. Restoran sel SAMA di luar radius tepat.
(0, node_test_1.default)("E. restoran sel sama di luar radius tepat DIKECUALIKAN", async () => {
    const s = store();
    const homeCell = (0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng);
    const b = (0, index_1.getCoverageCellBounds)(homeCell);
    const eps = 1e-7;
    const inCellCorners = [
        { lat: b.minLat + eps, lng: b.minLng + eps },
        { lat: b.maxLat - eps, lng: b.maxLng - eps },
        { lat: b.minLat + eps, lng: b.maxLng - eps },
        { lat: b.maxLat - eps, lng: b.minLng + eps },
    ].filter((c) => (0, index_1.getCoverageCellId)(c.lat, c.lng) === homeCell);
    let far = inCellCorners[0];
    let farM = 0;
    for (const c of inCellCorners) {
        const d = (0, geo_1.haversineMeters)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng, c.lat, c.lng);
        if (d > farM) {
            farM = d;
            far = c;
        }
    }
    await addPlace(s, "mm_e_same_cell", far);
    strict_1.default.equal((await s.getMembership("mm_e_same_cell")).homeCellId, homeCell);
    const r = await (0, index_1.getPublishedPlacesByArea)({ lat: fixtures_1.CENTER.lat, lng: fixtures_1.CENTER.lng, radiusMeters: Math.floor(farM / 2), now: fixtures_1.T + 1000 }, source(s));
    strict_1.default.equal(r.places.length, 0, "sel sama TIDAK memintas radius");
});
// F. Kedai disembunyikan selepas penerbitan.
(0, node_test_1.default)("F. kedai disembunyikan: keahlian dibuang, versi berubah, cache tidak sah", async () => {
    const s = store();
    await addPlace(s, "mm_f1", fixtures_1.CENTER);
    await addPlace(s, "mm_f2", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 40, 0));
    const cells = (await s.getMembership("mm_f1")).searchableCellIds;
    const versionsBefore = await s.getCoverageVersions(cells);
    const poolBefore = (0, index_1.combinedCoverageVersion)(versionsBefore);
    const entry = (0, index_1.buildAreaCacheEntry)({
        centerCellId: cells[0],
        queriedCellIds: cells,
        radiusMeters: 1000,
        filters: {},
        publicationPoolVersion: poolBefore,
        placeIds: ["mm_f1", "mm_f2"],
        publicationIds: [],
        generatedAt: fixtures_1.T,
        sourceMode: "approved_database",
    });
    await s.putCacheEntry(entry, fixtures_1.ADMIN);
    // Sembunyikan mm_f1.
    const res = await s.removePlaceFromCoverage({
        placeId: "mm_f1",
        reason: "hidden",
        actor: fixtures_1.ADMIN,
        now: fixtures_1.T + 5000,
    });
    strict_1.default.equal(res.coverageVersionChanged, true);
    const versionsAfter = await s.getCoverageVersions(cells);
    const poolAfter = (0, index_1.combinedCoverageVersion)(versionsAfter);
    strict_1.default.notEqual(poolAfter, poolBefore, "versi kolam berubah");
    // Cache lama tidak lagi boleh digunakan.
    strict_1.default.equal((0, index_1.isCacheEntryUsable)(entry, poolAfter, fixtures_1.T + 6000), false);
    strict_1.default.equal(await s.invalidateByCoverageVersion(cells[0], poolAfter), 1);
    // Bacaan tidak lagi memaparkan kedai yang disembunyikan.
    const r = await (0, index_1.getPublishedPlacesByArea)({ lat: fixtures_1.CENTER.lat, lng: fixtures_1.CENTER.lng, radiusMeters: 1000, now: fixtures_1.T + 7000 }, source(s));
    strict_1.default.deepEqual(r.places.map((p) => p.placeId), ["mm_f2"]);
});
// G. Restoran BERPINDAH.
(0, node_test_1.default)("G. kedai berpindah: keahlian lama dibuang, sel rumah baharu, sejarah kekal", async () => {
    const s = store();
    const v1 = await addPlace(s, "mm_g", fixtures_1.CENTER);
    const oldHome = (await s.getMembership("mm_g")).homeCellId;
    const newLoc = (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 40_000, 0);
    const movedPlace = (0, fixtures_1.makePlace)({ placeId: "mm_g", location: newLoc });
    const v2 = (0, fixtures_1.makePublication)(movedPlace, 2, fixtures_1.T + 10_000);
    const r = await s.reindexPlaceCoverage({
        publicationHead: (0, fixtures_1.head)("mm_g", v2.publicationId),
        publicationVersion: v2,
        canonicalLocation: newLoc,
        reason: "moved",
        context: { now: fixtures_1.T + 10_000 },
        actor: fixtures_1.ADMIN,
    });
    const newHome = r.membership.homeCellId;
    strict_1.default.notEqual(newHome, oldHome);
    strict_1.default.equal((await s.getCell(oldHome)).activePlaceCount, 0);
    strict_1.default.deepEqual((await s.getCell(newHome)).publishedPlaceIds, ["mm_g"]);
    // Sejarah penerbitan KEKAL — kedua-dua versi masih wujud sebagai rekod.
    strict_1.default.notEqual(v1.publicationId, v2.publicationId);
    strict_1.default.equal(r.membership.publicationVersion, 2);
    // Carian di lokasi LAMA tidak lagi menemuinya.
    const oldArea = await (0, index_1.getPublishedPlacesByArea)({ lat: fixtures_1.CENTER.lat, lng: fixtures_1.CENTER.lng, radiusMeters: 1000, now: fixtures_1.T + 11_000 }, source(s));
    strict_1.default.equal(oldArea.places.length, 0);
    // Carian di lokasi BAHARU menemuinya.
    const newArea = await (0, index_1.getPublishedPlacesByArea)({ lat: newLoc.lat, lng: newLoc.lng, radiusMeters: 1000, now: fixtures_1.T + 11_000 }, source(s));
    strict_1.default.deepEqual(newArea.places.map((p) => p.placeId), ["mm_g"]);
});
// H. Keahlian pendua merujuk kedai kanonikal yang sama.
(0, node_test_1.default)("H. keahlian merentas sel merujuk satu kedai kanonikal → satu hasil", async () => {
    const s = store();
    await addPlace(s, "mm_h", fixtures_1.CENTER);
    const m = await s.getMembership("mm_h");
    strict_1.default.ok(m.searchableCellIds.length > 1, "hadir dalam beberapa sel");
    const r = await (0, index_1.getPublishedPlacesByArea)({ lat: fixtures_1.CENTER.lat, lng: fixtures_1.CENTER.lng, radiusMeters: 1000, now: fixtures_1.T + 1000 }, source(s));
    strict_1.default.equal(r.places.length, 1);
    strict_1.default.equal(r.places[0].placeId, "mm_h");
});
// I. Kawasan KOSONG.
(0, node_test_1.default)("I. kawasan kosong: respons jujur, discovery dibaris-gilirkan, tiada dummy", async () => {
    const s = store();
    const enqueued = [];
    const r = await (0, index_1.getPublishedPlacesByArea)({ lat: fixtures_1.CENTER.lat, lng: fixtures_1.CENTER.lng, radiusMeters: 1000, now: fixtures_1.T + 1000 }, source(s), { onDiscoveryNeeded: (cells) => enqueued.push(...cells) });
    strict_1.default.deepEqual(r.places, [], "TIADA restoran dummy dicipta");
    strict_1.default.equal(r.sourceMode, "empty_coverage");
    strict_1.default.equal(r.coverageIncomplete, true);
    strict_1.default.equal(r.discoveryQueued, true);
    strict_1.default.ok(enqueued.length > 0);
});
// J. Pembekal discovery GAGAL.
(0, node_test_1.default)("J. kegagalan discovery: liputan diluluskan sedia ada kekal boleh dibaca", async () => {
    const s = store();
    await addPlace(s, "mm_j1", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 30, 0));
    await addPlace(s, "mm_j2", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 60, 0));
    const r = await (0, index_1.getPublishedPlacesByArea)({ lat: fixtures_1.CENTER.lat, lng: fixtures_1.CENTER.lng, radiusMeters: 1000, now: fixtures_1.T + 1000 }, source(s), {
        minimumPlacesForComplete: 10,
        onDiscoveryNeeded: () => {
            throw new Error("provider outage");
        },
    });
    strict_1.default.deepEqual(r.places.map((p) => p.placeId).sort(), ["mm_j1", "mm_j2"]);
    strict_1.default.ok(r.warnings.includes("discovery_enqueue_failed"));
    // Keahlian yang diluluskan TIDAK dimusnahkan oleh kegagalan pembekal.
    strict_1.default.ok(await s.getMembership("mm_j1"));
    strict_1.default.ok(await s.getMembership("mm_j2"));
});
