"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluatePublicationEligibility = evaluatePublicationEligibility;
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
const common_1 = require("../common");
const eligibilityConfig_1 = require("./eligibilityConfig");
const freshnessPolicy_1 = require("./freshnessPolicy");
const freshnessEvaluator_1 = require("./freshnessEvaluator");
/** Petakan `place.freshness` (Phase 1.2) → input penilai Phase 1.6. */
function freshnessInputsFromPlace(place) {
    const out = {};
    const f = place.freshness;
    for (const key of Object.keys(f)) {
        const input = (0, freshnessEvaluator_1.fromLegacyFieldFreshness)(f[key]);
        if (input)
            out[key] = input;
    }
    return out;
}
function checkIdentity(place) {
    return ((0, common_1.isNonEmptyString)(place.placeId) &&
        (0, common_1.isNonEmptyString)(place.identity.canonicalName) &&
        (0, common_1.isNonEmptyString)(place.identity.normalizedName));
}
function checkConflicts(place, ctx) {
    const m = place.mergeState;
    const isMergedAway = m.mergeStatus === "merged" ||
        m.mergeStatus === "superseded" ||
        (0, common_1.isNonEmptyString)(m.duplicateOf);
    const unresolvedFromState = m.mergeStatus === "possible_duplicate" ||
        m.mergeStatus === "review_required" ||
        m.mergeStatus === "split_required";
    return {
        hasUnresolvedDuplicate: ctx.hasUnresolvedDuplicate === true || unresolvedFromState,
        isMergedAway,
        mergeStatus: m.mergeStatus,
    };
}
function checkSafety(place, ctx, freshness) {
    const conflictCodes = [...(ctx.safetyConflictCodes ?? [])];
    const s = place.safetyEvidence;
    // Konflik dalaman yang boleh dikesan secara deterministik: mendakwa halal
    // certified sambil turut menandakan kemungkinan bukan-halal.
    if (s.halal.state === "certified" &&
        s.dietaryReported.includes("non_halal")) {
        conflictCodes.push("halal_certified_vs_non_halal_report");
    }
    const halalExpired = freshness.fieldResults.halalEvidence.expired;
    const allergenExpired = freshness.fieldResults.allergenEvidence.expired;
    const allergenDataIncomplete = s.allergenEvidenceLevel === "unknown" ||
        s.allergenReported.length === 0 ||
        allergenExpired;
    return {
        hasUnresolvedSafetyConflict: conflictCodes.length > 0,
        allergenDataIncomplete,
        halalRecheckRequired: halalExpired && s.halal.state === "certified",
        conflictCodes: Array.from(new Set(conflictCodes)),
    };
}
function checkMedia(place) {
    const { canonicalMediaId, items } = place.media;
    if (!canonicalMediaId)
        return true; // tiada media = sah (fallback kad)
    const canonical = items.find((i) => i.mediaId === canonicalMediaId);
    if (!canonical)
        return false; // menunjuk ke media yang tidak wujud
    // Media canonical mesti diluluskan; fallback mesti ditanda jujur.
    if (canonical.status !== "approved")
        return false;
    if (!canonical.isFallback && !(0, common_1.isNonEmptyString)(canonical.url))
        return false;
    return true;
}
/**
 * Nilai kelayakan penerbitan SEPENUHNYA.
 *
 * `eligible` benar HANYA bila `blockingReasons` kosong. Amaran TIDAK PERNAH
 * menyekat — ia mewajibkan label jujur pada kad (Phase 1.9).
 */
function evaluatePublicationEligibility(place, ctx) {
    const config = ctx.config ?? eligibilityConfig_1.DEFAULT_ELIGIBILITY_CONFIG;
    const registry = ctx.policyRegistry ?? freshnessPolicy_1.DEFAULT_FRESHNESS_POLICY_REGISTRY;
    const t = config.thresholds;
    const blockingReasons = [];
    const warnings = [];
    const requiredActions = [];
    // ---- Freshness ----
    const freshnessInputs = ctx.freshnessInputs ?? freshnessInputsFromPlace(place);
    const freshnessResult = (0, freshnessEvaluator_1.evaluatePlaceFreshness)(freshnessInputs, ctx.now, registry);
    // ---- Status ----
    const statusResult = {
        status: place.status,
        publishable: !config.nonPublishableStatuses.includes(place.status),
        permanentlyClosed: place.status === "permanently_closed",
    };
    // ---- Verification ----
    const verificationResult = {
        verificationStatus: place.verificationStatus,
        allowed: config.publishableVerifications.includes(place.verificationStatus),
        rejected: place.verificationStatus === "rejected",
    };
    // ---- Completeness ----
    const overallScore = place.completeness.overallScore;
    const completenessResult = {
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
    }
    else if (!statusResult.publishable) {
        blockingReasons.push("invalid_business_status");
    }
    // 3. Verification.
    if (verificationResult.rejected) {
        blockingReasons.push("verification_rejected");
        requiredActions.push("revalidate_verification");
    }
    else if (!verificationResult.allowed) {
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
    if (!(0, common_1.isValidLatLng)(place.location.lat, place.location.lng)) {
        blockingReasons.push("invalid_location");
        requiredActions.push("fix_location");
    }
    // 7. Completeness.
    if (!completenessResult.meetsMinimum) {
        blockingReasons.push("below_minimum_completeness");
        requiredActions.push("improve_completeness");
    }
    else if (!completenessResult.meetsStandard) {
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
    const missingProvenance = t.requiredProvenanceFields.filter((f) => place.provenance[f] === undefined);
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
        }
        else {
            warnings.push("unknown_price");
        }
    }
    else if (place.commercial.priceState === "estimated") {
        warnings.push("estimated_price");
    }
    if (place.hours.hoursState !== "known" || freshnessResult.fieldResults.openingHours.expired) {
        if (t.unknownHoursBlocksPublication) {
            blockingReasons.push("invalid_business_status");
        }
        else {
            warnings.push("unknown_hours");
        }
    }
    if (freshnessResult.fieldResults.rating.stale)
        warnings.push("stale_rating");
    const reviewCount = place.quality.reviewCount;
    if (typeof reviewCount !== "number" ||
        reviewCount < t.minReviewCountForStrongEvidence) {
        warnings.push("low_review_evidence");
    }
    if (place.status === "community_unverified" ||
        place.verificationStatus === "community_reported") {
        warnings.push("community_reported_status");
    }
    if (safetyResult.allergenDataIncomplete)
        warnings.push("incomplete_allergen_data");
    if (safetyResult.halalRecheckRequired)
        warnings.push("halal_evidence_recheck");
    const hasInferredTag = place.tagSet.tags.some((tg) => tg.evidenceLevel === "inferred" || tg.confidence < t.minTagConfidenceForApproved);
    if (hasInferredTag)
        warnings.push("inferred_tags");
    // Medan stale bukan-kritikal → amaran umum (bukan sekatan).
    const nonCriticalStale = freshnessResult.staleFieldIds.filter((f) => registry[f].criticality !== "critical");
    if (nonCriticalStale.length > 0)
        warnings.push("stale_non_critical_field");
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
