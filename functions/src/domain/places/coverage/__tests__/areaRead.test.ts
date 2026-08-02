/**
 * Phase 1.7 Part R — ujian enjin bacaan kawasan (21-33).
 * Termasuk bukti bahawa keahlian sel TIDAK memintas jarak tepat.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  InMemoryCoverageStore,
  InvalidAreaRequestError,
  MAX_AREA_RESULTS,
  compareBrowseOrder,
  getCoverageCellBounds,
  getCoverageCellId,
  getPublishedPlacesByArea,
  AreaPlaceResult,
} from "../index";
import { haversineMeters } from "../../dedup/geo";
import {
  ADMIN,
  CENTER,
  head,
  makePlace,
  makePublication,
  makeRawPublication,
  offsetMeters,
  T,
} from "./fixtures";

function store() {
  let t = T;
  return new InMemoryCoverageStore({ now: () => (t += 1000) });
}

/** Indeks kedai dan pulangkan store yang sama (untuk rantaian). */
async function addPlace(
  s: InMemoryCoverageStore,
  placeId: string,
  location: { lat: number; lng: number },
  extra: Partial<Parameters<typeof makePlace>[0]> = {},
  version = 1,
) {
  const place = makePlace({ placeId, location, ...extra });
  const v = makePublication(place, version);
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
    listMembershipsByCells: (cells: string[]) => s.listMembershipsByCells(cells),
    getCoverageVersions: (cells: string[]) => s.getCoverageVersions(cells),
    getActivePublication: (placeId: string) => s.getActivePublicationSnapshot(placeId),
  };
}

const baseReq = {
  lat: CENTER.lat,
  lng: CENTER.lng,
  radiusMeters: 1000,
  now: T + 1000,
};

// 21. Radius tepat mengecualikan kedai di luar julat.
test("21. radius tepat mengecualikan kedai di luar julat", async () => {
  const s = store();
  await addPlace(s, "mm_near", offsetMeters(CENTER, 100, 0)); // 100 m
  await addPlace(s, "mm_far", offsetMeters(CENTER, 900, 0)); // 900 m

  const r = await getPublishedPlacesByArea(
    { ...baseReq, radiusMeters: 500 },
    source(s),
  );
  const ids = r.places.map((p) => p.placeId);
  assert.deepEqual(ids, ["mm_near"]);
  assert.ok(r.places[0].distanceMeters <= 500);
});

// 22. Keahlian sel SAHAJA tidak memintas radius.
test("22. kedai dalam sel SAMA tetapi di luar radius DIKECUALIKAN", async () => {
  const s = store();
  const homeCell = getCoverageCellId(CENTER.lat, CENTER.lng);
  const bounds = getCoverageCellBounds(homeCell);

  // Cari titik yang PASTI dalam sel yang sama tetapi sejauh mungkin dari
  // pusat carian: sudut sel yang terjauh (ditarik sedikit ke dalam).
  const eps = 1e-7;
  const corners = [
    { lat: bounds.minLat + eps, lng: bounds.minLng + eps },
    { lat: bounds.minLat + eps, lng: bounds.maxLng - eps },
    { lat: bounds.maxLat - eps, lng: bounds.minLng + eps },
    { lat: bounds.maxLat - eps, lng: bounds.maxLng - eps },
  ].filter((c) => getCoverageCellId(c.lat, c.lng) === homeCell);
  assert.ok(corners.length > 0, "prasyarat: sekurang-kurangnya satu sudut dalam sel");

  let farthest = corners[0];
  let farthestM = 0;
  for (const c of corners) {
    const d = haversineMeters(CENTER.lat, CENTER.lng, c.lat, c.lng);
    if (d > farthestM) {
      farthestM = d;
      farthest = c;
    }
  }
  assert.ok(farthestM > 50, `prasyarat: sudut cukup jauh (dapat ${farthestM} m)`);

  await addPlace(s, "mm_samecell_far", farthest);
  const membership = await s.getMembership("mm_samecell_far");
  assert.equal(
    membership?.homeCellId,
    homeCell,
    "prasyarat: kedai berada dalam sel yang SAMA",
  );

  // Radius yang lebih KECIL daripada jarak sebenar mesti mengecualikannya,
  // walaupun ia berkongsi sel dengan pusat carian.
  const radiusMeters = Math.max(10, Math.floor(farthestM / 2));
  const r = await getPublishedPlacesByArea({ ...baseReq, radiusMeters }, source(s));
  assert.equal(r.places.length, 0, "sel BUKAN pengganti jarak");

  // Bukti positif: radius yang cukup besar MEMANG memasukkannya.
  const wide = await getPublishedPlacesByArea(
    { ...baseReq, radiusMeters: Math.ceil(farthestM) + 10 },
    source(s),
  );
  assert.deepEqual(wide.places.map((p) => p.placeId), ["mm_samecell_far"]);
});

// 23. Kedai dalam sel JIRAN tetapi dalam radius DISERTAKAN.
test("23. kedai dalam sel jiran tetapi dalam radius disertakan", async () => {
  const s = store();
  // Cari titik yang berada dalam sel BERBEZA tetapi hanya ~300 m jauh.
  const homeCell = getCoverageCellId(CENTER.lat, CENTER.lng);
  let neighborLoc = offsetMeters(CENTER, 0, 0);
  let found = false;
  for (let d = 100; d <= 900; d += 50) {
    for (const [n, e] of [
      [d, 0],
      [-d, 0],
      [0, d],
      [0, -d],
    ] as const) {
      const loc = offsetMeters(CENTER, n, e);
      if (getCoverageCellId(loc.lat, loc.lng) !== homeCell) {
        neighborLoc = loc;
        found = true;
        break;
      }
    }
    if (found) break;
  }
  assert.equal(found, true, "prasyarat: jumpa titik dalam sel jiran");
  assert.notEqual(getCoverageCellId(neighborLoc.lat, neighborLoc.lng), homeCell);

  await addPlace(s, "mm_neighbor", neighborLoc);
  const r = await getPublishedPlacesByArea({ ...baseReq, radiusMeters: 1000 }, source(s));
  assert.ok(
    r.places.some((p) => p.placeId === "mm_neighbor"),
    "kedai sel jiran dalam radius mesti disertakan",
  );
});

// 24. Keahlian pendua → satu kedai kanonikal.
test("24. keahlian merentas beberapa sel → satu hasil kanonikal", async () => {
  const s = store();
  await addPlace(s, "mm_dup", CENTER);
  const m = await s.getMembership("mm_dup");
  // Keahlian memang muncul dalam BEBERAPA sel boleh-cari.
  assert.ok(m!.searchableCellIds.length > 1);

  const r = await getPublishedPlacesByArea(baseReq, source(s));
  assert.equal(r.places.filter((p) => p.placeId === "mm_dup").length, 1);
});

// 25/26. Tutup sementara.
test("25. kedai tutup sementara DIKECUALIKAN secara lalai", async () => {
  const s = store();
  const place = makePlace({
    placeId: "mm_tc",
    location: CENTER,
    status: "temporarily_closed",
  });
  const v = makeRawPublication(place);
  await s.indexPublishedPlaceIntoCoverage({
    publicationHead: head("mm_tc", v.publicationId),
    publicationVersion: v,
    canonicalLocation: CENTER,
    context: { now: T },
    actor: ADMIN,
  });

  const r = await getPublishedPlacesByArea(baseReq, source(s));
  assert.equal(r.places.length, 0);
});

test("26. kedai tutup sementara disertakan HANYA bila diminta secara eksplisit", async () => {
  const s = store();
  const place = makePlace({
    placeId: "mm_tc2",
    location: CENTER,
    status: "temporarily_closed",
  });
  const v = makeRawPublication(place);
  await s.indexPublishedPlaceIntoCoverage({
    publicationHead: head("mm_tc2", v.publicationId),
    publicationVersion: v,
    canonicalLocation: CENTER,
    context: { now: T },
    actor: ADMIN,
  });

  const r = await getPublishedPlacesByArea(
    { ...baseReq, includeTemporarilyClosed: true },
    source(s),
  );
  assert.deepEqual(r.places.map((p) => p.placeId), ["mm_tc2"]);
  assert.equal(r.places[0].placeStatus, "temporarily_closed");
});

// 27. Penapis jenis tempat.
test("27. penapis jenis tempat berfungsi", async () => {
  const s = store();
  await addPlace(s, "mm_rest", offsetMeters(CENTER, 50, 0), {
    placeTypes: ["restaurant"],
  });
  await addPlace(s, "mm_cafe", offsetMeters(CENTER, 60, 0), { placeTypes: ["cafe"] });

  const r = await getPublishedPlacesByArea(
    { ...baseReq, requiredPlaceTypes: ["cafe"] },
    source(s),
  );
  assert.deepEqual(r.places.map((p) => p.placeId), ["mm_cafe"]);
});

// 28. Penapis masakan.
test("28. penapis masakan berfungsi", async () => {
  const s = store();
  await addPlace(s, "mm_malay", offsetMeters(CENTER, 50, 0), { cuisines: ["malay"] });
  await addPlace(s, "mm_jp", offsetMeters(CENTER, 60, 0), { cuisines: ["japanese"] });

  const r = await getPublishedPlacesByArea(
    { ...baseReq, requiredCuisineTags: ["japanese"] },
    source(s),
  );
  assert.deepEqual(r.places.map((p) => p.placeId), ["mm_jp"]);
});

// 29/30. Isihan browse deterministik + pemutus seri placeId.
test("29. isihan browse deterministik (jarak → completeness → rating → placeId)", async () => {
  const s = store();
  await addPlace(s, "mm_c", offsetMeters(CENTER, 300, 0));
  await addPlace(s, "mm_a", offsetMeters(CENTER, 100, 0));
  await addPlace(s, "mm_b", offsetMeters(CENTER, 200, 0));

  const r1 = await getPublishedPlacesByArea(baseReq, source(s));
  const r2 = await getPublishedPlacesByArea(baseReq, source(s));
  assert.deepEqual(
    r1.places.map((p) => p.placeId),
    ["mm_a", "mm_b", "mm_c"],
    "jarak menaik",
  );
  assert.deepEqual(r1.places.map((p) => p.placeId), r2.places.map((p) => p.placeId));
});

test("30. pemutus seri MUKTAMAD ialah placeId menaik", () => {
  const mk = (
    placeId: string,
    distanceMeters: number,
    completenessScore: number,
    ratingEvidenceConfidence: number,
  ): AreaPlaceResult => ({
    placeId,
    publicationId: `pub_${placeId}`,
    publicationVersion: 1,
    distanceMeters,
    lat: 0,
    lng: 0,
    placeStatus: "active",
    completenessScore,
    ratingEvidenceConfidence,
    placeTypeTagIds: [],
    cuisineTagIds: [],
    snapshot: {},
    warnings: [],
  });

  // Semua sama kecuali placeId.
  const sorted = [mk("zzz", 100, 0.9, 0.9), mk("aaa", 100, 0.9, 0.9)].sort(
    compareBrowseOrder,
  );
  assert.deepEqual(sorted.map((p) => p.placeId), ["aaa", "zzz"]);

  // Completeness menang atas rating.
  const byCompleteness = [
    mk("a", 100, 0.5, 0.99),
    mk("b", 100, 0.9, 0.1),
  ].sort(compareBrowseOrder);
  assert.deepEqual(byCompleteness.map((p) => p.placeId), ["b", "a"]);

  // Jarak menang atas semua.
  const byDistance = [mk("a", 200, 1, 1), mk("b", 100, 0, 0)].sort(compareBrowseOrder);
  assert.deepEqual(byDistance.map((p) => p.placeId), ["b", "a"]);
});

// 31. Penomboran STABIL.
test("31. penomboran stabil — tiada pendua merentas halaman", async () => {
  const s = store();
  for (let i = 0; i < 7; i++) {
    await addPlace(s, `mm_p${i}`, offsetMeters(CENTER, 50 + i * 20, 0));
  }

  const page1 = await getPublishedPlacesByArea(
    { ...baseReq, maxResults: 3 },
    source(s),
  );
  assert.equal(page1.places.length, 3);
  assert.ok(page1.nextPageToken);

  const page2 = await getPublishedPlacesByArea(
    { ...baseReq, maxResults: 3, pageToken: page1.nextPageToken },
    source(s),
  );
  const page3 = await getPublishedPlacesByArea(
    { ...baseReq, maxResults: 3, pageToken: page2.nextPageToken },
    source(s),
  );

  const all = [...page1.places, ...page2.places, ...page3.places].map((p) => p.placeId);
  assert.equal(all.length, 7);
  assert.equal(new Set(all).size, 7, "tiada placeId berulang merentas halaman");
  assert.equal(page3.nextPageToken, undefined, "halaman terakhir tiada token");
});

// 32. Token halaman BASI ditolak apabila versi liputan berubah.
test("32. token halaman ditolak selepas versi liputan berubah", async () => {
  const s = store();
  for (let i = 0; i < 5; i++) {
    await addPlace(s, `mm_q${i}`, offsetMeters(CENTER, 50 + i * 20, 0));
  }
  const page1 = await getPublishedPlacesByArea(
    { ...baseReq, maxResults: 2 },
    source(s),
  );
  assert.ok(page1.nextPageToken);

  // Liputan berubah — kedai baharu diindeks.
  await addPlace(s, "mm_new", offsetMeters(CENTER, 30, 0));

  await assert.rejects(
    () =>
      getPublishedPlacesByArea(
        { ...baseReq, maxResults: 2, pageToken: page1.nextPageToken },
        source(s),
      ),
    (e: unknown) => {
      assert.ok(e instanceof InvalidAreaRequestError);
      assert.equal(e.code, "stale_page_token");
      return true;
    },
  );
});

test("32b. token halaman milik permintaan LAIN ditolak", async () => {
  const s = store();
  for (let i = 0; i < 4; i++) {
    await addPlace(s, `mm_r${i}`, offsetMeters(CENTER, 50 + i * 20, 0));
  }
  const page1 = await getPublishedPlacesByArea(
    { ...baseReq, maxResults: 2 },
    source(s),
  );
  // Radius berbeza → hash permintaan berbeza.
  await assert.rejects(
    () =>
      getPublishedPlacesByArea(
        { ...baseReq, radiusMeters: 900, maxResults: 2, pageToken: page1.nextPageToken },
        source(s),
      ),
    (e: unknown) => {
      assert.ok(e instanceof InvalidAreaRequestError);
      assert.equal(e.code, "page_token_request_mismatch");
      return true;
    },
  );
});

test("32c. token rosak ditolak", async () => {
  const s = store();
  await addPlace(s, "mm_s0", CENTER);
  await assert.rejects(
    () => getPublishedPlacesByArea({ ...baseReq, pageToken: "###" }, source(s)),
    (e: unknown) => {
      assert.ok(e instanceof InvalidAreaRequestError);
      assert.equal(e.code, "invalid_page_token");
      return true;
    },
  );
});

// 33. maxResults TERBATAS.
test("33. maxResults terbatas kepada had keras", async () => {
  const s = store();
  await addPlace(s, "mm_only", CENTER);
  const r = await getPublishedPlacesByArea(
    { ...baseReq, maxResults: 10_000 },
    source(s),
  );
  assert.ok(r.places.length <= MAX_AREA_RESULTS);
});

test("33b. permintaan tidak sah ditolak (koordinat/radius/maxResults)", async () => {
  const s = store();
  const src = source(s);
  await assert.rejects(() => getPublishedPlacesByArea({ ...baseReq, lat: 99 }, src));
  await assert.rejects(() => getPublishedPlacesByArea({ ...baseReq, radiusMeters: 0 }, src));
  await assert.rejects(
    () => getPublishedPlacesByArea({ ...baseReq, radiusMeters: 999_999 }, src),
  );
  await assert.rejects(
    () => getPublishedPlacesByArea({ ...baseReq, maxResults: -1 }, src),
  );
});

test("bacaan mengembalikan versi liputan + sel yang disoal", async () => {
  const s = store();
  await addPlace(s, "mm_meta", CENTER);
  const r = await getPublishedPlacesByArea(baseReq, source(s));
  assert.ok(r.queriedCellIds.length > 0);
  assert.equal(Object.keys(r.coverageVersions).length, r.queriedCellIds.length);
  assert.equal(r.generatedAt, baseReq.now);
  assert.equal(r.places[0].publicationVersion, 1);
});

test("projeksi medan dihormati bila diminta", async () => {
  const s = store();
  await addPlace(s, "mm_proj", CENTER);
  const r = await getPublishedPlacesByArea(
    { ...baseReq, requestedFields: ["displayState"] },
    source(s),
  );
  assert.deepEqual(Object.keys(r.places[0].snapshot), ["displayState"]);
});

test("kedai tanpa kepala penerbitan aktif tidak dipapar", async () => {
  const s = store();
  await addPlace(s, "mm_gone", CENTER);
  // Buang penerbitan aktif tetapi TINGGALKAN keahlian (keadaan basi).
  s.unregisterActivePublication("mm_gone");
  const r = await getPublishedPlacesByArea(baseReq, source(s));
  assert.equal(r.places.length, 0, "keahlian basi tidak membocorkan data");
});
