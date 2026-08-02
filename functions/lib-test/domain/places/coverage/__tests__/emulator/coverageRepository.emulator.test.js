"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.7 — ujian repository liputan Firestore terhadap EMULATOR sahaja.
 * Jalankan: npm run test:emulator. Melangkau bila FIRESTORE_EMULATOR_HOST tiada.
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const firestoreCoverageRepository_1 = require("../../firestoreCoverageRepository");
const firestorePublicationRepository_1 = require("../../../publication/firestorePublicationRepository");
const index_1 = require("../../index");
const fixtures_1 = require("../fixtures");
const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator)";
let app;
let seq = 0;
function db() {
    if (!app)
        app = (0, app_1.initializeApp)({ projectId: process.env.GCLOUD_PROJECT ?? "demo-mm" });
    return (0, firestore_1.getFirestore)(app);
}
function store() {
    let t = fixtures_1.T;
    return new firestoreCoverageRepository_1.FirestoreCoverageStore(db(), { now: () => (t += 1000) });
}
function pubStore() {
    let t = fixtures_1.T;
    return new firestorePublicationRepository_1.FirestorePublicationStore(db(), { now: () => (t += 1000) });
}
/** Kedai unik per-ujian supaya ujian tidak berlanggar dalam satu emulator. */
function uniqueId(prefix) {
    return `emu_cov_${prefix}_${seq++}`;
}
/**
 * Terbitkan kedai melalui Phase 1.6 (penerbitan + kepala aktif), kemudian
 * indeks keahliannya ke dalam liputan Phase 1.7.
 */
async function publishAndIndex(s, placeId, location, extra = {}) {
    const ps = pubStore();
    const place = (0, fixtures_1.makePlace)({ placeId, location, ...extra });
    const version = (0, fixtures_1.makePublication)(place);
    await ps.createPublicationVersion(version, fixtures_1.ADMIN);
    await ps.setEmulatorActivePublication(placeId, version.publicationId, fixtures_1.ADMIN, "publish");
    const decision = (0, index_1.evaluateIndexingDecision)({
        placeId,
        activePublicationId: version.publicationId,
        activeVersionNumber: version.versionNumber,
        updatedAt: fixtures_1.T,
        updatedBy: fixtures_1.ADMIN.actorUid,
        reasonCode: "publish",
    }, version, location, { now: fixtures_1.T });
    strict_1.default.equal(decision.indexable, true, decision.denyReasons.join(","));
    const membership = (0, index_1.buildMembership)(version, location, decision, { now: fixtures_1.T }, index_1.EMPTY_COVERAGE_VERSION);
    await s.upsertMembership(membership, fixtures_1.ADMIN);
    for (const cellId of membership.searchableCellIds) {
        await s.recomputeCell(cellId, fixtures_1.ADMIN);
    }
    return { version, membership };
}
(0, node_test_1.default)("emulator: upsert keahlian + kira semula sel + versi liputan", { skip }, async () => {
    const s = store();
    const placeId = uniqueId("idx");
    const { membership } = await publishAndIndex(s, placeId, fixtures_1.CENTER);
    const stored = await s.getMembership(placeId);
    strict_1.default.equal(stored?.homeCellId, membership.homeCellId);
    strict_1.default.equal(stored?.lat, fixtures_1.CENTER.lat, "koordinat tepat dikekalkan");
    const cell = await s.getCell(membership.homeCellId);
    strict_1.default.ok(cell);
    strict_1.default.ok(cell.publishedPlaceIds.includes(placeId));
    strict_1.default.notEqual(cell.coverageVersion, index_1.EMPTY_COVERAGE_VERSION);
    strict_1.default.equal(cell.cellSystem, "geohash_base32");
});
(0, node_test_1.default)("emulator: upsert keahlian IDEMPOTEN", { skip }, async () => {
    const s = store();
    const placeId = uniqueId("idem");
    const { membership } = await publishAndIndex(s, placeId, fixtures_1.CENTER);
    const before = await s.getMembership(placeId);
    // Upsert semula dengan indexedAt berbeza tetapi contentHash sama.
    const again = await s.upsertMembership({ ...membership, indexedAt: fixtures_1.T + 999_999 }, fixtures_1.ADMIN);
    strict_1.default.equal(again.indexedAt, before.indexedAt, "rekod asal dikekalkan");
});
(0, node_test_1.default)("emulator: bacaan kawasan menggunakan kepala penerbitan aktif", { skip }, async () => {
    const s = store();
    const near = uniqueId("near");
    const far = uniqueId("far");
    await publishAndIndex(s, near, (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 80, 0));
    await publishAndIndex(s, far, (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 900, 0));
    const r = await (0, index_1.getPublishedPlacesByArea)({ lat: fixtures_1.CENTER.lat, lng: fixtures_1.CENTER.lng, radiusMeters: 300, now: fixtures_1.T + 1000 }, {
        listMembershipsByCells: (c) => s.listMembershipsByCells(c),
        getCoverageVersions: (c) => s.getCoverageVersions(c),
        getActivePublication: (p) => s.getActivePublicationSnapshot(p),
    });
    const ids = r.places.map((p) => p.placeId);
    strict_1.default.ok(ids.includes(near));
    strict_1.default.equal(ids.includes(far), false, "radius tepat dikuatkuasa");
});
(0, node_test_1.default)("emulator: buang keahlian mengemas kini sel (sejarah penerbitan kekal)", { skip }, async () => {
    const s = store();
    const placeId = uniqueId("remove");
    const { membership, version } = await publishAndIndex(s, placeId, fixtures_1.CENTER);
    const homeCell = membership.homeCellId;
    const versionBefore = (await s.getCell(homeCell)).coverageVersion;
    await s.removeMembership(placeId, "hidden", fixtures_1.ADMIN);
    strict_1.default.equal(await s.getMembership(placeId), null);
    const after = await s.getCell(homeCell);
    strict_1.default.equal(after.publishedPlaceIds.includes(placeId), false);
    strict_1.default.notEqual(after.coverageVersion, versionBefore);
    // Sejarah PENERBITAN Phase 1.6 KEKAL — hanya indeks liputan dibuang.
    const ps = pubStore();
    strict_1.default.ok(await ps.getPublicationVersion(version.publicationId), "versi penerbitan TIDAK dipadam");
});
(0, node_test_1.default)("emulator: metrik dikira & disimpan tanpa data peribadi", { skip }, async () => {
    const s = store();
    const p1 = uniqueId("m1");
    const { membership } = await publishAndIndex(s, p1, fixtures_1.CENTER, {
        placeTypes: ["restaurant"],
        cuisines: ["malay"],
        hoursUnknown: true,
    });
    const cellId = membership.homeCellId;
    const memberships = await s.listMembershipsByCells([cellId]);
    const versions = new Map(await Promise.all(memberships.map(async (m) => {
        const v = await s.getActivePublicationSnapshot(m.placeId);
        return [m.publicationId, v];
    })));
    const metrics = (0, index_1.computeCoverageMetrics)({
        cellId,
        memberships,
        versionsByPublicationId: versions,
        coverageVersion: (await s.getCoverageVersions([cellId]))[cellId],
        now: fixtures_1.T,
    });
    await s.putMetrics(metrics, fixtures_1.ADMIN);
    const read = await s.getMetrics(cellId);
    strict_1.default.ok(read);
    strict_1.default.ok(read.activePublishedPlaces >= 1);
    strict_1.default.ok(read.unknownHoursCount >= 1);
    const serialized = JSON.stringify(read);
    for (const forbidden of ["uid", "userId", "email", "deviceId"]) {
        strict_1.default.equal(serialized.includes(`"${forbidden}"`), false);
    }
});
(0, node_test_1.default)("emulator: baris gilir discovery idempoten + terbatas", { skip }, async () => {
    const s = store();
    const cellId = `emu_cell_${seq++}`;
    const req = (0, index_1.buildDiscoveryRequest)({
        cellId,
        neighboringCellIds: [],
        reason: "empty_coverage",
        requestedAt: fixtures_1.T,
        requestedBySystem: "area_read",
        priority: 1,
    });
    const a = await s.enqueueDiscovery(req, fixtures_1.ADMIN);
    const b = await s.enqueueDiscovery({ ...req, requestedAt: fixtures_1.T + 5000 }, fixtures_1.ADMIN);
    strict_1.default.equal(a.requestId, b.requestId);
    strict_1.default.equal(b.requestedAt, fixtures_1.T);
    const processing = await s.transitionDiscoveryStatus(req.requestId, "processing", fixtures_1.ADMIN);
    strict_1.default.equal(processing.attemptCount, 1);
    const page = await s.listQueue(undefined, { limit: 10_000 });
    strict_1.default.ok(page.items.length <= 100, "senarai terbatas");
});
(0, node_test_1.default)("emulator: cache kawasan berversi & boleh dibatalkan", { skip }, async () => {
    const s = store();
    const cellId = `emu_cache_${seq++}`;
    const poolOld = (0, index_1.combinedCoverageVersion)({ [cellId]: "cv_old" });
    const entry = (0, index_1.buildAreaCacheEntry)({
        centerCellId: cellId,
        queriedCellIds: [cellId],
        radiusMeters: 1000,
        filters: {},
        publicationPoolVersion: poolOld,
        placeIds: ["mm_x"],
        publicationIds: ["pub_x"],
        generatedAt: fixtures_1.T,
        sourceMode: "approved_database",
    });
    await s.putCacheEntry(entry, fixtures_1.ADMIN);
    strict_1.default.ok(await s.getCacheEntry(entry.cacheKey));
    const poolNew = (0, index_1.combinedCoverageVersion)({ [cellId]: "cv_new" });
    strict_1.default.equal((0, index_1.isCacheEntryUsable)(entry, poolNew, fixtures_1.T + 1000), false);
    const removed = await s.invalidateByCoverageVersion(cellId, poolNew);
    strict_1.default.equal(removed, 1);
    strict_1.default.equal(await s.getCacheEntry(entry.cacheKey), null);
});
(0, node_test_1.default)("emulator: TIADA tulisan place_registry / places_cache / place_details", { skip }, async () => {
    const s = store();
    await publishAndIndex(s, uniqueId("noprod"), fixtures_1.CENTER);
    const d = db();
    for (const c of ["place_registry", "places_cache", "place_details"]) {
        const snap = await d.collection(c).limit(1).get();
        strict_1.default.equal(snap.empty, true, `${c} tidak boleh disentuh oleh Phase 1.7`);
    }
});
