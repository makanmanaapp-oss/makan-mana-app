/**
 * Phase 1.6 Part G — ENJIN KELAYAKAN PENERBITAN (lengkap).
 *
 * Menggantikan helper asas Phase 1.2 (`evaluatePublicationEligibility` dalam
 * placePublication.ts) dengan penilai penuh yang menggabungkan completeness,
 * freshness, konflik, keselamatan, status dan verification.
 *
 * TULEN — tiada I/O, masa disuntik. Helper ini TIDAK menerbitkan apa-apa;
 * ia hanya MENILAI. Penerbitan sebenar dikawal repository (Part L).
 */
import { isNonEmptyString, isValidLatLng } from "../common";
import { CanonicalPlace } from "../canonicalPlace";
import { EpochMillis } from "../common";
import {
  BlockingReason,
  DEFAULT_ELIGIBILITY_CONFIG,
  EligibilityConfig,
  RequiredAction,
  WarningReason,
} from "./eligibilityConfig";
import {
  DEFAULT_FRESHNESS_POLICY_REGISTRY,
  FreshnessPolicyField,
  FreshnessPolicyRegistry,
} from "./freshnessPolicy";
import {
  evaluatePlaceFreshness,
  fromLegacyFieldFreshness,
  PlaceFreshnessInputMap,
  PlaceFreshnessResult,
} from "./freshnessEvaluator";

export interface CompletenessCheckResult {
  overallScore: number;
  meetsMinimum: boolean;
  meetsStandard: boolean;
}

export interface ConflictCheckResult {
  hasUnresolvedDuplicate: boolean;
  isMergedAway: boolean;
  mergeStatus: string;
}

export interface SafetyCheckResult {
  hasUnresolvedSafetyConflict: boolean;
  allergenDataIncomplete: boolean;
  halalRecheckRequired: boolean;
  conflictCodes: string[];
}

export interface StatusCheckResult {
  status: string;
  publishable: boolean;
  permanentlyClosed: boolean;
}

export interface VerificationCheckResult {
  verificationStatus: string;
  allowed: boolean;
  rejected: boolean;
}

export interface PublicationEligibilityResult {
  eligible: boolean;
  blockingReasons: BlockingReason[];
  warnings: WarningReason[];
  requiredActions: RequiredAction[];
  completenessResult: CompletenessCheckResult;
  freshnessResult: PlaceFreshnessResult;
  conflictResult: ConflictCheckResult;
  safetyResult: SafetyCheckResult;
  statusResult: StatusCheckResult;
  verificationResult: VerificationCheckResult;
  version: string;
}

/** Konteks penilaian — masa DISUNTIK, polisi & konfigurasi boleh diganti. */
export interface EligibilityContext {
  now: EpochMillis;
  config?: EligibilityConfig;
  policyRegistry?: FreshnessPolicyRegistry;
  /** Input freshness eksplisit; jika tiada, diambil dari `place.freshness`. */
  freshnessInputs?: PlaceFreshnessInputMap;
  /** Ditetapkan oleh enjin dedup (Phase 1.4) bila calon belum diselesaikan. */
  hasUnresolvedDuplicate?: boolean;
  /** Konflik keselamatan belum selesai (cth. halal vs bukan-halal). */
  safetyConflictCodes?: string[];
  /** ID tag yang TIDAK diluluskan/tidak dikenali oleh registri Phase 1.5. */
  unapprovedTagIds?: string[];
}

/** Petakan `place.freshness` (Phase 1.2) → input penilai Phase 1.6. */
function freshnessInputsFromPlace(place: CanonicalPlace): PlaceFreshnessInputMap {
  const out: PlaceFreshnessInputMap = {};
  const f = place.freshness as Record<string, unknown>;
  for (const key of Object.keys(f)) {
    const input = fromLegacyFieldFreshness(
      f[key] as Parameters<typeof fromLegacyFieldFreshness>[0],
    );
    if (input) out[key as FreshnessPolicyField] = input;
  }
  return out;
}

function checkIdentity(place: CanonicalPlace): boolean {
  return (
    isNonEmptyString(place.placeId) &&
    isNonEmptyString(place.identity.canonicalName) &&
    isNonEmptyString(place.identity.normalizedName)
  );
}

function checkConflicts(
  place: CanonicalPlace,
  ctx: EligibilityContext,
): ConflictCheckResult {
  const m = place.mergeState;
  const isMergedAway =
    m.mergeStatus === "merged" ||
    m.mergeStatus === "superseded" ||
    isNonEmptyString(m.duplicateOf);
  const unresolvedFromState =
    m.mergeStatus === "possible_duplicate" ||
    m.mergeStatus === "review_required" ||
    m.mergeStatus === "split_required";
  return {
    hasUnresolvedDuplicate: ctx.hasUnresolvedDuplicate === true || unresolvedFromState,
    isMergedAway,
    mergeStatus: m.mergeStatus,
  };
}

function checkSafety(
  place: CanonicalPlace,
  ctx: EligibilityContext,
  freshness: PlaceFreshnessResult,
): SafetyCheckResult {
  const conflictCodes = [...(ctx.safetyConflictCodes ?? [])];
  const s = place.safetyEvidence;

  // Konflik dalaman yang boleh dikesan secara deterministik: mendakwa halal
  // certified sambil turut menandakan kemungkinan bukan-halal.
  if (
    s.halal.state === "certified" &&
    s.dietaryReported.includes("non_halal")
  ) {
    conflictCodes.push("halal_certified_vs_non_halal_report");
  }

  const halalExpired = freshness.fieldResults.halalEvidence.expired;
  const allergenExpired = freshness.fieldResults.allergenEvidence.expired;
  const allergenDataIncomplete =
    s.allergenEvidenceLevel === "unknown" ||
    s.allergenReported.length === 0 ||
    allergenExpired;

  return {
    hasUnresolvedSafetyConflict: conflictCodes.length > 0,
    allergenDataIncomplete,
    halalRecheckRequired: halalExpired && s.halal.state === "certified",
    conflictCodes: Array.from(new Set(conflictCodes)),
  };
}

function checkMedia(place: CanonicalPlace): boolean {
  const { canonicalMediaId, items } = place.media;
  if (!canonicalMediaId) return true; // tiada media = sah (fallback kad)
  const canonical = items.find((i) => i.mediaId === canonicalMediaId);
  if (!canonical) return false; // menunjuk ke media yang tidak wujud
  // Media canonical mesti diluluskan; fallback mesti ditanda jujur.
  if (canonical.status !== "approved") return false;
  if (!canonical.isFallback && !isNonEmptyString(canonical.url)) return false;
  return true;
}

/**
 * Nilai kelayakan penerbitan SEPENUHNYA.
 *
 * `eligible` benar HANYA bila `blockingReasons` kosong. Amaran TIDAK PERNAH
 * menyekat — ia mewajibkan label jujur pada kad (Phase 1.9).
 */
export function evaluatePublicationEligibility(
  place: CanonicalPlace,
  ctx: EligibilityContext,
): PublicationEligibilityResult {
  const config = ctx.config ?? DEFAULT_ELIGIBILITY_CONFIG;
  const registry = ctx.policyRegistry ?? DEFAULT_FRESHNESS_POLICY_REGISTRY;
  const t = config.thresholds;

  const blockingReasons: BlockingReason[] = [];
  const warnings: WarningReason[] = [];
  const requiredActions: RequiredAction[] = [];

  // ---- Freshness ----
  const freshnessInputs = ctx.freshnessInputs ?? freshnessInputsFromPlace(place);
  const freshnessResult = evaluatePlaceFreshness(freshnessInputs, ctx.now, registry);

  // ---- Status ----
  const statusResult: StatusCheckResult = {
    status: place.status,
    publishable: !config.nonPublishableStatuses.includes(place.status),
    permanentlyClosed: place.status === "permanently_closed",
  };

  // ---- Verification ----
  const verificationResult: VerificationCheckResult = {
    verificationStatus: place.verificationStatus,
    allowed: config.publishableVerifications.includes(place.verificationStatus),
    rejected: place.verificationStatus === "rejected",
  };

  // ---- Completeness ----
  const overallScore = place.completeness.overallScore;
  const completenessResult: CompletenessCheckResult = {
    overallScore,
    meetsMinimum: overallScore >= t.minCompleteness,
    meetsStandard: overallScore >= t.standardCompleteness,
  };

  // ---- Konflik & keselamatan ----
  const conflictResult = checkConflicts(place, ctx);
  const safetyResult = checkSafety(place, ctx, freshnessResult);

  // ================= SEKATAN =================

  // 1. Belum diluluskan. "approved" TIDAK sama dengan "published": rekod
  //    mesti sekurang-kurangnya approved sebelum layak diterbitkan.
  if (place.publicationStatus !== "approved" && place.publicationStatus !== "published") {
    blockingReasons.push("not_approved");
    requiredActions.push("approve_record");
  }

  // 2. Status perniagaan tidak sah untuk penerbitan.
  if (statusResult.permanentlyClosed) {
    blockingReasons.push("permanently_closed");
  } else if (!statusResult.publishable) {
    blockingReasons.push("invalid_business_status");
  }

  // 3. Verification.
  if (verificationResult.rejected) {
    blockingReasons.push("verification_rejected");
    requiredActions.push("revalidate_verification");
  } else if (!verificationResult.allowed) {
    blockingReasons.push("verification_not_allowed");
    requiredActions.push("revalidate_verification");
  }

  // 4. Alias digabung/superseded — tidak boleh terbit sebagai entiti sendiri.
  if (conflictResult.isMergedAway) {
    blockingReasons.push("merged_or_superseded_alias");
  }

  // 5. Identiti stabil.
  if (!checkIdentity(place)) {
    blockingReasons.push("missing_stable_identity");
    requiredActions.push("fix_identity");
  }

  // 6. Lokasi.
  if (!isValidLatLng(place.location.lat, place.location.lng)) {
    blockingReasons.push("invalid_location");
    requiredActions.push("fix_location");
  }

  // 7. Completeness.
  if (!completenessResult.meetsMinimum) {
    blockingReasons.push("below_minimum_completeness");
    requiredActions.push("improve_completeness");
  } else if (!completenessResult.meetsStandard) {
    warnings.push("completeness_needs_labels");
  }

  // 8. Duplikat belum selesai.
  if (conflictResult.hasUnresolvedDuplicate) {
    blockingReasons.push("unresolved_duplicate");
    requiredActions.push("resolve_duplicate");
  }

  // 9. Konflik keselamatan belum selesai.
  if (safetyResult.hasUnresolvedSafetyConflict) {
    blockingReasons.push("unresolved_safety_conflict");
    requiredActions.push("resolve_safety_conflict");
  }

  // 10. Freshness kritikal luput.
  if (freshnessResult.publicationBlocked) {
    blockingReasons.push("expired_critical_freshness");
    requiredActions.push("refresh_critical_fields");
  }

  // 11. Provenance wajib.
  const missingProvenance = t.requiredProvenanceFields.filter(
    (f) => (place.provenance as Record<string, unknown>)[f] === undefined,
  );
  if (missingProvenance.length > 0) {
    blockingReasons.push("missing_required_provenance");
    requiredActions.push("attach_provenance");
  }

  // 12. Tag tidak sah/tidak diluluskan.
  if ((ctx.unapprovedTagIds?.length ?? 0) > 0) {
    blockingReasons.push("invalid_or_unapproved_tags");
    requiredActions.push("review_tags");
  }

  // 13. Keadaan media/fallback tidak sah.
  if (!checkMedia(place)) {
    blockingReasons.push("invalid_media_fallback_state");
    requiredActions.push("review_media");
  }

  // ================= AMARAN =================

  if (place.commercial.priceState === "unknown") {
    if (t.unknownPriceBlocksPublication) {
      blockingReasons.push("invalid_business_status");
    } else {
      warnings.push("unknown_price");
    }
  } else if (place.commercial.priceState === "estimated") {
    warnings.push("estimated_price");
  }

  if (place.hours.hoursState !== "known" || freshnessResult.fieldResults.openingHours.expired) {
    if (t.unknownHoursBlocksPublication) {
      blockingReasons.push("invalid_business_status");
    } else {
      warnings.push("unknown_hours");
    }
  }

  if (freshnessResult.fieldResults.rating.stale) warnings.push("stale_rating");

  const reviewCount = place.quality.reviewCount;
  if (
    typeof reviewCount !== "number" ||
    reviewCount < t.minReviewCountForStrongEvidence
  ) {
    warnings.push("low_review_evidence");
  }

  if (
    place.status === "community_unverified" ||
    place.verificationStatus === "community_reported"
  ) {
    warnings.push("community_reported_status");
  }

  if (safetyResult.allergenDataIncomplete) warnings.push("incomplete_allergen_data");
  if (safetyResult.halalRecheckRequired) warnings.push("halal_evidence_recheck");

  const hasInferredTag = place.tagSet.tags.some(
    (tg) => tg.evidenceLevel === "inferred" || tg.confidence < t.minTagConfidenceForApproved,
  );
  if (hasInferredTag) warnings.push("inferred_tags");

  // Medan stale bukan-kritikal → amaran umum (bukan sekatan).
  const nonCriticalStale = freshnessResult.staleFieldIds.filter(
    (f) => registry[f].criticality !== "critical",
  );
  if (nonCriticalStale.length > 0) warnings.push("stale_non_critical_field");

  return {
    eligible: blockingReasons.length === 0,
    blockingReasons: Array.from(new Set(blockingReasons)),
    warnings: Array.from(new Set(warnings)),
    requiredActions: Array.from(new Set(requiredActions)),
    completenessResult,
    freshnessResult,
    conflictResult,
    safetyResult,
    statusResult,
    verificationResult,
    version: config.engineVersion,
  };
}
