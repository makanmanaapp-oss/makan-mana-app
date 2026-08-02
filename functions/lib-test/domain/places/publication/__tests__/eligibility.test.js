"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.6 Part O — ujian enjin kelayakan penerbitan (25-30).
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
const ctx = (over = {}) => ({
    now: fixtures_1.T + 1000,
    freshnessInputs: (0, fixtures_1.freshInputsAt)(fixtures_1.T),
    ...over,
});
// 25. Kedai sah adalah LAYAK.
(0, node_test_1.default)("25. kedai lengkap+segar+approved adalah layak", () => {
    const r = (0, index_1.evaluatePublicationEligibility)((0, fixtures_1.eligiblePlace)(), ctx());
    strict_1.default.equal(r.eligible, true, `blocked: ${r.blockingReasons.join(",")}`);
    strict_1.default.deepEqual(r.blockingReasons, []);
    strict_1.default.equal(r.completenessResult.meetsMinimum, true);
    strict_1.default.equal(r.freshnessResult.overallFreshnessState, "fresh");
    strict_1.default.equal(r.version, "eligibility_v1");
});
// 26. Completeness rendah MENYEKAT.
(0, node_test_1.default)("26. completeness di bawah ambang menyekat", () => {
    const r = (0, index_1.evaluatePublicationEligibility)((0, fixtures_1.lowCompletenessPlace)(), ctx());
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.blockingReasons.includes("below_minimum_completeness"));
    strict_1.default.ok(r.requiredActions.includes("improve_completeness"));
});
(0, node_test_1.default)("26b. completeness sederhana (0.60-0.79) layak DENGAN amaran label", () => {
    const p = (0, fixtures_1.eligiblePlace)();
    p.completeness = { ...p.completeness, overallScore: 0.7 };
    const r = (0, index_1.evaluatePublicationEligibility)(p, ctx());
    strict_1.default.equal(r.eligible, true);
    strict_1.default.ok(r.warnings.includes("completeness_needs_labels"));
});
// 27. Duplikat belum selesai MENYEKAT.
(0, node_test_1.default)("27. duplikat belum selesai menyekat", () => {
    const r = (0, index_1.evaluatePublicationEligibility)((0, fixtures_1.unresolvedDuplicatePlace)(), ctx());
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.blockingReasons.includes("unresolved_duplicate"));
    strict_1.default.ok(r.requiredActions.includes("resolve_duplicate"));
});
(0, node_test_1.default)("27b. duplikat daripada konteks dedup luaran juga menyekat", () => {
    const r = (0, index_1.evaluatePublicationEligibility)((0, fixtures_1.eligiblePlace)(), ctx({ hasUnresolvedDuplicate: true }));
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.blockingReasons.includes("unresolved_duplicate"));
});
(0, node_test_1.default)("27c. rekod yang telah digabung tidak boleh terbit sebagai entiti sendiri", () => {
    const p = (0, fixtures_1.eligiblePlace)();
    p.mergeState = {
        mergeStatus: "merged",
        duplicateOf: "mm_pub_0001",
        preservedSourceRefs: [],
    };
    const r = (0, index_1.evaluatePublicationEligibility)(p, ctx());
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.blockingReasons.includes("merged_or_superseded_alias"));
});
// 28. Konflik keselamatan MENYEKAT.
(0, node_test_1.default)("28. konflik keselamatan halal menyekat", () => {
    const r = (0, index_1.evaluatePublicationEligibility)((0, fixtures_1.safetyConflictPlace)(), ctx());
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.blockingReasons.includes("unresolved_safety_conflict"));
    strict_1.default.ok(r.safetyResult.conflictCodes.includes("halal_certified_vs_non_halal_report"));
    strict_1.default.ok(r.requiredActions.includes("resolve_safety_conflict"));
});
// 29. Harga tidak diketahui hanya MEMBERI AMARAN.
(0, node_test_1.default)("29. harga unknown hanya memberi amaran (tidak menyekat)", () => {
    const r = (0, index_1.evaluatePublicationEligibility)((0, fixtures_1.unknownPricePlace)(), ctx());
    strict_1.default.equal(r.eligible, true, `blocked: ${r.blockingReasons.join(",")}`);
    strict_1.default.ok(r.warnings.includes("unknown_price"));
});
// 30. Waktu tidak diketahui: amaran ATAU sekatan mengikut polisi.
(0, node_test_1.default)("30. waktu unknown memberi amaran mengikut polisi lalai", () => {
    const r = (0, index_1.evaluatePublicationEligibility)((0, fixtures_1.unknownHoursPlace)(), ctx());
    strict_1.default.equal(r.eligible, true);
    strict_1.default.ok(r.warnings.includes("unknown_hours"));
});
(0, node_test_1.default)("30b. waktu unknown MENYEKAT bila polisi dikonfigurasi begitu", () => {
    const config = (0, index_1.withEligibilityOverrides)({ unknownHoursBlocksPublication: true });
    const r = (0, index_1.evaluatePublicationEligibility)((0, fixtures_1.unknownHoursPlace)(), ctx({ config }));
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.blockingReasons.includes("invalid_business_status"));
});
// Sekatan lain yang diwajibkan Part G.
(0, node_test_1.default)("kedai tutup kekal disekat", () => {
    const r = (0, index_1.evaluatePublicationEligibility)((0, fixtures_1.permanentlyClosed)(), ctx());
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.blockingReasons.includes("permanently_closed"));
    strict_1.default.equal(r.statusResult.permanentlyClosed, true);
});
(0, node_test_1.default)("rekod belum approved disekat (approved != published)", () => {
    const p = (0, fixtures_1.eligiblePlace)();
    p.publicationStatus = "needs_review";
    const r = (0, index_1.evaluatePublicationEligibility)(p, ctx());
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.blockingReasons.includes("not_approved"));
    strict_1.default.ok(r.requiredActions.includes("approve_record"));
});
(0, node_test_1.default)("identiti tidak stabil disekat", () => {
    const p = (0, fixtures_1.eligiblePlace)();
    p.identity = { ...p.identity, canonicalName: "  ", normalizedName: "" };
    const r = (0, index_1.evaluatePublicationEligibility)(p, ctx());
    strict_1.default.ok(r.blockingReasons.includes("missing_stable_identity"));
});
(0, node_test_1.default)("lokasi tidak sah disekat", () => {
    const p = (0, fixtures_1.eligiblePlace)();
    p.location = { ...p.location, lat: 999, lng: 0 };
    const r = (0, index_1.evaluatePublicationEligibility)(p, ctx());
    strict_1.default.ok(r.blockingReasons.includes("invalid_location"));
    strict_1.default.ok(r.requiredActions.includes("fix_location"));
});
(0, node_test_1.default)("verification rejected/tidak dibenarkan disekat", () => {
    const rejected = (0, fixtures_1.eligiblePlace)();
    rejected.verificationStatus = "rejected";
    strict_1.default.ok((0, index_1.evaluatePublicationEligibility)(rejected, ctx()).blockingReasons.includes("verification_rejected"));
    const unverified = (0, fixtures_1.eligiblePlace)();
    unverified.verificationStatus = "unverified";
    strict_1.default.ok((0, index_1.evaluatePublicationEligibility)(unverified, ctx()).blockingReasons.includes("verification_not_allowed"));
});
(0, node_test_1.default)("provenance wajib yang hilang disekat", () => {
    const p = (0, fixtures_1.eligiblePlace)();
    p.provenance = {};
    const r = (0, index_1.evaluatePublicationEligibility)(p, ctx());
    strict_1.default.ok(r.blockingReasons.includes("missing_required_provenance"));
    strict_1.default.ok(r.requiredActions.includes("attach_provenance"));
});
(0, node_test_1.default)("tag tidak diluluskan disekat", () => {
    const r = (0, index_1.evaluatePublicationEligibility)((0, fixtures_1.eligiblePlace)(), ctx({ unapprovedTagIds: ["Nasi Lemak"] }));
    strict_1.default.ok(r.blockingReasons.includes("invalid_or_unapproved_tags"));
    strict_1.default.ok(r.requiredActions.includes("review_tags"));
});
(0, node_test_1.default)("keadaan media/fallback tidak sah disekat", () => {
    const p = (0, fixtures_1.eligiblePlace)();
    p.media = { canonicalMediaId: "missing_media", items: [] };
    const r = (0, index_1.evaluatePublicationEligibility)(p, ctx());
    strict_1.default.ok(r.blockingReasons.includes("invalid_media_fallback_state"));
    const pending = (0, fixtures_1.eligiblePlace)();
    pending.media = {
        canonicalMediaId: "m1",
        items: [
            {
                mediaId: "m1",
                url: "https://example.test/a.jpg",
                status: "pending",
                sourceType: "provider",
                isFallback: false,
            },
        ],
    };
    strict_1.default.ok((0, index_1.evaluatePublicationEligibility)(pending, ctx()).blockingReasons.includes("invalid_media_fallback_state"));
});
// Freshness kritikal luput MENYEKAT (ujian 13 pada peringkat kelayakan).
(0, node_test_1.default)("freshness kritikal luput menyekat penerbitan", () => {
    const inputs = (0, fixtures_1.freshInputsAt)(fixtures_1.T);
    inputs.openingHours = { fetchedAt: fixtures_1.T - 61 * fixtures_1.DAY };
    const r = (0, index_1.evaluatePublicationEligibility)((0, fixtures_1.eligiblePlace)(), ctx({ freshnessInputs: inputs }));
    strict_1.default.equal(r.eligible, false);
    strict_1.default.ok(r.blockingReasons.includes("expired_critical_freshness"));
    strict_1.default.ok(r.requiredActions.includes("refresh_critical_fields"));
});
(0, node_test_1.default)("medan bukan-kritikal stale layak DENGAN amaran", () => {
    const inputs = (0, fixtures_1.freshInputsAt)(fixtures_1.T);
    inputs.rating = { fetchedAt: fixtures_1.T - 100 * fixtures_1.DAY }; // stale, bukan expired
    const r = (0, index_1.evaluatePublicationEligibility)((0, fixtures_1.eligiblePlace)(), ctx({ freshnessInputs: inputs }));
    strict_1.default.equal(r.eligible, true, `blocked: ${r.blockingReasons.join(",")}`);
    strict_1.default.ok(r.warnings.includes("stale_rating"));
    strict_1.default.ok(r.warnings.includes("stale_non_critical_field"));
});
(0, node_test_1.default)("amaran bukti lemah: ulasan sedikit + tag inferred + alergen tidak lengkap", () => {
    const p = (0, fixtures_1.eligiblePlace)();
    p.quality = { rating: 4.9, reviewCount: 2 };
    p.tagSet = {
        tags: [
            {
                tagId: "cafe",
                family: "place_type",
                evidenceLevel: "inferred",
                confidence: 0.2,
                sourceType: "makanmana",
            },
        ],
    };
    p.safetyEvidence = {
        halal: { state: "unknown", evidenceLevel: "unknown" },
        dietaryReported: [],
        allergenReported: [],
        allergenEvidenceLevel: "unknown",
    };
    const r = (0, index_1.evaluatePublicationEligibility)(p, ctx());
    strict_1.default.equal(r.eligible, true);
    strict_1.default.ok(r.warnings.includes("low_review_evidence"));
    strict_1.default.ok(r.warnings.includes("inferred_tags"));
    strict_1.default.ok(r.warnings.includes("incomplete_allergen_data"));
});
(0, node_test_1.default)("status community_unverified memberi amaran, bukan sekatan", () => {
    const p = (0, fixtures_1.eligiblePlace)();
    p.status = "community_unverified";
    p.verificationStatus = "community_reported";
    const r = (0, index_1.evaluatePublicationEligibility)(p, ctx());
    strict_1.default.equal(r.eligible, true);
    strict_1.default.ok(r.warnings.includes("community_reported_status"));
});
