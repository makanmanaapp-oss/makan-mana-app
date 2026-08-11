/** Phase 1.4 — pengesanan cawangan (jangan gabung rangkaian ikut jenama sahaja). */
import { DedupConfig, DEFAULT_DEDUP_CONFIG } from "./config";
import { geoProximity } from "./geo";
import { NormalizedIdentity } from "./identityNormalizer";
import { nameSimilarity, tokenSetSimilarity } from "./nameSimilarity";

export interface BranchAssessment {
  isLikelySeparateBranch: boolean;
  confidence: number;
  reasons: string[];
}

export function phonesOverlap(a: string[], b: string[]): boolean {
  return a.some((p) => b.includes(p));
}

export function hasExactIdentity(
  a: NormalizedIdentity,
  b: NormalizedIdentity,
): boolean {
  return (
    !!(a.providerPlaceId && a.providerPlaceId === b.providerPlaceId) ||
    !!(a.merchantRegistrationId &&
      a.merchantRegistrationId === b.merchantRegistrationId)
  );
}

export function assessBranch(
  a: NormalizedIdentity,
  b: NormalizedIdentity,
  config: DedupConfig = DEFAULT_DEDUP_CONFIG,
): BranchAssessment {
  const nameSim = nameSimilarity(a.normalizedName, b.normalizedName);
  const brandLikelySame = nameSim >= config.brandSameNameSimilarity;
  const geo = geoProximity(a, b, config.geoThresholds);
  const reasons: string[] = [];

  if (a.branchName && b.branchName && a.branchName !== b.branchName) {
    reasons.push("branch_name_differs");
  }
  if (a.postalCode && b.postalCode && a.postalCode !== b.postalCode) {
    reasons.push("postal_differs");
  }
  if (geo.valid && geo.distanceMeters > config.geoThresholds.moderateM) {
    reasons.push("coordinates_separated");
  }
  if (
    a.phoneDigits.length > 0 &&
    b.phoneDigits.length > 0 &&
    !phonesOverlap(a.phoneDigits, b.phoneDigits)
  ) {
    reasons.push("phone_differs");
  }
  if (a.providerPlaceId && b.providerPlaceId && a.providerPlaceId !== b.providerPlaceId) {
    reasons.push("provider_id_differs");
  }
  const addrSim = tokenSetSimilarity(a.addressTokens, b.addressTokens);
  if (
    a.addressTokens.length > 0 &&
    b.addressTokens.length > 0 &&
    addrSim < config.addressConflictMaxSimilarity
  ) {
    reasons.push("address_differs");
  }
  // Token nama unik (cth. locality "shah alam" vs "bangi") bila jenama sama.
  const uniqA = a.nameTokens.filter((t) => !b.nameTokens.includes(t));
  const uniqB = b.nameTokens.filter((t) => !a.nameTokens.includes(t));
  if (brandLikelySame && (uniqA.length > 0 || uniqB.length > 0)) {
    reasons.push("distinct_name_tokens");
  }

  const exactId = hasExactIdentity(a, b);
  // Telefon sepadan menindih "cawangan berbeza" — venue yang berpindah/dinamakan
  // semula MENGEKALKAN telefonnya. Halakan ke review (bukan pisah automatik).
  const phoneMatches =
    a.phoneDigits.length > 0 &&
    b.phoneDigits.length > 0 &&
    phonesOverlap(a.phoneDigits, b.phoneDigits);
  const isLikelySeparateBranch =
    brandLikelySame && reasons.length >= 1 && !exactId && !phoneMatches;
  const confidence = isLikelySeparateBranch
    ? Math.min(1, Math.round((reasons.length / 3) * 100) / 100)
    : 0;
  return { isLikelySeparateBranch, confidence, reasons };
}
