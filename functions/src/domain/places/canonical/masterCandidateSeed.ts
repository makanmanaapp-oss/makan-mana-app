/**
 * Pure helpers for publishing a Control Center master place into the persistent
 * area candidate pool without fabricating provider facts.
 */
import { PlaceCandidate } from "../../../types/place";
import { haversineMeters } from "../dedup/geo";

export interface MasterCandidateSeedInput {
  canonicalPlaceId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  primaryCategory?: string | null;
  cuisineTags?: unknown[];
  businessStatus?: string | null;
  coverImageUrl?: string | null;
  priceRange?: string | null;
}

const SAME_PLACE_MAX_M = 50;

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Canonical-only records do not invent rating/review/price/opening facts.
 * Unknown numeric provider facts are represented as 0 and unknown hours follow
 * the existing recommendation convention (isOpen=true + no openingPeriods).
 */
export function buildMasterCandidateSeed(input: MasterCandidateSeedInput): PlaceCandidate {
  const cuisine = text(input.primaryCategory) ??
    input.cuisineTags?.map(text).find((v): v is string => Boolean(v)) ??
    "Restoran";
  const closed = input.businessStatus === "permanently_closed" ||
    input.businessStatus === "temporarily_closed";
  return {
    placeId: input.canonicalPlaceId,
    canonicalPlaceId: input.canonicalPlaceId,
    dataSource: "canonical",
    name: input.name,
    cuisine,
    emoji: "🍽️",
    rating: 0,
    userRatingCount: 0,
    priceLevel: 0,
    distanceKm: 0,
    isOpen: !closed,
    address: input.address ?? "",
    matchScore: 0,
    matchReasonKeys: [],
    priceEstimate: input.priceRange ?? "",
    photoUrl: input.coverImageUrl ?? null,
    openingPeriods: null,
    lat: input.lat,
    lng: input.lng,
  };
}

function likelySamePhysicalPlace(a: PlaceCandidate, b: PlaceCandidate): boolean {
  if (!a.name || !b.name || normalizeName(a.name) !== normalizeName(b.name)) return false;
  if (![a.lat, a.lng, b.lat, b.lng].every((v) => typeof v === "number" && Number.isFinite(v))) return false;
  return haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!) <= SAME_PLACE_MAX_M;
}

function isMatch(candidate: PlaceCandidate, seed: PlaceCandidate): boolean {
  return candidate.canonicalPlaceId === seed.canonicalPlaceId ||
    candidate.placeId === seed.placeId ||
    likelySamePhysicalPlace(candidate, seed);
}

function providerEvidence(candidate: PlaceCandidate, canonicalPlaceId: string): number {
  let score = candidate.placeId !== canonicalPlaceId ? 2 : 0;
  if (candidate.rating > 0 || candidate.userRatingCount > 0) score += 2;
  if (candidate.priceLevel > 0) score += 1;
  if (Array.isArray(candidate.openingPeriods) && candidate.openingPeriods.length > 0) score += 1;
  if (candidate.photoUrl) score += 1;
  return score;
}

/**
 * Upsert one canonical seed into a cell. If a stale/provider candidate for the
 * same physical place already exists, retain its honest rating/price/hours and
 * stable provider `placeId`, but overlay curated identity fields and canonical
 * authority. All matched duplicates are collapsed to one candidate.
 */
export function upsertMasterCandidateSeed(
  existing: readonly PlaceCandidate[],
  seed: PlaceCandidate,
): PlaceCandidate[] {
  const matchingIndexes: number[] = [];
  for (let i = 0; i < existing.length; i++) {
    if (isMatch(existing[i], seed)) matchingIndexes.push(i);
  }
  if (matchingIndexes.length === 0) return [...existing, seed];

  const firstIndex = matchingIndexes[0];
  const baseIndex = [...matchingIndexes].sort((a, b) =>
    providerEvidence(existing[b], seed.canonicalPlaceId ?? seed.placeId) -
    providerEvidence(existing[a], seed.canonicalPlaceId ?? seed.placeId),
  )[0];
  const base = existing[baseIndex];
  const merged: PlaceCandidate = {
    ...base,
    canonicalPlaceId: seed.canonicalPlaceId,
    dataSource: "canonical",
    name: seed.name,
    address: seed.address,
    cuisine: seed.cuisine || base.cuisine,
    // Curated media/price text may replace stale display metadata, while the
    // numeric provider price/rating facts above remain untouched.
    photoUrl: seed.photoUrl ?? base.photoUrl ?? null,
    priceEstimate: seed.priceEstimate || base.priceEstimate,
    lat: seed.lat,
    lng: seed.lng,
    // Explicit master closure wins; otherwise preserve provider live state.
    isOpen: seed.isOpen === false ? false : base.isOpen,
  };

  const matched = new Set(matchingIndexes);
  const out: PlaceCandidate[] = [];
  for (let i = 0; i < existing.length; i++) {
    if (i === firstIndex) out.push(merged);
    if (!matched.has(i)) out.push(existing[i]);
  }
  return out;
}
