"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.6 — ujian repository penerbitan Firestore terhadap EMULATOR sahaja.
 * Jalankan: npm run test:emulator. Melangkau bila FIRESTORE_EMULATOR_HOST tiada.
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const firestorePublicationRepository_1 = require("../../firestorePublicationRepository");
const publicationBuilder_1 = require("../../publicationBuilder");
const fixtures_1 = require("../fixtures");
const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator)";
let app;
let seq = 0;
function store() {
    if (!app)
        app = (0, app_1.initializeApp)({ projectId: process.env.GCLOUD_PROJECT ?? "demo-mm" });
    let t = fixtures_1.T;
    return new firestorePublicationRepository_1.FirestorePublicationStore((0, firestore_1.getFirestore)(app), { now: () => (t += 1000) });
}
/** Kedai unik per-ujian supaya ujian tidak berlanggar dalam satu emulator. */
function placeFor(suffix) {
    const p = (0, fixtures_1.eligiblePlace)();
    p.placeId = `emu_pub_${suffix}_${seq++}`;
    return p;
}
function version(place, versionNumber, now = fixtures_1.T) {
    return (0, publicationBuilder_1.buildPublicationVersion)({
        place,
        actor: fixtures_1.ADMIN,
        now,
        versionNumber,
        sourceCanonicalVersion: fixtures_1.SOURCE_VERSION,
        eligibilityContext: { freshnessInputs: (0, fixtures_1.freshInputsAt)(fixtures_1.T) },
    }).version;
}
(0, node_test_1.default)("emulator: cipta versi + baca + senarai terbatas", { skip }, async () => {
    const s = store();
    const place = placeFor("create");
    const v1 = version(place, 1);
    const created = await s.createPublicationVersion(v1, fixtures_1.ADMIN);
    strict_1.default.equal(created.publicationId, v1.publicationId);
    const read = await s.getPublicationVersion(v1.publicationId);
    strict_1.default.equal(read?.placeId, place.placeId);
    strict_1.default.equal(read?.publicationStatus, "published");
    strict_1.default.equal(read?.snapshot.place.identity.canonicalName, place.identity.canonicalName);
    const page = await s.listVersionsByPlace(place.placeId, { limit: 10 });
    strict_1.default.equal(page.items.length, 1);
    strict_1.default.equal(await s.nextVersionNumber(place.placeId), 2);
});
(0, node_test_1.default)("emulator: penerbitan IDEMPOTEN (kandungan sama)", { skip }, async () => {
    const s = store();
    const place = placeFor("idem");
    const a = await s.createPublicationVersion(version(place, 1), fixtures_1.ADMIN);
    // Percubaan kedua: nombor versi & masa berbeza, kandungan SAMA.
    const b = await s.createPublicationVersion(version(place, 2, fixtures_1.T + 90_000), fixtures_1.ADMIN);
    strict_1.default.equal(a.publicationId, b.publicationId);
    strict_1.default.equal(b.versionNumber, 1, "ulangan tidak menaikkan nombor versi");
    const page = await s.listVersionsByPlace(place.placeId, { limit: 10 });
    strict_1.default.equal(page.items.length, 1);
});
(0, node_test_1.default)("emulator: versi immutable — create kedua kekal satu dokumen", { skip }, async () => {
    const s = store();
    const place = placeFor("immutable");
    const v = version(place, 1);
    await s.createPublicationVersion(v, fixtures_1.ADMIN);
    const again = await s.createPublicationVersion({ ...v, publicationStatus: "hidden", publishedBy: "penyerang" }, fixtures_1.ADMIN);
    // Dokumen asal dikembalikan — bukan ditulis ganti.
    strict_1.default.equal(again.publicationStatus, "published");
    strict_1.default.equal(again.publishedBy, fixtures_1.ADMIN.actorUid);
});
(0, node_test_1.default)("emulator: penunjuk aktif + audit + invalidasi", { skip }, async () => {
    const s = store();
    const place = placeFor("head");
    const v1 = version(place, 1);
    await s.createPublicationVersion(v1, fixtures_1.ADMIN);
    const head = await s.setEmulatorActivePublication(place.placeId, v1.publicationId, fixtures_1.ADMIN, "publish");
    strict_1.default.equal(head.activePublicationId, v1.publicationId);
    strict_1.default.equal((await s.getActiveHead(place.placeId))?.activeVersionNumber, 1);
    const audit = await s.listStatusAudit(place.placeId, { limit: 50 });
    const actions = new Set(audit.items.map((a) => a.action));
    strict_1.default.ok(actions.has("publication_created"));
    strict_1.default.ok(actions.has("publication_head_moved"));
    const inv = await s.listInvalidationEvents(place.placeId, { limit: 50 });
    strict_1.default.ok(inv.items.some((e) => e.reason === "publication_created"));
});
(0, node_test_1.default)("emulator: rollback mengekalkan sejarah + memindah penunjuk", { skip }, async () => {
    const s = store();
    const place = placeFor("rollback");
    const v1 = version(place, 1);
    await s.createPublicationVersion(v1, fixtures_1.ADMIN);
    await s.setEmulatorActivePublication(place.placeId, v1.publicationId, fixtures_1.ADMIN, "publish");
    const bad = { ...place, quality: { rating: 1.2, reviewCount: 3 } };
    const v2 = version(bad, 2, fixtures_1.T + 30_000);
    await s.createPublicationVersion(v2, fixtures_1.ADMIN);
    await s.setEmulatorActivePublication(place.placeId, v2.publicationId, fixtures_1.ADMIN, "publish");
    const rb = await s.requestRollback({
        placeId: place.placeId,
        fromPublicationId: v2.publicationId,
        targetPublicationId: v1.publicationId,
        reasonCode: "incorrect_data_published",
        actor: fixtures_1.ADMIN,
    });
    await s.approveRollback(rb.rollbackId, fixtures_1.ADMIN);
    const done = await s.executeRollbackInEmulator(rb.rollbackId, fixtures_1.ADMIN);
    strict_1.default.equal(done.status, "executed_in_emulator");
    // Tiada versi dipadam.
    strict_1.default.ok(await s.getPublicationVersion(v1.publicationId));
    strict_1.default.ok(await s.getPublicationVersion(v2.publicationId));
    const page = await s.listVersionsByPlace(place.placeId, { limit: 20 });
    strict_1.default.equal(page.items.length, 3);
    // Versi lama ditanda superseded (bukan dipadam).
    strict_1.default.equal((await s.getPublicationVersion(v2.publicationId))?.publicationStatus, "superseded");
    // Penunjuk aktif menunjuk ke versi pemulihan.
    const head = await s.getActiveHead(place.placeId);
    strict_1.default.equal(head?.activePublicationId, done.resultingPublicationId);
    // Kandungan yang dipulihkan = sasaran.
    const restored = await s.getPublicationVersion(done.resultingPublicationId);
    strict_1.default.equal(restored?.snapshot.place.quality.rating, 4.4);
});
(0, node_test_1.default)("emulator: pelaksanaan rollback IDEMPOTEN", { skip }, async () => {
    const s = store();
    const place = placeFor("rbidem");
    const v1 = version(place, 1);
    await s.createPublicationVersion(v1, fixtures_1.ADMIN);
    const bad = { ...place, commercial: { priceState: "unknown" } };
    const v2 = version(bad, 2, fixtures_1.T + 30_000);
    await s.createPublicationVersion(v2, fixtures_1.ADMIN);
    const rb = await s.requestRollback({
        placeId: place.placeId,
        fromPublicationId: v2.publicationId,
        targetPublicationId: v1.publicationId,
        reasonCode: "admin_request",
        actor: fixtures_1.ADMIN,
    });
    await s.approveRollback(rb.rollbackId, fixtures_1.ADMIN);
    const one = await s.executeRollbackInEmulator(rb.rollbackId, fixtures_1.ADMIN);
    const two = await s.executeRollbackInEmulator(rb.rollbackId, fixtures_1.ADMIN);
    strict_1.default.equal(one.resultingPublicationId, two.resultingPublicationId);
    const page = await s.listVersionsByPlace(place.placeId, { limit: 20 });
    strict_1.default.equal(page.items.length, 3, "pelaksanaan kedua tidak menambah versi");
    const rollbacks = await s.listRollbacksByPlace(place.placeId, { limit: 10 });
    strict_1.default.equal(rollbacks.items.length, 1);
    strict_1.default.equal(rollbacks.items[0].auditEntries.length, 3);
});
(0, node_test_1.default)("emulator: audit append-only (tiada ganti pada auditId sama)", { skip }, async () => {
    const s = store();
    const place = placeFor("audit");
    const entry = {
        auditId: `emu_aud_${place.placeId}`,
        placeId: place.placeId,
        action: "business_status_changed",
        actorUid: fixtures_1.ADMIN.actorUid,
        actorRole: fixtures_1.ADMIN.actorRole,
        previousState: "active",
        nextState: "temporarily_closed",
        reasonCode: "merchant_reported",
        createdAt: fixtures_1.T,
    };
    await s.appendStatusAudit(entry);
    const again = await s.appendStatusAudit({ ...entry, nextState: "permanently_closed" });
    strict_1.default.equal(again.nextState, "temporarily_closed", "entri asal tidak ditulis ganti");
    const list = await s.listStatusAudit(place.placeId, { limit: 10 });
    strict_1.default.equal(list.items.length, 1);
});
(0, node_test_1.default)("emulator: TIADA tulisan place_registry oleh repository", { skip }, async () => {
    const s = store();
    const place = placeFor("registry");
    await s.createPublicationVersion(version(place, 1), fixtures_1.ADMIN);
    await s.setEmulatorActivePublication(place.placeId, version(place, 1).publicationId, fixtures_1.ADMIN, "publish");
    // Koleksi produksi mesti kekal kosong.
    const db = (0, firestore_1.getFirestore)(app);
    for (const c of ["place_registry", "places_cache", "place_details"]) {
        const snap = await db.collection(c).limit(1).get();
        strict_1.default.equal(snap.empty, true, `${c} tidak boleh disentuh oleh Phase 1.6`);
    }
});
