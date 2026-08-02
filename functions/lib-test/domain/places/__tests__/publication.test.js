"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
// 9. Kedai published + aktif + sah = layak.
(0, node_test_1.default)("published valid active place is eligible", () => {
    const r = (0, index_1.evaluatePublicationEligibility)(fixtures_1.completeVerifiedPlace);
    strict_1.default.equal(r.eligible, true, JSON.stringify(r.reasons));
});
// 10. Kedai draft tidak layak.
(0, node_test_1.default)("draft place is not eligible", () => {
    const r = (0, index_1.evaluatePublicationEligibility)(fixtures_1.draftPlace);
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.reasons.includes("not_published"));
});
// 11. Kedai tutup kekal tidak layak.
(0, node_test_1.default)("permanently closed place is not eligible", () => {
    const r = (0, index_1.evaluatePublicationEligibility)(fixtures_1.permanentlyClosedPlace);
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.reasons.includes("status_blocked"));
});
// 12. Kedai hidden_by_admin tidak layak.
(0, node_test_1.default)("hidden place is not eligible", () => {
    const p = (0, fixtures_1.makeBasePlace)();
    p.status = "hidden_by_admin";
    const r = (0, index_1.evaluatePublicationEligibility)(p);
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.reasons.includes("status_blocked"));
});
// 13. Alias digabung tidak layak.
(0, node_test_1.default)("merged alias is not eligible", () => {
    const r = (0, index_1.evaluatePublicationEligibility)(fixtures_1.mergedAliasPlace);
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.reasons.includes("merged_into_other"));
});
// 14. Completeness rendah tidak layak.
(0, node_test_1.default)("low-completeness place is not eligible", () => {
    const r = (0, index_1.evaluatePublicationEligibility)(fixtures_1.partiallyCompletePlace);
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.reasons.includes("completeness_below_threshold"));
});
// Tambahan: warning dikeluarkan tetapi kekal layak untuk kes borderline.
(0, node_test_1.default)("borderline completeness stays eligible with warning label", () => {
    const p = (0, fixtures_1.makeBasePlace)();
    p.completeness = { ...p.completeness, overallScore: 0.7 };
    const r = (0, index_1.evaluatePublicationEligibility)(p);
    strict_1.default.equal(r.eligible, true, JSON.stringify(r.reasons));
    strict_1.default.ok(r.warnings.includes("completeness_needs_labels"));
});
