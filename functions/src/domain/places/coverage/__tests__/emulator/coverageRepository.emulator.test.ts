/**
 * Phase 1.7 — ujian repository liputan Firestore terhadap EMULATOR sahaja.
 * Jalankan: npm run test:emulator. Melangkau bila FIRESTORE_EMULATOR_HOST tiada.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { FirestoreCoverageStore } from "../../firestoreCoverageRepository";
import { FirestorePublicationStore } from "../../../publication/firestorePublicationRepository";
import {
  buildAreaCacheEntry,
  buildDiscoveryRequest,
  buildMembership,
  computeCoverageMetrics,
  evaluateIndexingDecision,
  getPublishedPlacesByArea,
  isCacheEntryUsable,
  combinedCoverageVersion,
  EMPTY_COVERAGE_VERSION,
} from "../../index";
import { ADMIN, CENTER, head, makePlace, makePublication, offsetMeters, T } from "../fixtures";

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator)";

let app: App | undefined;
let seq = 0;

function db() {
  if (!app) app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-mm" });
  return getFirestore(app);
}
function store(): FirestoreCoverageStore {
  let t = T;
  return new FirestoreCoverageStore(db(), { now: () => (t += 1000) });
}
function pubStore(): FirestorePublicationStore {
  let t = T;
  return new FirestorePublicationStore(db(), { now: () => (t += 1000) });
}

/** Kedai unik per-ujian supaya ujian tidak berlanggar dalam satu emulator. */
function uniqueId(prefix: string) {
  return `emu_cov_${prefix}_${seq++}`;
}

/**
 * Terbitkan kedai melalui Phase 1.6 (penerbitan + kepala aktif), kemudian
 * indeks keahliannya ke dalam liputan Phase 1.7.
 */
async function publishAndIndex(
  s: FirestoreCoverageStore,
  placeId: string,
  location: { lat: number; lng: number },
  extra: Partial<Parameters<typeof makePlace>[0]> = {},
) {
  const ps = pubStore();
  const place = makePlace({ placeId, location, ...extra });
  const version = makePublication(place);
  await ps.createPublicationVersion(version, ADMIN);
  await ps.setEmulatorActivePublication(placeId, version.publicationId, ADMIN, "publish");

  const decision = evaluateIndexingDecision(
    {
      placeId,
      activePublicationId: version.publicationId,
      activeVersionNumber: version.versionNumber,
      updatedAt: T,
      updatedBy: ADMIN.actorUid,
      reasonCode: "publish",
    },
    version,
    location,
    { now: T },
  );
  assert.equal(decision.indexable, true, decision.denyReasons.join(","));

  const membership = buildMembership(
    version,
    location,
    decision,
    { now: T },
    EMPTY_COVERAGE_VERSION,
  );
  await s.upsertMembership(membership, ADMIN);
  for (const cellId of membership.searchableCellIds) {
    await s.recomputeCell(cellId, ADMIN);
  }
  return { version, membership };
}

test("emulator: upsert keahlian + kira semula sel + versi liputan", { skip }, async () => {
  const s = store();
  const placeId = uniqueId("idx");
  const { membership } = await publishAndIndex(s, placeId, CENTER);

  const stored = await s.getMembership(placeId);
  assert.equal(stored?.homeCellId, membership.homeCellId);
  assert.equal(stored?.lat, CENTER.lat, "koordinat tepat dikekalkan");

  const cell = await s.getCell(membership.homeCellId);
  assert.ok(cell);
  assert.ok(cell!.publishedPlaceIds.includes(placeId));
  assert.notEqual(cell!.coverageVersion, EMPTY_COVERAGE_VERSION);
  assert.equal(cell!.cellSystem, "geohash_base32");
});

test("emulator: upsert keahlian IDEMPOTEN", { skip }, async () => {
  const s = store();
  const placeId = uniqueId("idem");
  const { membership } = await publishAndIndex(s, placeId, CENTER);
  const before = await s.getMembership(placeId);

  // Upsert semula dengan indexedAt berbeza tetapi contentHash sama.
  const again = await s.upsertMembership(
    { ...membership, indexedAt: T + 999_999 },
    ADMIN,
  );
  assert.equal(again.indexedAt, before!.indexedAt, "rekod asal dikekalkan");
});

test("emulator: bacaan kawasan menggunakan kepala penerbitan aktif", { skip }, async () => {
  const s = store();
  const near = uniqueId("near");
  const far = uniqueId("far");
  await publishAndIndex(s, near, offsetMeters(CENTER, 80, 0));
  await publishAndIndex(s, far, offsetMeters(CENTER, 900, 0));

  const r = await getPublishedPlacesByArea(
    { lat: CENTER.lat, lng: CENTER.lng, radiusMeters: 300, now: T + 1000 },
    {
      listMembershipsByCells: (c) => s.listMembershipsByCells(c),
      getCoverageVersions: (c) => s.getCoverageVersions(c),
      getActivePublication: (p) => s.getActivePublicationSnapshot(p),
    },
  );
  const ids = r.places.map((p) => p.placeId);
  assert.ok(ids.includes(near));
  assert.equal(ids.includes(far), false, "radius tepat dikuatkuasa");
});

test("emulator: buang keahlian mengemas kini sel (sejarah penerbitan kekal)", { skip }, async () => {
  const s = store();
  const placeId = uniqueId("remove");
  const { membership, version } = await publishAndIndex(s, placeId, CENTER);
  const homeCell = membership.homeCellId;
  const versionBefore = (await s.getCell(homeCell))!.coverageVersion;

  await s.removeMembership(placeId, "hidden", ADMIN);
  assert.equal(await s.getMembership(placeId), null);

  const after = await s.getCell(homeCell);
  assert.equal(after!.publishedPlaceIds.includes(placeId), false);
  assert.notEqual(after!.coverageVersion, versionBefore);

  // Sejarah PENERBITAN Phase 1.6 KEKAL — hanya indeks liputan dibuang.
  const ps = pubStore();
  assert.ok(
    await ps.getPublicationVersion(version.publicationId),
    "versi penerbitan TIDAK dipadam",
  );
});

test("emulator: metrik dikira & disimpan tanpa data peribadi", { skip }, async () => {
  const s = store();
  const p1 = uniqueId("m1");
  const { membership } = await publishAndIndex(s, p1, CENTER, {
    placeTypes: ["restaurant"],
    cuisines: ["malay"],
    hoursUnknown: true,
  });
  const cellId = membership.homeCellId;

  const memberships = await s.listMembershipsByCells([cellId]);
  const versions = new Map(
    await Promise.all(
      memberships.map(async (m) => {
        const v = await s.getActivePublicationSnapshot(m.placeId);
        return [m.publicationId, v!] as const;
      }),
    ),
  );
  const metrics = computeCoverageMetrics({
    cellId,
    memberships,
    versionsByPublicationId: versions,
    coverageVersion: (await s.getCoverageVersions([cellId]))[cellId],
    now: T,
  });
  await s.putMetrics(metrics, ADMIN);

  const read = await s.getMetrics(cellId);
  assert.ok(read);
  assert.ok(read!.activePublishedPlaces >= 1);
  assert.ok(read!.unknownHoursCount >= 1);
  const serialized = JSON.stringify(read);
  for (const forbidden of ["uid", "userId", "email", "deviceId"]) {
    assert.equal(serialized.includes(`"${forbidden}"`), false);
  }
});

test("emulator: baris gilir discovery idempoten + terbatas", { skip }, async () => {
  const s = store();
  const cellId = `emu_cell_${seq++}`;
  const req = buildDiscoveryRequest({
    cellId,
    neighboringCellIds: [],
    reason: "empty_coverage",
    requestedAt: T,
    requestedBySystem: "area_read",
    priority: 1,
  });
  const a = await s.enqueueDiscovery(req, ADMIN);
  const b = await s.enqueueDiscovery({ ...req, requestedAt: T + 5000 }, ADMIN);
  assert.equal(a.requestId, b.requestId);
  assert.equal(b.requestedAt, T);

  const processing = await s.transitionDiscoveryStatus(req.requestId, "processing", ADMIN);
  assert.equal(processing.attemptCount, 1);

  const page = await s.listQueue(undefined, { limit: 10_000 });
  assert.ok(page.items.length <= 100, "senarai terbatas");
});

test("emulator: cache kawasan berversi & boleh dibatalkan", { skip }, async () => {
  const s = store();
  const cellId = `emu_cache_${seq++}`;
  const poolOld = combinedCoverageVersion({ [cellId]: "cv_old" });
  const entry = buildAreaCacheEntry({
    centerCellId: cellId,
    queriedCellIds: [cellId],
    radiusMeters: 1000,
    filters: {},
    publicationPoolVersion: poolOld,
    placeIds: ["mm_x"],
    publicationIds: ["pub_x"],
    generatedAt: T,
    sourceMode: "approved_database",
  });
  await s.putCacheEntry(entry, ADMIN);
  assert.ok(await s.getCacheEntry(entry.cacheKey));

  const poolNew = combinedCoverageVersion({ [cellId]: "cv_new" });
  assert.equal(isCacheEntryUsable(entry, poolNew, T + 1000), false);
  const removed = await s.invalidateByCoverageVersion(cellId, poolNew);
  assert.equal(removed, 1);
  assert.equal(await s.getCacheEntry(entry.cacheKey), null);
});

test("emulator: TIADA tulisan place_registry / places_cache / place_details", { skip }, async () => {
  const s = store();
  await publishAndIndex(s, uniqueId("noprod"), CENTER);
  const d = db();
  for (const c of ["place_registry", "places_cache", "place_details"]) {
    const snap = await d.collection(c).limit(1).get();
    assert.equal(snap.empty, true, `${c} tidak boleh disentuh oleh Phase 1.7`);
  }
});
