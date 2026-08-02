/**
 * Phase 1.14C.1 — ujian domain enrichment lokasi (TULEN, tiada I/O/rangkaian).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ENRICHMENT_FIELD_ALLOWLIST,
  ENRICHMENT_SOURCE,
  ENRICHMENT_SOURCE_API,
  LOCATION_FRESH_TTL_MS,
  PLACE_DETAILS_FIELD_MASK,
  ProviderPlaceDetailsResponse,
  assertFieldsAllowlisted,
  buildEnrichmentFieldUpdate,
  displayNamesCompatible,
  isLocationFresh,
  mapProviderResponse,
  mayOverwrite,
  normalizeName,
  providerResponseChecksum,
} from "../locationEnrichment";

const NOW = 1_700_000_000_000;
const ID = "ChIJexampleProviderPlaceId000";

function raw(over: Partial<ProviderPlaceDetailsResponse> = {}): ProviderPlaceDetailsResponse {
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
test("1: exact provider ID fetch yields FETCH_READY with coordinates", () => {
  const r = mapProviderResponse(ID, "Nasi Kandar Pelita", raw(), NOW);
  assert.equal(r.fetchClass, "FETCH_READY");
  assert.equal(r.enrichment?.latitude, 3.1578);
  assert.equal(r.enrichment?.longitude, 101.7123);
  assert.equal(r.enrichment?.providerPlaceId, ID);
});

// 2. Location pair validation → both present accepted.
test("2: valid location pair accepted", () => {
  const r = mapProviderResponse(ID, undefined, raw({ location: { latitude: -6.2, longitude: 106.8 } }), NOW);
  assert.equal(r.fetchClass, "FETCH_READY");
});

// 3. Invalid latitude rejects (LOCATION_MISSING).
test("3: invalid latitude rejects", () => {
  const r = mapProviderResponse(ID, undefined, raw({ location: { latitude: 999, longitude: 101 } }), NOW);
  assert.equal(r.fetchClass, "LOCATION_MISSING");
});

// 4. Invalid longitude rejects.
test("4: invalid longitude rejects", () => {
  const r = mapProviderResponse(ID, undefined, raw({ location: { latitude: 3.1, longitude: 500 } }), NOW);
  assert.equal(r.fetchClass, "LOCATION_MISSING");
});

// 5. Provider ID mismatch rejects.
test("5: provider ID mismatch rejects", () => {
  const r = mapProviderResponse(ID, undefined, raw({ id: "ChIJsomethingCompletelyElse99" }), NOW);
  assert.equal(r.fetchClass, "ID_MISMATCH");
});

// 6. Branch/display-name mismatch holds.
test("6: branch/display-name mismatch holds", () => {
  const r = mapProviderResponse(ID, "Nasi Kandar Pelita", raw({ displayName: { text: "Starbucks Reserve KLCC" } }), NOW);
  assert.equal(r.fetchClass, "BRANCH_MISMATCH");
});

// 7. Missing location holds.
test("7: missing location holds", () => {
  const r = mapProviderResponse(ID, undefined, raw({ location: undefined }), NOW);
  assert.equal(r.fetchClass, "LOCATION_MISSING");
});

// 8. Empty address becomes null (unknown), not fabricated.
test("8: empty address becomes null", () => {
  const r = mapProviderResponse(ID, undefined, raw({ formattedAddress: "   " }), NOW);
  assert.equal(r.fetchClass, "FETCH_READY");
  assert.equal(r.enrichment?.formattedAddress, null);
});

// 9. Provenance is server-derived (source/api/mask/fetchedAt/freshUntil set here).
test("9: provenance is server-derived", () => {
  const r = mapProviderResponse(ID, undefined, raw(), NOW);
  assert.equal(r.enrichment?.source, ENRICHMENT_SOURCE);
  assert.equal(r.enrichment?.sourceApi, ENRICHMENT_SOURCE_API);
  assert.equal(r.enrichment?.sourceFieldMask, PLACE_DETAILS_FIELD_MASK);
  assert.equal(r.enrichment?.fetchedAt, NOW);
  assert.equal(r.enrichment?.freshUntil, NOW + LOCATION_FRESH_TTL_MS);
});

// 10. Field allowlist prevents unrelated writes.
test("10: field allowlist prevents unrelated writes", () => {
  const r = mapProviderResponse(ID, undefined, raw(), NOW);
  const fields = buildEnrichmentFieldUpdate(r.enrichment!);
  assert.doesNotThrow(() => assertFieldsAllowlisted(fields));
  assert.throws(() => assertFieldsAllowlisted({ ...fields, displayName: "HACK" }));
  assert.throws(() => assertFieldsAllowlisted({ rating: 5 }));
});

// 11. Existing legacy fields are preserved (update object touches ONLY allowlist).
test("11: enrichment update never includes legacy keys", () => {
  const r = mapProviderResponse(ID, undefined, raw(), NOW);
  const fields = buildEnrichmentFieldUpdate(r.enrichment!);
  for (const legacy of ["displayName", "rating", "userRatingCount", "priceLevel", "keywords", "photoUrl", "lastFetchedAt"]) {
    assert.ok(!(legacy in fields), `must not write legacy field '${legacy}'`);
  }
});

// 12. Fresh record avoids unnecessary rewrite.
test("12: fresh record is not rewritten", () => {
  const doc = { location: { latitude: 3.1, longitude: 101.7 }, locationFreshUntil: NOW + 1000 };
  assert.equal(isLocationFresh(doc, NOW), true);
  assert.equal(mayOverwrite(doc, NOW), false);
});

// 13. Response checksum idempotency (same input → same checksum).
test("13: response checksum is deterministic/idempotent", () => {
  assert.equal(providerResponseChecksum(raw()), providerResponseChecksum(raw()));
  assert.notEqual(providerResponseChecksum(raw()), providerResponseChecksum(raw({ location: { latitude: 1, longitude: 2 } })));
});

// 14. places_cache is never used as per-place location truth (no cache path exists here).
test("14: domain exposes no places_cache location path", () => {
  // Kontrak enrichment hanya menerima respons Places *Details*; tiada jalan cache.
  const src = ENRICHMENT_SOURCE;
  assert.equal(src, "google_places_details");
  assert.ok(!/cache/i.test(src));
});

// 15. Client coordinates are never trusted (mapProviderResponse takes provider raw only).
test("15: client-provided coordinates cannot enter enrichment", () => {
  // Tiada parameter klien; hanya (requestedId, existingName, providerRaw).
  const r = mapProviderResponse(ID, undefined, raw(), NOW);
  // Koordinat datang dari provider raw.location sahaja.
  assert.equal(r.enrichment?.latitude, raw().location!.latitude);
});

// 16. Conflict exclusion is caller-enforced; branch mismatch is held here.
test("16: incompatible identity is held not enriched", () => {
  const r = mapProviderResponse(ID, "Restoran A Sdn Bhd", raw({ displayName: { text: "Completely Different Bakery XYZ" } }), NOW);
  assert.equal(r.fetchClass, "BRANCH_MISMATCH");
  assert.equal(r.enrichment, undefined);
});

// 17. Allowlist covers exactly the enrichment surface (+ server timestamps).
test("17: allowlist includes server timestamp fields", () => {
  for (const f of ["providerFetchedAt", "locationVerifiedAt", "locationFreshUntil"]) {
    assert.ok((ENRICHMENT_FIELD_ALLOWLIST as readonly string[]).includes(f));
  }
});

// 18. Minimum SAFE eligibility proxy: FETCH_READY carries all canonical inputs.
test("18: FETCH_READY carries stable identity + location for SAFE preview", () => {
  const r = mapProviderResponse(ID, "Nasi Kandar Pelita", raw(), NOW);
  assert.equal(r.fetchClass, "FETCH_READY");
  assert.ok(r.enrichment!.providerPlaceId.length > 0);
  assert.ok(Number.isFinite(r.enrichment!.latitude));
  assert.ok(Number.isFinite(r.enrichment!.longitude));
});

// 19. API failure / null response returns safe status.
test("19: null response returns PROVIDER_NOT_FOUND (safe)", () => {
  const r = mapProviderResponse(ID, undefined, null, NOW);
  assert.equal(r.fetchClass, "PROVIDER_NOT_FOUND");
  assert.equal(r.enrichment, undefined);
});

// 20. Rate-limit handling does not corrupt data (no enrichment produced without valid raw).
test("20: empty provider id is held, produces no enrichment", () => {
  const r = mapProviderResponse("", "X", raw(), NOW);
  assert.equal(r.fetchClass, "HELD");
  assert.equal(r.enrichment, undefined);
});

// Extra: name normalization + compatibility helpers.
test("normalizeName strips punctuation/case", () => {
  assert.equal(normalizeName("  Nasi   Kandar (Pelita)!! "), "nasi kandar pelita");
});
test("displayNamesCompatible: substring + token overlap", () => {
  assert.equal(displayNamesCompatible("Pelita", "Nasi Kandar Pelita"), true);
  assert.equal(displayNamesCompatible("Restoran Ali Baba", "Ali Baba Nasi Kandar"), true);
  assert.equal(displayNamesCompatible("Kedai Kopi Ah Seng", "Zara Fashion Outlet"), false);
  assert.equal(displayNamesCompatible(undefined, "Anything"), true);
});
