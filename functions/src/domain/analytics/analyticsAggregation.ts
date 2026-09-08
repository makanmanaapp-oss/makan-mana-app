/**
 * WAVE 6 — Merchant Analytics: deterministic aggregation.
 *
 * Pure functions. No Firestore, no clock, no randomness: the same events in
 * always produce the same counters out, which is what makes a reconciliation
 * job able to REPAIR drift rather than merely overwrite it with a second guess.
 *
 * Day bucketing is Asia/Kuala_Lumpur, the business timezone the rest of the
 * backend already schedules against. A merchant asking "how did Tuesday go"
 * means their Tuesday, not UTC's.
 */
import {
  DEDUPED_PER_USER_PER_DAY,
  EVENT_TO_METRIC,
  MAX_RANGE_DAYS,
  emptyCounters,
  type DailyAnalyticsCounters,
  type TrackedMetric,
} from "./analyticsTypes";

/** The business day boundary. Everything user-facing is expressed in it. */
export const BUSINESS_TIMEZONE = "Asia/Kuala_Lumpur";
const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;

/** `yyyy-mm-dd` in the business timezone. */
export function businessDayKey(epochMs: number): string {
  const shifted = new Date(epochMs + BUSINESS_UTC_OFFSET_MINUTES * 60_000);
  const y = shifted.getUTCFullYear();
  const m = `${shifted.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${shifted.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** First instant of a business day, as epoch ms. */
export function businessDayStartMs(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - BUSINESS_UTC_OFFSET_MINUTES * 60_000;
}

export function isDayKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

/** Inclusive list of day keys. Bounded: an unbounded range is a refusal. */
export function dayKeysBetween(fromDay: string, toDay: string): string[] {
  if (!isDayKey(fromDay) || !isDayKey(toDay)) throw new Error("range_invalid");
  const start = businessDayStartMs(fromDay);
  const end = businessDayStartMs(toDay);
  if (end < start) throw new Error("range_inverted");
  const days = Math.round((end - start) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) throw new Error("range_too_large");
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(businessDayKey(start + i * 86_400_000 + 12 * 3_600_000));
  return out;
}

/** One raw event as stored in `events/{eventId}` (see lib/models/event_log.dart). */
export interface RawAnalyticsEvent {
  eventId: string;
  eventType?: unknown;
  userId?: unknown;
  placeId?: unknown;
  isSample?: unknown;
  isPreview?: unknown;
  sourceMode?: unknown;
  clientTimestamp?: unknown;
  serverTimestampMs?: unknown;
  metadata?: unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Should this event count at all?
 *
 * Rejects, in order: events with no metric, sample/demo data, previews, and
 * anything the client marked as a background or system-originated render. A
 * carousel that pre-builds three cards off-screen has not shown a merchant to
 * anybody, and neither has the mock data we display before the first real
 * suggestion returns.
 */
export function isCountableEvent(event: RawAnalyticsEvent): boolean {
  const type = text(event.eventType);
  if (!EVENT_TO_METRIC[type]) return false;
  if (!text(event.placeId)) return false;
  if (event.isSample === true) return false;
  if (event.isPreview === true) return false;
  const mode = text(event.sourceMode);
  if (mode === "sample" || mode === "preview" || mode === "system") return false;
  const meta = (event.metadata && typeof event.metadata === "object")
    ? event.metadata as Record<string, unknown> : {};
  // An impression must be a RENDERED, VISIBLE one. The client asserts this
  // explicitly; anything that does not assert it is not counted.
  if (type === "promotion_impression" && meta.visible !== true) return false;
  if (meta.background === true || meta.preload === true) return false;
  return true;
}

/** When did it happen, in server terms? Server stamp wins; client is fallback. */
export function eventOccurredAtMs(event: RawAnalyticsEvent, nowMs: number): number {
  const server = typeof event.serverTimestampMs === "number" ? event.serverTimestampMs : 0;
  if (server > 0) return server;
  const client = typeof event.clientTimestamp === "number" ? event.clientTimestamp : 0;
  // A client clock far in the future is not trusted to define a business day.
  if (client > 0 && client <= nowMs + 3_600_000) return client;
  return nowMs;
}

export interface AggregationInput {
  events: RawAnalyticsEvent[];
  nowMs: number;
}

export interface PlaceDayBucket {
  canonicalPlaceId: string;
  dayKey: string;
  counters: DailyAnalyticsCounters;
  /** eventIds folded in — the idempotency ledger for this bucket. */
  eventIds: string[];
  /** Distinct users seen, for sample-size decisions. Never emitted downstream. */
  distinctUsers: number;
}

/**
 * Fold raw events into per-place, per-day counters.
 *
 * Idempotent twice over: a repeated eventId is ignored, and view-class metrics
 * are additionally deduplicated per user per place per day, so the same person
 * reopening a page all afternoon still counts once.
 */
export function aggregateEvents(input: AggregationInput): PlaceDayBucket[] {
  const buckets = new Map<string, PlaceDayBucket>();
  const seenEventIds = new Set<string>();
  const dedupeKeys = new Set<string>();
  const usersPerBucket = new Map<string, Set<string>>();

  for (const event of input.events) {
    const eventId = text(event.eventId);
    if (!eventId || seenEventIds.has(eventId)) continue;
    if (!isCountableEvent(event)) continue;
    seenEventIds.add(eventId);

    const type = text(event.eventType);
    const metric = EVENT_TO_METRIC[type];
    const placeId = text(event.placeId);
    const dayKey = businessDayKey(eventOccurredAtMs(event, input.nowMs));
    const bucketKey = `${placeId}|${dayKey}`;

    if (DEDUPED_PER_USER_PER_DAY.includes(metric)) {
      const user = text(event.userId) || "anonymous";
      const dedupeKey = `${bucketKey}|${metric}|${user}`;
      if (dedupeKeys.has(dedupeKey)) {
        // Still record the id so a replay does not resurrect it later.
        const existing = buckets.get(bucketKey);
        if (existing) existing.eventIds.push(eventId);
        continue;
      }
      dedupeKeys.add(dedupeKey);
    }

    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        canonicalPlaceId: placeId,
        dayKey,
        counters: emptyCounters(),
        eventIds: [],
        distinctUsers: 0,
      };
      buckets.set(bucketKey, bucket);
      usersPerBucket.set(bucketKey, new Set());
    }
    bucket.counters[metric] += 1;
    bucket.eventIds.push(eventId);
    const user = text(event.userId);
    if (user) usersPerBucket.get(bucketKey)!.add(user);
  }

  for (const [key, bucket] of buckets) {
    bucket.distinctUsers = usersPerBucket.get(key)?.size ?? 0;
  }
  return [...buckets.values()];
}

/** Sum daily counters across a range. */
export function sumCounters(days: DailyAnalyticsCounters[]): DailyAnalyticsCounters {
  const total = emptyCounters();
  for (const day of days) {
    for (const key of Object.keys(total) as (keyof DailyAnalyticsCounters)[]) {
      total[key] += day[key] ?? 0;
    }
  }
  return total;
}

export function netFollows(counters: DailyAnalyticsCounters): number {
  return counters.newFollows - counters.unfollows;
}

/**
 * Click-through rate, or null.
 *
 * Null when no promotion was ever shown. Zero impressions is not "0% CTR" — it
 * is an undefined ratio, and printing 0% would tell a merchant their promotion
 * failed when in fact it never ran.
 */
export function promotionCtr(counters: DailyAnalyticsCounters): number | null {
  if (counters.promotionImpressions <= 0) return null;
  return counters.promotionTaps / counters.promotionImpressions;
}

/** Total high-intent (proxy) actions. Never called a conversion. */
export function conversionProxyActions(
  counters: DailyAnalyticsCounters,
  proxyMetrics: readonly TrackedMetric[],
): number {
  let total = 0;
  for (const metric of proxyMetrics) total += counters[metric] ?? 0;
  return total;
}

/**
 * Percentage change between two periods.
 *
 * Returns null when the previous period is zero: "up 100%" from nothing is not
 * a fact about the business, it is a division artefact.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

/** The equivalent window immediately before [fromDay, toDay]. */
export function previousPeriod(fromDay: string, toDay: string): {fromDay: string; toDay: string} {
  const start = businessDayStartMs(fromDay);
  const end = businessDayStartMs(toDay);
  const spanDays = Math.round((end - start) / 86_400_000) + 1;
  const prevEnd = start - 86_400_000;
  const prevStart = prevEnd - (spanDays - 1) * 86_400_000;
  return {
    fromDay: businessDayKey(prevStart + 12 * 3_600_000),
    toDay: businessDayKey(prevEnd + 12 * 3_600_000),
  };
}

/**
 * Rewrite each event's place to its PROVEN canonical id, dropping the ones that
 * could not be resolved.
 *
 * Pure, so the rule is testable without Firestore: the caller does the lookups
 * and hands in the map. Two properties matter and both are asserted by tests —
 * an unresolved event is DROPPED rather than aggregated under its provider id,
 * and a resolved event carries the canonical id forward, never the original.
 */
export function applyCanonicalResolution(
  events: RawAnalyticsEvent[],
  resolution: Map<string, string | null>,
): RawAnalyticsEvent[] {
  const out: RawAnalyticsEvent[] = [];
  for (const event of events) {
    const raw = typeof event.placeId === "string" ? event.placeId.trim() : "";
    if (!raw) continue;
    const canonical = resolution.get(raw);
    if (!canonical) continue;
    out.push({...event, placeId: canonical});
  }
  return out;
}
