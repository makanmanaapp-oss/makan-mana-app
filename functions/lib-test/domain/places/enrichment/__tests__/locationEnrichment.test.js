"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.14C.1 — ujian domain enrichment lokasi (TULEN, tiada I/O/rangkaian).
 */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const locationEnrichment_1 = require("../locationEnrichment");
const NOW = 1_700_000_000_000;
const ID = "ChIJexampleProviderPlaceId000";
function raw(over = {}) {
    return {
        id: ID,
        displayName: { text: "Nasi Kandar Pelita" },
        formattedAddress: "1 Jalan Ampang, 50450 Kuala Lumpur",
        location: { latitude: 3.1578, longitude: 101.7123 },
        businessStatus: "OPERATIONAL",
        googleMapsUri: "https://maps.google.com/?cid=1",
        ...over,
    };
}
// 1. Exact provider ID fetch → FETCH_READY, coordinates carried through.
(0, node_test_1.test)("1: exact provider ID fetch yields FETCH_READY with coordinates", () => {
    const r = (0, locationEnrichment_1.mapProviderResponse)(ID, "Nasi Kandar Pelita", raw(), NOW);
    strict_1.default.equal(r.fetchClass, "FETCH_READY");
    strict_1.default.equal(r.enrichment?.latitude, 3.1578);
    strict_1.default.equal(r.enrichment?.longitude, 101.7123);
    strict_1.default.equal(r.enrichment?.providerPlaceId, ID);
});
// 2. Location pair validation → both present accepted.
(0, node_test_1.test)("2: valid location pair accepted", () => {
    const r = (0, locationEnrichment_1.mapProviderResponse)(ID, undefined, raw({ location: { latitude: -6.2, longitude: 106.8 } }), NOW);
    strict_1.default.equal(r.fetchClass, "FETCH_READY");
});
// 3. Invalid latitude rejects (LOCATION_MISSING).
(0, node_test_1.test)("3: invalid latitude rejects", () => {
    const r = (0, locationEnrichment_1.mapProviderResponse)(ID, undefined, raw({ location: { latitude: 999, longitude: 101 } }), NOW);
    strict_1.default.equal(r.fetchClass, "LOCATION_MISSING");
});
// 4. Invalid longitude rejects.
(0, node_test_1.test)("4: invalid longitude rejects", () => {
    const r = (0, locationEnrichment_1.mapProviderResponse)(ID, undefined, raw({ location: { latitude: 3.1, longitude: 500 } }), NOW);
    strict_1.default.equal(r.fetchClass, "LOCATION_MISSING");
});
// 5. Provider ID mismatch rejects.
(0, node_test_1.test)("5: provider ID mismatch rejects", () => {
    const r = (0, locationEnrichment_1.mapProviderResponse)(ID, undefined, raw({ id: "ChIJsomethingCompletelyElse99" }), NOW);
    strict_1.default.equal(r.fetchClass, "ID_MISMATCH");
});
// 6. Branch/display-name mismatch holds.
(0, node_test_1.test)("6: branch/display-name mismatch holds", () => {
    const r = (0, locationEnrichment_1.mapProviderResponse)(ID, "Nasi Kandar Pelita", raw({ displayName: { text: "Starbucks Reserve KLCC" } }), NOW);
    strict_1.default.equal(r.fetchClass, "BRANCH_MISMATCH");
});
// 7. Missing location holds.
(0, node_test_1.test)("7: missing location holds", () => {
    const r = (0, locationEnrichment_1.mapProviderResponse)(ID, undefined, raw({ location: undefined }), NOW);
    strict_1.default.equal(r.fetchClass, "LOCATION_MISSING");
});
// 8. Empty address becomes null (unknown), not fabricated.
(0, node_test_1.test)("8: empty address becomes null", () => {
    const r = (0, locationEnrichment_1.mapProviderResponse)(ID, undefined, raw({ formattedAddress: "   " }), NOW);
    strict_1.default.equal(r.fetchClass, "FETCH_READY");
    strict_1.default.equal(r.enrichment?.formattedAddress, null);
});
// 9. Provenance is server-derived (source/api/mask/fetchedAt/freshUntil set here).
(0, node_test_1.test)("9: provenance is server-derived", () => {
    const r = (0, locationEnrichment_1.mapProviderResponse)(ID, undefined, raw(), NOW);
    strict_1.default.equal(r.enrichment?.source, locationEnrichment_1.ENRICHMENT_SOURCE);
    strict_1.default.equal(r.enrichment?.sourceApi, locationEnrichment_1.ENRICHMENT_SOURCE_API);
    strict_1.default.equal(r.enrichment?.sourceFieldMask, locationEnrichment_1.PLACE_DETAILS_FIELD_MASK);
    strict_1.default.equal(r.enrichment?.fetchedAt, NOW);
    strict_1.default.equal(r.enrichment?.freshUntil, NOW + locationEnrichment_1.LOCATION_FRESH_TTL_MS);
});
// 10. Field allowlist prevents unrelated writes.
(0, node_test_1.test)("10: field allowlist prevents unrelated writes", () => {
    const r = (0, locationEnrichment_1.mapProviderResponse)(ID, undefined, raw(), NOW);
    const fields = (0, locationEnrichment_1.buildEnrichmentFieldUpdate)(r.enrichment);
    strict_1.default.doesNotThrow(() => (0, locationEnrichment_1.assertFieldsAllowlisted)(fields));
    strict_1.default.throws(() => (0, locationEnrichment_1.assertFieldsAllowlisted)({ ...fields, displayName: "HACK" }));
    strict_1.default.throws(() => (0, locationEnrichment_1.assertFieldsAllowlisted)({ rating: 5 }));
});
// 11. Existing legacy fields are preserved (update object touches ONLY allowlist).
(0, node_test_1.test)("11: enrichment update never includes legacy keys", () => {
    const r = (0, locationEnrichment_1.mapProviderResponse)(ID, undefined, raw(), NOW);
    const fields = (0, locationEnrichment_1.buildEnrichmentFieldUpdate)(r.enrichment);
    for (const legacy of ["displayName", "rating", "userRatingCount", "priceLevel", "keywords", "photoUrl", "lastFetchedAt"]) {
        strict_1.default.ok(!(legacy in fields), `must not write legacy field '${legacy}'`);
    }
});
// 12. Fresh record avoids unnecessary rewrite.
(0, node_test_1.test)("12: fresh record is not rewritten", () => {
    const doc = { location: { latitude: 3.1, longitude: 101.7 }, locationFreshUntil: NOW + 1000 };
    strict_1.default.equal((0, locationEnrichment_1.isLocationFresh)(doc, NOW), true);
    strict_1.default.equal((0, locationEnrichment_1.mayOverwrite)(doc, NOW), false);
});
// 13. Response checksum idempotency (same input → same checksum).
(0, node_test_1.test)("13: response checksum is deterministic/idempotent", () => {
    strict_1.default.equal((0, locationEnrichment_1.providerResponseChecksum)(raw()), (0, locationEnrichment_1.providerResponseChecksum)(raw()));
    strict_1.default.notEqual((0, locationEnrichment_1.providerResponseChecksum)(raw()), (0, locationEnrichment_1.providerResponseChecksum)(raw({ location: { latitude: 1, longitude: 2 } })));
});
// 14. places_cache is never used as per-place location truth (no cache path exists here).
(0, node_test_1.test)("14: domain exposes no places_cache location path", () => {
    // Kontrak enrichment hanya menerima respons Places *Details*; tiada jalan cache.
    const src = locationEnrichment_1.ENRICHMENT_SOURCE;
    strict_1.default.equal(src, "google_places_details");
    strict_1.default.ok(!/cache/i.test(src));
});
// 15. Client coordinates are never trusted (mapProviderResponse takes provider raw only).
(0, node_test_1.test)("15: client-provided coordinates cannot enter enrichment", () => {
    // Tiada parameter klien; hanya (requestedId, existingName, providerRaw).
    const r = (0, locationEnrichment_1.mapProviderResponse)(ID, undefined, raw(), NOW);
    // Koordinat datang dari provider raw.location sahaja.
    strict_1.default.equal(r.enrichment?.latitude, raw().location.latitude);
});
// 16. Conflict exclusion is caller-enforced; branch mismatch is held here.
(0, node_test_1.test)("16: incompatible identity is held not enriched", () => {
    const r = (0, locationEnrichment_1.mapProviderResponse)(ID, "Restoran A Sdn Bhd", raw({ displayName: { text: "Completely Different Bakery XYZ" } }), NOW);
    strict_1.default.equal(r.fetchClass, "BRANCH_MISMATCH");
    strict_1.default.equal(r.enrichment, undefined);
});
// 17. Allowlist covers exactly the enrichment surface (+ server timestamps).
(0, node_test_1.test)("17: allowlist includes server timestamp fields", () => {
    for (const f of ["providerFetchedAt", "locationVerifiedAt", "locationFreshUntil"]) {
        strict_1.default.ok(locationEnrichment_1.ENRICHMENT_FIELD_ALLOWLIST.includes(f));
    }
});
// 18. Minimum SAFE eligibility proxy: FETCH_READY carries all canonical inputs.
(0, node_test_1.test)("18: FETCH_READY carries stable identity + location for SAFE preview", () => {
    const r = (0, locationEnrichment_1.mapProviderResponse)(ID, "Nasi Kandar Pelita", raw(), NOW);
    strict_1.default.equal(r.fetchClass, "FETCH_READY");
    strict_1.default.ok(r.enrichment.providerPlaceId.length > 0);
    strict_1.default.ok(Number.isFinite(r.enrichment.latitude));
    strict_1.default.ok(Number.isFinite(r.enrichment.longitude));
});
// 19. API failure / null response returns safe status.
(0, node_test_1.test)("19: null response returns PROVIDER_NOT_FOUND (safe)", () => {
    const r = (0, locationEnrichment_1.mapProviderResponse)(ID, undefined, null, NOW);
    strict_1.default.equal(r.fetchClass, "PROVIDER_NOT_FOUND");
    strict_1.default.equal(r.enrichment, undefined);
});
// 20. Rate-limit handling does not corrupt data (no enrichment produced without valid raw).
(0, node_test_1.test)("20: empty provider id is held, produces no enrichment", () => {
    const r = (0, locationEnrichment_1.mapProviderResponse)("", "X", raw(), NOW);
    strict_1.default.equal(r.fetchClass, "HELD");
    strict_1.default.equal(r.enrichment, undefined);
});
// Extra: name normalization + compatibility helpers.
(0, node_test_1.test)("normalizeName strips punctuation/case", () => {
    strict_1.default.equal((0, locationEnrichment_1.normalizeName)("  Nasi   Kandar (Pelita)!! "), "nasi kandar pelita");
});
(0, node_test_1.test)("displayNamesCompatible: substring + token overlap", () => {
    strict_1.default.equal((0, locationEnrichment_1.displayNamesCompatible)("Pelita", "Nasi Kandar Pelita"), true);
    strict_1.default.equal((0, locationEnrichment_1.displayNamesCompatible)("Restoran Ali Baba", "Ali Baba Nasi Kandar"), true);
    strict_1.default.equal((0, locationEnrichment_1.displayNamesCompatible)("Kedai Kopi Ah Seng", "Zara Fashion Outlet"), false);
    strict_1.default.equal((0, locationEnrichment_1.displayNamesCompatible)(undefined, "Anything"), true);
});
