"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
// Seed registry itself is valid (no dup tagId, no cycle).
(0, node_test_1.default)("seed registry is structurally valid", () => {
    const r = (0, index_1.validateTagDefinitions)(index_1.SEED_TAG_DEFINITIONS);
    strict_1.default.equal(r.ok, true, JSON.stringify(r.issues.slice(0, 5)));
});
// 1. Valid tag definition passes.
(0, node_test_1.default)("valid tag definition passes", () => {
    strict_1.default.equal((0, index_1.validateTagDefinition)(fixtures_1.REG.byId.get("restaurant")).ok, true);
});
// 2. Invalid family fails.
(0, node_test_1.default)("invalid family fails", () => {
    const bad = { ...fixtures_1.REG.byId.get("restaurant"), familyId: "nope" };
    strict_1.default.equal((0, index_1.validateTagDefinition)(bad).ok, false);
});
// 3. Invalid tag ID format fails.
(0, node_test_1.default)("invalid tag id format fails", () => {
    const bad = { ...fixtures_1.REG.byId.get("restaurant"), tagId: "Nasi Lemak" };
    const r = (0, index_1.validateTagDefinition)(bad);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "invalid_tag_id_format"));
});
// 4. Duplicate tag ID fails.
(0, node_test_1.default)("duplicate tag id fails", () => {
    const d = fixtures_1.REG.byId.get("restaurant");
    const r = (0, index_1.validateTagDefinitions)([d, { ...d }]);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "duplicate_tag_id"));
});
// 5. Tag with wrong family fails.
(0, node_test_1.default)("tag with wrong family fails", () => {
    // "restaurant" milik place_type — guna dalam dish → mismatch.
    const r = (0, index_1.validateTagEvidence)((0, fixtures_1.ev)("dish", "restaurant"), fixtures_1.REG);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "tag_family_mismatch"));
});
// 16. Alias resolves to canonical tag.
(0, node_test_1.default)("alias resolves to canonical tag", () => {
    strict_1.default.equal((0, index_1.resolveTagId)(fixtures_1.REG, "malaysian"), "malay");
    strict_1.default.equal((0, index_1.resolveTagId)(fixtures_1.REG, "ayam_gepuk"), "ayam_geprek");
});
// 17. Deprecated tag resolves to replacement.
(0, node_test_1.default)("deprecated tag resolves to replacement", () => {
    strict_1.default.equal((0, index_1.resolveTagId)(fixtures_1.REG, "western_food"), "western");
});
(0, node_test_1.default)("unknown tag resolves to undefined", () => {
    strict_1.default.equal((0, index_1.resolveTagId)(fixtures_1.REG, "zzz_unknown"), undefined);
});
// 18. Parent-child cycle fails.
(0, node_test_1.default)("hierarchy cycle fails", () => {
    const base = fixtures_1.REG.byId.get("arab");
    const a = { ...base, tagId: "cyc_a", parentTagId: "cyc_b", childTagIds: undefined };
    const b = { ...base, tagId: "cyc_b", parentTagId: "cyc_a", childTagIds: undefined };
    const r = (0, index_1.validateTagDefinitions)([a, b]);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "hierarchy_cycle"));
});
// 30. Localized label as tag ID is rejected.
(0, node_test_1.default)("localized label as tag id is rejected", () => {
    strict_1.default.equal((0, index_1.isLikelyLocalizedTagId)("Nasi Lemak").localized, true);
    strict_1.default.equal((0, index_1.isLikelyLocalizedTagId)("泰国").localized, true);
    const r = (0, index_1.validateTagEvidence)((0, fixtures_1.ev)("cuisine", "Nasi Lemak"), fixtures_1.REG);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "localized_or_invalid_tag_id"));
});
// 31. Canonical snake_case ID is accepted.
(0, node_test_1.default)("canonical snake_case id is accepted", () => {
    strict_1.default.equal((0, index_1.isLikelyLocalizedTagId)("nasi_lemak").localized, false);
    strict_1.default.equal((0, index_1.isLikelyLocalizedTagId)("ayam_geprek").localized, false);
    strict_1.default.equal((0, index_1.validateTagEvidence)((0, fixtures_1.ev)("dish", "nasi_lemak"), fixtures_1.REG).ok, true);
});
