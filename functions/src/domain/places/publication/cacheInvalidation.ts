/**
 * Phase 1.6 Part K — KONTRAK SIGNAL INVALIDASI CACHE.
 *
 * KONTRAK SAHAJA + storan emulator. TIADA invalidasi cache LANGSUNG dalam
 * fasa ini — tiada cache produksi disentuh, tiada penerbitan mobile.
 */
import { EpochMillis } from "../common";
import { hashCanonical } from "../staging/hashing";

/** Sebab invalidasi kanonikal. */
export const CACHE_INVALIDATION_REASONS = [
  "publication_created",
  "publication_superseded",
  "rollback_executed",
  "business_status_changed",
  "critical_freshness_expired",
  "merge_executed",
  "tag_set_changed",
  "media_changed",
  "location_moved",
] as const;
export type CacheInvalidationReason = (typeof CACHE_INVALIDATION_REASONS)[number];

/**
 * Skop yang terjejas. `coverage_pool` & `area_feed` dirujuk oleh Phase 1.7
 * (Shared Place Database) — kami mengisytiharkan kontraknya sekarang tetapi
 * TIDAK menyambungkannya.
 */
export const CACHE_INVALIDATION_SCOPES = [
  "place_card",
  "place_detail",
  "coverage_pool",
  "area_feed",
  "search_index",
  "suggestion_pool",
] as const;
export type CacheInvalidationScope = (typeof CACHE_INVALIDATION_SCOPES)[number];

export interface PlaceCacheInvalidationEvent {
  eventId: string;
  placeId: string;
  reason: CacheInvalidationReason;
  affectedScopes: CacheInvalidationScope[];
  publicationVersion?: number;
  /** Diisi oleh Phase 1.7 apabila kolam liputan wujud. */
  coveragePoolVersion?: string;
  createdAt: EpochMillis;
  algorithmVersion: string;
}

/**
 * Pemetaan lalai sebab → skop terjejas. Deterministik dan didokumenkan supaya
 * Phase 1.7 boleh bergantung padanya tanpa meneka.
 */
export const DEFAULT_SCOPES_BY_REASON: Record<
  CacheInvalidationReason,
  CacheInvalidationScope[]
> = {
  publication_created: ["place_card", "place_detail", "coverage_pool", "search_index"],
  publication_superseded: ["place_card", "place_detail", "coverage_pool", "search_index"],
  rollback_executed: ["place_card", "place_detail", "coverage_pool", "search_index"],
  business_status_changed: [
    "place_card",
    "place_detail",
    "coverage_pool",
    "suggestion_pool",
  ],
  critical_freshness_expired: ["place_card", "place_detail", "suggestion_pool"],
  merge_executed: ["place_card", "place_detail", "coverage_pool", "search_index", "area_feed"],
  tag_set_changed: ["place_card", "search_index", "suggestion_pool"],
  media_changed: ["place_card", "place_detail"],
  location_moved: ["place_card", "place_detail", "coverage_pool", "area_feed"],
};

/** ID peristiwa deterministik (idempoten untuk sebab+versi yang sama). */
export function cacheInvalidationEventId(
  placeId: string,
  reason: CacheInvalidationReason,
  publicationVersion: number | undefined,
  algorithmVersion: string,
): string {
  const digest = hashCanonical({ placeId, reason, publicationVersion, algorithmVersion });
  return `inv_${digest.slice(0, 32)}`;
}

export function buildCacheInvalidationEvent(params: {
  placeId: string;
  reason: CacheInvalidationReason;
  createdAt: EpochMillis;
  algorithmVersion: string;
  publicationVersion?: number;
  coveragePoolVersion?: string;
  scopes?: CacheInvalidationScope[];
}): PlaceCacheInvalidationEvent {
  const affectedScopes = params.scopes ?? DEFAULT_SCOPES_BY_REASON[params.reason];
  return {
    eventId: cacheInvalidationEventId(
      params.placeId,
      params.reason,
      params.publicationVersion,
      params.algorithmVersion,
    ),
    placeId: params.placeId,
    reason: params.reason,
    affectedScopes: [...affectedScopes],
    publicationVersion: params.publicationVersion,
    coveragePoolVersion: params.coveragePoolVersion,
    createdAt: params.createdAt,
    algorithmVersion: params.algorithmVersion,
  };
}
