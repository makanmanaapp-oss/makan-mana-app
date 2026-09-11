import {PlaceCandidate} from "../../../types/place";
import {haversineMeters} from "../dedup/geo";

const SAME_PLACE_EXACT_NAME_DISTANCE_M = 35;

/** Stable identity used on public discovery surfaces. */
export function canonicalCandidateKey(candidate: PlaceCandidate): string {
  return candidate.canonicalPlaceId?.trim() || candidate.placeId;
}

/**
 * A direct canonical candidate is a first-class MakanMana registry candidate,
 * not a provider record that was merely overlaid after retrieval.
 */
export function isDirectCanonicalCandidate(candidate: PlaceCandidate): boolean {
  const canonical = candidate.canonicalPlaceId?.trim();
  return Boolean(canonical && canonical === candidate.placeId);
}

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function exactNameNearby(a: PlaceCandidate, b: PlaceCandidate): boolean {
  if (normalized(a.name) !== normalized(b.name)) return false;
  if (typeof a.lat !== "number" || typeof a.lng !== "number" ||
      typeof b.lat !== "number" || typeof b.lng !== "number" ||
      !Number.isFinite(a.lat) || !Number.isFinite(a.lng) ||
      !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return false;
  return haversineMeters(a.lat, a.lng, b.lat, b.lng) <= SAME_PLACE_EXACT_NAME_DISTANCE_M;
}

/**
 * Dedupe provider/canonical aliases without changing unrelated ordering.
 * Prefer direct MakanMana registry identity. As a conservative safety net for a
 * provider copy discovered before an alias is written, exact normalized name +
 * <=35m is treated as the same premises only when one side is direct canonical.
 */
export function dedupeCanonicalCandidates(
  candidates: readonly PlaceCandidate[],
): PlaceCandidate[] {
  const out: PlaceCandidate[] = [];
  const indexByKey = new Map<string, number>();

  for (const candidate of candidates) {
    const key = canonicalCandidateKey(candidate);
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      const existing = out[existingIndex];
      if (isDirectCanonicalCandidate(candidate) && !isDirectCanonicalCandidate(existing)) {
        out[existingIndex] = candidate;
      }
      continue;
    }

    // Provider may be rediscovered before its alias is known. Do not fuzzy
    // match names: require exact normalized name, tight geo, and a direct
    // canonical side to avoid merging nearby branches.
    const nearDuplicateIndex = out.findIndex((existing) =>
      (isDirectCanonicalCandidate(existing) || isDirectCanonicalCandidate(candidate)) &&
      exactNameNearby(existing, candidate));
    if (nearDuplicateIndex >= 0) {
      const existing = out[nearDuplicateIndex];
      if (isDirectCanonicalCandidate(candidate) && !isDirectCanonicalCandidate(existing)) {
        out[nearDuplicateIndex] = candidate;
      }
      continue;
    }

    indexByKey.set(key, out.length);
    out.push(candidate);
  }

  return out;
}

/**
 * Server-side Explore search over the FULL retrieved pool (not only the first
 * 12 Flutter cards). Exact canonical-name matches are deterministic and first.
 */
export function searchCanonicalCandidates(
  candidates: readonly PlaceCandidate[],
  query: string,
): PlaceCandidate[] {
  const q = normalized(query);
  if (!q) return [...candidates];

  return candidates
    .map((candidate, index) => {
      const name = normalized(candidate.name);
      const cuisine = normalized(candidate.cuisine);
      const address = normalized(candidate.address);
      const exactName = name === q;
      const startsName = name.startsWith(q);
      const matches = exactName || startsName || name.includes(q) || cuisine.includes(q) || address.includes(q);
      return {candidate, index, exactName, startsName, matches};
    })
    .filter((row) => row.matches)
    .sort((left, right) => {
      if (left.exactName !== right.exactName) return left.exactName ? -1 : 1;
      if (left.startsName !== right.startsName) return left.startsName ? -1 : 1;
      const leftDirect = isDirectCanonicalCandidate(left.candidate);
      const rightDirect = isDirectCanonicalCandidate(right.candidate);
      if (leftDirect !== rightDirect) return leftDirect ? -1 : 1;
      const scoreGap = right.candidate.matchScore - left.candidate.matchScore;
      if (scoreGap !== 0) return scoreGap;
      const distanceGap = left.candidate.distanceKm - right.candidate.distanceKm;
      if (distanceGap !== 0) return distanceGap;
      return left.index - right.index;
    })
    .map((row) => row.candidate);
}
