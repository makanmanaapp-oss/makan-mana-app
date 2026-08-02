"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
const V = (e) => (0, index_1.validateTagEvidence)(e, fixtures_1.REG);
const has = (e, code) => e.issues.some((i) => i.code === code);
// 6 & 7. Confidence bounds.
(0, node_test_1.default)("confidence below 0 fails", () => {
    strict_1.default.equal(V((0, fixtures_1.ev)("cuisine", "malay", { confidence: -0.1 })).ok, false);
});
(0, node_test_1.default)("confidence above 1 fails", () => {
    strict_1.default.equal(V((0, fixtures_1.ev)("cuisine", "malay", { confidence: 1.5 })).ok, false);
});
// 8. Disallowed evidence level fails (dietary has no "inferred").
(0, node_test_1.default)("disallowed evidence level fails", () => {
    const r = V((0, fixtures_1.ev)("dietary", "vegan_options", { evidenceLevel: "inferred" }));
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(has(r, "evidence_level_not_allowed_for_family"));
});
// 9. Certified halal without verified evidence fails.
(0, node_test_1.default)("certified halal without verified evidence fails", () => {
    const r = V((0, fixtures_1.ev)("halal_evidence", "certified", { evidenceLevel: "reported" }));
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(has(r, "halal_certified_requires_verified"));
});
// 10 & Golden B. Merchant halal claim cannot become certified.
(0, node_test_1.default)("merchant claim cannot become certified", () => {
    const r = V((0, fixtures_1.ev)("halal_evidence", "certified", {
        sourceType: "merchant",
        evidenceLevel: "verified",
        verifiedAt: fixtures_1.T,
    }));
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(has(r, "halal_certified_requires_official_verification"));
    // merchant_claimed dari merchant adalah SAH.
    strict_1.default.equal(V((0, fixtures_1.ev)("halal_evidence", "merchant_claimed", { sourceType: "merchant" })).ok, true);
});
// 11 & Golden C. Community halal report remains community_reported.
(0, node_test_1.default)("community halal report stays community_reported", () => {
    strict_1.default.equal(V((0, fixtures_1.ev)("halal_evidence", "community_reported", { sourceType: "community" })).ok, true);
    // Komuniti cuba isytihar certified → gagal.
    strict_1.default.equal(V((0, fixtures_1.ev)("halal_evidence", "certified", { sourceType: "community", evidenceLevel: "verified" })).ok, false);
});
// Golden D. Official certificate → certified valid.
(0, node_test_1.default)("official certificate → certified valid", () => {
    const admin = V((0, fixtures_1.ev)("halal_evidence", "certified", { evidenceLevel: "verified", approvedBy: "admin_1", verifiedAt: fixtures_1.T }));
    strict_1.default.equal(admin.ok, true, JSON.stringify(admin.issues));
    const licensed = V((0, fixtures_1.ev)("halal_evidence", "certified", { evidenceLevel: "verified", sourceType: "licensed_dataset", verifiedAt: fixtures_1.T }));
    strict_1.default.equal(licensed.ok, true);
});
// 12 & Golden E. Missing allergen data remains unknown (valid).
(0, node_test_1.default)("missing allergen data remains unknown", () => {
    strict_1.default.equal(V((0, fixtures_1.ev)("allergen", "peanuts", { evidenceLevel: "unknown" })).ok, true);
});
// 13. Allergen-safe cannot be inferred (no inferred level for allergen).
(0, node_test_1.default)("allergen safety cannot be inferred", () => {
    const r = V((0, fixtures_1.ev)("allergen", "peanuts", { evidenceLevel: "inferred" }));
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(has(r, "evidence_level_not_allowed_for_family"));
});
// Golden F. Menu lists peanuts → allergen presence with evidence.
(0, node_test_1.default)("menu lists peanuts → allergen presence valid", () => {
    strict_1.default.equal(V((0, fixtures_1.ev)("allergen", "peanuts", { evidenceLevel: "verified", sourceRecordId: "menu_1" })).ok, true);
});
// 14. High-protein restaurant inference remains low confidence.
(0, node_test_1.default)("inferred high_protein at high confidence fails", () => {
    const high = V((0, fixtures_1.ev)("health", "high_protein", { evidenceLevel: "inferred", confidence: 0.8 }));
    strict_1.default.equal(high.ok, false);
    strict_1.default.ok(has(high, "health_inferred_confidence_too_high"));
    const low = V((0, fixtures_1.ev)("health", "high_protein", { evidenceLevel: "inferred", confidence: 0.3 }));
    strict_1.default.equal(low.ok, true);
});
// Golden G. Reviews mention "healthy" → inferred only; verified-from-review fails.
(0, node_test_1.default)("review-derived health cannot be verified without menu evidence", () => {
    const verifiedNoMenu = V((0, fixtures_1.ev)("health", "vegetable_rich", { evidenceLevel: "verified" }));
    strict_1.default.equal(verifiedNoMenu.ok, false);
    strict_1.default.ok(has(verifiedNoMenu, "health_verified_requires_menu_evidence"));
});
// 15. Vegan option without supporting evidence fails.
(0, node_test_1.default)("vegan option without supporting evidence fails", () => {
    strict_1.default.equal(V((0, fixtures_1.ev)("dietary", "vegan_options", { evidenceLevel: "inferred" })).ok, false);
});
// Golden H. Verified menu → grilled/high_protein with stronger evidence.
(0, node_test_1.default)("verified menu grilled/high_protein valid", () => {
    strict_1.default.equal(V((0, fixtures_1.ev)("health", "grilled", { evidenceLevel: "verified", sourceRecordId: "menu_2" })).ok, true);
    strict_1.default.equal(V((0, fixtures_1.ev)("health", "high_protein", { evidenceLevel: "verified", sourceRecordId: "menu_2" })).ok, true);
});
