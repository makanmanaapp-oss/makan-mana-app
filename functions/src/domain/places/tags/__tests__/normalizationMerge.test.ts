import test from "node:test";
import assert from "node:assert/strict";

import { normalizeCanonicalTagSet, mergeCanonicalTagSets } from "../index";
import { REG, T, ev } from "./fixtures";

// 24. Duplicate evidence keeps strongest valid evidence.
test("normalization keeps strongest duplicate evidence", () => {
  const r = normalizeCanonicalTagSet(
    [
      ev("cuisine", "malay", { evidenceLevel: "reported", confidence: 0.6 }),
      ev("cuisine", "malay", { evidenceLevel: "verified", confidence: 0.9 }),
    ],
    REG,
  );
  const malay = r.normalizedTagSet.filter((t) => t.tagId === "malay");
  assert.equal(malay.length, 1);
  assert.equal(malay[0].evidenceLevel, "verified");
  assert.equal(r.duplicateResolutions[0].droppedCount, 1);
});

// 28 & 29. Normalization + ordering deterministic.
test("normalization is deterministic and ordered", () => {
  const input = [ev("price", "budget"), ev("cuisine", "malay"), ev("place_type", "restaurant")];
  const a = normalizeCanonicalTagSet(input, REG).normalizedTagSet.map((t) => `${t.familyId}:${t.tagId}`);
  const b = normalizeCanonicalTagSet(input, REG).normalizedTagSet.map((t) => `${t.familyId}:${t.tagId}`);
  assert.deepEqual(a, b);
  // Diisih ikut keluarga kemudian tag.
  assert.deepEqual(a, [...a].sort());
});

// Golden J. Deprecated cuisine id → alias to canonical replacement.
test("normalization resolves deprecated alias", () => {
  const r = normalizeCanonicalTagSet([ev("cuisine", "western_food")], REG);
  assert.ok(r.aliasResolutions.some((a) => a.from === "western_food" && a.to === "western"));
  assert.ok(r.normalizedTagSet.some((t) => t.tagId === "western"));
});

test("normalization drops unknown tag with warning", () => {
  const r = normalizeCanonicalTagSet([ev("cuisine", "zzz_unknown")], REG);
  assert.equal(r.normalizedTagSet.length, 0);
  assert.ok(r.warnings.some((w) => w.startsWith("unknown_tag_dropped")));
});

// 25 & Golden I. Merge preserves provenance.
test("merge preserves provenance", () => {
  const r = mergeCanonicalTagSets(
    [[ev("cuisine", "malay", { sourceType: "provider" })], [ev("cuisine", "malay", { sourceType: "merchant" })]],
    REG,
  );
  assert.equal(r.provenancePreserved.length, 2);
  assert.equal(r.selectedTags.filter((t) => t.tagId === "malay").length, 1);
});

// 26. Merge is not last-write-wins.
test("merge is not last-write-wins", () => {
  const r = mergeCanonicalTagSets(
    [
      [ev("cuisine", "malay", { evidenceLevel: "verified", confidence: 0.9, verifiedAt: 1000 })],
      [ev("cuisine", "malay", { evidenceLevel: "inferred", confidence: 0.9, fetchedAt: 9_999_999_999 })],
    ],
    REG,
  );
  const malay = r.selectedTags.find((t) => t.tagId === "malay")!;
  assert.equal(malay.evidenceLevel, "verified"); // bukti kuat, bukan yang terakhir
});

// 27. Safety conflict requires review.
test("safety conflict across sets requires review", () => {
  const r = mergeCanonicalTagSets(
    [
      [ev("halal_evidence", "certified", { evidenceLevel: "verified", approvedBy: "admin", verifiedAt: T })],
      [ev("halal_evidence", "community_reported", { sourceType: "community" })],
    ],
    REG,
  );
  assert.ok(r.conflicts.some((c) => c.familyId === "halal_evidence"));
  assert.ok(r.warnings.some((w) => w.startsWith("safety_conflict_requires_review")));
});
