"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
// 20. Formula completeness memulangkan skor deterministik dijangka.
(0, node_test_1.default)("completeness formula returns expected deterministic score", () => {
    // Semua komponen 1.0 -> overall = jumlah pemberat = 1.0
    // (safetyEvidence DIKECUALIKAN dari formula).
    const full = (0, index_1.calculatePlaceCompleteness)({
        identityCompleteness: 1,
        locationCompleteness: 1,
        displayCompleteness: 1,
        commercialCompleteness: 1,
        hoursCompleteness: 1,
        qualityCompleteness: 1,
        tagCompleteness: 1,
        provenanceCompleteness: 1,
        safetyEvidenceCompleteness: 0, // sengaja 0 — tidak menjejaskan overall
    });
    strict_1.default.equal(full.overallScore, 1);
    // Nilai bercampur — dikira tangan mengikut pemberat rasmi.
    // 0.2*1 + 0.2*0.5 + 0.15*0 + 0.1*1 + 0.1*0 + 0.1*1 + 0.1*0 + 0.05*1
    // = 0.2 + 0.1 + 0 + 0.1 + 0 + 0.1 + 0 + 0.05 = 0.55
    const mixed = (0, index_1.calculatePlaceCompleteness)({
        identityCompleteness: 1,
        locationCompleteness: 0.5,
        displayCompleteness: 0,
        commercialCompleteness: 1,
        hoursCompleteness: 0,
        qualityCompleteness: 1,
        tagCompleteness: 0,
        provenanceCompleteness: 1,
        safetyEvidenceCompleteness: 1,
    });
    strict_1.default.equal(mixed.overallScore, 0.55);
});
// Tambahan: komponen luar julat melempar RangeError (helper defensif).
(0, node_test_1.default)("completeness helper throws on out-of-range component", () => {
    strict_1.default.throws(() => (0, index_1.calculatePlaceCompleteness)({
        identityCompleteness: 1.5,
        locationCompleteness: 1,
        displayCompleteness: 1,
        commercialCompleteness: 1,
        hoursCompleteness: 1,
        qualityCompleteness: 1,
        tagCompleteness: 1,
        provenanceCompleteness: 1,
        safetyEvidenceCompleteness: 1,
    }), RangeError);
});
