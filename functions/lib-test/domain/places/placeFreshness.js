"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FRESHNESS_FIELDS = void 0;
exports.calculateFreshnessState = calculateFreshnessState;
/** Medan yang mempunyai freshness bebas (rujuk PDF §11). */
exports.FRESHNESS_FIELDS = [
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
];
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
function calculateFreshnessState(now, fetchedAt, staleAfter, expiresAt) {
    if (fetchedAt === undefined)
        return "unknown";
    if (staleAfter === undefined && expiresAt === undefined)
        return "unknown";
    if (expiresAt !== undefined && now >= expiresAt)
        return "expired";
    if (staleAfter !== undefined && now >= staleAfter) {
        if (expiresAt === undefined)
            return "stale";
        const midpoint = staleAfter + (expiresAt - staleAfter) / 2;
        return now < midpoint ? "aging" : "stale";
    }
    return "fresh";
}
