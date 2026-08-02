/**
 * Phase 1.14B — ujian penyelesai snapshot DIPERCAYAI + model ketidakpadanan.
 * Membuktikan snapshot klien TIDAK PERNAH autoritatif.
 */
import assert from "node:assert/strict";
import {test} from "node:test";

import {
  AliasResolution,
  TrustedPlaceDataSource,
  TrustedPlaceView,
  TrustedSnapshotError,
  compareClientToTrusted,
  resolveTrustedSnapshot,
  trustedContentHash,
} from "../trustedSnapshotResolver";

const NOW = 1_700_000_000_000;

function view(over: Partial<TrustedPlaceView> = {}): TrustedPlaceView {
  return {
    placeId: "canon-1",
    title: "Nasi Kandar Pelita (TRUSTED)",
    address: "Trusted Address",
    coordinates: {lat: 3.16, lng: 101.71},
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

function source(over: {
  alias?: AliasResolution;
  publication?: TrustedPlaceView | null;
  test?: TrustedPlaceView | null;
  details?: TrustedPlaceView | null;
  cache?: TrustedPlaceView | null;
} = {}): TrustedPlaceDataSource {
  return {
    resolveAlias: async (id) =>
      over.alias ?? {requestedPlaceId: id, resolvedCanonicalPlaceId: id, chain: [id], status: "not_found"},
    getActivePublication: async () => over.publication ?? null,
    getApprovedCanonicalTestSource: async () => over.test ?? null,
    getPlaceDetails: async () => over.details ?? null,
    getPlacesCache: async () => over.cache ?? null,
  };
}

// Tests 1-8: klien TIDAK boleh menetapkan medan dipercayai — snapshot datang
// SEPENUHNYA daripada sumber dipercayai. (Penyelesai tiada parameter nilai klien.)
test("trusted snapshot fields come only from the trusted source", async () => {
  const r = await resolveTrustedSnapshot({uid: "u", placeId: "canon-1"}, source({publication: view()}), NOW);
  const s = r.trustedOriginalSnapshot;
  assert.equal(s.title, "Nasi Kandar Pelita (TRUSTED)"); // title
  assert.equal(s.address, "Trusted Address"); // address
  assert.deepEqual(s.coordinates, {lat: 3.16, lng: 101.71}); // coordinates
  assert.equal(s.ratingState, "rating_shown"); // rating
  assert.equal(s.priceState, "price_verified"); // price
  assert.equal(s.hoursState, "open_now"); // hours
  assert.equal(s.halalState, "halal_certified"); // halal
  assert.equal(s.allergenState, "allergen_known"); // allergen
  assert.equal(s.businessState, "active");
});

// Test 9: penerbitan canonical diutamakan.
test("active canonical publication is preferred over details/cache", async () => {
  const r = await resolveTrustedSnapshot(
    {uid: "u", placeId: "canon-1"},
    source({publication: view({title: "PUB"}), details: view({title: "DETAILS"}), cache: view({title: "CACHE"})}),
    NOW,
  );
  assert.equal(r.sourceUsed, "canonical_publication");
  assert.equal(r.trustedOriginalSnapshot.title, "PUB");
});

// Test 10: fallback place_details.
test("falls back to place_details when no publication", async () => {
  const r = await resolveTrustedSnapshot(
    {uid: "u", placeId: "canon-1"},
    source({details: view({title: "DETAILS"}), cache: view({title: "CACHE"})}),
    NOW,
  );
  assert.equal(r.sourceUsed, "place_details");
  assert.equal(r.trustedOriginalSnapshot.title, "DETAILS");
});

// Test 11: fallback places_cache.
test("falls back to places_cache last", async () => {
  const r = await resolveTrustedSnapshot({uid: "u", placeId: "canon-1"}, source({cache: view({title: "CACHE"})}), NOW);
  assert.equal(r.sourceUsed, "places_cache");
});

// Test 12: tiada sumber dipercayai → tolak.
test("rejects when no trusted source exists", async () => {
  await assert.rejects(
    () => resolveTrustedSnapshot({uid: "u", placeId: "canon-1"}, source({}), NOW),
    (e: unknown) => e instanceof TrustedSnapshotError && e.code === "no_trusted_source",
  );
});

// Test 13: alias diselesaikan.
test("resolves alias to canonical id", async () => {
  const alias: AliasResolution = {requestedPlaceId: "legacy-1", resolvedCanonicalPlaceId: "canon-1", chain: ["legacy-1", "canon-1"], status: "resolved"};
  const r = await resolveTrustedSnapshot({uid: "u", placeId: "legacy-1"}, source({alias, publication: view()}), NOW);
  assert.equal(r.resolvedCanonicalPlaceId, "canon-1");
  assert.equal(r.trustedOriginalSnapshot.placeId, "canon-1");
});

// Test 14: alias circular ditolak.
test("rejects circular alias", async () => {
  const alias: AliasResolution = {requestedPlaceId: "a", resolvedCanonicalPlaceId: "a", chain: ["a", "b", "a"], status: "circular"};
  await assert.rejects(
    () => resolveTrustedSnapshot({uid: "u", placeId: "a"}, source({alias, publication: view()}), NOW),
    (e: unknown) => e instanceof TrustedSnapshotError && e.code === "alias_unsafe",
  );
});

// Test 15: alias blocked ditolak.
test("rejects blocked alias", async () => {
  const alias: AliasResolution = {requestedPlaceId: "a", resolvedCanonicalPlaceId: "a", chain: ["a"], status: "blocked"};
  await assert.rejects(
    () => resolveTrustedSnapshot({uid: "u", placeId: "a"}, source({alias, publication: view()}), NOW),
    (e: unknown) => e instanceof TrustedSnapshotError && e.code === "alias_unsafe",
  );
});

test("rejects blocked trusted record", async () => {
  await assert.rejects(
    () => resolveTrustedSnapshot({uid: "u", placeId: "canon-1"}, source({publication: view({blocked: true})}), NOW),
    (e: unknown) => e instanceof TrustedSnapshotError && e.code === "invalid_place",
  );
});

// Test 16: hash deterministik.
test("content hash is deterministic and value-sensitive", () => {
  const h1 = trustedContentHash(view(), "canon-1");
  const h2 = trustedContentHash(view(), "canon-1");
  const h3 = trustedContentHash(view({title: "different"}), "canon-1");
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
});

// Test 17: snapshot mengandungi HANYA medan dipercayai (tiada medan klien tambahan).
test("snapshot contains only trusted fields", async () => {
  const r = await resolveTrustedSnapshot({uid: "u", placeId: "canon-1"}, source({publication: view()}), NOW);
  const keys = Object.keys(r.trustedOriginalSnapshot).sort();
  assert.ok(keys.includes("contentHash"));
  assert.ok(!keys.includes("reporterUid"));
  assert.ok(!keys.includes("proposedValues"));
  assert.equal(r.trustedOriginalSnapshot.capturedAt, NOW);
});

// Test 18: ketidakpadanan DIREDAKSI (hash, bukan nilai mentah).
test("mismatch warnings are redacted (hashes, not raw values)", async () => {
  const alias: AliasResolution = {requestedPlaceId: "legacy-x", resolvedCanonicalPlaceId: "canon-1", chain: ["legacy-x", "canon-1"], status: "resolved"};
  const r = await resolveTrustedSnapshot({uid: "u", placeId: "legacy-x"}, source({alias, publication: view({publicationVersion: 9})}), NOW);
  const mismatches = compareClientToTrusted(
    {placeId: "legacy-x", currentValue: "secret client value", publicationVersion: 3},
    r,
  );
  const alias1 = mismatches.find((m) => m.mismatchType === "alias_resolved");
  assert.ok(alias1, "alias_resolved mismatch expected");
  // Nilai mentah TIDAK PERNAH dalam output.
  const blob = JSON.stringify(mismatches);
  assert.ok(!blob.includes("secret client value"));
  assert.ok(!blob.includes("legacy-x") || alias1!.clientValueHash !== "legacy-x");
  assert.ok(mismatches.some((m) => m.mismatchType === "publication_version_mismatch"));
});

// Test 20: identiti dedup menggunakan placeId dipercayai (server-derived).
test("resolved canonical id (server-derived) drives identity", async () => {
  const alias: AliasResolution = {requestedPlaceId: "legacy-1", resolvedCanonicalPlaceId: "canon-9", chain: ["legacy-1", "canon-9"], status: "resolved"};
  const r = await resolveTrustedSnapshot({uid: "u", placeId: "legacy-1"}, source({alias, publication: view({placeId: "canon-9"})}), NOW);
  assert.equal(r.resolvedCanonicalPlaceId, "canon-9");
  assert.equal(r.trustedOriginalSnapshot.placeId, "canon-9");
});

// Test 19 (simulasi urutan callable): tiada tulisan sebelum snapshot diselesaikan.
test("no write dep is invoked when trusted resolution fails", async () => {
  let writes = 0;
  const write = async () => {
    writes++;
  };
  try {
    // Cermin urutan callable: selesaikan snapshot DAHULU; jika gagal, jangan tulis.
    await resolveTrustedSnapshot({uid: "u", placeId: "canon-1"}, source({}), NOW);
    await write(); // tidak dicapai
  } catch {
    /* dijangka */
  }
  assert.equal(writes, 0);
});
