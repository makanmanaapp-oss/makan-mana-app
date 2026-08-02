"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.6 Part O — ujian versi, rollback, idempotency & invalidasi (31-43).
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
function clock(start = fixtures_1.T) {
    let t = start;
    return { now: () => (t += 1000) };
}
function build(placeOverride, versionNumber = 1) {
    const place = { ...(0, fixtures_1.eligiblePlace)(), ...(placeOverride ?? {}) };
    return (0, index_1.buildPublicationVersion)({
        place,
        actor: fixtures_1.ADMIN,
        now: fixtures_1.T,
        versionNumber,
        sourceCanonicalVersion: fixtures_1.SOURCE_VERSION,
        eligibilityContext: { freshnessInputs: (0, fixtures_1.freshInputsAt)(fixtures_1.T) },
    });
}
// 31. Versi penerbitan IMMUTABLE.
(0, node_test_1.default)("31. versi penerbitan immutable — cipta kedua mengembalikan yang sama", async () => {
    const store = new index_1.InMemoryPublicationStore(clock());
    const { version } = build();
    const a = await store.createPublicationVersion(version, fixtures_1.ADMIN);
    const b = await store.createPublicationVersion(version, fixtures_1.ADMIN);
    strict_1.default.equal(a.publicationId, b.publicationId);
    strict_1.default.equal(a.versionNumber, b.versionNumber);
    const page = await store.listVersionsByPlace(version.placeId, { limit: 10 });
    strict_1.default.equal(page.items.length, 1, "tiada versi pendua dicipta");
});
(0, node_test_1.default)("31b. mutasi salinan yang dikembalikan tidak menjejaskan simpanan", async () => {
    const store = new index_1.InMemoryPublicationStore(clock());
    const { version } = build();
    const created = await store.createPublicationVersion(version, fixtures_1.ADMIN);
    created.publicationStatus = "hidden";
    created.snapshot.place.identity.canonicalName = "DIUBAH";
    const fetched = await store.getPublicationVersion(version.publicationId);
    strict_1.default.equal(fetched?.publicationStatus, "published");
    strict_1.default.notEqual(fetched?.snapshot.place.identity.canonicalName, "DIUBAH");
});
// 32. Nombor versi MENINGKAT.
(0, node_test_1.default)("32. nombor versi meningkat bagi kandungan berbeza", async () => {
    const store = new index_1.InMemoryPublicationStore(clock());
    const first = build().version;
    await store.createPublicationVersion(first, fixtures_1.ADMIN);
    strict_1.default.equal(await store.nextVersionNumber(first.placeId), 2);
    const changed = (0, fixtures_1.eligiblePlace)();
    changed.quality = { rating: 4.9, reviewCount: 999 };
    const second = (0, index_1.buildPublicationVersion)({
        place: changed,
        actor: fixtures_1.ADMIN,
        now: fixtures_1.T + 5000,
        versionNumber: 2,
        sourceCanonicalVersion: fixtures_1.SOURCE_VERSION,
        eligibilityContext: { freshnessInputs: (0, fixtures_1.freshInputsAt)(fixtures_1.T) },
    }).version;
    await store.createPublicationVersion(second, fixtures_1.ADMIN);
    const page = await store.listVersionsByPlace(first.placeId, { limit: 10 });
    strict_1.default.equal(page.items.length, 2);
    strict_1.default.equal(page.items[0].versionNumber, 2, "terbaharu dahulu");
    strict_1.default.equal(page.items[1].versionNumber, 1);
});
// 33. Kandungan sama = IDEMPOTEN.
(0, node_test_1.default)("33. kandungan sama menghasilkan ID + hash sama (idempoten)", () => {
    const a = build().version;
    const b = build().version;
    strict_1.default.equal(a.contentHash, b.contentHash);
    strict_1.default.equal(a.publicationId, b.publicationId);
});
(0, node_test_1.default)("33b. masa/pelaku BERBEZA tidak mengubah hash kandungan", () => {
    const a = build().version;
    const b = (0, index_1.buildPublicationVersion)({
        place: (0, fixtures_1.eligiblePlace)(),
        actor: { actorUid: "other_admin", actorRole: "admin" },
        now: fixtures_1.T + 999_999,
        versionNumber: 7,
        sourceCanonicalVersion: fixtures_1.SOURCE_VERSION,
        eligibilityContext: { freshnessInputs: (0, fixtures_1.freshInputsAt)(fixtures_1.T) },
    }).version;
    strict_1.default.equal(a.contentHash, b.contentHash, "hash mesti bebas masa/pelaku/versi");
});
(0, node_test_1.default)("33c. idempoten walaupun ID berbeza tetapi kandungan sama", async () => {
    const store = new index_1.InMemoryPublicationStore(clock());
    const v1 = build().version;
    await store.createPublicationVersion(v1, fixtures_1.ADMIN);
    const v2 = { ...v1, publicationId: "pub_manual_different_id" };
    const out = await store.createPublicationVersion(v2, fixtures_1.ADMIN);
    strict_1.default.equal(out.publicationId, v1.publicationId, "kandungan sama → versi sedia ada");
    const page = await store.listVersionsByPlace(v1.placeId, { limit: 10 });
    strict_1.default.equal(page.items.length, 1);
});
// 34. Kandungan berbeza = hash berbeza.
(0, node_test_1.default)("34. kandungan berbeza menghasilkan hash berbeza", () => {
    const a = build().version;
    const changed = (0, fixtures_1.eligiblePlace)();
    changed.identity = { ...changed.identity, canonicalName: "Warung Lain" };
    const b = (0, index_1.buildPublicationVersion)({
        place: changed,
        actor: fixtures_1.ADMIN,
        now: fixtures_1.T,
        versionNumber: 1,
        sourceCanonicalVersion: fixtures_1.SOURCE_VERSION,
        eligibilityContext: { freshnessInputs: (0, fixtures_1.freshInputsAt)(fixtures_1.T) },
    }).version;
    strict_1.default.notEqual(a.contentHash, b.contentHash);
    strict_1.default.notEqual(a.publicationId, b.publicationId);
});
(0, node_test_1.default)("34b. versi config/algoritma berbeza menghasilkan hash berbeza", () => {
    const base = {
        placeId: "p1",
        snapshot: { place: (0, fixtures_1.eligiblePlace)() },
        sourceCanonicalVersion: "v1",
        algorithmVersion: "publication_v1",
        configVersion: "publication_config_v1",
    };
    strict_1.default.notEqual((0, index_1.computePublicationContentHash)(base), (0, index_1.computePublicationContentHash)({ ...base, configVersion: "publication_config_v2" }));
    strict_1.default.notEqual((0, index_1.publicationIdFromContent)(base), (0, index_1.publicationIdFromContent)({ ...base, algorithmVersion: "publication_v2" }));
});
(0, node_test_1.default)("pengesahan versi menangkap hash yang tidak sepadan", () => {
    const v = build().version;
    strict_1.default.deepEqual((0, index_1.validatePublicationVersion)(v), []);
    strict_1.default.ok((0, index_1.validatePublicationVersion)({ ...v, contentHash: "palsu" }).includes("contentHash_mismatch"));
    strict_1.default.ok((0, index_1.validatePublicationVersion)({ ...v, versionNumber: 0 }).includes("versionNumber_invalid"));
});
// Tiada penerbitan boleh memintas pengesahan (peraturan #10).
(0, node_test_1.default)("penerbitan tidak layak MELEMPAR — tiada laluan pintasan", () => {
    strict_1.default.throws(() => (0, index_1.buildPublicationVersion)({
        place: (0, fixtures_1.permanentlyClosed)(),
        actor: fixtures_1.ADMIN,
        now: fixtures_1.T,
        versionNumber: 1,
        sourceCanonicalVersion: fixtures_1.SOURCE_VERSION,
        eligibilityContext: { freshnessInputs: (0, fixtures_1.freshInputsAt)(fixtures_1.T) },
    }), (e) => {
        strict_1.default.ok(e instanceof index_1.PublicationNotEligibleError);
        strict_1.default.ok(e.result.blockingReasons.includes("permanently_closed"));
        return true;
    });
});
(0, node_test_1.default)("snapshot kelayakan dibekukan ke dalam versi", () => {
    const { version } = build();
    strict_1.default.equal(version.eligibilitySnapshot.eligible, true);
    strict_1.default.equal(version.eligibilitySnapshot.engineVersion, "eligibility_v1");
    strict_1.default.equal(version.eligibilitySnapshot.overallFreshnessState, "fresh");
    strict_1.default.ok(version.snapshot.displayState, "keadaan paparan jujur disertakan");
    strict_1.default.equal(version.snapshot.displayState?.hours.canComputeOpenNow, true);
    strict_1.default.deepEqual(version.changeSummary, ["initial_publication"]);
});
// 35. Rollback MENGEKALKAN versi lebih baharu.
(0, node_test_1.default)("35. rollback mengekalkan versi lebih baharu (tiada pemadaman)", async () => {
    const store = new index_1.InMemoryPublicationStore(clock());
    const v1 = build().version;
    await store.createPublicationVersion(v1, fixtures_1.ADMIN);
    await store.setEmulatorActivePublication(v1.placeId, v1.publicationId, fixtures_1.ADMIN, "publish");
    const changed = (0, fixtures_1.eligiblePlace)();
    changed.quality = { rating: 2.0, reviewCount: 5 }; // penerbitan "salah"
    const v2 = (0, index_1.buildPublicationVersion)({
        place: changed,
        actor: fixtures_1.ADMIN,
        now: fixtures_1.T + 10_000,
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
    strict_1.default.equal(done.status, "executed_in_emulator");
    strict_1.default.ok(done.resultingPublicationId, "rollback mencipta versi BAHARU");
    // Versi 1 & 2 KEKAL wujud; versi 3 (pemulihan) ditambah.
    const page = await store.listVersionsByPlace(v1.placeId, { limit: 10 });
    strict_1.default.equal(page.items.length, 3);
    strict_1.default.ok(await store.getPublicationVersion(v2.publicationId), "v2 TIDAK dipadam");
    // Penunjuk aktif emulator menunjuk ke versi pemulihan baharu.
    const head = await store.getActiveHead(v1.placeId);
    strict_1.default.equal(head?.activePublicationId, done.resultingPublicationId);
    strict_1.default.equal(head?.activeVersionNumber, 3);
    // Versi terdahulu ditanda superseded, bukan dipadam.
    const from = await store.getPublicationVersion(v2.publicationId);
    strict_1.default.equal(from?.publicationStatus, "superseded");
    strict_1.default.ok(from?.effectiveUntil !== undefined);
    // Versi pemulihan membawa metadata rollback.
    const restored = await store.getPublicationVersion(done.resultingPublicationId);
    strict_1.default.equal(restored?.rollbackOfPublicationId, v1.publicationId);
    strict_1.default.equal(restored?.supersedesPublicationId, v2.publicationId);
});
(0, node_test_1.default)("35b. pelaksanaan rollback IDEMPOTEN (tiada versi tambahan)", async () => {
    const store = new index_1.InMemoryPublicationStore(clock());
    const v1 = build().version;
    await store.createPublicationVersion(v1, fixtures_1.ADMIN);
    const changed = (0, fixtures_1.eligiblePlace)();
    changed.commercial = { priceState: "unknown" };
    const v2 = (0, index_1.buildPublicationVersion)({
        place: changed,
        actor: fixtures_1.ADMIN,
        now: fixtures_1.T + 10_000,
        versionNumber: 2,
        sourceCanonicalVersion: fixtures_1.SOURCE_VERSION,
        eligibilityContext: { freshnessInputs: (0, fixtures_1.freshInputsAt)(fixtures_1.T) },
    }).version;
    await store.createPublicationVersion(v2, fixtures_1.ADMIN);
    const rb = await store.requestRollback({
        placeId: v1.placeId,
        fromPublicationId: v2.publicationId,
        targetPublicationId: v1.publicationId,
        reasonCode: "admin_request",
        actor: fixtures_1.ADMIN,
    });
    await store.approveRollback(rb.rollbackId, fixtures_1.ADMIN);
    const one = await store.executeRollbackInEmulator(rb.rollbackId, fixtures_1.ADMIN);
    const two = await store.executeRollbackInEmulator(rb.rollbackId, fixtures_1.ADMIN);
    strict_1.default.equal(one.resultingPublicationId, two.resultingPublicationId);
    const page = await store.listVersionsByPlace(v1.placeId, { limit: 10 });
    strict_1.default.equal(page.items.length, 3, "pelaksanaan kedua tidak menambah versi");
    // Permintaan rollback berulang juga idempoten.
    const again = await store.requestRollback({
        placeId: v1.placeId,
        fromPublicationId: v2.publicationId,
        targetPublicationId: v1.publicationId,
        reasonCode: "admin_request",
        actor: fixtures_1.ADMIN,
    });
    strict_1.default.equal(again.rollbackId, rb.rollbackId);
});
(0, node_test_1.default)("35c. peralihan status rollback dikawal", () => {
    strict_1.default.equal((0, index_1.canTransitionRollbackStatus)("requested", "approved"), true);
    strict_1.default.equal((0, index_1.canTransitionRollbackStatus)("approved", "executed_in_emulator"), true);
    strict_1.default.equal((0, index_1.canTransitionRollbackStatus)("requested", "executed_in_emulator"), false);
    strict_1.default.equal((0, index_1.canTransitionRollbackStatus)("executed_in_emulator", "approved"), false);
    strict_1.default.equal((0, index_1.canTransitionRollbackStatus)("rejected", "approved"), false);
});
// 36. Rollback mencipta AUDIT.
(0, node_test_1.default)("36. rollback mencipta jejak audit lengkap", async () => {
    const store = new index_1.InMemoryPublicationStore(clock());
    const v1 = build().version;
    await store.createPublicationVersion(v1, fixtures_1.ADMIN);
    const changed = (0, fixtures_1.eligiblePlace)();
    changed.hours = { hoursState: "unknown" };
    const v2 = (0, index_1.buildPublicationVersion)({
        place: changed,
        actor: fixtures_1.ADMIN,
        now: fixtures_1.T + 10_000,
        versionNumber: 2,
        sourceCanonicalVersion: fixtures_1.SOURCE_VERSION,
        eligibilityContext: { freshnessInputs: (0, fixtures_1.freshInputsAt)(fixtures_1.T) },
    }).version;
    await store.createPublicationVersion(v2, fixtures_1.ADMIN);
    const rb = await store.requestRollback({
        placeId: v1.placeId,
        fromPublicationId: v2.publicationId,
        targetPublicationId: v1.publicationId,
        reasonCode: "safety_data_incorrect",
        notes: "bukti alergen salah",
        actor: fixtures_1.ADMIN,
    });
    await store.approveRollback(rb.rollbackId, fixtures_1.ADMIN);
    const done = await store.executeRollbackInEmulator(rb.rollbackId, fixtures_1.ADMIN);
    // Audit dalam rekod rollback.
    const actions = done.auditEntries.map((e) => e.action);
    strict_1.default.deepEqual(actions, [
        "rollback_requested",
        "rollback_approved",
        "rollback_executed",
    ]);
    strict_1.default.equal(done.auditEntries[0].notes, "bukti alergen salah");
    // Audit status peringkat kedai (append-only).
    const audit = await store.listStatusAudit(v1.placeId, { limit: 50 });
    const kinds = new Set(audit.items.map((a) => a.action));
    strict_1.default.ok(kinds.has("publication_created"));
    strict_1.default.ok(kinds.has("rollback_requested"));
    strict_1.default.ok(kinds.has("rollback_approved"));
    strict_1.default.ok(kinds.has("rollback_executed"));
    strict_1.default.ok(kinds.has("publication_head_moved"));
    for (const e of audit.items) {
        strict_1.default.ok(e.reasonCode, "setiap entri audit mesti membawa reasonCode");
        strict_1.default.equal(e.actorUid, fixtures_1.ADMIN.actorUid);
    }
});
// 37. Peristiwa invalidasi cache DICIPTA.
(0, node_test_1.default)("37. peristiwa invalidasi cache dicipta untuk terbit & rollback", async () => {
    const store = new index_1.InMemoryPublicationStore(clock());
    const v1 = build().version;
    await store.createPublicationVersion(v1, fixtures_1.ADMIN);
    const events = await store.listInvalidationEvents(v1.placeId, { limit: 20 });
    strict_1.default.equal(events.items.length, 1);
    strict_1.default.equal(events.items[0].reason, "publication_created");
    strict_1.default.ok(events.items[0].affectedScopes.includes("place_card"));
    strict_1.default.equal(events.items[0].publicationVersion, 1);
});
(0, node_test_1.default)("37b. peristiwa invalidasi idempoten pada eventId sama", async () => {
    const store = new index_1.InMemoryPublicationStore(clock());
    const ev = (0, index_1.buildCacheInvalidationEvent)({
        placeId: "mm_x",
        reason: "merge_executed",
        createdAt: fixtures_1.T,
        algorithmVersion: "publication_v1",
    });
    await store.appendInvalidationEvent(ev);
    await store.appendInvalidationEvent(ev);
    const list = await store.listInvalidationEvents("mm_x", { limit: 10 });
    strict_1.default.equal(list.items.length, 1);
    strict_1.default.deepEqual(ev.affectedScopes, index_1.DEFAULT_SCOPES_BY_REASON.merge_executed);
});
// 42/43. Repository TIDAK mendedahkan tulisan produksi atau penerbitan mobile.
(0, node_test_1.default)("42/43. repository tiada operasi place_registry, mobile publish atau delete", () => {
    const store = new index_1.InMemoryPublicationStore(clock());
    const names = new Set([
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(store)),
        ...Object.keys(store),
    ]);
    for (const forbidden of [
        "writePlaceRegistry",
        "publishToMobile",
        "publishToProduction",
        "deletePublication",
        "deleteVersion",
        "hardDelete",
        "invalidateCacheNow",
        "purgeHistory",
    ]) {
        strict_1.default.equal(names.has(forbidden), false, `${forbidden} tidak boleh wujud`);
    }
    // Nama koleksi yang disentuh oleh repository ini adalah emulator sahaja.
    const src = index_1.InMemoryPublicationStore.toString();
    strict_1.default.equal(src.includes("place_registry"), false);
});
(0, node_test_1.default)("senarai versi TERBATAS (had halaman dikuatkuasa)", async () => {
    const store = new index_1.InMemoryPublicationStore(clock());
    const v1 = build().version;
    await store.createPublicationVersion(v1, fixtures_1.ADMIN);
    const page = await store.listVersionsByPlace(v1.placeId, { limit: 10_000 });
    strict_1.default.ok(page.items.length <= 100);
});
(0, node_test_1.default)("penunjuk aktif menolak versi kedai lain", async () => {
    const store = new index_1.InMemoryPublicationStore(clock());
    const v1 = build().version;
    await store.createPublicationVersion(v1, fixtures_1.ADMIN);
    await strict_1.default.rejects(() => store.setEmulatorActivePublication("mm_other", v1.publicationId, fixtures_1.ADMIN, "publish"));
    await strict_1.default.rejects(() => store.setEmulatorActivePublication(v1.placeId, "pub_tidak_wujud", fixtures_1.ADMIN, "publish"));
});
