import {PlaceCandidate} from "../../../types/place";

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

/**
 * Dedupe provider/canonical aliases without changing unrelated ordering.
 * When two rows resolve to the same canonical identity, prefer the direct
 * MakanMana registry candidate so stale provider data cannot replace curated
 * identity/location data. Safety/ranking still decides where the identity sits.
 */
export function dedupeCanonicalCandidates(
  candidates: readonly PlaceCandidate[],
): PlaceCandidate[] {
  const out: PlaceCandidate[] = [];
  const indexByKey = new Map<string, number>();

  for (const candidate of candidates) {
    const key = canonicalCandidateKey(candidate);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, out.length);
      out.push(candidate);
      continue;
    }

    const existing = out[existingIndex];
    if (isDirectCanonicalCandidate(candidate) && !isDirectCanonicalCandidate(existing)) {
      out[existingIndex] = candidate;
    }
  }

  return out;
}

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
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
