"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
// 24. Duplicate evidence keeps strongest valid evidence.
(0, node_test_1.default)("normalization keeps strongest duplicate evidence", () => {
    const r = (0, index_1.normalizeCanonicalTagSet)([
        (0, fixtures_1.ev)("cuisine", "malay", { evidenceLevel: "reported", confidence: 0.6 }),
        (0, fixtures_1.ev)("cuisine", "malay", { evidenceLevel: "verified", confidence: 0.9 }),
    ], fixtures_1.REG);
    const malay = r.normalizedTagSet.filter((t) => t.tagId === "malay");
    strict_1.default.equal(malay.length, 1);
    strict_1.default.equal(malay[0].evidenceLevel, "verified");
    strict_1.default.equal(r.duplicateResolutions[0].droppedCount, 1);
});
// 28 & 29. Normalization + ordering deterministic.
(0, node_test_1.default)("normalization is deterministic and ordered", () => {
    const input = [(0, fixtures_1.ev)("price", "budget"), (0, fixtures_1.ev)("cuisine", "malay"), (0, fixtures_1.ev)("place_type", "restaurant")];
    const a = (0, index_1.normalizeCanonicalTagSet)(input, fixtures_1.REG).normalizedTagSet.map((t) => `${t.familyId}:${t.tagId}`);
    const b = (0, index_1.normalizeCanonicalTagSet)(input, fixtures_1.REG).normalizedTagSet.map((t) => `${t.familyId}:${t.tagId}`);
    strict_1.default.deepEqual(a, b);
    // Diisih ikut keluarga kemudian tag.
    strict_1.default.deepEqual(a, [...a].sort());
});
// Golden J. Deprecated cuisine id → alias to canonical replacement.
(0, node_test_1.default)("normalization resolves deprecated alias", () => {
    const r = (0, index_1.normalizeCanonicalTagSet)([(0, fixtures_1.ev)("cuisine", "western_food")], fixtures_1.REG);
    strict_1.default.ok(r.aliasResolutions.some((a) => a.from === "western_food" && a.to === "western"));
    strict_1.default.ok(r.normalizedTagSet.some((t) => t.tagId === "western"));
});
(0, node_test_1.default)("normalization drops unknown tag with warning", () => {
    const r = (0, index_1.normalizeCanonicalTagSet)([(0, fixtures_1.ev)("cuisine", "zzz_unknown")], fixtures_1.REG);
    strict_1.default.equal(r.normalizedTagSet.length, 0);
    strict_1.default.ok(r.warnings.some((w) => w.startsWith("unknown_tag_dropped")));
});
// 25 & Golden I. Merge preserves provenance.
(0, node_test_1.default)("merge preserves provenance", () => {
    const r = (0, index_1.mergeCanonicalTagSets)([[(0, fixtures_1.ev)("cuisine", "malay", { sourceType: "provider" })], [(0, fixtures_1.ev)("cuisine", "malay", { sourceType: "merchant" })]], fixtures_1.REG);
    strict_1.default.equal(r.provenancePreserved.length, 2);
    strict_1.default.equal(r.selectedTags.filter((t) => t.tagId === "malay").length, 1);
});
// 26. Merge is not last-write-wins.
(0, node_test_1.default)("merge is not last-write-wins", () => {
    const r = (0, index_1.mergeCanonicalTagSets)([
        [(0, fixtures_1.ev)("cuisine", "malay", { evidenceLevel: "verified", confidence: 0.9, verifiedAt: 1000 })],
        [(0, fixtures_1.ev)("cuisine", "malay", { evidenceLevel: "inferred", confidence: 0.9, fetchedAt: 9_999_999_999 })],
    ], fixtures_1.REG);
    const malay = r.selectedTags.find((t) => t.tagId === "malay");
    strict_1.default.equal(malay.evidenceLevel, "verified"); // bukti kuat, bukan yang terakhir
});
// 27. Safety conflict requires review.
(0, node_test_1.default)("safety conflict across sets requires review", () => {
    const r = (0, index_1.mergeCanonicalTagSets)([
        [(0, fixtures_1.ev)("halal_evidence", "certified", { evidenceLevel: "verified", approvedBy: "admin", verifiedAt: fixtures_1.T })],
        [(0, fixtures_1.ev)("halal_evidence", "community_reported", { sourceType: "community" })],
    ], fixtures_1.REG);
    strict_1.default.ok(r.conflicts.some((c) => c.familyId === "halal_evidence"));
    strict_1.default.ok(r.warnings.some((w) => w.startsWith("safety_conflict_requires_review")));
});
