/**
 * SCALABLE AREA CACHE — storage contract.
 *
 * These are the tests that the old architecture could not have passed: with one
 * capped array per cell, candidate #401 did not exist to be retrieved.
 *
 * Entirely synthetic. No Firestore, no emulator, no Google Places call.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  AREA_CACHE_SCHEMA_VERSION,
  CANDIDATE_READ_PAGE_SIZE,
  candidateDocId,
  chunkForBatch,
  keyedForWrite,
  mergeCellCandidates,
  nextCursor,
  startCursor,
} from "../areaCacheStorage";
import {PlaceCandidate} from "../../../../types/place";

function provider(i: number, over: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    placeId: `ChIJprovider${String(i).padStart(5, "0")}`,
    name: `Provider Restaurant ${i}`,
    lat: 3.1 + i * 0.0001,
    lng: 101.6 + i * 0.0001,
    ...over,
  } as PlaceCandidate;
}

function canonical(id: string, over: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    placeId: id,
    canonicalPlaceId: id,
    dataSource: "canonical",
    name: `Canonical ${id}`,
    lat: 3.2389,
    lng: 101.42793,
    ...over,
  } as PlaceCandidate;
}

// ── identity ───────────────────────────────────────────────────────────────

test("1. the document id IS the dedupe key — canonical wins, provider is the fallback", () => {
  assert.equal(candidateDocId(canonical("PLC-abc")), "PLC-abc");
  assert.equal(candidateDocId(provider(7)), "ChIJprovider00007");
  // A provider row that the server has since proven canonical keys by canonical.
  const overlaid = provider(7, {canonicalPlaceId: "PLC-abc"});
  assert.equal(candidateDocId(overlaid), "PLC-abc");
});

test("2. an identity-less candidate is skipped, never invented", () => {
  assert.equal(candidateDocId({placeId: "", name: "x"} as PlaceCandidate), null);
  assert.equal(candidateDocId({placeId: "   ", name: "x"} as PlaceCandidate), null);
});

test("3. ids that Firestore would reject are refused rather than written", () => {
  assert.equal(candidateDocId({placeId: ".", name: "x"} as PlaceCandidate), null);
  assert.equal(candidateDocId({placeId: "..", name: "x"} as PlaceCandidate), null);
  assert.equal(candidateDocId({placeId: "__proto__", name: "x"} as PlaceCandidate), null);
  // "/" would silently create a nested path, so it is neutralised.
  assert.equal(candidateDocId({placeId: "a/b", name: "x"} as PlaceCandidate), "a_b");
  assert.equal(candidateDocId({placeId: "x".repeat(1600), name: "x"} as PlaceCandidate), null);
});

// ── no silent loss at scale ────────────────────────────────────────────────

for (const size of [20, 100, 399, 400, 401, 1000]) {
  test(`4. a cell holding ${size} candidates keeps every one of them`, () => {
    const all = Array.from({length: size}, (_, i) => provider(i));
    const keyed = keyedForWrite(all);
    assert.equal(keyed.length, size, "every candidate must be writable");
    assert.equal(new Set(keyed.map((k) => k.id)).size, size, "ids stay unique");

    // Round-trip through the merge exactly as a read would.
    const readBack = mergeCellCandidates([], keyed.map((k) => k.candidate));
    assert.equal(readBack.length, size, `${size} stored -> ${size} retrievable`);
  });
}

test("5. candidate #401 specifically exists and is retrievable", () => {
  const all = Array.from({length: 401}, (_, i) => provider(i));
  const stored = keyedForWrite(all);
  const target = candidateDocId(provider(400));       // zero-based -> the 401st
  assert.ok(target);
  assert.ok(stored.some((s) => s.id === target), "#401 must be stored");
  const readBack = mergeCellCandidates([], stored.map((s) => s.candidate));
  assert.ok(readBack.some((c) => candidateDocId(c) === target),
    "#401 must survive the read path — this is the exact entry the old cap deleted");
});

test("6. candidate #1000 specifically exists and is retrievable", () => {
  const all = Array.from({length: 1000}, (_, i) => provider(i));
  const stored = keyedForWrite(all);
  const target = candidateDocId(provider(999));
  assert.ok(stored.some((s) => s.id === target), "#1000 must be stored");
  const readBack = mergeCellCandidates([], stored.map((s) => s.candidate));
  assert.ok(readBack.some((c) => candidateDocId(c) === target));
  assert.equal(readBack.length, 1000);
});

test("7. a canonical restaurant survives regardless of insertion order", () => {
  // The old failure: canonical arriving last, past the cap, written out of the
  // cell. Storage order is now irrelevant because there is no array to slice.
  const all = [...Array.from({length: 900}, (_, i) => provider(i)), canonical("PLC-last")];
  const readBack = mergeCellCandidates([], keyedForWrite(all).map((k) => k.candidate));
  assert.ok(readBack.some((c) => c.placeId === "PLC-last"));
  assert.equal(readBack.length, 901);
});

// ── batching ───────────────────────────────────────────────────────────────

test("8. writes chunk under the Firestore 500-op batch limit", () => {
  const chunks = chunkForBatch(Array.from({length: 1000}, (_, i) => i));
  assert.deepEqual(chunks.map((c) => c.length), [450, 450, 100]);
  assert.ok(chunks.every((c) => c.length <= 500));
  assert.equal(chunks.flat().length, 1000, "nothing dropped by chunking");
  assert.deepEqual(chunkForBatch([]), []);
});

// ── cursor contract ────────────────────────────────────────────────────────

test("9. the cursor anchors on the last document id and starts null", () => {
  assert.deepEqual(startCursor("w22rk"), {cellId: "w22rk", after: null});
  assert.deepEqual(nextCursor("w22rk", [{id: "a"}, {id: "b"}]),
    {cellId: "w22rk", after: "b"});
});

test("10. an empty page ends the traversal instead of looping forever", () => {
  assert.equal(nextCursor("w22rk", []), null);
});

test("11. paging by document id traverses 1000 candidates exactly once", () => {
  // Simulates Firestore __name__ ordering: lexicographic, total, no ties.
  const ids = keyedForWrite(Array.from({length: 1000}, (_, i) => provider(i)))
    .map((k) => k.id)
    .sort();
  const seen: string[] = [];
  let cursor = startCursor("cell");
  let guard = 0;
  for (;;) {
    if (guard++ > 50) throw new Error("pagination loop");
    const startAt = cursor.after === null
      ? 0
      : ids.findIndex((id) => id > cursor.after!);
    if (startAt < 0) break;
    const page = ids.slice(startAt, startAt + CANDIDATE_READ_PAGE_SIZE)
      .map((id) => ({id}));
    if (page.length === 0) break;
    seen.push(...page.map((p) => p.id));
    const next = nextCursor("cell", page);
    if (!next) break;
    cursor = next;
  }
  assert.equal(seen.length, 1000, "every candidate reached");
  assert.equal(new Set(seen).size, 1000, "none returned twice");
  assert.deepEqual(seen, ids, "stable order, nothing skipped");
});

test("12. a document inserted mid-traversal cannot duplicate an earlier page", () => {
  // Lexicographic __name__ ordering means a late insert either sorts before the
  // anchor (missed this pass, present next read) or after it (seen normally).
  // It can never re-emit something already returned.
  const ids = ["a", "c", "e", "g"];
  const firstPage = [{id: "a"}, {id: "c"}];
  const cursor = nextCursor("cell", firstPage)!;
  const withInsert = [...ids, "b"].sort();          // "b" lands before the anchor
  const rest = withInsert.filter((id) => id > cursor.after!);
  assert.deepEqual(rest, ["e", "g"]);
  assert.equal(rest.includes("a"), false);
  assert.equal(rest.includes("c"), false);
});

// ── migration: legacy array + subcollection ────────────────────────────────

test("13. a legacy-only cell still reads", () => {
  const legacy = Array.from({length: 30}, (_, i) => provider(i));
  assert.equal(mergeCellCandidates(legacy, []).length, 30);
});

test("14. a subcollection-only cell reads", () => {
  const scalable = Array.from({length: 30}, (_, i) => provider(i));
  assert.equal(mergeCellCandidates([], scalable).length, 30);
});

test("15. a mixed cell reads as one coherent pool", () => {
  const legacy = Array.from({length: 20}, (_, i) => provider(i));
  const scalable = Array.from({length: 20}, (_, i) => provider(i + 20));
  assert.equal(mergeCellCandidates(legacy, scalable).length, 40);
});

test("16. the same identity in BOTH generations returns once, subcollection wins", () => {
  const legacyCopy = provider(1, {name: "Stale Name"});
  const freshCopy = provider(1, {name: "Fresh Name"});
  const merged = mergeCellCandidates([legacyCopy], [freshCopy]);
  assert.equal(merged.length, 1, "must not double count across generations");
  assert.equal(merged[0].name, "Fresh Name",
    "the subcollection is where new writes land, so it is the fresher copy");
});

test("17. a provider alias in legacy collapses against its canonical in the subcollection", () => {
  // Same premises: identical normalized name, within 35 m, one side direct
  // canonical. The existing dedupe rule must still fire ACROSS generations.
  const legacyProvider = provider(1, {
    name: "Warung Scale Test", lat: 3.23890, lng: 101.42793,
  });
  const canonicalRow = canonical("PLC-scale", {
    name: "Warung Scale Test", lat: 3.23890, lng: 101.42793,
  });
  const merged = mergeCellCandidates([legacyProvider], [canonicalRow]);
  assert.equal(merged.length, 1, "one restaurant, not a canonical + provider pair");
  assert.equal(merged[0].placeId, "PLC-scale", "canonical identity wins");
});

test("18. an unrelated nearby restaurant is NOT collapsed — no new fuzzy matching", () => {
  const a = provider(1, {name: "Nasi Kandar Satu", lat: 3.2389, lng: 101.42793});
  const b = canonical("PLC-other", {
    name: "Nasi Kandar Dua", lat: 3.2389, lng: 101.42793,
  });
  assert.equal(mergeCellCandidates([a], [b]).length, 2);
});

test("19. schema version marks a migrated cell", () => {
  assert.equal(AREA_CACHE_SCHEMA_VERSION, 2);
});

// ── multi-cell ─────────────────────────────────────────────────────────────

test("20. 1000+ candidates spread across cells all survive, deduped once", () => {
  const cells = new Map<string, PlaceCandidate[]>();
  for (let i = 0; i < 1200; i++) {
    const cellId = `cell${i % 6}`;
    const arr = cells.get(cellId) ?? [];
    arr.push(provider(i));
    cells.set(cellId, arr);
  }
  const pool: PlaceCandidate[] = [];
  for (const [, cands] of cells) {
    pool.push(...mergeCellCandidates([], keyedForWrite(cands).map((k) => k.candidate)));
  }
  assert.equal(pool.length, 1200, "no cell silently dropped its overflow");
  const ids = pool.map((c) => candidateDocId(c));
  assert.equal(new Set(ids).size, 1200);
});

test("21. a restaurant reachable from two overlapping cells appears once", () => {
  // Radius queries enumerate several cells; a place near a boundary can be
  // stored in both. The union must still present one restaurant.
  const shared = canonical("PLC-boundary", {name: "Boundary Cafe"});
  const cellA = mergeCellCandidates([], [shared, provider(1)]);
  const cellB = mergeCellCandidates([], [shared, provider(2)]);
  const union = mergeCellCandidates([], [...cellA, ...cellB]);
  assert.equal(union.length, 3, "shared restaurant must not double up");
  assert.equal(union.filter((c) => c.placeId === "PLC-boundary").length, 1);
});
