"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
const V = (c) => (0, index_1.validateNormalizedCandidate)(c, { now: fixtures_1.T, snapshotExists: true });
// 1. Valid import batch passes.
(0, node_test_1.default)("valid import batch passes", () => {
    strict_1.default.equal((0, index_1.validateImportBatch)(fixtures_1.validImportBatch).ok, true);
    strict_1.default.equal((0, index_1.validateSourceSnapshot)(fixtures_1.validProviderSnapshot).ok, true);
});
// 2. Empty source type fails.
(0, node_test_1.default)("empty source type fails", () => {
    const r = (0, index_1.validateImportBatch)({ ...fixtures_1.validImportBatch, sourceType: "" });
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "invalid_enum"));
});
// 5. Candidate confidence below 0 fails.
(0, node_test_1.default)("candidate confidence below 0 fails", () => {
    const r = V((0, fixtures_1.makeValidCandidate)({ candidateConfidence: -0.1 }));
    strict_1.default.equal(r.valid, false);
    strict_1.default.ok(r.errors.some((e) => e.code === "confidence_out_of_range"));
});
// 6. Candidate confidence above 1 fails.
(0, node_test_1.default)("candidate confidence above 1 fails", () => {
    const r = V((0, fixtures_1.makeValidCandidate)({ candidateConfidence: 1.5 }));
    strict_1.default.equal(r.valid, false);
});
// 7. Missing candidate name fails validation.
(0, node_test_1.default)("missing candidate name fails validation", () => {
    const r = V(fixtures_1.missingNameCandidate);
    strict_1.default.equal(r.valid, false);
    strict_1.default.ok(r.errors.some((e) => e.code === "name_empty"));
});
// 8. Unknown rating remains undefined (and still valid).
(0, node_test_1.default)("unknown rating remains undefined", () => {
    strict_1.default.equal(fixtures_1.unknownRatingCandidate.proposedQuality.rating, undefined);
    strict_1.default.equal(fixtures_1.unknownRatingCandidate.proposedQuality.reviewCount, undefined);
    strict_1.default.equal(V(fixtures_1.unknownRatingCandidate).valid, true);
});
// 9. Unknown price remains explicit unknown (and valid).
(0, node_test_1.default)("unknown price remains explicit unknown", () => {
    strict_1.default.equal(fixtures_1.unknownPriceCandidate.proposedCommercial.priceState, "unknown");
    strict_1.default.equal(V(fixtures_1.unknownPriceCandidate).valid, true);
});
// 10. Unknown hours remain unknown (and valid).
(0, node_test_1.default)("unknown hours remain unknown", () => {
    strict_1.default.equal(fixtures_1.unknownHoursCandidate.proposedHours.hoursState, "unknown");
    strict_1.default.equal(V(fixtures_1.unknownHoursCandidate).valid, true);
});
// 11. Halal claim cannot exceed evidence level.
(0, node_test_1.default)("halal claim cannot exceed evidence level", () => {
    const r = V(fixtures_1.invalidHalalClaimCandidate);
    strict_1.default.equal(r.valid, false);
    strict_1.default.ok(r.errors.some((e) => e.code === "halal_claim_exceeds_evidence"));
});
// 12. Allergen-safe cannot be inferred from missing data.
(0, node_test_1.default)("allergen-safe cannot be inferred from missing data", () => {
    // Tiada medan "selamat" wujud; helper sentiasa false.
    strict_1.default.equal((0, index_1.assertsAllergenSafety)(fixtures_1.allergenUnknownCandidate), false);
    // Alahan kosong + evidence unknown adalah SAH (bukan dakwaan selamat).
    strict_1.default.equal(V(fixtures_1.allergenUnknownCandidate).valid, true);
    strict_1.default.deepEqual(fixtures_1.allergenUnknownCandidate.proposedSafetyEvidence.allergenReported, []);
});
