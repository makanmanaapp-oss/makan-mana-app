/** Phase 1.4 — set isyarat duplikat deterministik. */
import { EvidenceLevel } from "../placeEnums";
import { DedupConfig, DEFAULT_DEDUP_CONFIG } from "./config";
import { geoProximity } from "./geo";
import { NormalizedIdentity } from "./identityNormalizer";
import { nameSimilarity, tokenSetSimilarity } from "./nameSimilarity";
import { assessBranch, phonesOverlap } from "./branchDetection";

export interface DuplicateSignal {
  value: number | boolean;
  confidence: number; // 0..1
  evidence: EvidenceLevel;
  source: string;
  explanationCode: string;
}

export interface DuplicateSignalSet {
  exactProviderIdMatch: DuplicateSignal;
  exactMerchantRegistrationIdMatch: DuplicateSignal;
  verifiedPhoneMatch: DuplicateSignal;
  websiteDomainMatch: DuplicateSignal;
  normalizedNameSimilarity: DuplicateSignal;
  addressSimilarity: DuplicateSignal;
  postalCodeMatch: DuplicateSignal;
  geoProximity: DuplicateSignal;
  sameBranchIndicator: DuplicateSignal;
  differentBranchIndicator: DuplicateSignal;
  sourceAgreement: DuplicateSignal;
  coordinateConflict: DuplicateSignal;
  phoneConflict: DuplicateSignal;
  addressConflict: DuplicateSignal;
}

function sig(
  value: number | boolean,
  confidence: number,
  evidence: EvidenceLevel,
  source: string,
  explanationCode: string,
): DuplicateSignal {
  return { value, confidence, evidence, source, explanationCode };
}

export function computeSignals(
  a: NormalizedIdentity,
  b: NormalizedIdentity,
  config: DedupConfig = DEFAULT_DEDUP_CONFIG,
): DuplicateSignalSet {
  const providerMatch = !!(a.providerPlaceId && a.providerPlaceId === b.providerPlaceId);
  const merchantMatch = !!(a.merchantRegistrationId && a.merchantRegistrationId === b.merchantRegistrationId);
  const phoneMatch = a.phoneDigits.length > 0 && b.phoneDigits.length > 0 && phonesOverlap(a.phoneDigits, b.phoneDigits);
  const phoneConflict = a.phoneDigits.length > 0 && b.phoneDigits.length > 0 && !phoneMatch;
  const domainMatch = !!(a.websiteDomain && a.websiteDomain === b.websiteDomain);
  const nameSim = nameSimilarity(a.normalizedName, b.normalizedName);
  // Alamat kosong pada mana-mana pihak = TIADA padanan (bukan "sama-sama kosong").
  const addrSim =
    a.addressTokens.length > 0 && b.addressTokens.length > 0
      ? tokenSetSimilarity(a.addressTokens, b.addressTokens)
      : 0;
  const postalMatch = !!(a.postalCode && b.postalCode && a.postalCode === b.postalCode);
  const geo = geoProximity(a, b, config.geoThresholds);
  const coordConflict = geo.valid && geo.distanceMeters > config.farCoordBlockM;
  const addrConflict =
    a.addressTokens.length > 0 &&
    b.addressTokens.length > 0 &&
    addrSim < config.addressConflictMaxSimilarity;
  const branch = assessBranch(a, b, config);

  // Persetujuan sumber: pecahan isyarat kuat yang tersedia & sepadan.
  const strong: Array<{ available: boolean; matched: boolean }> = [
    { available: !!(a.providerPlaceId && b.providerPlaceId), matched: providerMatch },
    { available: !!(a.merchantRegistrationId && b.merchantRegistrationId), matched: merchantMatch },
    { available: a.phoneDigits.length > 0 && b.phoneDigits.length > 0, matched: phoneMatch },
    { available: !!(a.websiteDomain && b.websiteDomain), matched: domainMatch },
    { available: geo.valid, matched: geo.geoSimilarity >= 0.85 },
  ];
  const availCount = strong.filter((s) => s.available).length;
  const matchCount = strong.filter((s) => s.available && s.matched).length;
  const agreement = availCount > 0 ? Math.round((matchCount / availCount) * 100) / 100 : 0;

  return {
    exactProviderIdMatch: sig(providerMatch, providerMatch ? 1 : 0.9, "verified", "provider", "provider_id_exact"),
    exactMerchantRegistrationIdMatch: sig(merchantMatch, merchantMatch ? 1 : 0.9, "verified", "merchant", "merchant_id_exact"),
    verifiedPhoneMatch: sig(phoneMatch, phoneMatch ? 0.9 : 0.5, "verified", "phone", "phone_match"),
    websiteDomainMatch: sig(domainMatch, 0.7, "reported", "website", "domain_match"),
    normalizedNameSimilarity: sig(nameSim, 0.6, "reported", "name", "name_similarity"),
    addressSimilarity: sig(addrSim, 0.6, "reported", "address", "address_similarity"),
    postalCodeMatch: sig(postalMatch, 0.7, "reported", "address", "postal_match"),
    geoProximity: sig(geo.geoSimilarity, geo.valid ? 0.7 : 0, "reported", "geo", "geo_proximity"),
    sameBranchIndicator: sig(!branch.isLikelySeparateBranch, 0.5, "inferred", "branch", "same_branch"),
    differentBranchIndicator: sig(branch.isLikelySeparateBranch, branch.confidence, "inferred", "branch", "different_branch"),
    sourceAgreement: sig(agreement, 0.6, "inferred", "aggregate", "source_agreement"),
    coordinateConflict: sig(coordConflict, 0.7, "inferred", "geo", "coordinate_conflict"),
    phoneConflict: sig(phoneConflict, 0.8, "inferred", "phone", "phone_conflict"),
    addressConflict: sig(addrConflict, 0.6, "inferred", "address", "address_conflict"),
  };
}
