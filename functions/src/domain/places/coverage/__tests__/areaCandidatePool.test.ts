/**
 * FULL RADIUS COVERAGE — ujian TULEN AreaCandidatePool (Part 34).
 * Database-first, preserve-old, dedup silang-sel, kolam >30/>100, penemuan
 * hanya-bila-jurang, cooldown, radius→sel, penapis radius tepat, closed retention.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AreaPlace,
  areaLocationBucket,
  buildAreaCandidatePool,
  coverageCellsForRadius,
  decideAreaDiscovery,
  enumerateCellsForRadius,
  exactRadiusFilter,
  mergeAreaPlaces,
  resolutionForRadius,
  storageCellForPlace,
  STORAGE_RESOLUTION,
} from "../areaCandidatePool";
import { MAX_QUERIED_CELLS } from "../coverageCell";
import { paginateRanked } from "../../../algorithm2/sessionEngine";
import { PlaceCandidate } from "../../../../types/place";
import { approxCellWidthMeters } from "../geohash";

const KL = { lat: 3.139, lng: 101.687 };

function cand(id: string, over: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    placeId: id, name: id, cuisine: "malay", emoji: "🍽️", rating: 4, userRatingCount: 100,
    priceLevel: 2, distanceKm: 0, isOpen: true, address: "", matchScore: 0, matchReasonKeys: [],
    priceEstimate: "RM10", ...over,
  };
}
function ap(
  id: string, lat: number, lng: number,
  o: Partial<AreaPlace> = {},
): AreaPlace {
  return {
    canonicalPlaceId: o.canonicalPlaceId ?? null, placeId: id, lat, lng,
    status: o.status ?? "active", origin: o.origin ?? "registry",
    candidate: o.candidate ?? cand(id, { name: id }),
  };
}
// tiny lat/lng offset (~m): 1 deg lat ≈ 111km
const dLat = (m: number) => m / 111000;

// ---- resolution / cells for radius (Part 6) ----
// 1
test("larger radius selects coarser resolution (more area / more supply)", () => {
  const r1 = resolutionForRadius(1000);
  const r3 = resolutionForRadius(3000);
  const r10 = resolutionForRadius(10000);
  assert.ok(r1 >= r3, `1km res ${r1} >= 3km res ${r3}`);
  assert.ok(r3 >= r10, `3km res ${r3} >= 10km res ${r10}`);
  // the 3x3 grid must cover the diameter
  assert.ok(approxCellWidthMeters(r10) * 3 >= 2 * 10000);
});

// 2
test("coverageCellsForRadius returns center + neighbors, no dup", () => {
  const cells = coverageCellsForRadius(KL.lat, KL.lng, 3000);
  assert.ok(cells.length >= 1);
  assert.equal(new Set(cells).size, cells.length);
});

// 2b — READ==WRITE resolution consistency (guards DB-reuse bug)
test("storage cell of a place is found by the read enumeration for its radius", () => {
  // a place ~1.5km from center must be readable at 3/5/10km radii
  const pLat = KL.lat + dLat(1500), pLng = KL.lng;
  const writeCell = storageCellForPlace(pLat, pLng);
  for (const r of [3000, 5000, 10000, 15000]) {
    const readCells = enumerateCellsForRadius(KL.lat, KL.lng, r);
    assert.ok(readCells.includes(writeCell), `radius ${r} read cells include place's storage cell`);
    assert.ok(readCells.length <= MAX_QUERIED_CELLS, `radius ${r} bounded`);
    // all enumerated cells are at the fixed storage resolution
    assert.ok(readCells.every((c) => c.length === STORAGE_RESOLUTION));
  }
});

// ---- exact radius filter (authoritative) ----
// 3
test("exact-radius filter drops beyond radius + sorts by distance", () => {
  const near = ap("near", KL.lat + dLat(200), KL.lng);
  const far = ap("far", KL.lat + dLat(5000), KL.lng);
  const res = exactRadiusFilter([far, near], KL.lat, KL.lng, 1000);
  assert.deepEqual(res.within.map((p) => p.placeId), ["near"]);
  assert.equal(res.droppedBeyondRadius, 1);
});

// 4
test("exact-radius filter drops invalid coordinates", () => {
  const bad = ap("bad", NaN, NaN);
  const res = exactRadiusFilter([bad], KL.lat, KL.lng, 5000);
  assert.equal(res.within.length, 0);
  assert.equal(res.droppedInvalid, 1);
});

// ---- preserve old knowledge (Part 3) ----
// 5
test("known place NOT returned by discovery is PRESERVED (not deleted)", () => {
  const known = [ap("A", KL.lat, KL.lng), ap("B", KL.lat, KL.lng)];
  const discovered = [ap("A", KL.lat, KL.lng, { origin: "discovery" })]; // B missing now
  const { merged } = mergeAreaPlaces(known, discovered);
  const ids = merged.map((p) => p.placeId).sort();
  assert.deepEqual(ids, ["A", "B"]); // B preserved despite absent from discovery
});

// 6
test("merge dedups provider + canonical identity across cells", () => {
  const known = [ap("prov1", KL.lat, KL.lng, { canonicalPlaceId: "canonA" })];
  const discovered = [
    ap("prov1", KL.lat, KL.lng, { canonicalPlaceId: "canonA", origin: "discovery" }), // dup by canon
    ap("prov2", KL.lat, KL.lng, { origin: "discovery" }), // new
  ];
  const { merged, newCount, duplicateCount } = mergeAreaPlaces(known, discovered);
  assert.equal(merged.length, 2);
  assert.equal(newCount, 1);
  assert.equal(duplicateCount, 1);
});

// 7
test("merge counts genuinely new discoveries", () => {
  const known = [ap("A", KL.lat, KL.lng)];
  const discovered = [ap("B", KL.lat, KL.lng, { origin: "discovery" }), ap("C", KL.lat, KL.lng, { origin: "discovery" })];
  const { newCount } = mergeAreaPlaces(known, discovered);
  assert.equal(newCount, 2);
});

// ---- discovery decision (Part 8/17) ----
const baseDecision = {
  knownActiveCount: 50, coverageStatus: "HEALTHY" as const, minDensity: 10,
  radiusExpanded: false, cooldownActive: false,
};
// 8
test("healthy + dense + fresh coverage → NO provider discovery (database-first)", () => {
  const d = decideAreaDiscovery(baseDecision);
  assert.equal(d.discover, false);
  assert.equal(d.reason, "coverage_healthy_database_first");
});
// 9
test("unknown/partial/stale coverage triggers discovery", () => {
  for (const s of ["UNKNOWN", "PARTIAL", "STALE"] as const) {
    assert.equal(decideAreaDiscovery({ ...baseDecision, coverageStatus: s }).discover, true, s);
  }
});
// 10
test("low known density triggers discovery", () => {
  assert.equal(decideAreaDiscovery({ ...baseDecision, knownActiveCount: 3 }).discover, true);
});
// 11
test("radius expansion triggers discovery", () => {
  assert.equal(decideAreaDiscovery({ ...baseDecision, radiusExpanded: true }).discover, true);
});
// 12
test("cooldown blocks repeated provider discovery when supply exists", () => {
  const d = decideAreaDiscovery({ ...baseDecision, coverageStatus: "PARTIAL", cooldownActive: true });
  assert.equal(d.discover, false);
  assert.equal(d.reason, "cooldown_active");
});
// 13
test("empty uncovered area discovers even under cooldown (avoid 0 results)", () => {
  const d = decideAreaDiscovery({ ...baseDecision, knownActiveCount: 0, coverageStatus: "UNKNOWN", cooldownActive: true });
  assert.equal(d.discover, true);
  assert.equal(d.reason, "empty_uncovered");
});
// 14
test("forced rescan always discovers", () => {
  assert.equal(decideAreaDiscovery({ ...baseDecision, forced: true }).discover, true);
});

// ---- area pool can exceed 30 / 100 (Part 7/12/13) ----
// 15
test("area pool is NOT capped at 30 (holds >30)", () => {
  const places = Array.from({ length: 45 }, (_, i) => ap(`p${i}`, KL.lat + dLat(i * 10), KL.lng));
  const pool = buildAreaCandidatePool({
    centerLat: KL.lat, centerLng: KL.lng, radiusMeters: 5000, coverageCellIds: ["c"],
    merged: places, knownCanonicalCount: 45, freshnessStatus: "HEALTHY",
    discoveryPerformed: false, discoveryReason: "db", newlyDiscoveredCount: 0, now: 1,
  });
  assert.equal(pool.exactRadiusCount, 45);
  assert.equal(pool.candidates.length, 45);
  assert.ok(pool.candidates.length > 30);
});
// 16
test("area pool holds >100 fixture", () => {
  const places = Array.from({ length: 140 }, (_, i) => ap(`p${i}`, KL.lat + dLat(i * 5), KL.lng));
  const pool = buildAreaCandidatePool({
    centerLat: KL.lat, centerLng: KL.lng, radiusMeters: 15000, coverageCellIds: ["c"],
    merged: places, knownCanonicalCount: 140, freshnessStatus: "HEALTHY",
    discoveryPerformed: false, discoveryReason: "db", newlyDiscoveredCount: 0, now: 1,
  });
  assert.ok(pool.candidates.length > 100, `got ${pool.candidates.length}`);
});

// ---- session chunk independent of area pool (Part 11/16) ----
// 17
test("session chunk (30) is independent from area pool size", () => {
  const places = Array.from({ length: 82 }, (_, i) => ap(`p${i}`, KL.lat + dLat(i * 10), KL.lng, { candidate: cand(`p${i}`, { matchScore: 90 - i }) }));
  const pool = buildAreaCandidatePool({
    centerLat: KL.lat, centerLng: KL.lng, radiusMeters: 10000, coverageCellIds: ["c"],
    merged: places, knownCanonicalCount: 82, freshnessStatus: "HEALTHY",
    discoveryPerformed: false, discoveryReason: "db", newlyDiscoveredCount: 0, now: 1,
  });
  // area pool 82; chunk into 30s over the ranked pool
  const c1 = paginateRanked(pool.candidates, 0, 30);
  const c2 = paginateRanked(pool.candidates, 30, 30);
  const c3 = paginateRanked(pool.candidates, 60, 30);
  assert.equal(pool.candidates.length, 82);
  assert.equal(c1.pageItems.length, 30);
  assert.equal(c2.pageItems.length, 30);
  assert.equal(c3.pageItems.length, 22);
  assert.equal(c3.endOfResults, true);
  // no overlap between chunk 1 and 2
  const s1 = new Set(c1.pageItems.map((p) => p.placeId));
  assert.ok(!c2.pageItems.some((p) => s1.has(p.placeId)));
});

// ---- closed place policy (Part 19) ----
// 18
test("permanently closed excluded from pool but temporarily closed retained", () => {
  const places = [
    ap("open", KL.lat, KL.lng, { status: "active" }),
    ap("temp", KL.lat, KL.lng, { status: "temporarily_closed" }),
    ap("perm", KL.lat, KL.lng, { status: "permanently_closed" }),
  ];
  const pool = buildAreaCandidatePool({
    centerLat: KL.lat, centerLng: KL.lng, radiusMeters: 3000, coverageCellIds: ["c"],
    merged: places, knownCanonicalCount: 3, freshnessStatus: "HEALTHY",
    discoveryPerformed: false, discoveryReason: "db", newlyDiscoveredCount: 0, now: 1,
  });
  const ids = pool.canonicalPlaceIds;
  assert.ok(ids.includes("open"));
  assert.ok(ids.includes("temp"), "temporarily closed retained in pool");
  assert.ok(!ids.includes("perm"), "permanently closed excluded");
  assert.equal(pool.activePlaceCount, 1);
});

// 19
test("location bucket is deterministic + radius-bucketed", () => {
  assert.equal(areaLocationBucket(3.1391, 101.6871, 3000), areaLocationBucket(3.1393, 101.6873, 3000));
  assert.notEqual(areaLocationBucket(3.139, 101.687, 3000), areaLocationBucket(3.139, 101.687, 5500));
});
