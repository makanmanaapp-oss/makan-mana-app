/**
 * Phase 1.7 Part K — BARIS GILIR DISCOVERY & REFRESH (kontrak sahaja).
 *
 * TIADA panggilan Google Places dalam fasa ini. Baris gilir ini TIDAK PERNAH
 * menyekat bacaan kawasan: `getPublishedPlacesByArea` memulangkan liputan
 * yang telah diluluskan serta-merta dan hanya MENANDAKAN bahawa discovery
 * patut dijadualkan.
 */
import { EpochMillis } from "../common";
import { hashCanonical } from "../staging/hashing";

export const DISCOVERY_REASONS = [
  "empty_coverage",
  "low_coverage",
  "stale_coverage",
  "missing_category",
  "user_area_request",
  "scheduled_refresh",
  "critical_expiry",
] as const;
export type DiscoveryReason = (typeof DISCOVERY_REASONS)[number];

export const DISCOVERY_STATUSES = [
  "queued",
  "processing",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
] as const;
export type DiscoveryStatus = (typeof DISCOVERY_STATUSES)[number];

/** Skop pembekal — dideklarasikan sekarang, TIDAK dipanggil dalam fasa ini. */
export const PROVIDER_SCOPES = [
  "none",
  "provider_nearby",
  "provider_text_search",
  "licensed_dataset",
] as const;
export type ProviderScope = (typeof PROVIDER_SCOPES)[number];

export interface PlaceDiscoveryRequest {
  requestId: string;
  cellId: string;
  neighboringCellIds: string[];
  reason: DiscoveryReason;
  requestedAt: EpochMillis;
  /** Sistem pelayan yang meminta — BUKAN uid pengguna (tiada data peribadi). */
  requestedBySystem: string;
  priority: number;
  status: DiscoveryStatus;
  attemptCount: number;
  nextAttemptAt?: EpochMillis;
  lastErrorCode?: string;
  providerScope: ProviderScope;
  idempotencyKey: string;
}

/**
 * Kunci idempotency: sel + sebab + skop. Permintaan berulang untuk sel dan
 * sebab yang sama TIDAK mencipta entri baharu (Part K: "queue creation is
 * idempotent"). Sengaja TIDAK mengandungi masa.
 */
export function discoveryIdempotencyKey(
  cellId: string,
  reason: DiscoveryReason,
  providerScope: ProviderScope,
): string {
  return hashCanonical({ cellId, reason, providerScope }).slice(0, 32);
}

export function discoveryRequestId(idempotencyKey: string): string {
  return `dsc_${idempotencyKey}`;
}

export function buildDiscoveryRequest(params: {
  cellId: string;
  neighboringCellIds: string[];
  reason: DiscoveryReason;
  requestedAt: EpochMillis;
  requestedBySystem: string;
  priority: number;
  providerScope?: ProviderScope;
}): PlaceDiscoveryRequest {
  const providerScope = params.providerScope ?? "none";
  const idempotencyKey = discoveryIdempotencyKey(
    params.cellId,
    params.reason,
    providerScope,
  );
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
const QUEUE_ALLOWED: Record<DiscoveryStatus, DiscoveryStatus[]> = {
  queued: ["processing", "cancelled"],
  processing: ["completed", "partially_completed", "failed", "cancelled"],
  // Kegagalan boleh dicuba semula.
  failed: ["queued", "cancelled"],
  partially_completed: ["queued", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionDiscoveryStatus(
  from: DiscoveryStatus,
  to: DiscoveryStatus,
): boolean {
  if (from === to) return false;
  return (QUEUE_ALLOWED[from] ?? []).includes(to);
}

export function assertValidDiscoveryTransition(
  from: DiscoveryStatus,
  to: DiscoveryStatus,
): void {
  if (!canTransitionDiscoveryStatus(from, to)) {
    throw new Error(`invalid discovery transition: ${from} -> ${to}`);
  }
}
