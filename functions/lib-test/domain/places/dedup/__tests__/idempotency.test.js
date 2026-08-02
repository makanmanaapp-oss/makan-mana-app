"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
// 29. Repeated same comparison is idempotent (same candidate identity).
(0, node_test_1.default)("repeated comparison is idempotent", () => {
    const one = (0, index_1.buildDuplicateCandidate)({
        stagingRecordId: "stg_a",
        comparedStagingRecordId: "stg_b",
        a: fixtures_1.B_google,
        b: fixtures_1.B_owner,
        now: fixtures_1.T,
    });
    const two = (0, index_1.buildDuplicateCandidate)({
        stagingRecordId: "stg_a",
        comparedStagingRecordId: "stg_b",
        a: fixtures_1.B_google,
        b: fixtures_1.B_owner,
        now: fixtures_1.T + 10_000,
    });
    strict_1.default.equal(one.duplicateCandidateId, two.duplicateCandidateId);
});
// 30. Reversed record order creates same pair identity.
(0, node_test_1.default)("reversed record order → same pair identity", () => {
    const forward = (0, index_1.buildDuplicateCandidate)({
        stagingRecordId: "stg_a",
        comparedStagingRecordId: "stg_b",
        a: fixtures_1.B_google,
        b: fixtures_1.B_owner,
        now: fixtures_1.T,
    });
    const reversed = (0, index_1.buildDuplicateCandidate)({
        stagingRecordId: "stg_b",
        comparedStagingRecordId: "stg_a",
        a: fixtures_1.B_owner,
        b: fixtures_1.B_google,
        now: fixtures_1.T,
    });
    strict_1.default.equal(forward.duplicateCandidateId, reversed.duplicateCandidateId);
});
// Part N: config version berbeza → ID berbeza.
(0, node_test_1.default)("different config version → different candidate id", () => {
    const base = (0, index_1.duplicateCandidateId)("stg_a", "stg_b", index_1.DEFAULT_DEDUP_CONFIG.algorithmVersion, "dedup_config_v1");
    const other = (0, index_1.duplicateCandidateId)("stg_a", "stg_b", index_1.DEFAULT_DEDUP_CONFIG.algorithmVersion, "dedup_config_v2");
    strict_1.default.notEqual(base, other);
});
// Part N: ID bergantung pada pasangan+algo+config sahaja (bukan metadata) →
// kemas kini metadata sumber tidak mengubah identiti calon.
(0, node_test_1.default)("candidate id stable across source metadata changes", () => {
    const id1 = (0, index_1.duplicateCandidateId)("stg_a", "stg_b", "dedup_v1", "dedup_config_v1");
    const id2 = (0, index_1.duplicateCandidateId)("stg_a", "stg_b", "dedup_v1", "dedup_config_v1");
    strict_1.default.equal(id1, id2);
});
