import {createHash} from "node:crypto";

export interface AiBrainControlCenterRecord extends Record<string, unknown> {
  user_ref: string;
  brain_version: number;
  schema_version?: number;
  privacy_version?: number;
  confidence_overall?: number;
  insufficient_data: boolean;
  source_event_count: number;
  source_meal_count: number;
  preferred_distance_km?: number;
  preferred_price_level?: number;
  common_reject_reasons: Record<string, number>;
  top_cuisines: Record<string, number>;
  avoided_cuisines: Record<string, number>;
  preferred_time_slots: Record<string, number>;
  event_window_days?: number;
  meal_window_days?: number;
  last_calculated_at?: string;
  reset_boundary_at?: string;
  source_updated_at?: string;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nonNegativeInt(value: unknown): number {
  const n = finiteNumber(value);
  return n === undefined ? 0 : Math.max(0, Math.trunc(n));
}

function boundedMap(value: unknown, maxEntries = 20): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, maxEntries)) {
    const n = finiteNumber(child);
    if (n !== undefined && n >= 0) out[key.slice(0, 80)] = n;
  }
  return out;
}

function toEpochMs(value: unknown): number | undefined {
  const direct = finiteNumber(value);
  if (direct !== undefined && direct > 0) return direct;
  if (value && typeof (value as {toMillis?: () => number}).toMillis === "function") {
    const parsed = (value as {toMillis: () => number}).toMillis();
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function isoFromMs(value: unknown): string | undefined {
  const ms = toEpochMs(value);
  return ms === undefined ? undefined : new Date(ms).toISOString();
}

function firstIso(...values: unknown[]): string | undefined {
  for (const value of values) {
    const iso = isoFromMs(value);
    if (iso) return iso;
  }
  return undefined;
}

/**
 * Stable non-reversible admin reference. Firebase UID never leaves the backend
 * in the operational profile mirror.
 */
export function aiBrainUserRef(uid: string): string {
  return `fb_${createHash("sha256").update(uid, "utf8").digest("hex").slice(0, 32)}`;
}

/**
 * Privacy-minimised operational projection for Control Center.
 * Explicit allow-list: recent place IDs, moods, raw events, health/allergy data,
 * receipts, GPS and tokens are intentionally never included.
 */
export function sanitizeAiBrainProfile(
  uid: string,
  data: Record<string, unknown>,
): AiBrainControlCenterRecord {
  const confidence = data.confidence && typeof data.confidence === "object" && !Array.isArray(data.confidence)
    ? data.confidence as Record<string, unknown>
    : {};
  const sourceUpdatedAt = firstIso(
    data.lastCalculatedAtMs,
    data.lastCalculatedAt,
    data.resetAtMs,
    data.resetAt,
  );
  const record: AiBrainControlCenterRecord = {
    user_ref: aiBrainUserRef(uid),
    brain_version: nonNegativeInt(data.brainVersion),
    insufficient_data: data.insufficientData !== false,
    source_event_count: nonNegativeInt(data.sourceEventCount),
    source_meal_count: nonNegativeInt(data.sourceMealCount),
    common_reject_reasons: boundedMap(data.commonRejectReasons),
    top_cuisines: boundedMap(data.learnedTopCuisines ?? data.topCuisines),
    avoided_cuisines: boundedMap(data.learnedAvoidedCuisines ?? data.avoidedCuisines),
    preferred_time_slots: boundedMap(data.preferredTimeSlots),
  };

  const schemaVersion = finiteNumber(data.schemaVersion);
  const privacyVersion = finiteNumber(data.privacyVersion);
  const overall = finiteNumber(confidence.overall);
  const preferredDistance = finiteNumber(data.preferredDistanceKm);
  const preferredPrice = finiteNumber(data.preferredPriceLevel);
  const eventWindow = finiteNumber(data.eventWindowDays);
  const mealWindow = finiteNumber(data.mealWindowDays);
  const lastCalculated = firstIso(data.lastCalculatedAtMs, data.lastCalculatedAt);
  const resetBoundary = firstIso(data.resetBoundaryMs, data.resetAtMs, data.resetAt);

  if (schemaVersion !== undefined) record.schema_version = Math.max(0, Math.trunc(schemaVersion));
  if (privacyVersion !== undefined) record.privacy_version = Math.max(0, Math.trunc(privacyVersion));
  if (overall !== undefined) record.confidence_overall = Math.max(0, Math.min(1, overall));
  if (preferredDistance !== undefined && preferredDistance >= 0) record.preferred_distance_km = preferredDistance;
  if (preferredPrice !== undefined && preferredPrice >= 0) {
    record.preferred_price_level = Math.max(0, Math.min(4, Math.trunc(preferredPrice)));
  }
  if (eventWindow !== undefined && eventWindow > 0) record.event_window_days = Math.trunc(eventWindow);
  if (mealWindow !== undefined && mealWindow > 0) record.meal_window_days = Math.trunc(mealWindow);
  if (lastCalculated) record.last_calculated_at = lastCalculated;
  if (resetBoundary) record.reset_boundary_at = resetBoundary;
  if (sourceUpdatedAt) record.source_updated_at = sourceUpdatedAt;

  return record;
}
