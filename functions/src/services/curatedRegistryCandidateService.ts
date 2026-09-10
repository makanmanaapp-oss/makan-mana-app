/**
 * MakanMana curated registry candidate source.
 *
 * Control Center master-registry places are first-party knowledge. Provider
 * discovery must not be the only way a published MakanMana place can enter the
 * recommendation pool. This reader is server-only and only accepts the ACTIVE
 * publication pointed to by place_publication_heads.
 *
 * Safety / honesty:
 * - unpublished / blocked / permanently-closed publications are excluded;
 * - exact haversine radius is authoritative;
 * - unknown ratings are represented as 0 (mobile hides 0.0), never fabricated;
 * - provider duplicates are removed via canonical aliases and a conservative
 *   same-name + very-close-coordinate fallback.
 */
import { db } from "../config/firebase";
import { haversineMeters } from "../domain/places/dedup/geo";
import { PlaceCandidate } from "../types/place";

const C_REGISTRY = "place_registry";
const C_HEAD = "place_publication_heads";
const C_PUB = "place_publications";
const C_ALIAS = "place_migration_aliases";
const MASTER_SOURCE = "makanmana_master_registry";
const MAX_REGISTRY_SCAN = 250;
const MAX_CURATED_IN_RADIUS = 80;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
}
function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [];
}

function priceLevelFromRange(value: unknown): number {
  const p = (str(value) ?? "").toLowerCase();
  if (!p) return 0;
  if (p.includes("budget") || p.includes("murah") || p.includes("low")) return 1;
  if (p.includes("mid") || p.includes("moderate") || p.includes("sederhana")) return 2;
  if (p.includes("premium") || p.includes("high")) return 3;
  if (p.includes("luxury") || p.includes("mewah")) return 4;
  return 0;
}

function normalizedName(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

function likelySamePhysicalPlace(a: PlaceCandidate, b: PlaceCandidate): boolean {
  if (normalizedName(a.name) !== normalizedName(b.name)) return false;
  if (typeof a.lat !== "number" || typeof a.lng !== "number" ||
      typeof b.lat !== "number" || typeof b.lng !== "number") return false;
  return haversineMeters(a.lat, a.lng, b.lat, b.lng) <= 120;
}

export interface CuratedCandidateReadResult {
  candidates: PlaceCandidate[];
  scannedRegistryCount: number;
  scanTruncated: boolean;
}

/** Read first-party published candidates inside the exact requested radius. */
export async function readPublishedCuratedCandidatesNear(opts: {
  lat: number;
  lng: number;
  radiusMeters: number;
}): Promise<CuratedCandidateReadResult> {
  const registrySnap = await db.collection(C_REGISTRY)
    .where("provenanceSource", "==", MASTER_SOURCE)
    .limit(MAX_REGISTRY_SCAN)
    .get();

  const scanTruncated = registrySnap.size >= MAX_REGISTRY_SCAN;
  const inRadius = registrySnap.docs
    .map((doc) => {
      const d = doc.data() ?? {};
      const lat = num(d.lat);
      const lng = num(d.lng);
      if (lat === null || lng === null) return null;
      if (str(d.lifecycleStatus) === "archived") return null;
      const distanceMeters = haversineMeters(opts.lat, opts.lng, lat, lng);
      if (distanceMeters > opts.radiusMeters) return null;
      return { canonicalId: doc.id, lat, lng, distanceMeters };
    })
    .filter((x): x is { canonicalId: string; lat: number; lng: number; distanceMeters: number } => x !== null)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, MAX_CURATED_IN_RADIUS);

  if (inRadius.length === 0) {
    return { candidates: [], scannedRegistryCount: registrySnap.size, scanTruncated };
  }

  const headSnaps = await db.getAll(...inRadius.map((x) => db.collection(C_HEAD).doc(x.canonicalId)));
  const publicationIds = headSnaps.map((head) => str(head.data()?.activePublicationId));
  const pubRefs = publicationIds.map((id) => id ? db.collection(C_PUB).doc(id) : null);
  const existingRefs = pubRefs.filter((ref): ref is NonNullable<typeof ref> => ref !== null);
  const pubSnaps = existingRefs.length > 0 ? await db.getAll(...existingRefs) : [];
  const pubById = new Map(pubSnaps.map((snap) => [snap.id, snap]));

  const candidates: PlaceCandidate[] = [];
  for (let i = 0; i < inRadius.length; i++) {
    const row = inRadius[i];
    const pubId = publicationIds[i];
    if (!pubId) continue;
    const pubSnap = pubById.get(pubId);
    if (!pubSnap?.exists) continue;
    const p = pubSnap.data() ?? {};
    if (p.publicationStatus !== "published" || p.blocked === true) continue;
    if (str(p.sourceCanonicalVersion) !== "control-center-master-v1") continue;

    const curated = obj(p.controlCenterCurated);
    const businessStatus = (str(p.controlCenterBusinessStatus) ?? str(curated.businessStatus) ?? "active").toLowerCase();
    if (businessStatus === "permanently_closed") continue;

    const title = str(p.title);
    const lat = num(p.lat);
    const lng = num(p.lng);
    if (!title || lat === null || lng === null) continue;
    const distanceMeters = haversineMeters(opts.lat, opts.lng, lat, lng);
    if (distanceMeters > opts.radiusMeters) continue;

    const cuisineTags = strings(curated.cuisineTags);
    const primaryCategory = str(curated.primaryCategory) ?? cuisineTags[0] ?? "Makanan";
    const priceRange = str(curated.priceRange) ?? "";
    const isOpen = businessStatus !== "temporarily_closed";

    candidates.push({
      placeId: row.canonicalId,
      canonicalPlaceId: row.canonicalId,
      dataSource: "canonical",
      name: title,
      cuisine: primaryCategory,
      emoji: "🍽️",
      rating: 0,
      userRatingCount: 0,
      priceLevel: priceLevelFromRange(priceRange),
      distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
      isOpen,
      address: str(p.address) ?? "",
      matchScore: 0,
      matchReasonKeys: [],
      negativeSignals: ["rating_unverified"],
      priceEstimate: priceRange,
      photoUrl: str(p.coverImageUrl),
      openingPeriods: null,
      lat,
      lng,
    });
  }

  return { candidates, scannedRegistryCount: registrySnap.size, scanTruncated };
}

export interface CuratedMergeResult extends CuratedCandidateReadResult {
  providerCount: number;
  duplicateProviderCount: number;
}

/**
 * Merge curated published records into a provider pool BEFORE scoring.
 * Curated records are placed first only as a deterministic source-order tie
 * breaker; the scoring engines still calculate the final algorithmic rank.
 */
export async function mergePublishedCuratedCandidates(
  providerCandidates: readonly PlaceCandidate[],
  opts: { lat: number; lng: number; radiusMeters: number },
): Promise<CuratedMergeResult> {
  const curatedRead = await readPublishedCuratedCandidatesNear(opts);
  if (curatedRead.candidates.length === 0) {
    return {
      ...curatedRead,
      candidates: [...providerCandidates],
      providerCount: providerCandidates.length,
      duplicateProviderCount: 0,
    };
  }

  const aliasSnaps = providerCandidates.length > 0
    ? await db.getAll(...providerCandidates.map((p) => db.collection(C_ALIAS).doc(p.placeId)))
    : [];
  const providerCanonicalIds = new Set<string>();
  providerCandidates.forEach((p, i) => {
    if (p.canonicalPlaceId) providerCanonicalIds.add(p.canonicalPlaceId);
    const target = str(aliasSnaps[i]?.data()?.canonicalPlaceId);
    if (target) providerCanonicalIds.add(target);
  });

  const curated = curatedRead.candidates.filter((c) => !providerCanonicalIds.has(c.canonicalPlaceId ?? c.placeId));
  const provider = providerCandidates.filter((p) => !curated.some((c) => likelySamePhysicalPlace(c, p)));
  const duplicateProviderCount = providerCandidates.length - provider.length +
    (curatedRead.candidates.length - curated.length);

  return {
    ...curatedRead,
    candidates: [...curated, ...provider],
    providerCount: providerCandidates.length,
    duplicateProviderCount,
  };
}
