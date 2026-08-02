/** Phase 1.2 — kelayakan penerbitan (helper tulen; TIADA tulisan). */
import { isNonEmptyString, isValidLatLng } from "./common";
import { PlaceStatus, VerificationStatus } from "./placeEnums";
import { CanonicalPlace } from "./canonicalPlace";

/** Ambang minimum completeness untuk terbit (PDF §10.2: < 0.60 = tahan). */
export const MIN_PUBLICATION_COMPLETENESS = 0.6;
/** >= 0.80 = terbitan standard; 0.60–0.79 = perlu label unknown + kelulusan. */
export const STANDARD_PUBLICATION_COMPLETENESS = 0.8;

export const ALLOWED_VERIFICATION_FOR_PUBLICATION: VerificationStatus[] = [
  "source_verified",
  "merchant_verified",
  "admin_verified",
  "community_reported",
];

export const BLOCKED_PLACE_STATUSES: PlaceStatus[] = [
  "permanently_closed",
  "hidden_by_admin",
  "pending_validation",
  "stale_critical",
];

export interface PublicationEligibility {
  eligible: boolean;
  /** ID sebab kanonikal (kenapa tidak layak). */
  reasons: string[];
  /** ID amaran kanonikal (layak tetapi perlu label jujur). */
  warnings: string[];
}

function identityComplete(place: CanonicalPlace): boolean {
  return (
    isNonEmptyString(place.identity.canonicalName) &&
    isNonEmptyString(place.identity.normalizedName)
  );
}

function isMergedAway(place: CanonicalPlace): boolean {
  const m = place.mergeState;
  return (
    m.mergeStatus === "merged" ||
    m.mergeStatus === "superseded" ||
    isNonEmptyString(m.duplicateOf)
  );
}

/**
 * Nilai kelayakan terbit. Layak HANYA bila: published + verification
 * dibenarkan + status tidak disekat + identiti lengkap + lokasi sah + tidak
 * digabung + completeness >= ambang. Semua ambang ialah pemalar (bukan nombor
 * ajaib tersembunyi).
 */
export function evaluatePublicationEligibility(
  place: CanonicalPlace,
): PublicationEligibility {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (place.publicationStatus !== "published") reasons.push("not_published");

  if (place.verificationStatus === "rejected") {
    reasons.push("verification_rejected");
  } else if (
    !ALLOWED_VERIFICATION_FOR_PUBLICATION.includes(place.verificationStatus)
  ) {
    reasons.push("verification_not_allowed");
  }

  if (BLOCKED_PLACE_STATUSES.includes(place.status)) {
    reasons.push("status_blocked");
  }
  if (place.status === "community_unverified") {
    warnings.push("community_evidence_only");
  }

  if (!identityComplete(place)) reasons.push("identity_incomplete");
  if (!isValidLatLng(place.location.lat, place.location.lng)) {
    reasons.push("location_invalid");
  }
  if (isMergedAway(place)) reasons.push("merged_into_other");

  const overall = place.completeness.overallScore;
  if (overall < MIN_PUBLICATION_COMPLETENESS) {
    reasons.push("completeness_below_threshold");
  } else if (overall < STANDARD_PUBLICATION_COMPLETENESS) {
    warnings.push("completeness_needs_labels");
  }

  if (place.verificationStatus === "community_reported") {
    warnings.push("community_evidence_only");
  }
  if (place.hours.hoursState !== "known") warnings.push("hours_unknown");
  if (place.commercial.priceState === "unknown") warnings.push("price_unknown");

  return {
    eligible: reasons.length === 0,
    reasons: Array.from(new Set(reasons)),
    warnings: Array.from(new Set(warnings)),
  };
}
