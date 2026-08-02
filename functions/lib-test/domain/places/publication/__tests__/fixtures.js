"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOURCE_VERSION = exports.ADMIN = exports.DAY = exports.T = void 0;
exports.freshInputsAt = freshInputsAt;
exports.eligiblePlace = eligiblePlace;
exports.lowCompletenessPlace = lowCompletenessPlace;
exports.permanentlyClosed = permanentlyClosed;
exports.unknownPricePlace = unknownPricePlace;
exports.unknownHoursPlace = unknownHoursPlace;
exports.unresolvedDuplicatePlace = unresolvedDuplicatePlace;
exports.safetyConflictPlace = safetyConflictPlace;
const placeCompleteness_1 = require("../../placeCompleteness");
const fixtures_1 = require("../../__tests__/fixtures");
Object.defineProperty(exports, "T", { enumerable: true, get: function () { return fixtures_1.T; } });
Object.defineProperty(exports, "DAY", { enumerable: true, get: function () { return fixtures_1.DAY; } });
const freshnessPolicy_1 = require("../freshnessPolicy");
exports.ADMIN = { actorUid: "server_admin", actorRole: "admin" };
exports.SOURCE_VERSION = "canon_v1";
/** Semua medan freshness diambil pada T (segar sepenuhnya pada T). */
function freshInputsAt(t = fixtures_1.T) {
    const out = {};
    for (const f of Object.keys(freshnessPolicy_1.DEFAULT_FRESHNESS_POLICY_REGISTRY)) {
        out[f] = { fetchedAt: t };
    }
    return out;
}
/** Kedai LAYAK sepenuhnya: approved, lengkap, segar, tiada konflik. */
function eligiblePlace() {
    const p = (0, fixtures_1.makeBasePlace)();
    p.placeId = "mm_pub_0001";
    p.publicationStatus = "approved";
    p.status = "active";
    p.verificationStatus = "admin_verified";
    p.quality = { rating: 4.4, reviewCount: 250, ratingSource: "provider" };
    p.safetyEvidence = {
        halal: { state: "certified", evidenceLevel: "verified", sourceType: "merchant" },
        dietaryReported: ["vegetarian_options"],
        allergenReported: ["peanuts"],
        allergenEvidenceLevel: "reported",
    };
    // Tag berkeyakinan tinggi supaya tiada amaran "inferred_tags".
    p.tagSet = {
        tags: [
            {
                tagId: "restaurant",
                family: "place_type",
                evidenceLevel: "verified",
                confidence: 0.95,
                sourceType: "makanmana",
            },
        ],
    };
    p.provenance = {
        displayName: {
            value: "Warung Fixture Satu",
            sourceType: "provider",
            evidenceLevel: "verified",
            confidence: 0.95,
            fetchedAt: fixtures_1.T,
        },
        coordinates: {
            value: { lat: 3.1189, lng: 101.6252 },
            sourceType: "provider",
            evidenceLevel: "verified",
            confidence: 0.95,
            fetchedAt: fixtures_1.T,
        },
    };
    return p;
}
function lowCompletenessPlace() {
    const p = eligiblePlace();
    p.placeId = "mm_pub_low";
    p.completeness = (0, placeCompleteness_1.calculatePlaceCompleteness)({
        identityCompleteness: 0.3,
        locationCompleteness: 0.3,
        displayCompleteness: 0.3,
        commercialCompleteness: 0.3,
        hoursCompleteness: 0.3,
        qualityCompleteness: 0.3,
        tagCompleteness: 0.3,
        provenanceCompleteness: 0.3,
        safetyEvidenceCompleteness: 0.3,
    });
    return p;
}
function permanentlyClosed() {
    const p = eligiblePlace();
    p.placeId = "mm_pub_closed";
    p.status = "permanently_closed";
    return p;
}
function unknownPricePlace() {
    const p = eligiblePlace();
    p.placeId = "mm_pub_noprice";
    p.commercial = { priceState: "unknown" };
    return p;
}
function unknownHoursPlace() {
    const p = eligiblePlace();
    p.placeId = "mm_pub_nohours";
    p.hours = { hoursState: "unknown" };
    return p;
}
function unresolvedDuplicatePlace() {
    const p = eligiblePlace();
    p.placeId = "mm_pub_dup";
    p.mergeState = { mergeStatus: "review_required", preservedSourceRefs: [] };
    return p;
}
function safetyConflictPlace() {
    const p = eligiblePlace();
    p.placeId = "mm_pub_safety";
    p.safetyEvidence = {
        halal: { state: "certified", evidenceLevel: "verified", sourceType: "merchant" },
        dietaryReported: ["non_halal"], // konflik langsung dengan sijil halal
        allergenReported: ["peanuts"],
        allergenEvidenceLevel: "reported",
    };
    return p;
}
