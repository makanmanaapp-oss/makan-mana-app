/** Phase 1.4 — band keputusan + peraturan khas (safety-first). */
import { DedupConfig, DEFAULT_DEDUP_CONFIG } from "./config";
import { DuplicateSignalSet } from "./duplicateSignals";
import { computeDuplicateScore } from "./duplicateScoring";

export const DUPLICATE_DECISIONS = [
  "exact_duplicate",
  "auto_link_source",
  "review_required",
  "possible_duplicate",
  "separate_place",
  "likely_separate_branch",
] as const;
export type DuplicateDecision = (typeof DUPLICATE_DECISIONS)[number];

export interface DuplicateDecisionResult {
  decision: DuplicateDecision;
  score: number;
  reasons: string[];
  warnings: string[];
  matchedBy: string[];
}

function num(v: number | boolean): number {
  return typeof v === "boolean" ? (v ? 1 : 0) : v;
}

/** Peta skor mentah → band (rujuk PDF §8.2). */
export function scoreBand(
  score: number,
  config: DedupConfig = DEFAULT_DEDUP_CONFIG,
): "exact" | "review" | "possible" | "separate" {
  if (score >= config.bands.exact) return "exact";
  if (score >= config.bands.review) return "review";
  if (score >= config.bands.possible) return "possible";
  return "separate";
}

/**
 * Precedence (safety-first):
 * 1. Identiti tepat (provider/merchant) + tiada konflik telefon → auto_link.
 * 2. Identiti tepat + konflik telefon → review_required (telefon menyekat).
 * 3. Bukti cawangan berbeza → likely_separate_branch (blok auto-merge).
 * 4. Telefon sah sepadan + nama jenama sama → review_required (korroborasi).
 * 5. "Nama sahaja" → possible_duplicate maksimum.
 * 6. Band skor berpemberat (dengan penurunan konflik koordinat).
 */
export function evaluateDuplicateDecision(
  signals: DuplicateSignalSet,
  config: DedupConfig = DEFAULT_DEDUP_CONFIG,
): DuplicateDecisionResult {
  const score = computeDuplicateScore(signals, config).adjustedScore;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const matchedBy: string[] = [];

  const providerExact = !!num(signals.exactProviderIdMatch.value);
  const merchantExact = !!num(signals.exactMerchantRegistrationIdMatch.value);
  const phoneMatch = !!num(signals.verifiedPhoneMatch.value);
  const phoneConflict = !!num(signals.phoneConflict.value);
  const coordConflict = !!num(signals.coordinateConflict.value);
  const branchSep = !!num(signals.differentBranchIndicator.value);
  const nameSim = num(signals.normalizedNameSimilarity.value);
  const geoSim = num(signals.geoProximity.value);
  const addrSim = num(signals.addressSimilarity.value);
  const postalMatch = !!num(signals.postalCodeMatch.value);
  const domainMatch = !!num(signals.websiteDomainMatch.value);

  if (providerExact) matchedBy.push("provider_id");
  if (merchantExact) matchedBy.push("merchant_id");
  if (phoneMatch) matchedBy.push("phone");
  if (geoSim >= 0.85) matchedBy.push("geo");
  if (addrSim >= config.brandSameNameSimilarity) matchedBy.push("address");
  if (nameSim >= config.brandSameNameSimilarity) matchedBy.push("name");
  if (domainMatch) matchedBy.push("website");
  if (postalMatch) matchedBy.push("postal");

  // 1 & 2 — identiti tepat.
  const exactIdentity = providerExact || merchantExact;
  if (exactIdentity && !phoneConflict) {
    reasons.push("exact_identity_match");
    return {
      decision: "auto_link_source",
      score: Math.max(score, config.bands.exact),
      reasons,
      warnings,
      matchedBy,
    };
  }
  if (exactIdentity && phoneConflict) {
    warnings.push("exact_id_but_phone_conflict");
    reasons.push("phone_conflict_blocks_auto_link");
    return { decision: "review_required", score, reasons, warnings, matchedBy };
  }

  // 3 — cawangan berbeza.
  if (branchSep) {
    reasons.push("different_branch_evidence");
    return { decision: "likely_separate_branch", score, reasons, warnings, matchedBy };
  }

  if (phoneConflict) warnings.push("phone_conflict");

  // 4a — telefon sepadan + LOKASI sama (walau nama berbeza) → review.
  //       Menangkap "dinamakan semula / berpindah" di premis sama.
  if (phoneMatch && !phoneConflict && geoSim >= 0.85) {
    reasons.push("phone_and_location_corroboration");
    if (nameSim < config.brandSameNameSimilarity) {
      warnings.push("possible_rename_or_moved");
    }
    return {
      decision: "review_required",
      score: Math.max(score, config.bands.review),
      reasons,
      warnings,
      matchedBy,
    };
  }

  // 4b — telefon sepadan + nama jenama sama (mungkin tanpa koordinat) → review.
  if (phoneMatch && !phoneConflict && nameSim >= config.brandSameNameSimilarity) {
    reasons.push("phone_and_name_corroboration");
    const corroborators = [
      geoSim >= 0.85,
      addrSim >= config.brandSameNameSimilarity,
      postalMatch,
      domainMatch,
    ].filter(Boolean).length;
    return {
      decision: "review_required",
      score: Math.max(score, config.bands.review + corroborators * 0.02),
      reasons,
      warnings,
      matchedBy,
    };
  }

  // 5 — nama sahaja → possible maksimum.
  const hasNonNameStrong =
    phoneMatch || geoSim >= 0.85 || addrSim >= config.brandSameNameSimilarity ||
    domainMatch || postalMatch;
  if (nameSim >= config.nameOnlyMinSimilarity && !hasNonNameStrong) {
    reasons.push("name_only_similarity");
    return {
      decision: "possible_duplicate",
      score: Math.min(score, config.bands.review - 0.001),
      reasons,
      warnings,
      matchedBy,
    };
  }

  // 6 — band skor berpemberat.
  const band = scoreBand(score, config);
  if (band === "exact") {
    if (coordConflict) {
      warnings.push("coordinate_conflict");
      reasons.push("far_coordinates");
      return { decision: "review_required", score, reasons, warnings, matchedBy };
    }
    warnings.push("no_exact_id_needs_review");
    reasons.push("very_high_weighted_score");
    return { decision: "exact_duplicate", score, reasons, warnings, matchedBy };
  }
  if (band === "review") {
    reasons.push("high_weighted_score");
    return { decision: "review_required", score, reasons, warnings, matchedBy };
  }
  if (band === "possible") {
    reasons.push("moderate_weighted_score");
    return { decision: "possible_duplicate", score, reasons, warnings, matchedBy };
  }
  reasons.push("low_weighted_score");
  return { decision: "separate_place", score, reasons, warnings, matchedBy };
}
