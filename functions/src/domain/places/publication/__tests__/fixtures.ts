/**
 * Phase 1.6 — fixtures ujian deterministik untuk penerbitan.
 * Data rekaan. Masa = pemalar T (tiada Date.now()).
 */
import { CanonicalPlace } from "../../canonicalPlace";
import { calculatePlaceCompleteness } from "../../placeCompleteness";
import { makeBasePlace, T, DAY } from "../../__tests__/fixtures";
import { TrustedActor } from "../../staging/stagingAudit";
import { PlaceFreshnessInputMap } from "../freshnessEvaluator";
import { DEFAULT_FRESHNESS_POLICY_REGISTRY } from "../freshnessPolicy";

export { T, DAY };

export const ADMIN: TrustedActor = { actorUid: "server_admin", actorRole: "admin" };
export const SOURCE_VERSION = "canon_v1";

/** Semua medan freshness diambil pada T (segar sepenuhnya pada T). */
export function freshInputsAt(t: number = T): PlaceFreshnessInputMap {
  const out: PlaceFreshnessInputMap = {};
  for (const f of Object.keys(DEFAULT_FRESHNESS_POLICY_REGISTRY) as (keyof PlaceFreshnessInputMap)[]) {
    out[f] = { fetchedAt: t };
  }
  return out;
}

/** Kedai LAYAK sepenuhnya: approved, lengkap, segar, tiada konflik. */
export function eligiblePlace(): CanonicalPlace {
  const p = makeBasePlace();
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
      fetchedAt: T,
    },
    coordinates: {
      value: { lat: 3.1189, lng: 101.6252 },
      sourceType: "provider",
      evidenceLevel: "verified",
      confidence: 0.95,
      fetchedAt: T,
    },
  };
  return p;
}

export function lowCompletenessPlace(): CanonicalPlace {
  const p = eligiblePlace();
  p.placeId = "mm_pub_low";
  p.completeness = calculatePlaceCompleteness({
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

export function permanentlyClosed(): CanonicalPlace {
  const p = eligiblePlace();
  p.placeId = "mm_pub_closed";
  p.status = "permanently_closed";
  return p;
}

export function unknownPricePlace(): CanonicalPlace {
  const p = eligiblePlace();
  p.placeId = "mm_pub_noprice";
  p.commercial = { priceState: "unknown" };
  return p;
}

export function unknownHoursPlace(): CanonicalPlace {
  const p = eligiblePlace();
  p.placeId = "mm_pub_nohours";
  p.hours = { hoursState: "unknown" };
  return p;
}

export function unresolvedDuplicatePlace(): CanonicalPlace {
  const p = eligiblePlace();
  p.placeId = "mm_pub_dup";
  p.mergeState = { mergeStatus: "review_required", preservedSourceRefs: [] };
  return p;
}

export function safetyConflictPlace(): CanonicalPlace {
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
