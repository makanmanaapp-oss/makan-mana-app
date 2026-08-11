/**
 * Algorithm 2 / Phase 2.2 — ujian enjin sesi (TULEN).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_COLD_PROVIDER_QUERIES,
  REJECT_MEMORY_TTL_MS,
  activeRejectMemoryIds,
  applyCuisineDiversity,
  buildExcludeIds,
  computeContextHash,
  mergeDedupe,
  paginateRanked,
  pickNextAlternative,
  planProviderQueries,
  seedFromString,
  sessionSeededRotation,
} from "../sessionEngine";
import { place } from "./fixtures";

const CTX = { uid: "u1", lat: 3.1478, lng: 101.6953, radiusMeters: 3000, mood: "moodLapar", timeSegment: "lunch", plan: "free" };

// context hash
test("contextHash deterministic + grid-stable for tiny location jitter", () => {
  assert.equal(computeContextHash(CTX), computeContextHash(CTX));
  assert.equal(computeContextHash(CTX), computeContextHash({ ...CTX, lat: 3.14781 })); // same 3dp grid
  assert.notEqual(computeContextHash(CTX), computeContextHash({ ...CTX, mood: "moodPedas" }));
  assert.notEqual(computeContextHash(CTX), computeContextHash({ ...CTX, uid: "u2" }));
});

// reject memory expiry
test("active reject-memory excludes only unexpired + includes canonical", () => {
  const now = 1_000_000;
  const recs = [
    { placeId: "a", rejectedAt: now - 1000, expiresAt: now + 1000, canonicalPlaceId: "PLC-a" },
    { placeId: "b", rejectedAt: now - REJECT_MEMORY_TTL_MS, expiresAt: now - 1 }, // expired
  ];
  const ids = activeRejectMemoryIds(recs, now);
  assert.ok(ids.includes("a") && ids.includes("PLC-a"));
  assert.ok(!ids.includes("b"));
});

// buildExcludeIds
test("buildExcludeIds merges shown+rejected+memory (+alias equivalence)", () => {
  const ex = buildExcludeIds({
    sessionShown: ["s1"], sessionRejected: ["r1"], rejectMemoryIds: ["m1"],
    aliasToCanonical: { s1: "PLC-1", other: "PLC-2" },
  });
  assert.ok(["s1", "r1", "m1", "PLC-1"].every((id) => ex.includes(id)));
  assert.ok(!ex.includes("PLC-2")); // "other" not excluded → its canonical not added
});

// rotation: stable per seed, rotates across seeds, big gaps preserved
test("rotation stable for same seed, rotates near-equal for different seed", () => {
  const near = [place({ placeId: "a", matchScore: 90 }), place({ placeId: "b", matchScore: 89 }), place({ placeId: "c", matchScore: 88 })];
  const s1a = sessionSeededRotation(near, 1).map((p) => p.placeId);
  const s1b = sessionSeededRotation(near, 1).map((p) => p.placeId);
  const s2 = sessionSeededRotation(near, 2).map((p) => p.placeId);
  assert.deepEqual(s1a, s1b);
  assert.notDeepEqual(s1a, s2); // different seed rotates the near-equal group
});
test("rotation NEVER moves a materially-lower score ahead of a higher band", () => {
  const list = [place({ placeId: "top", matchScore: 95 }), place({ placeId: "low", matchScore: 60 })];
  for (const seed of [0, 1, 2, 7, 13]) {
    assert.equal(sessionSeededRotation(list, seed)[0].placeId, "top");
  }
});

// diversity
test("cuisine diversity caps same cuisine at 2 in first 12 (pool > window)", () => {
  const thai = Array.from({ length: 6 }, (_, i) => place({ placeId: `t${i}`, cuisine: "thai", matchScore: 95 - i }));
  // 15 distinct-cuisine others so the window fills without needing >2 thai.
  const others = Array.from({ length: 15 }, (_, i) => place({ placeId: `o${i}`, cuisine: `cuisine_${i}`, matchScore: 80 - i }));
  const out = applyCuisineDiversity([...thai, ...others], { cuisineCap: 2, window: 12 });
  const first12 = out.slice(0, 12);
  assert.equal(first12.filter((p) => p.cuisine === "thai").length, 2);
  // overflow thai still present later (not dropped)
  assert.equal(out.filter((p) => p.cuisine === "thai").length, 6);
});
test("cuisine diversity relaxes for small pool (overflow reappears within window)", () => {
  const thai = Array.from({ length: 6 }, (_, i) => place({ placeId: `t${i}`, cuisine: "thai", matchScore: 90 - i }));
  const out = applyCuisineDiversity(thai, { cuisineCap: 2, window: 12 });
  assert.equal(out.length, 6); // nothing dropped; small pool → all shown
});

// alternative reuse
test("pickNextAlternative skips excluded ids", () => {
  const r = pickNextAlternative(["a", "b", "c"], ["a"]);
  assert.equal(r.nextId, "b");
  assert.deepEqual(r.remaining, ["b", "c"]);
});
test("pickNextAlternative returns null when all excluded", () => {
  assert.equal(pickNextAlternative(["a"], ["a"]).nextId, null);
});

// provider query planning
test("planProviderQueries=0 when cache already sufficient", () => {
  assert.equal(planProviderQueries(40, 40), 0);
  assert.equal(planProviderQueries(50, 40), 0);
});
test("planProviderQueries capped at 3", () => {
  assert.equal(planProviderQueries(0, 200), MAX_COLD_PROVIDER_QUERIES);
  assert.ok(planProviderQueries(0, 40) >= 1 && planProviderQueries(0, 40) <= 3);
});

// dedupe
test("mergeDedupe collapses by placeId across batches", () => {
  const b1 = [place({ placeId: "x" }), place({ placeId: "y" })];
  const b2 = [place({ placeId: "y" }), place({ placeId: "z" })];
  assert.equal(mergeDedupe([b1, b2]).length, 3);
});

// pagination
test("paginate page1/page2 no duplicates + end state", () => {
  const pool = Array.from({ length: 20 }, (_, i) => place({ placeId: `p${i}` }));
  const p1 = paginateRanked(pool, 0, 12);
  const p2 = paginateRanked(pool, p1.nextCursor!, 12);
  assert.equal(p1.pageItems.length, 12);
  assert.equal(p2.pageItems.length, 8);
  assert.equal(p2.endOfResults, true);
  const ids = new Set([...p1.pageItems, ...p2.pageItems].map((p) => p.placeId));
  assert.equal(ids.size, 20); // no duplicates across pages
});
test("paginate small pool ends immediately", () => {
  const pool = [place({ placeId: "only" })];
  const p1 = paginateRanked(pool, 0, 12);
  assert.equal(p1.endOfResults, true);
  assert.equal(p1.nextCursor, null);
});

// seed
test("seedFromString deterministic + differs per session", () => {
  assert.equal(seedFromString("sess-A"), seedFromString("sess-A"));
  assert.notEqual(seedFromString("sess-A"), seedFromString("sess-B"));
});
