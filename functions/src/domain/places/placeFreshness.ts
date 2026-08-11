/** Phase 1.2 — freshness per-medan + helper tulen (masa disuntik). */
import { EpochMillis } from "./common";
import { FreshnessState } from "./placeEnums";

export interface FieldFreshness {
  fetchedAt?: EpochMillis;
  verifiedAt?: EpochMillis;
  /** Ambang mula "aging/stale" (epoch ms). */
  staleAfter?: EpochMillis;
  /** Ambang "expired" (epoch ms). */
  expiresAt?: EpochMillis;
  state: FreshnessState;
}

/** Medan yang mempunyai freshness bebas (rujuk PDF §11). */
export const FRESHNESS_FIELDS = [
  "businessStatus",
  "openingHours",
  "rating",
  "reviewCount",
  "price",
  "images",
  "address",
  "location",
  "tags",
  "merchantData",
] as const;
export type FreshnessField = (typeof FRESHNESS_FIELDS)[number];

export type PlaceFreshness = {
  [K in FreshnessField]?: FieldFreshness;
};

/**
 * Helper tulen deterministik. `now` disuntik (tiada `Date.now()` dalaman).
 *
 * Peraturan:
 * - `fetchedAt` tiada                         -> "unknown"
 * - `staleAfter` DAN `expiresAt` kedua tiada  -> "unknown"
 * - `now >= expiresAt`                         -> "expired"
 * - `now >= staleAfter`:
 *     - tiada `expiresAt`                      -> "stale"
 *     - `now` sebelum titik tengah [staleAfter,expiresAt] -> "aging"
 *     - selepas titik tengah                   -> "stale"
 * - selainnya (`now < staleAfter`, atau hanya `expiresAt` & belum luput)
 *                                              -> "fresh"
 */
export function calculateFreshnessState(
  now: EpochMillis,
  fetchedAt?: EpochMillis,
  staleAfter?: EpochMillis,
  expiresAt?: EpochMillis,
): FreshnessState {
  if (fetchedAt === undefined) return "unknown";
  if (staleAfter === undefined && expiresAt === undefined) return "unknown";
  if (expiresAt !== undefined && now >= expiresAt) return "expired";
  if (staleAfter !== undefined && now >= staleAfter) {
    if (expiresAt === undefined) return "stale";
    const midpoint = staleAfter + (expiresAt - staleAfter) / 2;
    return now < midpoint ? "aging" : "stale";
  }
  return "fresh";
}
