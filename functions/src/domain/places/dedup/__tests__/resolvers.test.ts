import test from "node:test";
import assert from "node:assert/strict";

import { resolveFieldEvidence, resolveCanonicalPlaceId } from "../index";
import { FieldEvidence } from "../../placeProvenance";

// 23. Field resolver chooses stronger evidence.
test("field resolver chooses stronger evidence", () => {
  const candidates: FieldEvidence<string>[] = [
    { value: "reported-high-conf", sourceType: "community", evidenceLevel: "reported", confidence: 0.99 },
    { value: "verified-low-conf", sourceType: "merchant", evidenceLevel: "verified", confidence: 0.4 },
  ];
  const r = resolveFieldEvidence(candidates);
  assert.equal(r.selectedValue, "verified-low-conf"); // pangkat evidence menang
  assert.equal(r.rejected.length, 1);
});

// 24. Field resolver does NOT use last-write-wins.
test("field resolver does not use last-write-wins", () => {
  const candidates: FieldEvidence<string>[] = [
    { value: "strong", sourceType: "provider", evidenceLevel: "verified", confidence: 0.9, fetchedAt: 1_000 },
    { value: "weak-newest", sourceType: "community", evidenceLevel: "inferred", confidence: 0.9, fetchedAt: 9_999_999_999 },
  ];
  const r = resolveFieldEvidence(candidates);
  assert.equal(r.selectedValue, "strong"); // bukan yang terakhir/terbaru ditulis
});

test("field resolver empty → no candidates", () => {
  const r = resolveFieldEvidence<string>([]);
  assert.equal(r.selectedValue, undefined);
  assert.equal(r.reason, "no_candidates");
});

// 25. Alias one-hop resolution.
test("alias one-hop resolution", () => {
  const map = new Map([["g1", "c1"]]);
  const r = resolveCanonicalPlaceId("g1", map);
  assert.equal(r.status, "resolved");
  assert.equal(r.canonicalPlaceId, "c1");
  assert.equal(r.hops, 1);
});

// 26. Alias multi-hop resolution.
test("alias multi-hop resolution", () => {
  const map = new Map([["old", "mid"], ["mid", "c1"]]);
  const r = resolveCanonicalPlaceId("old", map);
  assert.equal(r.status, "resolved");
  assert.equal(r.canonicalPlaceId, "c1");
  assert.equal(r.hops, 2);
});

// 27. Circular alias fails safely.
test("circular alias fails safely", () => {
  const map = new Map([["a", "b"], ["b", "a"]]);
  const r = resolveCanonicalPlaceId("a", map);
  assert.equal(r.status, "circular");
});

// 28. Unknown alias returns explicit not_found.
test("unknown alias returns not_found", () => {
  const r = resolveCanonicalPlaceId("zzz", new Map([["g1", "c1"]]));
  assert.equal(r.status, "not_found");
});

// Merged legacy Google place id + canonical self.
test("merged legacy Google id resolves; canonical returns itself", () => {
  const map = new Map([["ChIJ_legacy", "mm_place_1"]]);
  assert.equal(resolveCanonicalPlaceId("ChIJ_legacy", map).canonicalPlaceId, "mm_place_1");
  const self = resolveCanonicalPlaceId("mm_place_1", map);
  assert.equal(self.status, "resolved");
  assert.equal(self.canonicalPlaceId, "mm_place_1");
});
