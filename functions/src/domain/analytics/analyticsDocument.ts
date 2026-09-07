/**
 * WAVE 6 — Merchant Analytics: stored shape and outward projections.
 *
 * Projections are built by ALLOWLIST. A strip-list forgets to strip the field
 * somebody adds next month; an allowlist simply never learns about it. That is
 * the difference between a privacy boundary that holds and one that decays.
 */
import {
  CONVERSION_PROXY_METRICS,
  MIN_SEGMENT_SAMPLE,
  NOT_TRACKED_METRICS,
  NOT_YET_INSTRUMENTED,
  emptyCounters,
  type DailyAnalyticsCounters,
  type MetricState,
} from "./analyticsTypes";
import {
  conversionProxyActions,
  netFollows,
  promotionCtr,
  percentChange,
  sumCounters,
} from "./analyticsAggregation";

export const ANALYTICS_DAILY_COLLECTION = "restaurant_analytics_daily";

/** Document id: one row per restaurant per business day. */
export function analyticsDailyDocId(canonicalPlaceId: string, dayKey: string): string {
  return `${canonicalPlaceId}__${dayKey}`;
}

export interface AnalyticsDailyDocument {
  canonicalPlaceId: string;
  dayKey: string;
  counters: DailyAnalyticsCounters;
  /**
   * Distinct-user COUNT only. Never the users themselves. It exists so a
   * segment can be suppressed when the sample is too small to be anonymous,
   * which is the one legitimate reason to know how many people there were.
   */
  distinctUserCount: number;
  /** Applied event ids, for idempotent folding. Internal; never projected. */
  appliedEventIds: string[];
  updatedAtMs: number;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function readCounters(raw: unknown): DailyAnalyticsCounters {
  const source = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const out = emptyCounters();
  for (const key of Object.keys(out) as (keyof DailyAnalyticsCounters)[]) {
    out[key] = num(source[key]);
  }
  return out;
}

// ── MERCHANT-FACING PROJECTION ─────────────────────────────────────────────

export interface MetricCell {
  value: number | null;
  state: MetricState;
  /** Present only when the metric is not a plain measurement. */
  note?: string;
}

export interface MerchantAnalyticsSummary {
  canonicalPlaceId: string;
  fromDay: string;
  toDay: string;
  timezone: string;
  metrics: Record<string, MetricCell>;
  /** Same metrics for the equivalent previous window, when it is meaningful. */
  comparison: {
    available: boolean;
    fromDay: string | null;
    toDay: string | null;
    changes: Record<string, number | null>;
    note?: string;
  };
  /** Metrics the product cannot measure, stated rather than zeroed. */
  notTracked: Record<string, string>;
  /** Daily series for charting. Counts only — no identity, ever. */
  series: Array<{dayKey: string} & DailyAnalyticsCounters>;
}

function cell(value: number | null, state: MetricState, note?: string): MetricCell {
  return note ? {value, state, note} : {value, state};
}

/**
 * Build the merchant's summary.
 *
 * `previous` may be null — the merchant may simply not have existed that long.
 * When it is null, comparison is reported unavailable with a reason rather than
 * quietly rendering as "0% change".
 */
export function buildMerchantSummary(params: {
  canonicalPlaceId: string;
  fromDay: string;
  toDay: string;
  timezone: string;
  days: Array<{dayKey: string; counters: DailyAnalyticsCounters; distinctUserCount: number}>;
  previous: {fromDay: string; toDay: string; days: Array<{counters: DailyAnalyticsCounters}>} | null;
  /** False when the restaurant has no analytics history at all yet. */
  hasAnyHistory: boolean;
}): MerchantAnalyticsSummary {
  const total = sumCounters(params.days.map((d) => d.counters));
  const metrics: Record<string, MetricCell> = {};

  for (const key of Object.keys(total) as (keyof DailyAnalyticsCounters)[]) {
    // A metric whose button does not exist is never reported as a measurement,
    // however much history the restaurant has. Zero here would mean "nobody
    // called you"; the truth is "nobody could".
    if (NOT_YET_INSTRUMENTED[key]) {
      metrics[key] = cell(null, "not_tracked", NOT_YET_INSTRUMENTED[key]);
      continue;
    }
    metrics[key] = params.hasAnyHistory
      ? cell(total[key], "recorded")
      : cell(null, "not_tracked",
        "Measurement starts from the day analytics was switched on for this restaurant.");
  }

  metrics.netFollows = params.hasAnyHistory
    ? cell(netFollows(total), "recorded")
    : cell(null, "not_tracked", "No follow history recorded yet.");

  // CTR needs BOTH halves to be real. Taps are not instrumented yet, so the
  // rate is refused outright rather than published as a confident 0%.
  const ctr = promotionCtr(total);
  metrics.promotionCtr = NOT_YET_INSTRUMENTED.promotionTaps
    ? cell(null, "not_tracked",
      "A rate needs taps as well as impressions, and taps are not measurable yet.")
    : ctr === null
      ? cell(null, "not_tracked",
        "No promotion was shown in this period, so there is no rate to divide.")
      : cell(ctr, "recorded");

  metrics.conversionProxyActions = params.hasAnyHistory
    ? cell(conversionProxyActions(total, CONVERSION_PROXY_METRICS), "recorded",
      "High-intent actions. A proxy for interest, not a recorded visit or sale.")
    : cell(null, "not_tracked");

  // Comparison.
  const changes: Record<string, number | null> = {};
  let available = false;
  let note: string | undefined;
  if (params.previous && params.previous.days.length > 0) {
    const prevTotal = sumCounters(params.previous.days.map((d) => d.counters));
    const prevSum = Object.values(prevTotal).reduce((a, b) => a + b, 0);
    if (prevSum === 0) {
      note = "The previous period has no activity to compare against.";
    } else {
      available = true;
      for (const key of Object.keys(total) as (keyof DailyAnalyticsCounters)[]) {
        if (NOT_YET_INSTRUMENTED[key]) continue;
        changes[key] = percentChange(total[key], prevTotal[key]);
      }
      changes.netFollows = percentChange(netFollows(total), netFollows(prevTotal));
      changes.conversionProxyActions = percentChange(
        conversionProxyActions(total, CONVERSION_PROXY_METRICS),
        conversionProxyActions(prevTotal, CONVERSION_PROXY_METRICS),
      );
    }
  } else {
    note = "There is no earlier period on record to compare against.";
  }

  return {
    canonicalPlaceId: params.canonicalPlaceId,
    fromDay: params.fromDay,
    toDay: params.toDay,
    timezone: params.timezone,
    metrics,
    comparison: {
      available,
      fromDay: params.previous?.fromDay ?? null,
      toDay: params.previous?.toDay ?? null,
      changes,
      ...(note ? {note} : {}),
    },
    notTracked: {...NOT_TRACKED_METRICS, ...NOT_YET_INSTRUMENTED},
    series: params.days.map((d) => ({dayKey: d.dayKey, ...d.counters})),
  };
}

/**
 * Is a segment safe to report?
 *
 * Below the threshold a "segment" can identify the individual it describes,
 * which is exactly what a merchant must not receive.
 */
export function segmentIsReportable(distinctUsers: number): boolean {
  return distinctUsers >= MIN_SEGMENT_SAMPLE;
}

// ── CONTROL CENTER MIRROR ──────────────────────────────────────────────────

export interface AnalyticsMirrorRecord {
  canonical_place_id: string;
  day_key: string;
  profile_views: number;
  saves: number;
  unsaves: number;
  new_follows: number;
  unfollows: number;
  menu_opens: number;
  menu_item_views: number;
  menu_comments: number;
  directions_taps: number;
  maps_taps: number;
  call_taps: number;
  website_taps: number;
  shares: number;
  checkins: number;
  meals_logged: number;
  promotion_impressions: number;
  promotion_taps: number;
  distinct_user_count: number;
  updated_at_ms: number;
}

/**
 * Aggregate rows only — never a raw event dump, never a user id.
 *
 * `distinct_user_count` is a COUNT. It travels because the console needs to
 * suppress small samples for the same reason the app does; it carries nothing
 * about who those people were.
 */
export function toAnalyticsMirrorRecord(doc: AnalyticsDailyDocument): AnalyticsMirrorRecord {
  const c = doc.counters;
  return {
    canonical_place_id: doc.canonicalPlaceId,
    day_key: doc.dayKey,
    profile_views: c.profileViews,
    saves: c.saves,
    unsaves: c.unsaves,
    new_follows: c.newFollows,
    unfollows: c.unfollows,
    menu_opens: c.menuOpens,
    menu_item_views: c.menuItemViews,
    menu_comments: c.menuComments,
    directions_taps: c.directionsTaps,
    maps_taps: c.mapsTaps,
    call_taps: c.callTaps,
    website_taps: c.websiteTaps,
    shares: c.shares,
    checkins: c.checkins,
    meals_logged: c.mealsLogged,
    promotion_impressions: c.promotionImpressions,
    promotion_taps: c.promotionTaps,
    distinct_user_count: doc.distinctUserCount,
    updated_at_ms: doc.updatedAtMs,
  };
}
