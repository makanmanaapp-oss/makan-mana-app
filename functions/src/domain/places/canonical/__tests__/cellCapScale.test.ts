/**
 * SCALE — a Firestore document-size cap must never become a statement about
 * how many restaurants MakanMana can have.
 *
 * `persistDiscovered` writes a cell with
 * `orderCanonicalFirst(dedupe(cands)).slice(0, MAX_CANDIDATES_PER_CELL)` and a
 * `set`, so anything sliced off is not merely hidden — it is written out of
 * that cell. Before the ordering guard, a published registry restaurant that
 * happened to land past the cap disappeared from discovery entirely.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  dedupeCanonicalCandidates,
  orderCanonicalFirst,
} from "../canonicalCandidatePool";
import {PlaceCandidate} from "../../../../types/place";

const MAX_CANDIDATES_PER_CELL = 400;

function provider(i: number): PlaceCandidate {
  return {
    placeId: `ChIJprovider${i}`,
    name: `Provider Restaurant ${i}`,
    lat: 3.1 + i * 0.00001,
    lng: 101.6 + i * 0.00001,
  } as PlaceCandidate;
}

function canonical(id: string, name: string): PlaceCandidate {
  return {
    placeId: id,
    canonicalPlaceId: id,
    dataSource: "canonical",
    name,
    lat: 3.23890,
    lng: 101.42793,
  } as PlaceCandidate;
}

test("1. a registry restaurant arriving last still survives a full cell", () => {
  // 500 provider candidates discovered first, the curated restaurant last —
  // the worst case, and the realistic one for a newly published place.
  const cands = [
    ...Array.from({length: 500}, (_, i) => provider(i)),
    canonical("PLC-testkitchen", "MakanMana Test Kitchen Puncak Alam"),
  ];

  const naive = dedupeCanonicalCandidates(cands).slice(0, MAX_CANDIDATES_PER_CELL);
  assert.equal(
    naive.some((c) => c.placeId === "PLC-testkitchen"), false,
    "precondition: insertion order alone loses the registry restaurant",
  );

  const guarded = orderCanonicalFirst(dedupeCanonicalCandidates(cands))
    .slice(0, MAX_CANDIDATES_PER_CELL);
  assert.equal(
    guarded.some((c) => c.placeId === "PLC-testkitchen"), true,
    "the authoritative registry restaurant must never be the one dropped",
  );
});

test("2. every canonical restaurant survives, not just the first", () => {
  const canonicals = Array.from({length: 25}, (_, i) =>
    canonical(`PLC-${i}`, `Curated ${i}`));
  const cands = [
    ...Array.from({length: 900}, (_, i) => provider(i)),
    ...canonicals,
  ];
  const kept = orderCanonicalFirst(dedupeCanonicalCandidates(cands))
    .slice(0, MAX_CANDIDATES_PER_CELL);
  for (const c of canonicals) {
    assert.ok(kept.some((k) => k.placeId === c.placeId), `${c.placeId} dropped`);
  }
});

test("3. provider ordering is preserved — this is a partition, not a sort", () => {
  // Dedupe order carries ranking meaning for provider candidates; a comparator
  // would scramble it. Only the canonical/provider split may change.
  const cands = [provider(1), canonical("PLC-a", "A"), provider(2), provider(3)];
  const out = orderCanonicalFirst(cands);
  assert.equal(out[0].placeId, "PLC-a");
  assert.deepEqual(
    out.slice(1).map((c) => c.placeId),
    ["ChIJprovider1", "ChIJprovider2", "ChIJprovider3"],
  );
});

test("4. the guard does not inflate or drop anything below the cap", () => {
  const cands = [
    ...Array.from({length: 40}, (_, i) => provider(i)),
    canonical("PLC-x", "X"),
  ];
  const deduped = dedupeCanonicalCandidates(cands);
  const out = orderCanonicalFirst(deduped);
  assert.equal(out.length, deduped.length, "no candidate invented or lost");
  assert.deepEqual(
    new Set(out.map((c) => c.placeId)),
    new Set(deduped.map((c) => c.placeId)),
  );
});

test("5. a dense area beyond the cap still keeps the cell writable", () => {
  // 401 in one logical area is the case the owner called out explicitly.
  const cands = [
    canonical("PLC-keep", "Kept"),
    ...Array.from({length: 400}, (_, i) => provider(i)),
  ];
  const kept = orderCanonicalFirst(dedupeCanonicalCandidates(cands))
    .slice(0, MAX_CANDIDATES_PER_CELL);
  assert.equal(kept.length, MAX_CANDIDATES_PER_CELL);
  assert.equal(kept[0].placeId, "PLC-keep");
  // Restaurant #401 is still *capped* here — the cap itself is removed by the
  // sharded schema in AREA_CACHE_SCALABILITY_DESIGN.md. What this guarantees
  // is only that the one dropped is never an authoritative registry record.
});
