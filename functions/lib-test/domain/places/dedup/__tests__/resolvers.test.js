"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
// 23. Field resolver chooses stronger evidence.
(0, node_test_1.default)("field resolver chooses stronger evidence", () => {
    const candidates = [
        { value: "reported-high-conf", sourceType: "community", evidenceLevel: "reported", confidence: 0.99 },
        { value: "verified-low-conf", sourceType: "merchant", evidenceLevel: "verified", confidence: 0.4 },
    ];
    const r = (0, index_1.resolveFieldEvidence)(candidates);
    strict_1.default.equal(r.selectedValue, "verified-low-conf"); // pangkat evidence menang
    strict_1.default.equal(r.rejected.length, 1);
});
// 24. Field resolver does NOT use last-write-wins.
(0, node_test_1.default)("field resolver does not use last-write-wins", () => {
    const candidates = [
        { value: "strong", sourceType: "provider", evidenceLevel: "verified", confidence: 0.9, fetchedAt: 1_000 },
        { value: "weak-newest", sourceType: "community", evidenceLevel: "inferred", confidence: 0.9, fetchedAt: 9_999_999_999 },
    ];
    const r = (0, index_1.resolveFieldEvidence)(candidates);
    strict_1.default.equal(r.selectedValue, "strong"); // bukan yang terakhir/terbaru ditulis
});
(0, node_test_1.default)("field resolver empty → no candidates", () => {
    const r = (0, index_1.resolveFieldEvidence)([]);
    strict_1.default.equal(r.selectedValue, undefined);
    strict_1.default.equal(r.reason, "no_candidates");
});
// 25. Alias one-hop resolution.
(0, node_test_1.default)("alias one-hop resolution", () => {
    const map = new Map([["g1", "c1"]]);
    const r = (0, index_1.resolveCanonicalPlaceId)("g1", map);
    strict_1.default.equal(r.status, "resolved");
    strict_1.default.equal(r.canonicalPlaceId, "c1");
    strict_1.default.equal(r.hops, 1);
});
// 26. Alias multi-hop resolution.
(0, node_test_1.default)("alias multi-hop resolution", () => {
    const map = new Map([["old", "mid"], ["mid", "c1"]]);
    const r = (0, index_1.resolveCanonicalPlaceId)("old", map);
    strict_1.default.equal(r.status, "resolved");
    strict_1.default.equal(r.canonicalPlaceId, "c1");
    strict_1.default.equal(r.hops, 2);
});
// 27. Circular alias fails safely.
(0, node_test_1.default)("circular alias fails safely", () => {
    const map = new Map([["a", "b"], ["b", "a"]]);
    const r = (0, index_1.resolveCanonicalPlaceId)("a", map);
    strict_1.default.equal(r.status, "circular");
});
// 28. Unknown alias returns explicit not_found.
(0, node_test_1.default)("unknown alias returns not_found", () => {
    const r = (0, index_1.resolveCanonicalPlaceId)("zzz", new Map([["g1", "c1"]]));
    strict_1.default.equal(r.status, "not_found");
});
// Merged legacy Google place id + canonical self.
(0, node_test_1.default)("merged legacy Google id resolves; canonical returns itself", () => {
    const map = new Map([["ChIJ_legacy", "mm_place_1"]]);
    strict_1.default.equal((0, index_1.resolveCanonicalPlaceId)("ChIJ_legacy", map).canonicalPlaceId, "mm_place_1");
    const self = (0, index_1.resolveCanonicalPlaceId)("mm_place_1", map);
    strict_1.default.equal(self.status, "resolved");
    strict_1.default.equal(self.canonicalPlaceId, "mm_place_1");
});
