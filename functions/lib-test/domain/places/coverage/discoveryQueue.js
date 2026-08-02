"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROVIDER_SCOPES = exports.DISCOVERY_STATUSES = exports.DISCOVERY_REASONS = void 0;
exports.discoveryIdempotencyKey = discoveryIdempotencyKey;
exports.discoveryRequestId = discoveryRequestId;
exports.buildDiscoveryRequest = buildDiscoveryRequest;
exports.canTransitionDiscoveryStatus = canTransitionDiscoveryStatus;
exports.assertValidDiscoveryTransition = assertValidDiscoveryTransition;
const hashing_1 = require("../staging/hashing");
exports.DISCOVERY_REASONS = [
    "empty_coverage",
    "low_coverage",
    "stale_coverage",
    "missing_category",
    "user_area_request",
    "scheduled_refresh",
    "critical_expiry",
];
exports.DISCOVERY_STATUSES = [
    "queued",
    "processing",
    "completed",
    "partially_completed",
    "failed",
    "cancelled",
];
/** Skop pembekal — dideklarasikan sekarang, TIDAK dipanggil dalam fasa ini. */
exports.PROVIDER_SCOPES = [
    "none",
    "provider_nearby",
    "provider_text_search",
    "licensed_dataset",
];
/**
 * Kunci idempotency: sel + sebab + skop. Permintaan berulang untuk sel dan
 * sebab yang sama TIDAK mencipta entri baharu (Part K: "queue creation is
 * idempotent"). Sengaja TIDAK mengandungi masa.
 */
function discoveryIdempotencyKey(cellId, reason, providerScope) {
    return (0, hashing_1.hashCanonical)({ cellId, reason, providerScope }).slice(0, 32);
}
function discoveryRequestId(idempotencyKey) {
    return `dsc_${idempotencyKey}`;
}
function buildDiscoveryRequest(params) {
    const providerScope = params.providerScope ?? "none";
    const idempotencyKey = discoveryIdempotencyKey(params.cellId, params.reason, providerScope);
    return {
        requestId: discoveryRequestId(idempotencyKey),
        cellId: params.cellId,
        neighboringCellIds: [...params.neighboringCellIds],
        reason: params.reason,
        requestedAt: params.requestedAt,
        requestedBySystem: params.requestedBySystem,
        priority: params.priority,
        status: "queued",
        attemptCount: 0,
        providerScope,
        idempotencyKey,
    };
}
/** Peralihan status baris gilir yang dibenarkan. */
const QUEUE_ALLOWED = {
    queued: ["processing", "cancelled"],
    processing: ["completed", "partially_completed", "failed", "cancelled"],
    // Kegagalan boleh dicuba semula.
    failed: ["queued", "cancelled"],
    partially_completed: ["queued", "cancelled"],
    completed: [],
    cancelled: [],
};
function canTransitionDiscoveryStatus(from, to) {
    if (from === to)
        return false;
    return (QUEUE_ALLOWED[from] ?? []).includes(to);
}
function assertValidDiscoveryTransition(from, to) {
    if (!canTransitionDiscoveryStatus(from, to)) {
        throw new Error(`invalid discovery transition: ${from} -> ${to}`);
    }
}
