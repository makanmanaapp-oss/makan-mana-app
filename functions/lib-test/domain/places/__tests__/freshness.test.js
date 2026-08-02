"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
// 18. Freshness jadi expired selepas expiresAt.
(0, node_test_1.default)("freshness state becomes expired after expiresAt", () => {
    const state = (0, index_1.calculateFreshnessState)(fixtures_1.T + 8 * fixtures_1.DAY, // now
    fixtures_1.T, // fetchedAt
    fixtures_1.T + 3 * fixtures_1.DAY, // staleAfter
    fixtures_1.T + 7 * fixtures_1.DAY);
    strict_1.default.equal(state, "expired");
});
// 19. Freshness = unknown bila timestamp tiada.
(0, node_test_1.default)("freshness state is unknown when timestamps are absent", () => {
    strict_1.default.equal((0, index_1.calculateFreshnessState)(fixtures_1.T, undefined, undefined, undefined), "unknown");
    // fetchedAt hadir tetapi tiada staleAfter/expiresAt -> unknown.
    strict_1.default.equal((0, index_1.calculateFreshnessState)(fixtures_1.T, fixtures_1.T, undefined, undefined), "unknown");
});
// Tambahan: fresh sebelum staleAfter; aging/stale dalam tetingkap.
(0, node_test_1.default)("fresh before staleAfter, aging then stale within window", () => {
    strict_1.default.equal((0, index_1.calculateFreshnessState)(fixtures_1.T + 1 * fixtures_1.DAY, fixtures_1.T, fixtures_1.T + 3 * fixtures_1.DAY, fixtures_1.T + 7 * fixtures_1.DAY), "fresh");
    // Selepas staleAfter, sebelum titik tengah (5 hari) -> aging.
    strict_1.default.equal((0, index_1.calculateFreshnessState)(fixtures_1.T + 4 * fixtures_1.DAY, fixtures_1.T, fixtures_1.T + 3 * fixtures_1.DAY, fixtures_1.T + 7 * fixtures_1.DAY), "aging");
    // Selepas titik tengah, sebelum expiry -> stale.
    strict_1.default.equal((0, index_1.calculateFreshnessState)(fixtures_1.T + 6 * fixtures_1.DAY, fixtures_1.T, fixtures_1.T + 3 * fixtures_1.DAY, fixtures_1.T + 7 * fixtures_1.DAY), "stale");
});
