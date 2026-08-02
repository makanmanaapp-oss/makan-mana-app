/**
 * Phase 1.7 Part R — discovery (34-38), metrik & kesihatan (42-49),
 * cache (50-52), dan pengasingan produksi (58-59).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  AREA_CACHE_TTL_MS,
  DEFAULT_COVERAGE_HEALTH_CONFIG,
  FORBIDDEN_METRIC_FIELDS,
  InMemoryCoverageStore,
  buildAreaCacheEntry,
  buildAreaCacheKey,
  buildDiscoveryRequest,
  canTransitionDiscoveryStatus,
  combinedCoverageVersion,
  computeCoverageMetrics,
  coverageVersionFromMembers,
  discoveryIdempotencyKey,
  evaluateCoverageHealth,
  getPublishedPlacesByArea,
  isCacheEntryUsable,
  radiusBucket,
  CoverageMetrics,
} from "../index";
import {
  ADMIN,
  CENTER,
  head,
  makePlace,
  makePublication,
  offsetMeters,
  T,
} from "./fixtures";

function store() {
  let t = T;
  return new InMemoryCoverageStore({ now: () => (t += 1000) });
}

async function addPlace(
  s: InMemoryCoverageStore,
  placeId: string,
  location: { lat: number; lng: number },
  extra: Partial<Parameters<typeof makePlace>[0]> = {},
) {
  const place = makePlace({ placeId, location, ...extra });
  const v = makePublication(place);
  await s.indexPublishedPlaceIntoCoverage({
    publicationHead: head(placeId, v.publicationId),
    publicationVersion: v,
    canonicalLocation: location,
    context: { now: T },
    actor: ADMIN,
  });
  return v;
}

function source(s: InMemoryCoverageStore) {
  return {
    listMembershipsByCells: (c: string[]) => s.listMembershipsByCells(c),
    getCoverageVersions: (c: string[]) => s.getCoverageVersions(c),
    getActivePublication: (p: string) => s.getActivePublicationSnapshot(p),
  };
}

const baseReq = { lat: CENTER.lat, lng: CENTER.lng, radiusMeters: 1000, now: T + 1000 };

// 34. Liputan kosong → respons kosong yang JUJUR.
test("34. liputan kosong memulangkan respons kosong (tiada kedai dummy)", async () => {
  const s = store();
  const r = await getPublishedPlacesByArea(baseReq, source(s));
  assert.deepEqual(r.places, []);
  assert.equal(r.sourceMode, "empty_coverage");
  assert.equal(r.coverageIncomplete, true);
  assert.ok(r.warnings.includes("empty_coverage"));
  assert.equal(r.nextPageToken, undefined);
});

// 35. Liputan kosong MENGANTRIKAN discovery.
test("35. liputan kosong mengantrikan discovery", async () => {
  const s = store();
  const queued: { cells: string[]; reason: string }[] = [];
  const r = await getPublishedPlacesByArea(baseReq, source(s), {
    onDiscoveryNeeded: (cells, reason) => queued.push({ cells, reason }),
  });
  assert.equal(r.discoveryQueued, true);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].reason, "empty_coverage");
  assert.ok(queued[0].cells.length > 0);
});

// 36. Bacaan kawasan TIDAK menunggu discovery.
test("36. bacaan kawasan memulangkan hasil diluluskan tanpa menunggu discovery", async () => {
  const s = store();
  for (let i = 0; i < 20; i++) {
    await addPlace(s, `mm_d${i}`, offsetMeters(CENTER, 20 + i * 10, 0));
  }
  let discoveryRan = false;
  const r = await getPublishedPlacesByArea(
    { ...baseReq, maxResults: 20 },
    source(s),
    { onDiscoveryNeeded: () => (discoveryRan = true) },
  );
  assert.equal(r.places.length, 20, "20 kedai diluluskan dipulangkan SERTA-MERTA");
  assert.equal(r.sourceMode, "approved_database");
  assert.equal(r.coverageIncomplete, false);
  assert.equal(discoveryRan, false, "liputan sihat → tiada discovery diperlukan");
});

// 37. Kegagalan discovery MENGEKALKAN hasil yang diluluskan.
test("37. kegagalan discovery tidak memusnahkan liputan diluluskan", async () => {
  const s = store();
  await addPlace(s, "mm_keep", offsetMeters(CENTER, 40, 0));

  const r = await getPublishedPlacesByArea(baseReq, source(s), {
    minimumPlacesForComplete: 5, // paksa "partial" supaya discovery dicuba
    onDiscoveryNeeded: () => {
      throw new Error("provider down");
    },
  });
  assert.deepEqual(r.places.map((p) => p.placeId), ["mm_keep"]);
  assert.equal(r.discoveryQueued, false);
  assert.ok(r.warnings.includes("discovery_enqueue_failed"));
  assert.equal(r.sourceMode, "partial_coverage");
});

// 38. Permintaan discovery yang sama IDEMPOTEN.
test("38. enqueue discovery idempoten pada sel+sebab yang sama", async () => {
  const s = store();
  const req = buildDiscoveryRequest({
    cellId: "w283b8",
    neighboringCellIds: ["w283b9"],
    reason: "empty_coverage",
    requestedAt: T,
    requestedBySystem: "area_read",
    priority: 1,
  });
  const a = await s.enqueueDiscovery(req, ADMIN);
  const b = await s.enqueueDiscovery(
    buildDiscoveryRequest({
      cellId: "w283b8",
      neighboringCellIds: ["w283b9"],
      reason: "empty_coverage",
      requestedAt: T + 60_000, // masa berbeza
      requestedBySystem: "scheduler", // sistem berbeza
      priority: 3,
    }),
    ADMIN,
  );
  assert.equal(a.requestId, b.requestId);
  assert.equal(b.requestedAt, T, "entri asal dikekalkan");
  const list = await s.listQueue(undefined, { limit: 10 });
  assert.equal(list.items.length, 1);

  // Sebab berbeza → permintaan berbeza.
  assert.notEqual(
    discoveryIdempotencyKey("w283b8", "empty_coverage", "none"),
    discoveryIdempotencyKey("w283b8", "stale_coverage", "none"),
  );
});

test("38b. peralihan status baris gilir dikawal + cuba semula selepas gagal", async () => {
  const s = store();
  const req = buildDiscoveryRequest({
    cellId: "w283bx",
    neighboringCellIds: [],
    reason: "low_coverage",
    requestedAt: T,
    requestedBySystem: "area_read",
    priority: 2,
  });
  await s.enqueueDiscovery(req, ADMIN);
  const processing = await s.transitionDiscoveryStatus(
    req.requestId,
    "processing",
    ADMIN,
  );
  assert.equal(processing.attemptCount, 1);
  const failed = await s.transitionDiscoveryStatus(
    req.requestId,
    "failed",
    ADMIN,
    "provider_timeout",
  );
  assert.equal(failed.lastErrorCode, "provider_timeout");
  // Gagal boleh dibaris-gilirkan semula.
  assert.equal(canTransitionDiscoveryStatus("failed", "queued"), true);
  assert.equal(canTransitionDiscoveryStatus("queued", "completed"), false);
  assert.equal(canTransitionDiscoveryStatus("completed", "queued"), false);
});

test("permintaan discovery tidak mengandungi data peribadi pengguna", () => {
  const req = buildDiscoveryRequest({
    cellId: "w283b8",
    neighboringCellIds: [],
    reason: "user_area_request",
    requestedAt: T,
    requestedBySystem: "area_read",
    priority: 1,
  });
  const keys = Object.keys(req);
  for (const forbidden of ["uid", "userId", "lat", "lng", "email"]) {
    assert.equal(keys.includes(forbidden), false, `${forbidden} tidak dibenarkan`);
  }
  assert.equal(req.requestedBySystem, "area_read"); // sistem, bukan pengguna
});

// ---- Metrik (42-45) ----

async function metricsFor(s: InMemoryCoverageStore, cellId: string) {
  const memberships = await s.listMembershipsByCells([cellId]);
  const versions = new Map(
    await Promise.all(
      memberships.map(async (m) => {
        const v = await s.getActivePublicationSnapshot(m.placeId);
        return [m.publicationId, v!] as const;
      }),
    ),
  );
  return computeCoverageMetrics({
    cellId,
    memberships,
    versionsByPublicationId: versions,
    coverageVersion: (await s.getCoverageVersions([cellId]))[cellId],
    now: T,
  });
}

// 42. Metrik mengira kedai yang diterbitkan aktif.
test("42. metrik mengira kedai diterbitkan aktif + kategori/masakan", async () => {
  const s = store();
  await addPlace(s, "mm_m1", CENTER, {
    placeTypes: ["restaurant"],
    cuisines: ["malay"],
  });
  await addPlace(s, "mm_m2", offsetMeters(CENTER, 30, 0), {
    placeTypes: ["cafe"],
    cuisines: ["western"],
  });
  const home = (await s.getMembership("mm_m1"))!.homeCellId;
  const m = await metricsFor(s, home);

  assert.equal(m.activePublishedPlaces, 2);
  assert.equal(m.placeTypeCounts.restaurant, 1);
  assert.equal(m.placeTypeCounts.cafe, 1);
  assert.equal(m.cuisineCounts.malay, 1);
  assert.ok(m.sourceTypeCounts.provider >= 1);
  assert.equal(m.cellId, home);
});

// 43/44. Metrik mengenal pasti waktu & harga tidak diketahui.
test("43/44. metrik mengenal pasti waktu & harga tidak diketahui", async () => {
  const s = store();
  await addPlace(s, "mm_u1", CENTER, { hoursUnknown: true, priceUnknown: true });
  await addPlace(s, "mm_u2", offsetMeters(CENTER, 30, 0));
  const home = (await s.getMembership("mm_u1"))!.homeCellId;
  const m = await metricsFor(s, home);

  assert.equal(m.activePublishedPlaces, 2);
  assert.equal(m.unknownHoursCount, 1);
  assert.equal(m.unknownPriceCount, 1);
});

test("metrik mengira imej yang hilang", async () => {
  const s = store();
  await addPlace(s, "mm_noimg", CENTER, { noImage: true });
  const home = (await s.getMembership("mm_noimg"))!.homeCellId;
  const m = await metricsFor(s, home);
  assert.equal(m.missingImageCount, 1);
});

// 45. Metrik TIDAK mengandungi data peribadi pengguna.
test("45. metrik tidak mengandungi data peribadi pengguna", async () => {
  const s = store();
  await addPlace(s, "mm_priv", CENTER);
  const home = (await s.getMembership("mm_priv"))!.homeCellId;
  const m = await metricsFor(s, home);

  const serialized = JSON.stringify(m);
  for (const forbidden of FORBIDDEN_METRIC_FIELDS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(m, forbidden),
      false,
      `${forbidden} tidak dibenarkan dalam metrik`,
    );
    assert.equal(
      serialized.includes(`"${forbidden}"`),
      false,
      `${forbidden} muncul dalam metrik bersiri`,
    );
  }
});

// ---- Kesihatan liputan (46-49) ----

function metrics(over: Partial<CoverageMetrics> = {}): CoverageMetrics {
  return {
    cellId: "w283b8",
    activePublishedPlaces: 20,
    placeTypeCounts: { restaurant: 10, cafe: 10 },
    cuisineCounts: { malay: 8, western: 6, japanese: 6 },
    mealSlotCounts: {},
    sourceTypeCounts: { provider: 20 },
    stalePlaceCount: 0,
    expiredCriticalCount: 0,
    duplicateCandidateCount: 0,
    missingImageCount: 0,
    unknownPriceCount: 0,
    unknownHoursCount: 0,
    lastComputedAt: T,
    coverageVersion: coverageVersionFromMembers([]),
    ...over,
  };
}

// 46. Kesihatan liputan SIHAT.
test("46. kesihatan liputan healthy", () => {
  const r = evaluateCoverageHealth(metrics(), DEFAULT_COVERAGE_HEALTH_CONFIG, T);
  assert.equal(r.healthState, "healthy");
  assert.equal(r.incomplete, false);
  assert.equal(r.discoveryRequired, false);
});

// 47. Kesihatan liputan RENDAH.
test("47. kesihatan liputan low", () => {
  const r = evaluateCoverageHealth(
    metrics({ activePublishedPlaces: 2, cuisineCounts: { malay: 2 } }),
    DEFAULT_COVERAGE_HEALTH_CONFIG,
    T,
  );
  assert.equal(r.healthState, "low");
  assert.equal(r.incomplete, true);
  assert.equal(r.discoveryRequired, true);
  assert.ok(r.reasons.includes("below_minimum_places"));
});

test("47b. kepelbagaian masakan rendah juga 'low'", () => {
  const r = evaluateCoverageHealth(
    metrics({ cuisineCounts: { malay: 20 } }),
    DEFAULT_COVERAGE_HEALTH_CONFIG,
    T,
  );
  assert.equal(r.healthState, "low");
  assert.ok(r.reasons.includes("low_cuisine_diversity"));
});

// 48. Kesihatan liputan KOSONG.
test("48. kesihatan liputan empty", () => {
  const r = evaluateCoverageHealth(
    metrics({ activePublishedPlaces: 0, placeTypeCounts: {}, cuisineCounts: {} }),
    DEFAULT_COVERAGE_HEALTH_CONFIG,
    T,
  );
  assert.equal(r.healthState, "empty");
  assert.equal(r.discoveryRequired, true);
  assert.equal(r.priority, 1);
});

// 49. Kesihatan liputan BASI.
test("49. kesihatan liputan stale bila terlalu lama", () => {
  const old = T - DEFAULT_COVERAGE_HEALTH_CONFIG.maxCoverageAgeMs - 1;
  const r = evaluateCoverageHealth(
    metrics({ lastComputedAt: old }),
    DEFAULT_COVERAGE_HEALTH_CONFIG,
    T,
  );
  assert.equal(r.healthState, "stale");
  assert.equal(r.refreshRequired, true);
});

test("kesihatan critical bila terlalu banyak bukti kritikal luput", () => {
  const r = evaluateCoverageHealth(
    metrics({ expiredCriticalCount: 10 }), // 10/20 = 0.5 > 0.25
    DEFAULT_COVERAGE_HEALTH_CONFIG,
    T,
  );
  assert.equal(r.healthState, "critical");
  assert.equal(r.refreshRequired, true);
});

test("kesihatan adequate antara minimum dan sasaran", () => {
  const r = evaluateCoverageHealth(
    metrics({ activePublishedPlaces: 8 }),
    DEFAULT_COVERAGE_HEALTH_CONFIG,
    T,
  );
  assert.equal(r.healthState, "adequate");
  assert.equal(r.discoveryRequired, true);
});

test("sasaran 100 tempat BUKAN peraturan per-sel (boleh dikonfigurasi)", () => {
  // Sasaran per-sel lalai kecil; kolam 9 sel melebihi 100 tempat.
  assert.ok(DEFAULT_COVERAGE_HEALTH_CONFIG.targetPlacesForHealthyCell < 100);
  assert.ok(DEFAULT_COVERAGE_HEALTH_CONFIG.targetPlacesForHealthyCell * 9 > 100);
  // Boleh dikonfigurasi.
  const strict = {
    ...DEFAULT_COVERAGE_HEALTH_CONFIG,
    targetPlacesForHealthyCell: 50,
  };
  assert.equal(
    evaluateCoverageHealth(metrics({ activePublishedPlaces: 20 }), strict, T)
      .healthState,
    "adequate",
  );
});

// ---- Cache (50-52) ----

// 50. Kunci cache TERMASUK versi liputan.
test("50. kunci cache termasuk versi kolam liputan", () => {
  const common = {
    centerCellId: "w283b8",
    radiusMeters: 1000,
    filters: {},
  };
  const k1 = buildAreaCacheKey({ ...common, publicationPoolVersion: "cpv_aaa" });
  const k2 = buildAreaCacheKey({ ...common, publicationPoolVersion: "cpv_bbb" });
  assert.notEqual(k1, k2, "versi liputan berbeza → kunci berbeza");
});

// 51. Koordinat mentah BUKAN kunci cache tunggal.
test("51. koordinat mentah bukan kunci cache; kunci dikongsi dalam sel", () => {
  const poolVersion = combinedCoverageVersion({ w283b8: "cv_x" });
  // Dua pengguna pada koordinat BERBEZA tetapi dalam sel & baldi yang sama
  // menghasilkan kunci yang SAMA — inilah yang membolehkan perkongsian.
  const k1 = buildAreaCacheKey({
    centerCellId: "w283b8",
    radiusMeters: 800,
    filters: {},
    publicationPoolVersion: poolVersion,
  });
  const k2 = buildAreaCacheKey({
    centerCellId: "w283b8",
    radiusMeters: 950, // baldi sama (1000)
    filters: {},
    publicationPoolVersion: poolVersion,
  });
  assert.equal(k1, k2);
  assert.equal(radiusBucket(800), radiusBucket(950));
  // Kunci tidak mengandungi koordinat mentah.
  assert.equal(k1.includes("3.11"), false);
  assert.equal(k1.includes("101.6"), false);
  // Penapis berbeza → kunci berbeza.
  assert.notEqual(
    k1,
    buildAreaCacheKey({
      centerCellId: "w283b8",
      radiusMeters: 800,
      filters: { requiredCuisineTags: ["malay"] },
      publicationPoolVersion: poolVersion,
    }),
  );
});

// 52. Cache TIDAK SAH selepas versi berubah.
test("52. entri cache tidak boleh digunakan selepas versi liputan berubah", async () => {
  const s = store();
  const entry = buildAreaCacheEntry({
    centerCellId: "w283b8",
    queriedCellIds: ["w283b8"],
    radiusMeters: 1000,
    filters: {},
    publicationPoolVersion: "cpv_old",
    placeIds: ["mm_1"],
    publicationIds: ["pub_1"],
    generatedAt: T,
    sourceMode: "approved_database",
  });
  await s.putCacheEntry(entry, ADMIN);

  assert.equal(isCacheEntryUsable(entry, "cpv_old", T + 1000), true);
  assert.equal(isCacheEntryUsable(entry, "cpv_new", T + 1000), false);
  // Juga luput mengikut TTL.
  assert.equal(isCacheEntryUsable(entry, "cpv_old", T + AREA_CACHE_TTL_MS + 1), false);

  const removed = await s.invalidateByCoverageVersion("w283b8", "cpv_new");
  assert.equal(removed, 1);
  assert.equal(await s.getCacheEntry(entry.cacheKey), null);
});

// ---- 58/59. Pengasingan produksi ----
test("58/59. repository liputan tiada operasi place_registry / publish mobile", () => {
  const s = store();
  const names = new Set([
    ...Object.getOwnPropertyNames(Object.getPrototypeOf(s)),
    ...Object.keys(s),
  ]);
  for (const forbidden of [
    "writePlaceRegistry",
    "publishToMobile",
    "publishToProduction",
    "callGooglePlaces",
    "fetchFromProvider",
    "deletePublication",
    "hardDelete",
  ]) {
    assert.equal(names.has(forbidden), false, `${forbidden} tidak boleh wujud`);
  }
  const src = InMemoryCoverageStore.toString();
  assert.equal(src.includes("place_registry"), false);
  assert.equal(src.includes("places_cache"), false);
  assert.equal(src.includes("place_details"), false);
});
