"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.6 Part P — SENARIO EMAS (A-H).
 * Setiap senario mengesahkan tingkah laku hujung-ke-hujung yang diminta.
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
const ctx = (over = {}) => ({
    now: fixtures_1.T + 1000,
    freshnessInputs: (0, fixtures_1.freshInputsAt)(fixtures_1.T),
    ...over,
});
// A. Kedai aktif, lengkap, segar → LAYAK.
(0, node_test_1.default)("A. kedai aktif+lengkap+segar layak diterbitkan", () => {
    const r = (0, index_1.evaluatePublicationEligibility)((0, fixtures_1.eligiblePlace)(), ctx());
    strict_1.default.equal(r.eligible, true, `blocked: ${r.blockingReasons.join(",")}`);
    strict_1.default.deepEqual(r.blockingReasons, []);
});
// B. Kedai aktif, harga tidak diketahui → LAYAK dengan amaran price_unknown.
(0, node_test_1.default)("B. harga tidak diketahui → layak DENGAN amaran unknown_price", () => {
    const place = (0, fixtures_1.unknownPricePlace)();
    const r = (0, index_1.evaluatePublicationEligibility)(place, ctx());
    strict_1.default.equal(r.eligible, true);
    strict_1.default.ok(r.warnings.includes("unknown_price"));
    // Kad tidak akan mereka julat harga.
    const display = (0, index_1.deriveHonestDisplayState)(place, r, fixtures_1.T);
    strict_1.default.equal(display.price.state, "price_unknown");
    strict_1.default.equal(display.price.priceBandId, undefined);
});
// C. Kedai aktif, waktu LUPUT → tiada open_now; sekat/amaran ikut polisi.
(0, node_test_1.default)("C. waktu luput → tiada open_now, penerbitan disekat oleh polisi lalai", () => {
    const inputs = (0, fixtures_1.freshInputsAt)(fixtures_1.T);
    inputs.openingHours = { fetchedAt: fixtures_1.T - 61 * fixtures_1.DAY };
    const place = (0, fixtures_1.eligiblePlace)();
    const r = (0, index_1.evaluatePublicationEligibility)(place, ctx({ freshnessInputs: inputs }));
    // Polisi lalai: openingHours ialah kritikal + blockPublicationWhenExpired.
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.blockingReasons.includes("expired_critical_freshness"));
    // Dan yang paling penting: open_now TIDAK boleh dikira.
    const display = (0, index_1.deriveHonestDisplayState)(place, r, fixtures_1.T);
    strict_1.default.equal(display.hours.state, "hours_expired");
    strict_1.default.equal(display.hours.canComputeOpenNow, false);
});
// D. Kedai tutup kekal → DISEKAT.
(0, node_test_1.default)("D. kedai tutup kekal disekat daripada penerbitan & paparan awam", () => {
    const place = (0, fixtures_1.permanentlyClosed)();
    const r = (0, index_1.evaluatePublicationEligibility)(place, ctx());
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.blockingReasons.includes("permanently_closed"));
    const display = (0, index_1.deriveHonestDisplayState)(place, r, fixtures_1.T);
    strict_1.default.equal(display.business.state, "blocked");
    strict_1.default.equal(display.business.blockedFromPublic, true);
});
// E. Duplikat belum diselesaikan → DISEKAT.
(0, node_test_1.default)("E. duplikat belum selesai disekat", () => {
    const r = (0, index_1.evaluatePublicationEligibility)((0, fixtures_1.unresolvedDuplicatePlace)(), ctx());
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.blockingReasons.includes("unresolved_duplicate"));
});
// F. Bukti halal LUPUT → tidak boleh papar certified; recheck diperlukan.
(0, node_test_1.default)("F. bukti halal luput → tidak boleh papar certified, recheck diperlukan", () => {
    const inputs = (0, fixtures_1.freshInputsAt)(fixtures_1.T);
    inputs.halalEvidence = { fetchedAt: fixtures_1.T - 366 * fixtures_1.DAY };
    const place = (0, fixtures_1.eligiblePlace)();
    const r = (0, index_1.evaluatePublicationEligibility)(place, ctx({ freshnessInputs: inputs }));
    const display = (0, index_1.deriveHonestDisplayState)(place, r, fixtures_1.T);
    strict_1.default.notEqual(display.safety.halal, "halal_certified");
    strict_1.default.equal(display.safety.halal, "halal_recheck_required");
    strict_1.default.ok(display.safety.warningCodes.includes("halal_evidence_expired"));
    // Bukti keselamatan kritikal yang luput turut menyekat penerbitan.
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.blockingReasons.includes("expired_critical_freshness"));
    strict_1.default.ok(r.warnings.includes("halal_evidence_recheck"));
});
// G. Penerbitan sedia ada di-rollback → sejarah kekal, penunjuk berubah.
(0, node_test_1.default)("G. rollback: sejarah kekal, penunjuk emulator berubah, tiada versi dipadam", async () => {
    let t = fixtures_1.T;
    const store = new index_1.InMemoryPublicationStore({ now: () => (t += 1000) });
    const v1 = (0, index_1.buildPublicationVersion)({
        place: (0, fixtures_1.eligiblePlace)(),
        actor: fixtures_1.ADMIN,
        now: fixtures_1.T,
        versionNumber: 1,
        sourceCanonicalVersion: fixtures_1.SOURCE_VERSION,
        eligibilityContext: { freshnessInputs: (0, fixtures_1.freshInputsAt)(fixtures_1.T) },
    }).version;
    await store.createPublicationVersion(v1, fixtures_1.ADMIN);
    await store.setEmulatorActivePublication(v1.placeId, v1.publicationId, fixtures_1.ADMIN, "publish");
    const bad = (0, fixtures_1.eligiblePlace)();
    bad.quality = { rating: 1.0, reviewCount: 1 };
    const v2 = (0, index_1.buildPublicationVersion)({
        place: bad,
        actor: fixtures_1.ADMIN,
        now: fixtures_1.T + 60_000,
        versionNumber: 2,
        sourceCanonicalVersion: fixtures_1.SOURCE_VERSION,
        eligibilityContext: { freshnessInputs: (0, fixtures_1.freshInputsAt)(fixtures_1.T) },
    }).version;
    await store.createPublicationVersion(v2, fixtures_1.ADMIN);
    await store.setEmulatorActivePublication(v1.placeId, v2.publicationId, fixtures_1.ADMIN, "publish");
    const rb = await store.requestRollback({
        placeId: v1.placeId,
        fromPublicationId: v2.publicationId,
        targetPublicationId: v1.publicationId,
        reasonCode: "incorrect_data_published",
        actor: fixtures_1.ADMIN,
    });
    await store.approveRollback(rb.rollbackId, fixtures_1.ADMIN);
    const done = await store.executeRollbackInEmulator(rb.rollbackId, fixtures_1.ADMIN);
    // Sejarah dikekalkan.
    strict_1.default.ok(await store.getPublicationVersion(v1.publicationId));
    strict_1.default.ok(await store.getPublicationVersion(v2.publicationId));
    const page = await store.listVersionsByPlace(v1.placeId, { limit: 20 });
    strict_1.default.equal(page.items.length, 3);
    // Penunjuk aktif emulator berubah kepada versi pemulihan.
    const head = await store.getActiveHead(v1.placeId);
    strict_1.default.equal(head?.activePublicationId, done.resultingPublicationId);
    strict_1.default.equal(head?.reasonCode, "rollback_executed");
    // Kandungan yang dipulihkan sepadan dengan sasaran (rating asal).
    const restored = await store.getPublicationVersion(done.resultingPublicationId);
    strict_1.default.equal(restored?.snapshot.place.quality.rating, 4.4);
});
// H. Penerbitan sama dihantar dua kali → satu versi sahaja (idempoten).
(0, node_test_1.default)("H. penerbitan sama dihantar dua kali → satu versi (idempoten)", async () => {
    let t = fixtures_1.T;
    const store = new index_1.InMemoryPublicationStore({ now: () => (t += 1000) });
    const a = (0, index_1.buildPublicationVersion)({
        place: (0, fixtures_1.eligiblePlace)(),
        actor: fixtures_1.ADMIN,
        now: fixtures_1.T,
        versionNumber: 1,
        sourceCanonicalVersion: fixtures_1.SOURCE_VERSION,
        eligibilityContext: { freshnessInputs: (0, fixtures_1.freshInputsAt)(fixtures_1.T) },
    }).version;
    // Percubaan kedua: masa & nombor versi berbeza, kandungan SAMA.
    const b = (0, index_1.buildPublicationVersion)({
        place: (0, fixtures_1.eligiblePlace)(),
        actor: fixtures_1.ADMIN,
        now: fixtures_1.T + 120_000,
        versionNumber: 2,
        sourceCanonicalVersion: fixtures_1.SOURCE_VERSION,
        eligibilityContext: { freshnessInputs: (0, fixtures_1.freshInputsAt)(fixtures_1.T) },
    }).version;
    const r1 = await store.createPublicationVersion(a, fixtures_1.ADMIN);
    const r2 = await store.createPublicationVersion(b, fixtures_1.ADMIN);
    strict_1.default.equal(r1.publicationId, r2.publicationId);
    strict_1.default.equal(r2.versionNumber, 1, "nombor versi TIDAK dinaikkan oleh ulangan");
    const page = await store.listVersionsByPlace(a.placeId, { limit: 20 });
    strict_1.default.equal(page.items.length, 1);
    // Satu peristiwa invalidasi sahaja.
    const events = await store.listInvalidationEvents(a.placeId, { limit: 20 });
    strict_1.default.equal(events.items.length, 1);
});
