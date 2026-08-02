"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
// 19 & 20. Certified + possible_non_halal → exclusion conflict, blocks publication.
(0, node_test_1.default)("halal certified + possible_non_halal conflict blocks publication", () => {
    const r = (0, index_1.detectTagConflicts)([(0, fixtures_1.ev)("halal_evidence", "certified"), (0, fixtures_1.ev)("halal_evidence", "possible_non_halal")], fixtures_1.REG);
    strict_1.default.ok(r.conflicts.length > 0);
    strict_1.default.equal(r.resolutionRequired, true);
    strict_1.default.equal(r.safeForPublication, false);
    strict_1.default.ok(r.conflicts.some((c) => c.code === "exclusion_conflict" || c.code === "single_value_family_conflict"));
});
// 21. Budget + luxury conflict.
(0, node_test_1.default)("price budget + luxury conflict", () => {
    const r = (0, index_1.detectTagConflicts)([(0, fixtures_1.ev)("price", "budget"), (0, fixtures_1.ev)("price", "luxury")], fixtures_1.REG);
    strict_1.default.ok(r.conflicts.some((c) => c.code === "single_value_family_conflict"));
    strict_1.default.equal(r.safeForPublication, false);
});
(0, node_test_1.default)("spice non_spicy + extreme conflict", () => {
    const r = (0, index_1.detectTagConflicts)([(0, fixtures_1.ev)("spice", "non_spicy"), (0, fixtures_1.ev)("spice", "extreme")], fixtures_1.REG);
    strict_1.default.ok(r.conflicts.length > 0);
});
// 22. Multiple cuisine tags are allowed.
(0, node_test_1.default)("multiple cuisine tags are allowed", () => {
    const r = (0, index_1.detectTagConflicts)([(0, fixtures_1.ev)("cuisine", "malay"), (0, fixtures_1.ev)("cuisine", "chinese")], fixtures_1.REG);
    strict_1.default.equal(r.conflicts.length, 0);
    strict_1.default.equal(r.safeForPublication, true);
});
// 23. Multiple meal-slot tags are allowed.
(0, node_test_1.default)("multiple meal-slot tags are allowed", () => {
    const r = (0, index_1.detectTagConflicts)([(0, fixtures_1.ev)("meal_slot", "breakfast"), (0, fixtures_1.ev)("meal_slot", "lunch")], fixtures_1.REG);
    strict_1.default.equal(r.conflicts.length, 0);
});
// Deprecated + replacement present → warning (not silent).
(0, node_test_1.default)("deprecated + replacement present warns", () => {
    const r = (0, index_1.detectTagConflicts)([(0, fixtures_1.ev)("cuisine", "western_food"), (0, fixtures_1.ev)("cuisine", "western")], fixtures_1.REG);
    strict_1.default.ok(r.warnings.some((w) => w.code === "deprecated_and_replacement_present"));
});
