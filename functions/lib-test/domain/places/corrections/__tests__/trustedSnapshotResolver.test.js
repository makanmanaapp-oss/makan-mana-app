"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.14B — ujian penyelesai snapshot DIPERCAYAI + model ketidakpadanan.
 * Membuktikan snapshot klien TIDAK PERNAH autoritatif.
 */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const trustedSnapshotResolver_1 = require("../trustedSnapshotResolver");
const NOW = 1_700_000_000_000;
function view(over = {}) {
    return {
        placeId: "canon-1",
        title: "Nasi Kandar Pelita (TRUSTED)",
        address: "Trusted Address",
        coordinates: { lat: 3.16, lng: 101.71 },
        hoursState: "open_now",
        priceState: "price_verified",
        ratingState: "rating_shown",
        businessState: "active",
        halalState: "halal_certified",
        dietaryState: "dietary_verified",
        allergenState: "allergen_known",
        imageReferences: ["img1"],
        tagIds: ["mamak"],
        warnings: [],
        sourceMode: "live",
        publicationVersion: 7,
        ...over,
    };
}
function source(over = {}) {
    return {
        resolveAlias: async (id) => over.alias ?? { requestedPlaceId: id, resolvedCanonicalPlaceId: id, chain: [id], status: "not_found" },
        getActivePublication: async () => over.publication ?? null,
        getApprovedCanonicalTestSource: async () => over.test ?? null,
        getPlaceDetails: async () => over.details ?? null,
        getPlacesCache: async () => over.cache ?? null,
    };
}
// Tests 1-8: klien TIDAK boleh menetapkan medan dipercayai — snapshot datang
// SEPENUHNYA daripada sumber dipercayai. (Penyelesai tiada parameter nilai klien.)
(0, node_test_1.test)("trusted snapshot fields come only from the trusted source", async () => {
    const r = await (0, trustedSnapshotResolver_1.resolveTrustedSnapshot)({ uid: "u", placeId: "canon-1" }, source({ publication: view() }), NOW);
    const s = r.trustedOriginalSnapshot;
    strict_1.default.equal(s.title, "Nasi Kandar Pelita (TRUSTED)"); // title
    strict_1.default.equal(s.address, "Trusted Address"); // address
    strict_1.default.deepEqual(s.coordinates, { lat: 3.16, lng: 101.71 }); // coordinates
    strict_1.default.equal(s.ratingState, "rating_shown"); // rating
    strict_1.default.equal(s.priceState, "price_verified"); // price
    strict_1.default.equal(s.hoursState, "open_now"); // hours
    strict_1.default.equal(s.halalState, "halal_certified"); // halal
    strict_1.default.equal(s.allergenState, "allergen_known"); // allergen
    strict_1.default.equal(s.businessState, "active");
});
// Test 9: penerbitan canonical diutamakan.
(0, node_test_1.test)("active canonical publication is preferred over details/cache", async () => {
    const r = await (0, trustedSnapshotResolver_1.resolveTrustedSnapshot)({ uid: "u", placeId: "canon-1" }, source({ publication: view({ title: "PUB" }), details: view({ title: "DETAILS" }), cache: view({ title: "CACHE" }) }), NOW);
    strict_1.default.equal(r.sourceUsed, "canonical_publication");
    strict_1.default.equal(r.trustedOriginalSnapshot.title, "PUB");
});
// Test 10: fallback place_details.
(0, node_test_1.test)("falls back to place_details when no publication", async () => {
    const r = await (0, trustedSnapshotResolver_1.resolveTrustedSnapshot)({ uid: "u", placeId: "canon-1" }, source({ details: view({ title: "DETAILS" }), cache: view({ title: "CACHE" }) }), NOW);
    strict_1.default.equal(r.sourceUsed, "place_details");
    strict_1.default.equal(r.trustedOriginalSnapshot.title, "DETAILS");
});
// Test 11: fallback places_cache.
(0, node_test_1.test)("falls back to places_cache last", async () => {
    const r = await (0, trustedSnapshotResolver_1.resolveTrustedSnapshot)({ uid: "u", placeId: "canon-1" }, source({ cache: view({ title: "CACHE" }) }), NOW);
    strict_1.default.equal(r.sourceUsed, "places_cache");
});
// Test 12: tiada sumber dipercayai → tolak.
(0, node_test_1.test)("rejects when no trusted source exists", async () => {
    await strict_1.default.rejects(() => (0, trustedSnapshotResolver_1.resolveTrustedSnapshot)({ uid: "u", placeId: "canon-1" }, source({}), NOW), (e) => e instanceof trustedSnapshotResolver_1.TrustedSnapshotError && e.code === "no_trusted_source");
});
// Test 13: alias diselesaikan.
(0, node_test_1.test)("resolves alias to canonical id", async () => {
    const alias = { requestedPlaceId: "legacy-1", resolvedCanonicalPlaceId: "canon-1", chain: ["legacy-1", "canon-1"], status: "resolved" };
    const r = await (0, trustedSnapshotResolver_1.resolveTrustedSnapshot)({ uid: "u", placeId: "legacy-1" }, source({ alias, publication: view() }), NOW);
    strict_1.default.equal(r.resolvedCanonicalPlaceId, "canon-1");
    strict_1.default.equal(r.trustedOriginalSnapshot.placeId, "canon-1");
});
// Test 14: alias circular ditolak.
(0, node_test_1.test)("rejects circular alias", async () => {
    const alias = { requestedPlaceId: "a", resolvedCanonicalPlaceId: "a", chain: ["a", "b", "a"], status: "circular" };
    await strict_1.default.rejects(() => (0, trustedSnapshotResolver_1.resolveTrustedSnapshot)({ uid: "u", placeId: "a" }, source({ alias, publication: view() }), NOW), (e) => e instanceof trustedSnapshotResolver_1.TrustedSnapshotError && e.code === "alias_unsafe");
});
// Test 15: alias blocked ditolak.
(0, node_test_1.test)("rejects blocked alias", async () => {
    const alias = { requestedPlaceId: "a", resolvedCanonicalPlaceId: "a", chain: ["a"], status: "blocked" };
    await strict_1.default.rejects(() => (0, trustedSnapshotResolver_1.resolveTrustedSnapshot)({ uid: "u", placeId: "a" }, source({ alias, publication: view() }), NOW), (e) => e instanceof trustedSnapshotResolver_1.TrustedSnapshotError && e.code === "alias_unsafe");
});
(0, node_test_1.test)("rejects blocked trusted record", async () => {
    await strict_1.default.rejects(() => (0, trustedSnapshotResolver_1.resolveTrustedSnapshot)({ uid: "u", placeId: "canon-1" }, source({ publication: view({ blocked: true }) }), NOW), (e) => e instanceof trustedSnapshotResolver_1.TrustedSnapshotError && e.code === "invalid_place");
});
// Test 16: hash deterministik.
(0, node_test_1.test)("content hash is deterministic and value-sensitive", () => {
    const h1 = (0, trustedSnapshotResolver_1.trustedContentHash)(view(), "canon-1");
    const h2 = (0, trustedSnapshotResolver_1.trustedContentHash)(view(), "canon-1");
    const h3 = (0, trustedSnapshotResolver_1.trustedContentHash)(view({ title: "different" }), "canon-1");
    strict_1.default.equal(h1, h2);
    strict_1.default.notEqual(h1, h3);
});
// Test 17: snapshot mengandungi HANYA medan dipercayai (tiada medan klien tambahan).
(0, node_test_1.test)("snapshot contains only trusted fields", async () => {
    const r = await (0, trustedSnapshotResolver_1.resolveTrustedSnapshot)({ uid: "u", placeId: "canon-1" }, source({ publication: view() }), NOW);
    const keys = Object.keys(r.trustedOriginalSnapshot).sort();
    strict_1.default.ok(keys.includes("contentHash"));
    strict_1.default.ok(!keys.includes("reporterUid"));
    strict_1.default.ok(!keys.includes("proposedValues"));
    strict_1.default.equal(r.trustedOriginalSnapshot.capturedAt, NOW);
});
// Test 18: ketidakpadanan DIREDAKSI (hash, bukan nilai mentah).
(0, node_test_1.test)("mismatch warnings are redacted (hashes, not raw values)", async () => {
    const alias = { requestedPlaceId: "legacy-x", resolvedCanonicalPlaceId: "canon-1", chain: ["legacy-x", "canon-1"], status: "resolved" };
    const r = await (0, trustedSnapshotResolver_1.resolveTrustedSnapshot)({ uid: "u", placeId: "legacy-x" }, source({ alias, publication: view({ publicationVersion: 9 }) }), NOW);
    const mismatches = (0, trustedSnapshotResolver_1.compareClientToTrusted)({ placeId: "legacy-x", currentValue: "secret client value", publicationVersion: 3 }, r);
    const alias1 = mismatches.find((m) => m.mismatchType === "alias_resolved");
    strict_1.default.ok(alias1, "alias_resolved mismatch expected");
    // Nilai mentah TIDAK PERNAH dalam output.
    const blob = JSON.stringify(mismatches);
    strict_1.default.ok(!blob.includes("secret client value"));
    strict_1.default.ok(!blob.includes("legacy-x") || alias1.clientValueHash !== "legacy-x");
    strict_1.default.ok(mismatches.some((m) => m.mismatchType === "publication_version_mismatch"));
});
// Test 20: identiti dedup menggunakan placeId dipercayai (server-derived).
(0, node_test_1.test)("resolved canonical id (server-derived) drives identity", async () => {
    const alias = { requestedPlaceId: "legacy-1", resolvedCanonicalPlaceId: "canon-9", chain: ["legacy-1", "canon-9"], status: "resolved" };
    const r = await (0, trustedSnapshotResolver_1.resolveTrustedSnapshot)({ uid: "u", placeId: "legacy-1" }, source({ alias, publication: view({ placeId: "canon-9" }) }), NOW);
    strict_1.default.equal(r.resolvedCanonicalPlaceId, "canon-9");
    strict_1.default.equal(r.trustedOriginalSnapshot.placeId, "canon-9");
});
// Test 19 (simulasi urutan callable): tiada tulisan sebelum snapshot diselesaikan.
(0, node_test_1.test)("no write dep is invoked when trusted resolution fails", async () => {
    let writes = 0;
    const write = async () => {
        writes++;
    };
    try {
        // Cermin urutan callable: selesaikan snapshot DAHULU; jika gagal, jangan tulis.
        await (0, trustedSnapshotResolver_1.resolveTrustedSnapshot)({ uid: "u", placeId: "canon-1" }, source({}), NOW);
        await write(); // tidak dicapai
    }
    catch {
        /* dijangka */
    }
    strict_1.default.equal(writes, 0);
});
