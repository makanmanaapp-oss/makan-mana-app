/**
 * Phase 1.7 Part S — SENARIO EMAS (A-J).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  InMemoryCoverageStore,
  buildAreaCacheEntry,
  buildDiscoveryRequest,
  combinedCoverageVersion,
  getCoverageCellBounds,
  getCoverageCellId,
  getPublishedPlacesByArea,
  isCacheEntryUsable,
} from "../index";
import { haversineMeters } from "../../dedup/geo";
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

// A. Pengguna A mencari kawasan yang sudah ada liputan diluluskan.
test("A. pengguna A membaca kolam diluluskan sedia ada tanpa menunggu pembekal", async () => {
  const s = store();
  for (let i = 0; i < 8; i++) {
    await addPlace(s, `mm_a${i}`, offsetMeters(CENTER, 30 + i * 25, 0));
  }
  let providerCalled = false;
  const r = await getPublishedPlacesByArea(
    { lat: CENTER.lat, lng: CENTER.lng, radiusMeters: 1000, now: T + 1000 },
    source(s),
    { onDiscoveryNeeded: () => (providerCalled = true) },
  );
  assert.equal(r.places.length, 8);
  assert.equal(r.sourceMode, "approved_database");
  assert.equal(providerCalled, false, "tiada penantian pembekal diperlukan");
});

// B. Pengguna B memasuki kawasan yang SAMA.
test("B. pengguna B menggunakan semula kolam & versi penerbitan yang sama", async () => {
  const s = store();
  for (let i = 0; i < 6; i++) {
    await addPlace(s, `mm_b${i}`, offsetMeters(CENTER, 30 + i * 25, 0));
  }

  // Pengguna A di satu koordinat; pengguna B beberapa meter jauh.
  const userA = { lat: CENTER.lat, lng: CENTER.lng, radiusMeters: 1000, now: T + 1000 };
  const bLoc = offsetMeters(CENTER, 15, 15);
  const userB = { lat: bLoc.lat, lng: bLoc.lng, radiusMeters: 1000, now: T + 2000 };

  const rA = await getPublishedPlacesByArea(userA, source(s));
  const rB = await getPublishedPlacesByArea(userB, source(s));

  // Sel yang disoal dan versi liputan adalah SAMA → kolam dikongsi.
  assert.deepEqual(rA.queriedCellIds, rB.queriedCellIds);
  assert.deepEqual(rA.coverageVersions, rB.coverageVersions);
  assert.deepEqual(
    rA.places.map((p) => p.publicationId).sort(),
    rB.places.map((p) => p.publicationId).sort(),
    "versi penerbitan yang sama digunakan semula",
  );
});

// C. 20 kedai diluluskan + discovery dibaris-gilirkan.
test("C. 20 kedai dipulangkan serta-merta; discovery berlaku berasingan", async () => {
  const s = store();
  for (let i = 0; i < 20; i++) {
    await addPlace(s, `mm_c${String(i).padStart(2, "0")}`, offsetMeters(CENTER, 20 + i * 8, 0));
  }
  const enqueued: string[] = [];
  const r = await getPublishedPlacesByArea(
    { lat: CENTER.lat, lng: CENTER.lng, radiusMeters: 1000, maxResults: 20, now: T + 1000 },
    source(s),
    {
      // Paksa "tidak lengkap" walaupun ada 20, untuk membuktikan discovery
      // berjalan BERASINGAN tanpa menyekat hasil.
      minimumPlacesForComplete: 50,
      onDiscoveryNeeded: (cells) => enqueued.push(...cells),
    },
  );
  assert.equal(r.places.length, 20, "20 dipulangkan SERTA-MERTA");
  assert.equal(r.discoveryQueued, true);
  assert.ok(enqueued.length > 0, "discovery dibaris-gilirkan secara berasingan");

  // Baris gilir sebenar boleh menerima permintaan itu (idempoten).
  const req = buildDiscoveryRequest({
    cellId: enqueued[0],
    neighboringCellIds: enqueued.slice(1),
    reason: "low_coverage",
    requestedAt: T,
    requestedBySystem: "area_read",
    priority: 2,
  });
  await s.enqueueDiscovery(req, ADMIN);
  await s.enqueueDiscovery(req, ADMIN);
  const q = await s.listQueue("queued", { limit: 10 });
  assert.equal(q.items.length, 1);
});

// D. Restoran sel JIRAN dalam radius tepat.
test("D. restoran sel jiran dalam radius tepat DISERTAKAN", async () => {
  const s = store();
  const homeCell = getCoverageCellId(CENTER.lat, CENTER.lng);
  let neighborLoc: { lat: number; lng: number } | undefined;
  for (let d = 100; d <= 900 && !neighborLoc; d += 50) {
    for (const [n, e] of [[d, 0], [-d, 0], [0, d], [0, -d]] as const) {
      const loc = offsetMeters(CENTER, n, e);
      if (getCoverageCellId(loc.lat, loc.lng) !== homeCell) {
        neighborLoc = loc;
        break;
      }
    }
  }
  assert.ok(neighborLoc, "prasyarat: jumpa lokasi sel jiran");
  await addPlace(s, "mm_d_neighbor", neighborLoc!);

  const dist = haversineMeters(CENTER.lat, CENTER.lng, neighborLoc!.lat, neighborLoc!.lng);
  const r = await getPublishedPlacesByArea(
    {
      lat: CENTER.lat,
      lng: CENTER.lng,
      radiusMeters: Math.ceil(dist) + 50,
      now: T + 1000,
    },
    source(s),
  );
  assert.deepEqual(r.places.map((p) => p.placeId), ["mm_d_neighbor"]);
});

// E. Restoran sel SAMA di luar radius tepat.
test("E. restoran sel sama di luar radius tepat DIKECUALIKAN", async () => {
  const s = store();
  const homeCell = getCoverageCellId(CENTER.lat, CENTER.lng);
  const b = getCoverageCellBounds(homeCell);
  const eps = 1e-7;
  const inCellCorners = [
    { lat: b.minLat + eps, lng: b.minLng + eps },
    { lat: b.maxLat - eps, lng: b.maxLng - eps },
    { lat: b.minLat + eps, lng: b.maxLng - eps },
    { lat: b.maxLat - eps, lng: b.minLng + eps },
  ].filter((c) => getCoverageCellId(c.lat, c.lng) === homeCell);

  let far = inCellCorners[0];
  let farM = 0;
  for (const c of inCellCorners) {
    const d = haversineMeters(CENTER.lat, CENTER.lng, c.lat, c.lng);
    if (d > farM) {
      farM = d;
      far = c;
    }
  }
  await addPlace(s, "mm_e_same_cell", far);
  assert.equal((await s.getMembership("mm_e_same_cell"))!.homeCellId, homeCell);

  const r = await getPublishedPlacesByArea(
    { lat: CENTER.lat, lng: CENTER.lng, radiusMeters: Math.floor(farM / 2), now: T + 1000 },
    source(s),
  );
  assert.equal(r.places.length, 0, "sel sama TIDAK memintas radius");
});

// F. Kedai disembunyikan selepas penerbitan.
test("F. kedai disembunyikan: keahlian dibuang, versi berubah, cache tidak sah", async () => {
  const s = store();
  await addPlace(s, "mm_f1", CENTER);
  await addPlace(s, "mm_f2", offsetMeters(CENTER, 40, 0));

  const cells = (await s.getMembership("mm_f1"))!.searchableCellIds;
  const versionsBefore = await s.getCoverageVersions(cells);
  const poolBefore = combinedCoverageVersion(versionsBefore);

  const entry = buildAreaCacheEntry({
    centerCellId: cells[0],
    queriedCellIds: cells,
    radiusMeters: 1000,
    filters: {},
    publicationPoolVersion: poolBefore,
    placeIds: ["mm_f1", "mm_f2"],
    publicationIds: [],
    generatedAt: T,
    sourceMode: "approved_database",
  });
  await s.putCacheEntry(entry, ADMIN);

  // Sembunyikan mm_f1.
  const res = await s.removePlaceFromCoverage({
    placeId: "mm_f1",
    reason: "hidden",
    actor: ADMIN,
    now: T + 5000,
  });
  assert.equal(res.coverageVersionChanged, true);

  const versionsAfter = await s.getCoverageVersions(cells);
  const poolAfter = combinedCoverageVersion(versionsAfter);
  assert.notEqual(poolAfter, poolBefore, "versi kolam berubah");

  // Cache lama tidak lagi boleh digunakan.
  assert.equal(isCacheEntryUsable(entry, poolAfter, T + 6000), false);
  assert.equal(await s.invalidateByCoverageVersion(cells[0], poolAfter), 1);

  // Bacaan tidak lagi memaparkan kedai yang disembunyikan.
  const r = await getPublishedPlacesByArea(
    { lat: CENTER.lat, lng: CENTER.lng, radiusMeters: 1000, now: T + 7000 },
    source(s),
  );
  assert.deepEqual(r.places.map((p) => p.placeId), ["mm_f2"]);
});

// G. Restoran BERPINDAH.
test("G. kedai berpindah: keahlian lama dibuang, sel rumah baharu, sejarah kekal", async () => {
  const s = store();
  const v1 = await addPlace(s, "mm_g", CENTER);
  const oldHome = (await s.getMembership("mm_g"))!.homeCellId;

  const newLoc = offsetMeters(CENTER, 40_000, 0);
  const movedPlace = makePlace({ placeId: "mm_g", location: newLoc });
  const v2 = makePublication(movedPlace, 2, T + 10_000);
  const r = await s.reindexPlaceCoverage({
    publicationHead: head("mm_g", v2.publicationId),
    publicationVersion: v2,
    canonicalLocation: newLoc,
    reason: "moved",
    context: { now: T + 10_000 },
    actor: ADMIN,
  });

  const newHome = r.membership!.homeCellId;
  assert.notEqual(newHome, oldHome);
  assert.equal((await s.getCell(oldHome))!.activePlaceCount, 0);
  assert.deepEqual((await s.getCell(newHome))!.publishedPlaceIds, ["mm_g"]);

  // Sejarah penerbitan KEKAL — kedua-dua versi masih wujud sebagai rekod.
  assert.notEqual(v1.publicationId, v2.publicationId);
  assert.equal(r.membership!.publicationVersion, 2);

  // Carian di lokasi LAMA tidak lagi menemuinya.
  const oldArea = await getPublishedPlacesByArea(
    { lat: CENTER.lat, lng: CENTER.lng, radiusMeters: 1000, now: T + 11_000 },
    source(s),
  );
  assert.equal(oldArea.places.length, 0);
  // Carian di lokasi BAHARU menemuinya.
  const newArea = await getPublishedPlacesByArea(
    { lat: newLoc.lat, lng: newLoc.lng, radiusMeters: 1000, now: T + 11_000 },
    source(s),
  );
  assert.deepEqual(newArea.places.map((p) => p.placeId), ["mm_g"]);
});

// H. Keahlian pendua merujuk kedai kanonikal yang sama.
test("H. keahlian merentas sel merujuk satu kedai kanonikal → satu hasil", async () => {
  const s = store();
  await addPlace(s, "mm_h", CENTER);
  const m = await s.getMembership("mm_h");
  assert.ok(m!.searchableCellIds.length > 1, "hadir dalam beberapa sel");

  const r = await getPublishedPlacesByArea(
    { lat: CENTER.lat, lng: CENTER.lng, radiusMeters: 1000, now: T + 1000 },
    source(s),
  );
  assert.equal(r.places.length, 1);
  assert.equal(r.places[0].placeId, "mm_h");
});

// I. Kawasan KOSONG.
test("I. kawasan kosong: respons jujur, discovery dibaris-gilirkan, tiada dummy", async () => {
  const s = store();
  const enqueued: string[] = [];
  const r = await getPublishedPlacesByArea(
    { lat: CENTER.lat, lng: CENTER.lng, radiusMeters: 1000, now: T + 1000 },
    source(s),
    { onDiscoveryNeeded: (cells) => enqueued.push(...cells) },
  );
  assert.deepEqual(r.places, [], "TIADA restoran dummy dicipta");
  assert.equal(r.sourceMode, "empty_coverage");
  assert.equal(r.coverageIncomplete, true);
  assert.equal(r.discoveryQueued, true);
  assert.ok(enqueued.length > 0);
});

// J. Pembekal discovery GAGAL.
test("J. kegagalan discovery: liputan diluluskan sedia ada kekal boleh dibaca", async () => {
  const s = store();
  await addPlace(s, "mm_j1", offsetMeters(CENTER, 30, 0));
  await addPlace(s, "mm_j2", offsetMeters(CENTER, 60, 0));

  const r = await getPublishedPlacesByArea(
    { lat: CENTER.lat, lng: CENTER.lng, radiusMeters: 1000, now: T + 1000 },
    source(s),
    {
      minimumPlacesForComplete: 10,
      onDiscoveryNeeded: () => {
        throw new Error("provider outage");
      },
    },
  );
  assert.deepEqual(r.places.map((p) => p.placeId).sort(), ["mm_j1", "mm_j2"]);
  assert.ok(r.warnings.includes("discovery_enqueue_failed"));
  // Keahlian yang diluluskan TIDAK dimusnahkan oleh kegagalan pembekal.
  assert.ok(await s.getMembership("mm_j1"));
  assert.ok(await s.getMembership("mm_j2"));
});
