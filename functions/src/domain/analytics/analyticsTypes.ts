/**
 * WAVE 6 — Merchant Analytics: the metric contract.
 *
 * Every metric here is derived from a signal the product ACTUALLY emits today.
 * Nothing is invented to fill a dashboard. Where the roadmap names a metric the
 * app has no action for, it appears in NOT_TRACKED_METRICS and the merchant is
 * told so in words rather than shown a zero that looks like a real measurement.
 *
 * A zero and an untracked metric are different claims: "nobody did this" versus
 * "we do not know". Conflating them is the fastest way to make a merchant
 * distrust everything else on the screen.
 */

/** Raw client events are APPENDED by the signed-in user and never read back by
 * them (`events/` is create-only, uid-bound). That makes them a fair record of
 * intent but a SELF-ASSERTED one: a determined user can append their own views.
 * Two consequences are baked into this module:
 *   1. aggregates are only ever written by the server, never by a client;
 *   2. view-class metrics are deduplicated per user, per place, per day, so
 *      repeatedly reopening a page cannot inflate a merchant's numbers. */
export const EVENTS_ARE_CLIENT_ASSERTED = true;

/** Metrics the product can measure honestly today. */
export const TRACKED_METRICS = [
  "profileViews",
  "saves",
  "unsaves",
  "newFollows",
  "unfollows",
  "menuOpens",
  "menuItemViews",
  "menuComments",
  "directionsTaps",
  "mapsTaps",
  "callTaps",
  "websiteTaps",
  "shares",
  "checkins",
  "mealsLogged",
  "promotionImpressions",
  "promotionTaps",
] as const;
export type TrackedMetric = (typeof TRACKED_METRICS)[number];

/**
 * Metrics deliberately NOT offered.
 *
 * These are not "coming soon" placeholders. Each names a claim the product has
 * no authoritative source for, and inventing one would misrepresent a
 * merchant's business back to them.
 */
export const NOT_TRACKED_METRICS: Record<string, string> = {
  revenue: "MakanMana processes no restaurant payments, so no revenue exists to report.",
  orders: "MakanMana takes no orders.",
  walkIns: "A walk-in cannot be observed from the app.",
  sales: "No sale is transacted through MakanMana.",
  reservations: "The product has no booking flow.",
  repeatCustomers: "Identifying a returning customer would require exposing who they are.",
};

/**
 * Metrics whose UI ACTION does not exist or does not function yet.
 *
 * These are different from NOT_TRACKED_METRICS: the product could measure them
 * tomorrow, it simply has nothing for a customer to press today. Found by
 * reading the screens rather than by assuming:
 *
 *  - the Call and Website buttons on Restaurant Detail are rendered but their
 *    callbacks are never wired, so nothing happens when they are pressed;
 *  - the public promotion card carries no call-to-action at all.
 *
 * They stay in the metric list so that the day someone wires the button the
 * number starts working with no further change — and until then a merchant is
 * told the truth instead of shown a zero that means "nobody called you".
 */
export const NOT_YET_INSTRUMENTED: Record<string, string> = {
  callTaps: "The call button is not connected to anything yet, so a tap cannot be counted.",
  websiteTaps: "The website button is not connected to anything yet.",
  promotionTaps: "Promotion cards have no call-to-action for a customer to press yet.",
};

/** Derived rates. A rate is only emitted when its denominator is real. */
export const DERIVED_METRICS = ["netFollows", "promotionCtr", "conversionProxyActions"] as const;

/**
 * HIGH-INTENT ACTIONS, also called conversion PROXIES.
 *
 * They are proxies and are labelled as such everywhere. Someone tapping
 * "directions" is a strong signal they intend to visit; it is not a visit, and
 * this codebase never rounds one up to the other.
 */
export const CONVERSION_PROXY_METRICS: readonly TrackedMetric[] = [
  "directionsTaps",
  "mapsTaps",
  "callTaps",
  "websiteTaps",
  "newFollows",
  "saves",
  "checkins",
  "mealsLogged",
];

/** Canonical event types that feed a metric. Mirrors lib/core/events/event_types.dart. */
export const EVENT_TO_METRIC: Record<string, TrackedMetric> = {
  restaurant_detail_viewed: "profileViews",
  favorite_added: "saves",
  favorite_removed: "unsaves",
  menu_opened: "menuOpens",
  menu_item_viewed: "menuItemViews",
  open_map: "mapsTaps",
  directions_tapped: "directionsTaps",
  call_tapped: "callTaps",
  website_tapped: "websiteTaps",
  share_clicked: "shares",
  checkin_created: "checkins",
  meal_logged: "mealsLogged",
  promotion_impression: "promotionImpressions",
  promotion_cta_tapped: "promotionTaps",
};

/**
 * Metrics counted at most ONCE per user per place per day.
 *
 * Views and impressions are the inflatable ones: a page rebuild, a back-and-
 * forward, or a bored thumb should not read as demand. Intent actions (calling,
 * tapping directions) are NOT deduplicated — doing them twice is genuinely
 * twice the signal.
 */
export const DEDUPED_PER_USER_PER_DAY: readonly TrackedMetric[] = [
  "profileViews",
  "menuOpens",
  "menuItemViews",
  "promotionImpressions",
];

/** Server-authoritative metrics: derived from callables, not client events. */
export const SERVER_AUTHORITATIVE_METRICS: readonly TrackedMetric[] = [
  "newFollows",
  "unfollows",
  "menuComments",
];

/** Honest states a metric cell may carry. They are not interchangeable. */
export type MetricState =
  | "recorded"       // a real measurement, possibly zero
  | "not_tracked"    // no signal exists for this
  | "insufficient"   // too little data to say anything responsibly
  | "unavailable";   // the source could not be read right now

/** Below this many distinct users, a segment is not reported at all. */
export const MIN_SEGMENT_SAMPLE = 5;

/** Guard against unbounded scans. */
export const MAX_RANGE_DAYS = 400;

export interface DailyAnalyticsCounters {
  profileViews: number;
  saves: number;
  unsaves: number;
  newFollows: number;
  unfollows: number;
  menuOpens: number;
  menuItemViews: number;
  menuComments: number;
  directionsTaps: number;
  mapsTaps: number;
  callTaps: number;
  websiteTaps: number;
  shares: number;
  checkins: number;
  mealsLogged: number;
  promotionImpressions: number;
  promotionTaps: number;
}

export function emptyCounters(): DailyAnalyticsCounters {
  return {
    profileViews: 0, saves: 0, unsaves: 0, newFollows: 0, unfollows: 0,
    menuOpens: 0, menuItemViews: 0, menuComments: 0, directionsTaps: 0,
    mapsTaps: 0, callTaps: 0, websiteTaps: 0, shares: 0, checkins: 0,
    mealsLogged: 0, promotionImpressions: 0, promotionTaps: 0,
  };
}

export function isTrackedMetric(value: unknown): value is TrackedMetric {
  return typeof value === "string" && (TRACKED_METRICS as readonly string[]).includes(value);
}
