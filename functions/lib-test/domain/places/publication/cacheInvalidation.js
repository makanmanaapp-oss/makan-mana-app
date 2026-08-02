"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SCOPES_BY_REASON = exports.CACHE_INVALIDATION_SCOPES = exports.CACHE_INVALIDATION_REASONS = void 0;
exports.cacheInvalidationEventId = cacheInvalidationEventId;
exports.buildCacheInvalidationEvent = buildCacheInvalidationEvent;
const hashing_1 = require("../staging/hashing");
/** Sebab invalidasi kanonikal. */
exports.CACHE_INVALIDATION_REASONS = [
    "publication_created",
    "publication_superseded",
    "rollback_executed",
    "business_status_changed",
    "critical_freshness_expired",
    "merge_executed",
    "tag_set_changed",
    "media_changed",
    "location_moved",
];
/**
 * Skop yang terjejas. `coverage_pool` & `area_feed` dirujuk oleh Phase 1.7
 * (Shared Place Database) — kami mengisytiharkan kontraknya sekarang tetapi
 * TIDAK menyambungkannya.
 */
exports.CACHE_INVALIDATION_SCOPES = [
    "place_card",
    "place_detail",
    "coverage_pool",
    "area_feed",
    "search_index",
    "suggestion_pool",
];
/**
 * Pemetaan lalai sebab → skop terjejas. Deterministik dan didokumenkan supaya
 * Phase 1.7 boleh bergantung padanya tanpa meneka.
 */
exports.DEFAULT_SCOPES_BY_REASON = {
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
function cacheInvalidationEventId(placeId, reason, publicationVersion, algorithmVersion) {
    const digest = (0, hashing_1.hashCanonical)({ placeId, reason, publicationVersion, algorithmVersion });
    return `inv_${digest.slice(0, 32)}`;
}
function buildCacheInvalidationEvent(params) {
    const affectedScopes = params.scopes ?? exports.DEFAULT_SCOPES_BY_REASON[params.reason];
    return {
        eventId: cacheInvalidationEventId(params.placeId, params.reason, params.publicationVersion, params.algorithmVersion),
        placeId: params.placeId,
        reason: params.reason,
        affectedScopes: [...affectedScopes],
        publicationVersion: params.publicationVersion,
        coveragePoolVersion: params.coveragePoolVersion,
        createdAt: params.createdAt,
        algorithmVersion: params.algorithmVersion,
    };
}
