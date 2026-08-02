"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
// 13. imported → normalizing passes.
(0, node_test_1.default)("valid imported to normalizing", () => {
    strict_1.default.equal((0, index_1.canTransitionStagingStatus)("imported", "normalizing"), true);
});
// 14. normalizing → needs_review passes.
(0, node_test_1.default)("valid normalizing to needs_review", () => {
    strict_1.default.equal((0, index_1.canTransitionStagingStatus)("normalizing", "needs_review"), true);
});
// 15. needs_review → approved passes.
(0, node_test_1.default)("valid needs_review to approved", () => {
    strict_1.default.equal((0, index_1.canTransitionStagingStatus)("needs_review", "approved"), true);
});
// 16. imported → published fails (published bukan status staging).
(0, node_test_1.default)("invalid imported to published fails", () => {
    strict_1.default.equal((0, index_1.canTransitionStagingStatus)("imported", "published"), false);
    strict_1.default.throws(() => (0, index_1.assertValidStagingTransition)("imported", "published"));
});
// 17. rejected → published fails.
(0, node_test_1.default)("invalid rejected to published fails", () => {
    strict_1.default.equal((0, index_1.canTransitionStagingStatus)("rejected", "published"), false);
});
// Tambahan: validation_failed → approved DILARANG (mesti revalidate).
(0, node_test_1.default)("validation_failed to approved is forbidden", () => {
    strict_1.default.equal((0, index_1.canTransitionStagingStatus)("validation_failed", "approved"), false);
    strict_1.default.equal((0, index_1.canTransitionStagingStatus)("validation_failed", "normalizing"), true);
});
// Tambahan: merged → approved DILARANG (mesti reopen dahulu).
(0, node_test_1.default)("merged to approved is forbidden without reopen", () => {
    strict_1.default.equal((0, index_1.canTransitionStagingStatus)("merged", "approved"), false);
    strict_1.default.equal((0, index_1.canTransitionStagingStatus)("merged", "needs_review"), true);
});
