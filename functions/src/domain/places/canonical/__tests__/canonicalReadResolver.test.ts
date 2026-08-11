/**
 * Phase 1.14G — ujian resolver baca kanonikal (TULEN).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalPlaceView,
  overlayCanonicalCandidate,
  resolveCohortAuthorization,
} from "../canonicalReadResolver";
import { PlaceCandidate } from "../../../../types/place";

const CONFIG = { ownerAllowlist: ["blp6g37BUVPFLsDrSGuVqHrne153"] };

function cand(over: Partial<PlaceCandidate> = {}): PlaceCandidate {
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

function view(over: Partial<CanonicalPlaceView> = {}): CanonicalPlaceView {
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
test("owner admin claim → cohort eligible", () => {
  const c = resolveCohortAuthorization({ uid: "x", token: { admin: true } }, CONFIG);
  assert.equal(c.canonicalCohortEligible, true);
  assert.equal(c.source, "claim_owner");
  assert.ok(!c.maskedIdentity.includes("x".repeat(20)));
});
test("owner role claim → cohort eligible", () => {
  assert.equal(resolveCohortAuthorization({ uid: "x", token: { role: "owner" } }, CONFIG).canonicalCohortEligible, true);
});
test("approved allowlist uid → cohort eligible", () => {
  const c = resolveCohortAuthorization({ uid: "blp6g37BUVPFLsDrSGuVqHrne153", token: {} }, CONFIG);
  assert.equal(c.canonicalCohortEligible, true);
  assert.equal(c.source, "owner_allowlist");
});
test("standard user → NOT cohort eligible but authenticated", () => {
  const c = resolveCohortAuthorization({ uid: "public-user", token: {} }, CONFIG);
  assert.equal(c.authenticated, true);
  assert.equal(c.canonicalCohortEligible, false);
  assert.equal(c.correctionEligible, true);
});
test("unauthenticated → nothing eligible", () => {
  const c = resolveCohortAuthorization(undefined, CONFIG);
  assert.equal(c.authenticated, false);
  assert.equal(c.canonicalCohortEligible, false);
});
test("client-writable isAdmin is IGNORED (not a claim source)", () => {
  const c = resolveCohortAuthorization({ uid: "x", token: { isAdmin: true } }, CONFIG);
  assert.equal(c.canonicalCohortEligible, false);
});

// --- overlay ----------------------------------------------------------------
const OPTS = { cohortEligible: true, forceLegacy: false, aliasResolved: true, includeDebug: true };

test("cohort + valid canonical → canonical overlay (name/address)", () => {
  const r = overlayCanonicalCandidate(cand(), view(), OPTS);
  assert.equal(r.dataSource, "canonical");
  assert.equal(r.candidate.name, "Canonical Name");
  assert.equal(r.candidate.address, "Canonical formatted address, KL");
  assert.equal(r.candidate.dataSource, "canonical");
  assert.equal(r.candidate.canonicalPlaceId, "PLC-abcdef0123456789abcdef01");
});
test("non-cohort → legacy unchanged (no server read)", () => {
  const r = overlayCanonicalCandidate(cand(), view(), { ...OPTS, cohortEligible: false });
  assert.equal(r.dataSource, "legacy");
  assert.equal(r.candidate.name, "Legacy Name");
  assert.equal(r.fallbackReason, "not_cohort");
});
test("emergency forceLegacy → legacy (wins)", () => {
  const r = overlayCanonicalCandidate(cand(), view(), { ...OPTS, forceLegacy: true });
  assert.equal(r.dataSource, "legacy");
  assert.equal(r.fallbackReason, "emergency_legacy_override");
});
test("alias not resolved → legacy", () => {
  const r = overlayCanonicalCandidate(cand(), view(), { ...OPTS, aliasResolved: false });
  assert.equal(r.dataSource, "legacy");
  assert.equal(r.fallbackReason, "alias_not_resolved");
});
test("null canonical view → legacy fallback", () => {
  const r = overlayCanonicalCandidate(cand(), null, OPTS);
  assert.equal(r.dataSource, "legacy");
  assert.equal(r.fallbackReason, "canonical_missing_or_invalid");
});
test("invalid canonical location → legacy fallback", () => {
  const r = overlayCanonicalCandidate(cand(), view({ lat: NaN as unknown as number }), OPTS);
  assert.equal(r.dataSource, "legacy");
  assert.equal(r.fallbackReason, "canonical_location_invalid");
});
test("NO fabrication: numeric rating/price preserved from legacy (not invented)", () => {
  const r = overlayCanonicalCandidate(cand({ rating: 0, userRatingCount: 0, priceLevel: 1 }), view(), OPTS);
  // canonical publication carries STATES, not raw numbers → legacy numerics kept.
  assert.equal(r.candidate.rating, 0);
  assert.equal(r.candidate.userRatingCount, 0);
  assert.equal(r.candidate.priceLevel, 1);
});
test("public (includeDebug false) → no dataSource field leaked on candidate", () => {
  const r = overlayCanonicalCandidate(cand(), null, { ...OPTS, cohortEligible: false, includeDebug: false });
  assert.equal(r.candidate.dataSource, undefined);
});
test("order/identity: placeId + matchScore preserved on canonical overlay", () => {
  const r = overlayCanonicalCandidate(cand({ placeId: "ChIJkeep", matchScore: 91 }), view({ providerPlaceId: "ChIJkeep" }), OPTS);
  assert.equal(r.candidate.placeId, "ChIJkeep");
  assert.equal(r.candidate.matchScore, 91);
});
