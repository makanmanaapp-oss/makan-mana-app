"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
// 1. Fixture CanonicalPlace sah lulus.
(0, node_test_1.default)("valid CanonicalPlace passes", () => {
    const r = (0, index_1.validateCanonicalPlace)(fixtures_1.completeVerifiedPlace);
    strict_1.default.equal(r.ok, true, JSON.stringify(r.issues));
});
// 2. placeId hilang gagal.
(0, node_test_1.default)("missing placeId fails", () => {
    const p = (0, fixtures_1.makeBasePlace)();
    p.placeId = "";
    const r = (0, index_1.validateCanonicalPlace)(p);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "empty_place_id"));
});
// 3. Nama canonical hilang gagal.
(0, node_test_1.default)("missing canonical name fails", () => {
    const p = (0, fixtures_1.makeBasePlace)();
    p.identity.canonicalName = "";
    const r = (0, index_1.validateCanonicalPlace)(p);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "empty_canonical_name"));
});
// 4. Latitud tidak sah gagal.
(0, node_test_1.default)("invalid latitude fails", () => {
    const p = (0, fixtures_1.makeBasePlace)();
    p.location.lat = 200;
    const r = (0, index_1.validateCanonicalPlace)(p);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "location_invalid"));
});
// 5. Longitud tidak sah gagal.
(0, node_test_1.default)("invalid longitude fails", () => {
    const p = (0, fixtures_1.makeBasePlace)();
    p.location.lng = 500;
    const r = (0, index_1.validateCanonicalPlace)(p);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "location_invalid"));
});
// 6. Confidence < 0 gagal.
(0, node_test_1.default)("confidence below 0 fails", () => {
    const p = (0, fixtures_1.makeBasePlace)();
    p.tagSet.tags[0].confidence = -0.1;
    const r = (0, index_1.validateCanonicalPlace)(p);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "confidence_out_of_range"));
});
// 7. Confidence > 1 gagal.
(0, node_test_1.default)("confidence above 1 fails", () => {
    const p = (0, fixtures_1.makeBasePlace)();
    p.provenance.rating.confidence = 1.5;
    const r = (0, index_1.validateCanonicalPlace)(p);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "confidence_out_of_range"));
});
// 8. Komponen completeness luar julat gagal.
(0, node_test_1.default)("completeness component out of range fails", () => {
    const p = (0, fixtures_1.makeBasePlace)();
    p.completeness = { ...p.completeness, tagCompleteness: 1.5 };
    const r = (0, index_1.validatePlaceCompleteness)(p.completeness);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "completeness_out_of_range"));
});
// 21. Skema alias menyokong keserasian placeId Google semasa.
(0, node_test_1.default)("alias schema supports current Google placeId compatibility", () => {
    const alias = fixtures_1.completeVerifiedPlace.aliases[0];
    strict_1.default.equal(alias.aliasType, "google_place_id");
    strict_1.default.equal(alias.canonicalPlaceId, fixtures_1.completeVerifiedPlace.placeId);
    const r = (0, index_1.validatePlaceAlias)(alias);
    strict_1.default.equal(r.ok, true, JSON.stringify(r.issues));
});
// 22. Tag canonical menolak confidence tidak sah.
(0, node_test_1.default)("canonical tags reject invalid confidence", () => {
    const r = (0, index_1.validateCanonicalTagEvidence)({
        tagId: "cafe",
        family: "place_type",
        evidenceLevel: "reported",
        confidence: 2,
        sourceType: "community",
    });
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "confidence_out_of_range"));
});
// Tambahan: ID tag berbentuk label terjemah ditolak.
(0, node_test_1.default)("localized tag id is rejected", () => {
    const r = (0, index_1.validateCanonicalTagEvidence)({
        tagId: "Nasi Lemak",
        family: "dish",
        evidenceLevel: "reported",
        confidence: 0.5,
        sourceType: "community",
    });
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.issues.some((i) => i.code === "localized_or_invalid_tag_id"));
});
