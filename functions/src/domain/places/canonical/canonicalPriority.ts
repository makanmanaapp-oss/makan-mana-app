/**
 * Recommendation precedence for authoritative place data.
 *
 * Product rule:
 * - published/validated canonical candidates sit ahead of legacy/provider-only
 *   candidates;
 * - the recommendation algorithm STILL owns ordering inside each tier.
 *
 * This is intentionally a stable partition, not a new score. Therefore a
 * curated place never receives a fabricated score boost and Algorithm 2's
 * relative order among curated places remains untouched.
 */
import { PlaceCandidate } from "../../../types/place";

/** Only a candidate explicitly resolved/seeded as canonical is authoritative. */
export function isCanonicalCandidate(candidate: PlaceCandidate): boolean {
  return candidate.dataSource === "canonical" &&
    typeof candidate.canonicalPlaceId === "string" &&
    candidate.canonicalPlaceId.trim().length > 0;
}

/**
 * Stable canonical-first partition. Input is assumed to already be algorithm-
 * ranked; order inside the canonical and legacy tiers is preserved exactly.
 */
export function prioritizeCanonicalCandidates(
  candidates: readonly PlaceCandidate[],
): PlaceCandidate[] {
  if (candidates.length < 2) return [...candidates];
  const canonical: PlaceCandidate[] = [];
  const legacy: PlaceCandidate[] = [];
  for (const candidate of candidates) {
    (isCanonicalCandidate(candidate) ? canonical : legacy).push(candidate);
  }
  if (canonical.length === 0 || legacy.length === 0) return [...candidates];
  return [...canonical, ...legacy];
}
