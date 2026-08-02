/**
 * Phase 1.7 Part M — KONTRAK CACHE KAWASAN (emulator sahaja).
 *
 * PDF §5.3: "Card cache key mesti termasuk coveragePoolVersion."
 *
 * Kunci cache MESTI mengandungi sel + baldi radius + penapis kanonikal +
 * versi kolam liputan gabungan. Latitud/longitud MENTAH tidak pernah menjadi
 * kunci penuh — itu akan menghasilkan kunci yang hampir unik bagi setiap
 * pengguna dan memusnahkan perkongsian (matlamat Shared Place Database).
 */
import { EpochMillis } from "../common";
import { hashCanonical } from "../staging/hashing";
import { CoveragePoolSource } from "./coverageMembership";

/**
 * Baldi radius (meter). Radius sebenar dibundarkan KE ATAS ke baldi terdekat
 * untuk kunci cache; penapisan jarak TEPAT tetap berlaku selepas cache dibaca,
 * jadi pembundaran ini tidak pernah memulangkan kedai di luar radius.
 */
export const RADIUS_BUCKETS_M = [500, 1000, 2000, 3000, 5000, 10_000, 20_000] as const;

export function radiusBucket(radiusMeters: number): number {
  for (const b of RADIUS_BUCKETS_M) {
    if (radiusMeters <= b) return b;
  }
  return RADIUS_BUCKETS_M[RADIUS_BUCKETS_M.length - 1];
}

/** Penapis kanonikal yang menyumbang kepada identiti cache. */
export interface AreaCacheFilters {
  requiredPlaceTypes?: string[];
  requiredCuisineTags?: string[];
  includeTemporarilyClosed?: boolean;
}

/** Hash penapis — bebas susunan (senarai diisih dahulu). */
export function filterHash(filters: AreaCacheFilters): string {
  return hashCanonical({
    placeTypes: [...(filters.requiredPlaceTypes ?? [])].sort(),
    cuisines: [...(filters.requiredCuisineTags ?? [])].sort(),
    includeTemporarilyClosed: filters.includeTemporarilyClosed === true,
  }).slice(0, 16);
}

export interface AreaPlaceCacheEntry {
  cacheKey: string;
  centerCellId: string;
  queriedCellIds: string[];
  radiusBucket: number;
  filterHash: string;
  publicationPoolVersion: string;
  placeIds: string[];
  publicationIds: string[];
  generatedAt: EpochMillis;
  expiresAt: EpochMillis;
  sourceMode: CoveragePoolSource;
}

/**
 * Bina kunci cache. Komponen: sel pusat + baldi radius + hash penapis +
 * versi kolam liputan. Perubahan versi liputan menghasilkan kunci BERBEZA,
 * jadi entri lama tidak pernah dipulangkan selepas liputan berubah.
 */
export function buildAreaCacheKey(params: {
  centerCellId: string;
  radiusMeters: number;
  filters: AreaCacheFilters;
  publicationPoolVersion: string;
}): string {
  const bucket = radiusBucket(params.radiusMeters);
  const fh = filterHash(params.filters);
  const digest = hashCanonical({
    cell: params.centerCellId,
    bucket,
    filters: fh,
    pool: params.publicationPoolVersion,
  }).slice(0, 32);
  return `ac_${params.centerCellId}_${bucket}_${fh}_${digest}`;
}

/** TTL lalai cache kawasan (emulator sahaja) — 15 minit. */
export const AREA_CACHE_TTL_MS = 15 * 60 * 1000;

export function buildAreaCacheEntry(params: {
  centerCellId: string;
  queriedCellIds: string[];
  radiusMeters: number;
  filters: AreaCacheFilters;
  publicationPoolVersion: string;
  placeIds: string[];
  publicationIds: string[];
  generatedAt: EpochMillis;
  sourceMode: CoveragePoolSource;
  ttlMs?: number;
}): AreaPlaceCacheEntry {
  const bucket = radiusBucket(params.radiusMeters);
  return {
    cacheKey: buildAreaCacheKey({
      centerCellId: params.centerCellId,
      radiusMeters: params.radiusMeters,
      filters: params.filters,
      publicationPoolVersion: params.publicationPoolVersion,
    }),
    centerCellId: params.centerCellId,
    queriedCellIds: [...params.queriedCellIds],
    radiusBucket: bucket,
    filterHash: filterHash(params.filters),
    publicationPoolVersion: params.publicationPoolVersion,
    placeIds: [...params.placeIds],
    publicationIds: [...params.publicationIds],
    generatedAt: params.generatedAt,
    expiresAt: params.generatedAt + (params.ttlMs ?? AREA_CACHE_TTL_MS),
    sourceMode: params.sourceMode,
  };
}

/** Entri sah HANYA bila belum luput DAN versi kolam masih sepadan. */
export function isCacheEntryUsable(
  entry: AreaPlaceCacheEntry,
  currentPoolVersion: string,
  now: EpochMillis,
): boolean {
  if (entry.publicationPoolVersion !== currentPoolVersion) return false;
  return now < entry.expiresAt;
}
