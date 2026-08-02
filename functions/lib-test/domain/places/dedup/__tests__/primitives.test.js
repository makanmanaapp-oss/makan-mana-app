"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
// 10. Geo helper same coordinates.
(0, node_test_1.default)("geo same coordinates → very strong", () => {
    const r = (0, index_1.geoProximity)({ lat: 3.15, lng: 101.7 }, { lat: 3.15, lng: 101.7 });
    strict_1.default.equal(r.valid, true);
    strict_1.default.equal(r.distanceMeters, 0);
    strict_1.default.equal(r.geoSimilarity, 1.0);
});
// 11. Geo helper close coordinates (~7 m).
(0, node_test_1.default)("geo close coordinates → very strong", () => {
    const r = (0, index_1.geoProximity)({ lat: 3.15, lng: 101.7 }, { lat: 3.15005, lng: 101.70005 });
    strict_1.default.ok(r.distanceMeters < 15);
    strict_1.default.equal(r.geoSimilarity, 1.0);
});
// 12. Geo helper moderate + far distance.
(0, node_test_1.default)("geo moderate and far distance", () => {
    const moderate = (0, index_1.geoProximity)({ lat: 3.15, lng: 101.7 }, { lat: 3.1509, lng: 101.7 });
    strict_1.default.ok(moderate.distanceMeters > 50 && moderate.distanceMeters <= 150);
    strict_1.default.equal(moderate.geoSimilarity, 0.5);
    const far = (0, index_1.geoProximity)({ lat: 3.1, lng: 101.6 }, { lat: 3.2, lng: 101.7 });
    strict_1.default.ok(far.distanceMeters > 150);
    strict_1.default.equal(far.geoSimilarity, 0.15);
});
(0, node_test_1.default)("geo invalid coordinates → not valid", () => {
    const r = (0, index_1.geoProximity)({ lat: undefined, lng: 101.7 }, { lat: 3.15, lng: 101.7 });
    strict_1.default.equal(r.valid, false);
    strict_1.default.equal(r.geoSimilarity, 0);
});
// 13. Name normalization deterministic + preserves branch text.
(0, node_test_1.default)("name normalization deterministic and branch-preserving", () => {
    strict_1.default.equal((0, index_1.normalizeName)("Restoran Ali (Shah Alam)!"), (0, index_1.normalizeName)("Restoran Ali (Shah Alam)!"));
    strict_1.default.equal((0, index_1.normalizeName)("Restoran Ali (Shah Alam)!"), "restoran ali shah alam");
    // Enam contoh mesti kekal berbeza.
    const names = [
        "Restoran Ali Shah Alam",
        "Restoran Ali Bangi",
        "Restoran Ali Cawangan 2",
        "Restoran Ali Express",
        "Ali Cafe",
        "Ali Restaurant",
    ].map(index_1.normalizeName);
    const unique = new Set(names);
    strict_1.default.equal(unique.size, names.length);
    // Nombor cawangan bermakna kekal.
    strict_1.default.match((0, index_1.normalizeName)("Restoran Ali Cawangan 2"), /cawangan 2/);
});
// 14. Name similarity deterministic + branch names distinguishable.
(0, node_test_1.default)("name similarity deterministic and distinguishes branches", () => {
    const a = (0, index_1.normalizeName)("Restoran Ali Shah Alam");
    const b = (0, index_1.normalizeName)("Restoran Ali Bangi");
    strict_1.default.equal((0, index_1.nameSimilarity)(a, b), (0, index_1.nameSimilarity)(a, b)); // deterministik
    strict_1.default.ok((0, index_1.nameSimilarity)(a, b) < 1);
    strict_1.default.equal((0, index_1.nameSimilarity)(a, a), 1);
});
(0, node_test_1.default)("buildIdentity normalizes phone to national digits", () => {
    const idA = (0, index_1.buildIdentity)({ displayName: "X", phones: ["03-1111 2222"] });
    const idB = (0, index_1.buildIdentity)({ displayName: "X", phones: ["0311112222"] });
    strict_1.default.deepEqual(idA.phoneDigits, idB.phoneDigits);
    strict_1.default.deepEqual(idA.phoneDigits, ["311112222"]);
});
