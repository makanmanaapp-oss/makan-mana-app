"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.14G — ujian resolver baca kanonikal (TULEN).
 */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const canonicalReadResolver_1 = require("../canonicalReadResolver");
const CONFIG = { ownerAllowlist: ["blp6g37BUVPFLsDrSGuVqHrne153"] };
function cand(over = {}) {
    return {
        placeId: "ChIJprovider0001",
        name: "Legacy Name",
        cuisine: "Restoran",
        emoji: "🍽️",
        rating: 4.2,
        userRatingCount: 88,
        priceLevel: 2,
        distanceKm: 1.2,
        isOpen: true,
        address: "Legacy address",
        matchScore: 77,
        matchReasonKeys: ["withinBudget"],
        priceEstimate: "RM12 - RM30",
        ...over,
    };
}
function view(over = {}) {
    return {
        canonicalPlaceId: "PLC-abcdef0123456789abcdef01",
        providerPlaceId: "ChIJprovider0001",
        title: "Canonical Name",
        address: "Canonical formatted address, KL",
        lat: 3.15,
        lng: 101.71,
        ratingState: "rating_shown",
        priceState: "price_provider_band",
        hoursState: "hours_unknown",
        businessState: "status_unknown",
        halalState: "halal_unknown",
        publicationId: "PUB-x",
        publicationVersion: 1,
        ...over,
    };
}
// --- cohort authorization ---------------------------------------------------
(0, node_test_1.test)("owner admin claim → cohort eligible", () => {
    const c = (0, canonicalReadResolver_1.resolveCohortAuthorization)({ uid: "x", token: { admin: true } }, CONFIG);
    strict_1.default.equal(c.canonicalCohortEligible, true);
    strict_1.default.equal(c.source, "claim_owner");
    strict_1.default.ok(!c.maskedIdentity.includes("x".repeat(20)));
});
(0, node_test_1.test)("owner role claim → cohort eligible", () => {
    strict_1.default.equal((0, canonicalReadResolver_1.resolveCohortAuthorization)({ uid: "x", token: { role: "owner" } }, CONFIG).canonicalCohortEligible, true);
});
(0, node_test_1.test)("approved allowlist uid → cohort eligible", () => {
    const c = (0, canonicalReadResolver_1.resolveCohortAuthorization)({ uid: "blp6g37BUVPFLsDrSGuVqHrne153", token: {} }, CONFIG);
    strict_1.default.equal(c.canonicalCohortEligible, true);
    strict_1.default.equal(c.source, "owner_allowlist");
});
(0, node_test_1.test)("standard user → NOT cohort eligible but authenticated", () => {
    const c = (0, canonicalReadResolver_1.resolveCohortAuthorization)({ uid: "public-user", token: {} }, CONFIG);
    strict_1.default.equal(c.authenticated, true);
    strict_1.default.equal(c.canonicalCohortEligible, false);
    strict_1.default.equal(c.correctionEligible, true);
});
(0, node_test_1.test)("unauthenticated → nothing eligible", () => {
    const c = (0, canonicalReadResolver_1.resolveCohortAuthorization)(undefined, CONFIG);
    strict_1.default.equal(c.authenticated, false);
    strict_1.default.equal(c.canonicalCohortEligible, false);
});
(0, node_test_1.test)("client-writable isAdmin is IGNORED (not a claim source)", () => {
    const c = (0, canonicalReadResolver_1.resolveCohortAuthorization)({ uid: "x", token: { isAdmin: true } }, CONFIG);
    strict_1.default.equal(c.canonicalCohortEligible, false);
});
// --- overlay ----------------------------------------------------------------
const OPTS = { cohortEligible: true, forceLegacy: false, aliasResolved: true, includeDebug: true };
(0, node_test_1.test)("cohort + valid canonical → canonical overlay (name/address)", () => {
    const r = (0, canonicalReadResolver_1.overlayCanonicalCandidate)(cand(), view(), OPTS);
    strict_1.default.equal(r.dataSource, "canonical");
    strict_1.default.equal(r.candidate.name, "Canonical Name");
    strict_1.default.equal(r.candidate.address, "Canonical formatted address, KL");
    strict_1.default.equal(r.candidate.dataSource, "canonical");
    strict_1.default.equal(r.candidate.canonicalPlaceId, "PLC-abcdef0123456789abcdef01");
});
(0, node_test_1.test)("non-cohort → legacy unchanged (no server read)", () => {
    const r = (0, canonicalReadResolver_1.overlayCanonicalCandidate)(cand(), view(), { ...OPTS, cohortEligible: false });
    strict_1.default.equal(r.dataSource, "legacy");
    strict_1.default.equal(r.candidate.name, "Legacy Name");
    strict_1.default.equal(r.fallbackReason, "not_cohort");
});
(0, node_test_1.test)("emergency forceLegacy → legacy (wins)", () => {
    const r = (0, canonicalReadResolver_1.overlayCanonicalCandidate)(cand(), view(), { ...OPTS, forceLegacy: true });
    strict_1.default.equal(r.dataSource, "legacy");
    strict_1.default.equal(r.fallbackReason, "emergency_legacy_override");
});
(0, node_test_1.test)("alias not resolved → legacy", () => {
    const r = (0, canonicalReadResolver_1.overlayCanonicalCandidate)(cand(), view(), { ...OPTS, aliasResolved: false });
    strict_1.default.equal(r.dataSource, "legacy");
    strict_1.default.equal(r.fallbackReason, "alias_not_resolved");
});
(0, node_test_1.test)("null canonical view → legacy fallback", () => {
    const r = (0, canonicalReadResolver_1.overlayCanonicalCandidate)(cand(), null, OPTS);
    strict_1.default.equal(r.dataSource, "legacy");
    strict_1.default.equal(r.fallbackReason, "canonical_missing_or_invalid");
});
(0, node_test_1.test)("invalid canonical location → legacy fallback", () => {
    const r = (0, canonicalReadResolver_1.overlayCanonicalCandidate)(cand(), view({ lat: NaN }), OPTS);
    strict_1.default.equal(r.dataSource, "legacy");
    strict_1.default.equal(r.fallbackReason, "canonical_location_invalid");
});
(0, node_test_1.test)("NO fabrication: numeric rating/price preserved from legacy (not invented)", () => {
    const r = (0, canonicalReadResolver_1.overlayCanonicalCandidate)(cand({ rating: 0, userRatingCount: 0, priceLevel: 1 }), view(), OPTS);
    // canonical publication carries STATES, not raw numbers → legacy numerics kept.
    strict_1.default.equal(r.candidate.rating, 0);
    strict_1.default.equal(r.candidate.userRatingCount, 0);
    strict_1.default.equal(r.candidate.priceLevel, 1);
});
(0, node_test_1.test)("public (includeDebug false) → no dataSource field leaked on candidate", () => {
    const r = (0, canonicalReadResolver_1.overlayCanonicalCandidate)(cand(), null, { ...OPTS, cohortEligible: false, includeDebug: false });
    strict_1.default.equal(r.candidate.dataSource, undefined);
});
(0, node_test_1.test)("order/identity: placeId + matchScore preserved on canonical overlay", () => {
    const r = (0, canonicalReadResolver_1.overlayCanonicalCandidate)(cand({ placeId: "ChIJkeep", matchScore: 91 }), view({ providerPlaceId: "ChIJkeep" }), OPTS);
    strict_1.default.equal(r.candidate.placeId, "ChIJkeep");
    strict_1.default.equal(r.candidate.matchScore, 91);
});
