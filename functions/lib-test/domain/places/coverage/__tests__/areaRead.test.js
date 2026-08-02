"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.7 Part R — ujian enjin bacaan kawasan (21-33).
 * Termasuk bukti bahawa keahlian sel TIDAK memintas jarak tepat.
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
/** Indeks kedai dan pulangkan store yang sama (untuk rantaian). */
async function addPlace(s, placeId, location, extra = {}, version = 1) {
    const place = (0, fixtures_1.makePlace)({ placeId, location, ...extra });
    const v = (0, fixtures_1.makePublication)(place, version);
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
        listMembershipsByCells: (cells) => s.listMembershipsByCells(cells),
        getCoverageVersions: (cells) => s.getCoverageVersions(cells),
        getActivePublication: (placeId) => s.getActivePublicationSnapshot(placeId),
    };
}
const baseReq = {
    lat: fixtures_1.CENTER.lat,
    lng: fixtures_1.CENTER.lng,
    radiusMeters: 1000,
    now: fixtures_1.T + 1000,
};
// 21. Radius tepat mengecualikan kedai di luar julat.
(0, node_test_1.default)("21. radius tepat mengecualikan kedai di luar julat", async () => {
    const s = store();
    await addPlace(s, "mm_near", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 100, 0)); // 100 m
    await addPlace(s, "mm_far", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 900, 0)); // 900 m
    const r = await (0, index_1.getPublishedPlacesByArea)({ ...baseReq, radiusMeters: 500 }, source(s));
    const ids = r.places.map((p) => p.placeId);
    strict_1.default.deepEqual(ids, ["mm_near"]);
    strict_1.default.ok(r.places[0].distanceMeters <= 500);
});
// 22. Keahlian sel SAHAJA tidak memintas radius.
(0, node_test_1.default)("22. kedai dalam sel SAMA tetapi di luar radius DIKECUALIKAN", async () => {
    const s = store();
    const homeCell = (0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng);
    const bounds = (0, index_1.getCoverageCellBounds)(homeCell);
    // Cari titik yang PASTI dalam sel yang sama tetapi sejauh mungkin dari
    // pusat carian: sudut sel yang terjauh (ditarik sedikit ke dalam).
    const eps = 1e-7;
    const corners = [
        { lat: bounds.minLat + eps, lng: bounds.minLng + eps },
        { lat: bounds.minLat + eps, lng: bounds.maxLng - eps },
        { lat: bounds.maxLat - eps, lng: bounds.minLng + eps },
        { lat: bounds.maxLat - eps, lng: bounds.maxLng - eps },
    ].filter((c) => (0, index_1.getCoverageCellId)(c.lat, c.lng) === homeCell);
    strict_1.default.ok(corners.length > 0, "prasyarat: sekurang-kurangnya satu sudut dalam sel");
    let farthest = corners[0];
    let farthestM = 0;
    for (const c of corners) {
        const d = (0, geo_1.haversineMeters)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng, c.lat, c.lng);
        if (d > farthestM) {
            farthestM = d;
            farthest = c;
        }
    }
    strict_1.default.ok(farthestM > 50, `prasyarat: sudut cukup jauh (dapat ${farthestM} m)`);
    await addPlace(s, "mm_samecell_far", farthest);
    const membership = await s.getMembership("mm_samecell_far");
    strict_1.default.equal(membership?.homeCellId, homeCell, "prasyarat: kedai berada dalam sel yang SAMA");
    // Radius yang lebih KECIL daripada jarak sebenar mesti mengecualikannya,
    // walaupun ia berkongsi sel dengan pusat carian.
    const radiusMeters = Math.max(10, Math.floor(farthestM / 2));
    const r = await (0, index_1.getPublishedPlacesByArea)({ ...baseReq, radiusMeters }, source(s));
    strict_1.default.equal(r.places.length, 0, "sel BUKAN pengganti jarak");
    // Bukti positif: radius yang cukup besar MEMANG memasukkannya.
    const wide = await (0, index_1.getPublishedPlacesByArea)({ ...baseReq, radiusMeters: Math.ceil(farthestM) + 10 }, source(s));
    strict_1.default.deepEqual(wide.places.map((p) => p.placeId), ["mm_samecell_far"]);
});
// 23. Kedai dalam sel JIRAN tetapi dalam radius DISERTAKAN.
(0, node_test_1.default)("23. kedai dalam sel jiran tetapi dalam radius disertakan", async () => {
    const s = store();
    // Cari titik yang berada dalam sel BERBEZA tetapi hanya ~300 m jauh.
    const homeCell = (0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng);
    let neighborLoc = (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 0, 0);
    let found = false;
    for (let d = 100; d <= 900; d += 50) {
        for (const [n, e] of [
            [d, 0],
            [-d, 0],
            [0, d],
            [0, -d],
        ]) {
            const loc = (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, n, e);
            if ((0, index_1.getCoverageCellId)(loc.lat, loc.lng) !== homeCell) {
                neighborLoc = loc;
                found = true;
                break;
            }
        }
        if (found)
            break;
    }
    strict_1.default.equal(found, true, "prasyarat: jumpa titik dalam sel jiran");
    strict_1.default.notEqual((0, index_1.getCoverageCellId)(neighborLoc.lat, neighborLoc.lng), homeCell);
    await addPlace(s, "mm_neighbor", neighborLoc);
    const r = await (0, index_1.getPublishedPlacesByArea)({ ...baseReq, radiusMeters: 1000 }, source(s));
    strict_1.default.ok(r.places.some((p) => p.placeId === "mm_neighbor"), "kedai sel jiran dalam radius mesti disertakan");
});
// 24. Keahlian pendua → satu kedai kanonikal.
(0, node_test_1.default)("24. keahlian merentas beberapa sel → satu hasil kanonikal", async () => {
    const s = store();
    await addPlace(s, "mm_dup", fixtures_1.CENTER);
    const m = await s.getMembership("mm_dup");
    // Keahlian memang muncul dalam BEBERAPA sel boleh-cari.
    strict_1.default.ok(m.searchableCellIds.length > 1);
    const r = await (0, index_1.getPublishedPlacesByArea)(baseReq, source(s));
    strict_1.default.equal(r.places.filter((p) => p.placeId === "mm_dup").length, 1);
});
// 25/26. Tutup sementara.
(0, node_test_1.default)("25. kedai tutup sementara DIKECUALIKAN secara lalai", async () => {
    const s = store();
    const place = (0, fixtures_1.makePlace)({
        placeId: "mm_tc",
        location: fixtures_1.CENTER,
        status: "temporarily_closed",
    });
    const v = (0, fixtures_1.makeRawPublication)(place);
    await s.indexPublishedPlaceIntoCoverage({
        publicationHead: (0, fixtures_1.head)("mm_tc", v.publicationId),
        publicationVersion: v,
        canonicalLocation: fixtures_1.CENTER,
        context: { now: fixtures_1.T },
        actor: fixtures_1.ADMIN,
    });
    const r = await (0, index_1.getPublishedPlacesByArea)(baseReq, source(s));
    strict_1.default.equal(r.places.length, 0);
});
(0, node_test_1.default)("26. kedai tutup sementara disertakan HANYA bila diminta secara eksplisit", async () => {
    const s = store();
    const place = (0, fixtures_1.makePlace)({
        placeId: "mm_tc2",
        location: fixtures_1.CENTER,
        status: "temporarily_closed",
    });
    const v = (0, fixtures_1.makeRawPublication)(place);
    await s.indexPublishedPlaceIntoCoverage({
        publicationHead: (0, fixtures_1.head)("mm_tc2", v.publicationId),
        publicationVersion: v,
        canonicalLocation: fixtures_1.CENTER,
        context: { now: fixtures_1.T },
        actor: fixtures_1.ADMIN,
    });
    const r = await (0, index_1.getPublishedPlacesByArea)({ ...baseReq, includeTemporarilyClosed: true }, source(s));
    strict_1.default.deepEqual(r.places.map((p) => p.placeId), ["mm_tc2"]);
    strict_1.default.equal(r.places[0].placeStatus, "temporarily_closed");
});
// 27. Penapis jenis tempat.
(0, node_test_1.default)("27. penapis jenis tempat berfungsi", async () => {
    const s = store();
    await addPlace(s, "mm_rest", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 50, 0), {
        placeTypes: ["restaurant"],
    });
    await addPlace(s, "mm_cafe", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 60, 0), { placeTypes: ["cafe"] });
    const r = await (0, index_1.getPublishedPlacesByArea)({ ...baseReq, requiredPlaceTypes: ["cafe"] }, source(s));
    strict_1.default.deepEqual(r.places.map((p) => p.placeId), ["mm_cafe"]);
});
// 28. Penapis masakan.
(0, node_test_1.default)("28. penapis masakan berfungsi", async () => {
    const s = store();
    await addPlace(s, "mm_malay", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 50, 0), { cuisines: ["malay"] });
    await addPlace(s, "mm_jp", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 60, 0), { cuisines: ["japanese"] });
    const r = await (0, index_1.getPublishedPlacesByArea)({ ...baseReq, requiredCuisineTags: ["japanese"] }, source(s));
    strict_1.default.deepEqual(r.places.map((p) => p.placeId), ["mm_jp"]);
});
// 29/30. Isihan browse deterministik + pemutus seri placeId.
(0, node_test_1.default)("29. isihan browse deterministik (jarak → completeness → rating → placeId)", async () => {
    const s = store();
    await addPlace(s, "mm_c", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 300, 0));
    await addPlace(s, "mm_a", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 100, 0));
    await addPlace(s, "mm_b", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 200, 0));
    const r1 = await (0, index_1.getPublishedPlacesByArea)(baseReq, source(s));
    const r2 = await (0, index_1.getPublishedPlacesByArea)(baseReq, source(s));
    strict_1.default.deepEqual(r1.places.map((p) => p.placeId), ["mm_a", "mm_b", "mm_c"], "jarak menaik");
    strict_1.default.deepEqual(r1.places.map((p) => p.placeId), r2.places.map((p) => p.placeId));
});
(0, node_test_1.default)("30. pemutus seri MUKTAMAD ialah placeId menaik", () => {
    const mk = (placeId, distanceMeters, completenessScore, ratingEvidenceConfidence) => ({
        placeId,
        publicationId: `pub_${placeId}`,
        publicationVersion: 1,
        distanceMeters,
        lat: 0,
        lng: 0,
        placeStatus: "active",
        completenessScore,
        ratingEvidenceConfidence,
        placeTypeTagIds: [],
        cuisineTagIds: [],
        snapshot: {},
        warnings: [],
    });
    // Semua sama kecuali placeId.
    const sorted = [mk("zzz", 100, 0.9, 0.9), mk("aaa", 100, 0.9, 0.9)].sort(index_1.compareBrowseOrder);
    strict_1.default.deepEqual(sorted.map((p) => p.placeId), ["aaa", "zzz"]);
    // Completeness menang atas rating.
    const byCompleteness = [
        mk("a", 100, 0.5, 0.99),
        mk("b", 100, 0.9, 0.1),
    ].sort(index_1.compareBrowseOrder);
    strict_1.default.deepEqual(byCompleteness.map((p) => p.placeId), ["b", "a"]);
    // Jarak menang atas semua.
    const byDistance = [mk("a", 200, 1, 1), mk("b", 100, 0, 0)].sort(index_1.compareBrowseOrder);
    strict_1.default.deepEqual(byDistance.map((p) => p.placeId), ["b", "a"]);
});
// 31. Penomboran STABIL.
(0, node_test_1.default)("31. penomboran stabil — tiada pendua merentas halaman", async () => {
    const s = store();
    for (let i = 0; i < 7; i++) {
        await addPlace(s, `mm_p${i}`, (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 50 + i * 20, 0));
    }
    const page1 = await (0, index_1.getPublishedPlacesByArea)({ ...baseReq, maxResults: 3 }, source(s));
    strict_1.default.equal(page1.places.length, 3);
    strict_1.default.ok(page1.nextPageToken);
    const page2 = await (0, index_1.getPublishedPlacesByArea)({ ...baseReq, maxResults: 3, pageToken: page1.nextPageToken }, source(s));
    const page3 = await (0, index_1.getPublishedPlacesByArea)({ ...baseReq, maxResults: 3, pageToken: page2.nextPageToken }, source(s));
    const all = [...page1.places, ...page2.places, ...page3.places].map((p) => p.placeId);
    strict_1.default.equal(all.length, 7);
    strict_1.default.equal(new Set(all).size, 7, "tiada placeId berulang merentas halaman");
    strict_1.default.equal(page3.nextPageToken, undefined, "halaman terakhir tiada token");
});
// 32. Token halaman BASI ditolak apabila versi liputan berubah.
(0, node_test_1.default)("32. token halaman ditolak selepas versi liputan berubah", async () => {
    const s = store();
    for (let i = 0; i < 5; i++) {
        await addPlace(s, `mm_q${i}`, (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 50 + i * 20, 0));
    }
    const page1 = await (0, index_1.getPublishedPlacesByArea)({ ...baseReq, maxResults: 2 }, source(s));
    strict_1.default.ok(page1.nextPageToken);
    // Liputan berubah — kedai baharu diindeks.
    await addPlace(s, "mm_new", (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 30, 0));
    await strict_1.default.rejects(() => (0, index_1.getPublishedPlacesByArea)({ ...baseReq, maxResults: 2, pageToken: page1.nextPageToken }, source(s)), (e) => {
        strict_1.default.ok(e instanceof index_1.InvalidAreaRequestError);
        strict_1.default.equal(e.code, "stale_page_token");
        return true;
    });
});
(0, node_test_1.default)("32b. token halaman milik permintaan LAIN ditolak", async () => {
    const s = store();
    for (let i = 0; i < 4; i++) {
        await addPlace(s, `mm_r${i}`, (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 50 + i * 20, 0));
    }
    const page1 = await (0, index_1.getPublishedPlacesByArea)({ ...baseReq, maxResults: 2 }, source(s));
    // Radius berbeza → hash permintaan berbeza.
    await strict_1.default.rejects(() => (0, index_1.getPublishedPlacesByArea)({ ...baseReq, radiusMeters: 900, maxResults: 2, pageToken: page1.nextPageToken }, source(s)), (e) => {
        strict_1.default.ok(e instanceof index_1.InvalidAreaRequestError);
        strict_1.default.equal(e.code, "page_token_request_mismatch");
        return true;
    });
});
(0, node_test_1.default)("32c. token rosak ditolak", async () => {
    const s = store();
    await addPlace(s, "mm_s0", fixtures_1.CENTER);
    await strict_1.default.rejects(() => (0, index_1.getPublishedPlacesByArea)({ ...baseReq, pageToken: "###" }, source(s)), (e) => {
        strict_1.default.ok(e instanceof index_1.InvalidAreaRequestError);
        strict_1.default.equal(e.code, "invalid_page_token");
        return true;
    });
});
// 33. maxResults TERBATAS.
(0, node_test_1.default)("33. maxResults terbatas kepada had keras", async () => {
    const s = store();
    await addPlace(s, "mm_only", fixtures_1.CENTER);
    const r = await (0, index_1.getPublishedPlacesByArea)({ ...baseReq, maxResults: 10_000 }, source(s));
    strict_1.default.ok(r.places.length <= index_1.MAX_AREA_RESULTS);
});
(0, node_test_1.default)("33b. permintaan tidak sah ditolak (koordinat/radius/maxResults)", async () => {
    const s = store();
    const src = source(s);
    await strict_1.default.rejects(() => (0, index_1.getPublishedPlacesByArea)({ ...baseReq, lat: 99 }, src));
    await strict_1.default.rejects(() => (0, index_1.getPublishedPlacesByArea)({ ...baseReq, radiusMeters: 0 }, src));
    await strict_1.default.rejects(() => (0, index_1.getPublishedPlacesByArea)({ ...baseReq, radiusMeters: 999_999 }, src));
    await strict_1.default.rejects(() => (0, index_1.getPublishedPlacesByArea)({ ...baseReq, maxResults: -1 }, src));
});
(0, node_test_1.default)("bacaan mengembalikan versi liputan + sel yang disoal", async () => {
    const s = store();
    await addPlace(s, "mm_meta", fixtures_1.CENTER);
    const r = await (0, index_1.getPublishedPlacesByArea)(baseReq, source(s));
    strict_1.default.ok(r.queriedCellIds.length > 0);
    strict_1.default.equal(Object.keys(r.coverageVersions).length, r.queriedCellIds.length);
    strict_1.default.equal(r.generatedAt, baseReq.now);
    strict_1.default.equal(r.places[0].publicationVersion, 1);
});
(0, node_test_1.default)("projeksi medan dihormati bila diminta", async () => {
    const s = store();
    await addPlace(s, "mm_proj", fixtures_1.CENTER);
    const r = await (0, index_1.getPublishedPlacesByArea)({ ...baseReq, requestedFields: ["displayState"] }, source(s));
    strict_1.default.deepEqual(Object.keys(r.places[0].snapshot), ["displayState"]);
});
(0, node_test_1.default)("kedai tanpa kepala penerbitan aktif tidak dipapar", async () => {
    const s = store();
    await addPlace(s, "mm_gone", fixtures_1.CENTER);
    // Buang penerbitan aktif tetapi TINGGALKAN keahlian (keadaan basi).
    s.unregisterActivePublication("mm_gone");
    const r = await (0, index_1.getPublishedPlacesByArea)(baseReq, source(s));
    strict_1.default.equal(r.places.length, 0, "keahlian basi tidak membocorkan data");
});
