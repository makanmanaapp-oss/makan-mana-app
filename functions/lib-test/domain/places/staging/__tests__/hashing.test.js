"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
// 3 & 22. Source/raw payload hash is deterministic (same payload → same hash).
(0, node_test_1.default)("raw payload hash is deterministic", () => {
    const a = (0, index_1.hashRawPayload)(fixtures_1.rawProviderPayload);
    const b = (0, index_1.hashRawPayload)(fixtures_1.rawProviderPayload);
    strict_1.default.equal(a, b);
    strict_1.default.match(a, /^[0-9a-f]{64}$/);
});
(0, node_test_1.default)("different payloads produce different hashes", () => {
    const a = (0, index_1.hashRawPayload)({ x: 1 });
    const b = (0, index_1.hashRawPayload)({ x: 2 });
    strict_1.default.notEqual(a, b);
});
// 23. Equivalent normalized payload hashes match despite key order differences.
(0, node_test_1.default)("equivalent normalized payload hashes match", () => {
    const norm = new index_1.GenericProviderNormalizer();
    const one = norm.normalize({
        snapshot: fixtures_1.validProviderSnapshot,
        raw: fixtures_1.rawProviderPayload,
        now: fixtures_1.T,
        candidateId: "cand_x",
    });
    const two = norm.normalize({
        snapshot: fixtures_1.validProviderSnapshot,
        raw: fixtures_1.rawProviderPayloadReordered,
        now: fixtures_1.T + 5000, // masa berbeza — hash mengecualikan created/updated
        candidateId: "cand_x",
    });
    strict_1.default.equal(one.candidateHash, two.candidateHash);
    strict_1.default.equal(one.errors.length, 0);
});
// Normalisasi mengekalkan "unknown" & tidak mereka fakta.
(0, node_test_1.default)("normalizer keeps unknown values explicit and invents nothing", () => {
    const norm = new index_1.GenericProviderNormalizer();
    const out = norm.normalize({
        snapshot: fixtures_1.validProviderSnapshot,
        raw: { name: "Kedai Kosong" }, // tiada harga/waktu/rating/koordinat
        now: fixtures_1.T,
        candidateId: "cand_empty",
    });
    strict_1.default.equal(out.candidate.proposedCommercial.priceState, "unknown");
    strict_1.default.equal(out.candidate.proposedHours.hoursState, "unknown");
    strict_1.default.equal(out.candidate.proposedQuality.rating, undefined);
    strict_1.default.equal(out.candidate.proposedLocation.lat, undefined);
    strict_1.default.equal(out.candidate.proposedSafetyEvidence.halal.state, "unknown");
});
