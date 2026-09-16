/**
 * B5 — CMS banner analytics: the contract and the deterministic aggregation.
 *
 * SEPARATE FROM MERCHANT ANALYTICS ON PURPOSE. `restaurant_analytics_daily` is
 * keyed by canonical place and answers "how is this restaurant doing". A banner
 * is not a restaurant: it belongs to a placement, it has a schedule, and the
 * same banner can run across every restaurant at once. Folding CMS counters
 * into that collection would key them by the wrong identity and make both
 * datasets lie.
 *
 * CLIENT EVENTS ARE ASSERTIONS, NOT AUTHORITY. `events/` is append-only and
 * uid-bound, so a determined user can append their own. Two consequences are
 * built in rather than documented and forgotten:
 *
 *   1. aggregates are only ever written by the server;
 *   2. BOTH metrics are deduplicated per user, per banner, per placement, per
 *      Malaysia business day.
 *
 * That second point is what keeps the rate honest. If impressions were deduped
 * and taps were not, one person who saw a banner once and tapped it five times
 * would produce a 500% click-through rate. Deduplicating both makes the ratio
 * mean "of the people who saw it, how many acted" — a number that cannot exceed
 * 100% and that an operator can actually reason about.
 *
 * Pure: no Firestore, no clock, no randomness. The same events always produce
 * the same counters, which is what lets the nightly reconcile REPAIR a day
 * rather than guess at it a second time.
 */
import {businessDayKey} from "../analytics/analyticsAggregation";
import {CMS_PLACEMENTS, isCmsPlacement} from "./cmsTypes";

export const CMS_ANALYTICS_DAILY_COLLECTION = "cms_analytics_daily";

/** Mirrors the client constants in lib/core/events/event_types.dart. */
export const CMS_IMPRESSION_EVENT = "cms_impression";
export const CMS_CTA_TAPPED_EVENT = "cms_cta_tapped";

export interface CmsDailyCounters {
  impressions: number;
  ctaTaps: number;
}

export function emptyCmsCounters(): CmsDailyCounters {
  return {impressions: 0, ctaTaps: 0};
}

export const CMS_EVENT_TO_METRIC: Record<string, keyof CmsDailyCounters> = {
  [CMS_IMPRESSION_EVENT]: "impressions",
  [CMS_CTA_TAPPED_EVENT]: "ctaTaps",
};

/** One row per banner, per placement, per business day. */
export function cmsAnalyticsDailyDocId(
  contentId: string,
  placement: string,
  dayKey: string,
): string {
  return `${contentId}__${placement}__${dayKey}`;
}

export interface CmsAnalyticsDailyDocument {
  contentId: string;
  placement: string;
  dayKey: string;
  counters: CmsDailyCounters;
  /**
   * Distinct-user COUNT only, never the users. It exists so the console can say
   * how thin a day's sample is; it carries nothing about who anyone was.
   */
  distinctUserCount: number;
  updatedAtMs: number;
}

// ── VALIDATION ─────────────────────────────────────────────────────────────

/** One raw event as stored in `events/{eventId}`. */
export interface RawCmsEvent {
  eventId: string;
  eventType?: unknown;
  userId?: unknown;
  clientTimestampMs?: unknown;
  serverTimestampMs?: unknown;
  metadata?: unknown;
}

export interface CountableCmsEvent {
  eventId: string;
  metric: keyof CmsDailyCounters;
  contentId: string;
  placement: string;
  userId: string;
  occurredAtMs: number;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The server's own clock wins.
 *
 * A device clock can be wrong by years, and a day bucket chosen from it would
 * be unrepairable. The client stamp is only a fallback for an event that
 * somehow reached storage before the stamping trigger ran.
 */
export function cmsEventOccurredAtMs(event: RawCmsEvent, nowMs: number): number {
  if (typeof event.serverTimestampMs === "number" &&
    Number.isFinite(event.serverTimestampMs)) {
    return event.serverTimestampMs;
  }
  if (typeof event.clientTimestampMs === "number" &&
    Number.isFinite(event.clientTimestampMs)) {
    return event.clientTimestampMs;
  }
  return nowMs;
}

/**
 * Decide whether one raw event may be counted, and as what.
 *
 * Returns null for anything that cannot be attributed honestly. Every rejection
 * below is a case where counting would invent an audience:
 *
 *   - an unknown event type is not a CMS signal at all;
 *   - a missing contentId or an unknown placement cannot be attributed to a
 *     banner, and a bucket keyed on "" would silently merge unrelated content;
 *   - an impression that does not assert `visible: true` was not seen — that
 *     flag is the client's statement that the visibility rule was met, and a
 *     backend read or an offscreen build carries no such statement;
 *   - a missing userId means the event cannot be deduplicated, and an
 *     undeduplicable view is exactly how a count gets inflated.
 */
export function toCountableCmsEvent(
  event: RawCmsEvent,
  nowMs: number,
): CountableCmsEvent | null {
  const metric = CMS_EVENT_TO_METRIC[text(event.eventType)];
  if (!metric) return null;

  const meta = (event.metadata && typeof event.metadata === "object")
    ? event.metadata as Record<string, unknown>
    : {};

  const contentId = text(meta.contentId);
  if (!contentId || contentId.length > 200) return null;

  const placement = text(meta.placement);
  if (!isCmsPlacement(placement)) return null;

  // An impression must SAY it was visible. Silence is not a claim.
  if (metric === "impressions" && meta.visible !== true) return null;

  const userId = text(event.userId);
  if (!userId) return null;

  const occurredAtMs = cmsEventOccurredAtMs(event, nowMs);
  if (!Number.isFinite(occurredAtMs)) return null;

  return {eventId: event.eventId, metric, contentId, placement, userId, occurredAtMs};
}

// ── AGGREGATION ────────────────────────────────────────────────────────────

export interface CmsDailyBucket {
  contentId: string;
  placement: string;
  dayKey: string;
  counters: CmsDailyCounters;
  distinctUsers: number;
}

/**
 * Fold raw events into day buckets.
 *
 * Deterministic and order-independent: both metrics are deduplicated per user
 * per bucket, so replaying the same events — in any order, any number of times
 * — produces identical counters. That is precisely what makes the reconcile a
 * repair rather than a second opinion.
 */
export function aggregateCmsEvents(input: {
  events: readonly RawCmsEvent[];
  nowMs: number;
}): CmsDailyBucket[] {
  const buckets = new Map<string, {
    contentId: string;
    placement: string;
    dayKey: string;
    seen: Map<keyof CmsDailyCounters, Set<string>>;
    users: Set<string>;
  }>();

  for (const raw of input.events) {
    const event = toCountableCmsEvent(raw, input.nowMs);
    if (!event) continue;

    const dayKey = businessDayKey(event.occurredAtMs);
    const key = `${event.contentId}|${event.placement}|${dayKey}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        contentId: event.contentId,
        placement: event.placement,
        dayKey,
        seen: new Map(),
        users: new Set(),
      };
      buckets.set(key, bucket);
    }
    let perMetric = bucket.seen.get(event.metric);
    if (!perMetric) {
      perMetric = new Set();
      bucket.seen.set(event.metric, perMetric);
    }
    perMetric.add(event.userId);
    bucket.users.add(event.userId);
  }

  return [...buckets.values()].map((bucket) => {
    const counters = emptyCmsCounters();
    for (const [metric, users] of bucket.seen) counters[metric] = users.size;
    return {
      contentId: bucket.contentId,
      placement: bucket.placement,
      dayKey: bucket.dayKey,
      counters,
      distinctUsers: bucket.users.size,
    };
  });
}

/**
 * Click-through rate as a percentage, or null when there is nothing to divide.
 *
 * Null is not zero. "Nobody clicked" and "nobody saw it, so there is no rate"
 * are different facts, and showing the second as 0% would tell an operator the
 * banner failed when it was never given the chance.
 */
export function cmsCtr(counters: CmsDailyCounters): number | null {
  if (!Number.isFinite(counters.impressions) || counters.impressions <= 0) return null;
  const taps = Number.isFinite(counters.ctaTaps) ? counters.ctaTaps : 0;
  return (taps / counters.impressions) * 100;
}

export function sumCmsCounters(
  all: readonly CmsDailyCounters[],
): CmsDailyCounters {
  const out = emptyCmsCounters();
  for (const c of all) {
    out.impressions += Number.isFinite(c.impressions) ? c.impressions : 0;
    out.ctaTaps += Number.isFinite(c.ctaTaps) ? c.ctaTaps : 0;
  }
  return out;
}

// ── CONTROL CENTER MIRROR ──────────────────────────────────────────────────

export const CMS_ANALYTICS_MIRROR_ENTITY_TYPE = "cms_analytics_daily";

export interface CmsAnalyticsMirrorRecord {
  content_id: string;
  placement: string;
  day_key: string;
  impressions: number;
  cta_taps: number;
  distinct_user_count: number;
  updated_at_ms: number;
}

/**
 * Aggregate rows only. No raw events, no user ids, no browsing history — the
 * only thing that travels about people is HOW MANY of them there were.
 */
export function toCmsAnalyticsMirrorRecord(
  doc: CmsAnalyticsDailyDocument,
): CmsAnalyticsMirrorRecord {
  return {
    content_id: doc.contentId,
    placement: doc.placement,
    day_key: doc.dayKey,
    impressions: doc.counters.impressions,
    cta_taps: doc.counters.ctaTaps,
    distinct_user_count: doc.distinctUserCount,
    updated_at_ms: doc.updatedAtMs,
  };
}

/**
 * Idempotency key for one mirrored snapshot.
 *
 * Carries `updatedAtMs`, so re-pushing an unchanged row reuses the same id (a
 * safe duplicate the receipt contract absorbs) while a genuine change gets a
 * new one. A reconcile that repairs a count therefore replaces the row instead
 * of being rejected as a conflicting duplicate.
 */
export function cmsAnalyticsMirrorEventId(
  contentId: string,
  placement: string,
  dayKey: string,
  updatedAtMs: number | null,
): string | null {
  const id = text(contentId);
  if (!id || !isCmsPlacement(placement) || !dayKey) return null;
  const stamp = typeof updatedAtMs === "number" && Number.isFinite(updatedAtMs)
    ? updatedAtMs : 0;
  return `cms-analytics:${id}:${placement}:${dayKey}:${stamp}`;
}

export const CMS_ANALYTICS_PLACEMENTS = CMS_PLACEMENTS;
