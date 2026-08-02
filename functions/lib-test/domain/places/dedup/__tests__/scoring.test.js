"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
// 15. Duplicate score clamped 0..1.
(0, node_test_1.default)("duplicate score is clamped to 0..1", () => {
    const high = (0, index_1.computeDuplicateScore)((0, index_1.computeSignals)(fixtures_1.A_google1, fixtures_1.A_google2));
    strict_1.default.ok(high.adjustedScore >= 0 && high.adjustedScore <= 1);
    const conflicted = (0, index_1.computeDuplicateScore)((0, index_1.computeSignals)(fixtures_1.AC_a, fixtures_1.AC_b));
    strict_1.default.ok(conflicted.adjustedScore >= 0 && conflicted.adjustedScore <= 1);
});
// 9. Conflicting addresses apply a penalty.
(0, node_test_1.default)("conflicting addresses apply penalty", () => {
    const res = (0, index_1.computeDuplicateScore)((0, index_1.computeSignals)(fixtures_1.AC_a, fixtures_1.AC_b));
    strict_1.default.ok(res.penalties.addressConflict > 0, "address conflict penalty");
    strict_1.default.ok(res.penalties.coordinateConflict > 0, "coordinate conflict penalty");
    strict_1.default.ok(res.penalties.total > 0);
});
// 16-19. Decision bands map scores correctly.
(0, node_test_1.default)("score bands map correctly", () => {
    strict_1.default.equal((0, index_1.scoreBand)(0.96), "exact"); // 16: >= 0.95 auto/exact band
    strict_1.default.equal((0, index_1.scoreBand)(0.85), "review"); // 17: 0.80-0.949
    strict_1.default.equal((0, index_1.scoreBand)(0.6), "possible"); // 18: 0.55-0.799
    strict_1.default.equal((0, index_1.scoreBand)(0.4), "separate"); // 19: < 0.55
    // Sempadan tepat.
    strict_1.default.equal((0, index_1.scoreBand)(0.95), "exact");
    strict_1.default.equal((0, index_1.scoreBand)(0.8), "review");
    strict_1.default.equal((0, index_1.scoreBand)(0.55), "possible");
    strict_1.default.equal((0, index_1.scoreBand)(0.549), "separate");
});
