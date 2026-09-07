/**
 * WAVE 6 — Merchant Analytics.
 *
 * The aggregation is a pure function, so the interesting cases are exercised
 * directly rather than through an emulator: what must NOT be counted, what must
 * be counted once, and where a number is refused because it would be a lie.
 *
 * The authorization posture is asserted against the callable's SOURCE, the same
 * way the Wave 4 receiver tests do it — the question "who decides" is visible
 * without a live Firestore, and an emulator test would mostly prove fetch works.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  aggregateEvents,
  businessDayKey,
  conversionProxyActions,
  dayKeysBetween,
  isCountableEvent,
  netFollows,
  percentChange,
  previousPeriod,
  promotionCtr,
  sumCounters,
  type RawAnalyticsEvent,
} from "../analyticsAggregation";
import {
  buildMerchantSummary,
  segmentIsReportable,
  toAnalyticsMirrorRecord,
  type AnalyticsDailyDocument,
} from "../analyticsDocument";
import {
  CONVERSION_PROXY_METRICS,
  NOT_TRACKED_METRICS,
  NOT_YET_INSTRUMENTED,
  emptyCounters,
} from "../analyticsTypes";

const PLACE = "PLC-analytics-test";
const NOW = Date.UTC(2026, 8, 8, 4, 0, 0); // 2026-09-08 12:00 MYT

function ev(over: Partial<RawAnalyticsEvent> & {eventId: string}): RawAnalyticsEvent {
  return {
    eventType: "restaurant_detail_viewed",
    userId: "user-a",
    placeId: PLACE,
    serverTimestampMs: NOW,
    ...over,
  };
}

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

// ── WHAT COUNTS ────────────────────────────────────────────────────────────

test("1. a real restaurant view is counted", () => {
  const [bucket] = aggregateEvents({events: [ev({eventId: "e1"})], nowMs: NOW});
  assert.equal(bucket.counters.profileViews, 1);
  assert.equal(bucket.canonicalPlaceId, PLACE);
  assert.equal(bucket.dayKey, "2026-09-08");
});

test("2. the same event id folded twice counts once (idempotent)", () => {
  const buckets = aggregateEvents({
    events: [ev({eventId: "e1"}), ev({eventId: "e1"}), ev({eventId: "e1"})],
    nowMs: NOW,
  });
  assert.equal(buckets[0].counters.profileViews, 1);
});

test("3. one person reopening a page all day is one view, two people are two", () => {
  const buckets = aggregateEvents({
    events: [
      ev({eventId: "a1", userId: "user-a"}),
      ev({eventId: "a2", userId: "user-a"}),
      ev({eventId: "a3", userId: "user-a"}),
      ev({eventId: "b1", userId: "user-b"}),
    ],
    nowMs: NOW,
  });
  assert.equal(buckets[0].counters.profileViews, 2);
  assert.equal(buckets[0].distinctUsers, 2);
});

test("4. intent actions are NOT deduplicated — doing it twice means twice", () => {
  const buckets = aggregateEvents({
    events: [
      ev({eventId: "c1", eventType: "call_tapped"}),
      ev({eventId: "c2", eventType: "call_tapped"}),
    ],
    nowMs: NOW,
  });
  assert.equal(buckets[0].counters.callTaps, 2);
});

// ── WHAT MUST NOT COUNT ────────────────────────────────────────────────────

test("5. sample and preview data never reach a merchant's numbers", () => {
  assert.equal(isCountableEvent(ev({eventId: "s", isSample: true})), false);
  assert.equal(isCountableEvent(ev({eventId: "p", isPreview: true})), false);
  assert.equal(isCountableEvent(ev({eventId: "m", sourceMode: "sample"})), false);
  assert.equal(isCountableEvent(ev({eventId: "n", sourceMode: "preview"})), false);
  const buckets = aggregateEvents({
    events: [ev({eventId: "s", isSample: true}), ev({eventId: "p", isPreview: true})],
    nowMs: NOW,
  });
  assert.equal(buckets.length, 0, "nothing should have been bucketed");
});

test("6. a background or preloaded render is not an impression", () => {
  assert.equal(isCountableEvent(ev({
    eventId: "bg", eventType: "promotion_impression",
    metadata: {visible: true, background: true},
  })), false);
  assert.equal(isCountableEvent(ev({
    eventId: "pre", eventType: "promotion_impression",
    metadata: {visible: true, preload: true},
  })), false);
});

test("7. a promotion the backend merely READ is not an impression", () => {
  // No `visible: true` assertion means it was never shown to a human.
  assert.equal(isCountableEvent(ev({
    eventId: "read", eventType: "promotion_impression", metadata: {},
  })), false);
  assert.equal(isCountableEvent(ev({
    eventId: "read2", eventType: "promotion_impression",
  })), false);
});

test("8. a promotion actually rendered and visible DOES count, and so does its tap", () => {
  const buckets = aggregateEvents({
    events: [
      ev({eventId: "i1", eventType: "promotion_impression", metadata: {visible: true}}),
      ev({eventId: "t1", eventType: "promotion_cta_tapped"}),
    ],
    nowMs: NOW,
  });
  assert.equal(buckets[0].counters.promotionImpressions, 1);
  assert.equal(buckets[0].counters.promotionTaps, 1);
});

test("9. an event with no restaurant is not attributable to one", () => {
  assert.equal(isCountableEvent(ev({eventId: "x", placeId: ""})), false);
  assert.equal(isCountableEvent(ev({eventId: "y", placeId: undefined})), false);
});

test("10. an unmapped event type is ignored rather than guessed at", () => {
  assert.equal(isCountableEvent(ev({eventId: "z", eventType: "dm_message_sent"})), false);
});

// ── RATES THAT REFUSE TO LIE ───────────────────────────────────────────────

test("11. zero impressions gives NO ctr, not 0%", () => {
  const counters = emptyCounters();
  assert.equal(promotionCtr(counters), null,
    "0/0 is undefined; printing 0% would read as 'your promotion failed'");
  counters.promotionImpressions = 4;
  counters.promotionTaps = 1;
  assert.equal(promotionCtr(counters), 0.25);
});

test("12. percent change from zero is refused, not reported as +100%", () => {
  assert.equal(percentChange(5, 0), null);
  assert.equal(percentChange(0, 0), null);
  assert.equal(percentChange(15, 10), 0.5);
  assert.equal(percentChange(5, 10), -0.5);
});

test("13. follows net out correctly, including going negative", () => {
  const c = emptyCounters();
  c.newFollows = 3;
  c.unfollows = 5;
  assert.equal(netFollows(c), -2, "losing followers must be reportable");
});

test("14. conversion proxies are a sum of high-intent actions only", () => {
  const c = emptyCounters();
  c.callTaps = 2;
  c.directionsTaps = 1;
  c.newFollows = 1;
  c.profileViews = 99;          // a view is NOT high intent
  c.promotionImpressions = 50;  // nor is an impression
  assert.equal(conversionProxyActions(c, CONVERSION_PROXY_METRICS), 4);
});

test("15. metrics with no authoritative source are named, not zeroed", () => {
  for (const key of ["revenue", "orders", "walkIns", "sales"]) {
    assert.ok(NOT_TRACKED_METRICS[key], `${key} must be declared not-tracked`);
    assert.ok(NOT_TRACKED_METRICS[key].length > 10, "with a reason a merchant can read");
  }
});

// ── RANGES ─────────────────────────────────────────────────────────────────

test("16. an invalid or inverted range is rejected", () => {
  assert.throws(() => dayKeysBetween("nope", "2026-09-08"), /range_invalid/);
  assert.throws(() => dayKeysBetween("2026-09-08", "2026-09-01"), /range_inverted/);
});

test("17. an unbounded range is refused, not silently clamped", () => {
  assert.throws(() => dayKeysBetween("2000-01-01", "2026-09-08"), /range_too_large/);
});

test("18. a range enumerates every day inclusively", () => {
  const days = dayKeysBetween("2026-09-06", "2026-09-08");
  assert.deepEqual(days, ["2026-09-06", "2026-09-07", "2026-09-08"]);
});

test("19. the previous period is the same length, immediately before", () => {
  assert.deepEqual(previousPeriod("2026-09-02", "2026-09-08"),
    {fromDay: "2026-08-26", toDay: "2026-09-01"});
});

test("20. days bucket by MALAYSIAN time, not UTC", () => {
  // 2026-09-08 00:30 MYT is still 2026-09-07 in UTC.
  const justAfterLocalMidnight = Date.UTC(2026, 8, 7, 16, 30);
  assert.equal(businessDayKey(justAfterLocalMidnight), "2026-09-08");
});

// ── SUMMARY + COMPARISON ───────────────────────────────────────────────────

function day(dayKey: string, over: Partial<ReturnType<typeof emptyCounters>>) {
  return {dayKey, counters: {...emptyCounters(), ...over}, distinctUserCount: 9};
}

test("21. a summary totals the window and exposes the series", () => {
  const summary = buildMerchantSummary({
    canonicalPlaceId: PLACE, fromDay: "2026-09-07", toDay: "2026-09-08",
    timezone: "Asia/Kuala_Lumpur",
    days: [day("2026-09-07", {profileViews: 2}), day("2026-09-08", {profileViews: 3})],
    previous: null, hasAnyHistory: true,
  });
  assert.equal(summary.metrics.profileViews.value, 5);
  assert.equal(summary.metrics.profileViews.state, "recorded");
  assert.equal(summary.series.length, 2);
});

test("22. with no history at all, metrics say not-tracked instead of zero", () => {
  const summary = buildMerchantSummary({
    canonicalPlaceId: PLACE, fromDay: "2026-09-07", toDay: "2026-09-08",
    timezone: "Asia/Kuala_Lumpur",
    days: [day("2026-09-07", {}), day("2026-09-08", {})],
    previous: null, hasAnyHistory: false,
  });
  assert.equal(summary.metrics.profileViews.state, "not_tracked");
  assert.equal(summary.metrics.profileViews.value, null,
    "a zero here would claim nobody visited, which we do not know");
});

test("23. comparison against a real previous period reports change", () => {
  const summary = buildMerchantSummary({
    canonicalPlaceId: PLACE, fromDay: "2026-09-08", toDay: "2026-09-08",
    timezone: "Asia/Kuala_Lumpur",
    days: [day("2026-09-08", {profileViews: 15})],
    previous: {fromDay: "2026-09-07", toDay: "2026-09-07",
      days: [{counters: {...emptyCounters(), profileViews: 10}}]},
    hasAnyHistory: true,
  });
  assert.equal(summary.comparison.available, true);
  assert.equal(summary.comparison.changes.profileViews, 0.5);
});

test("24. an empty or missing previous period is stated, never fabricated", () => {
  const noPrev = buildMerchantSummary({
    canonicalPlaceId: PLACE, fromDay: "2026-09-08", toDay: "2026-09-08",
    timezone: "Asia/Kuala_Lumpur", days: [day("2026-09-08", {profileViews: 5})],
    previous: null, hasAnyHistory: true,
  });
  assert.equal(noPrev.comparison.available, false);
  assert.ok(noPrev.comparison.note && noPrev.comparison.note.length > 0);

  const emptyPrev = buildMerchantSummary({
    canonicalPlaceId: PLACE, fromDay: "2026-09-08", toDay: "2026-09-08",
    timezone: "Asia/Kuala_Lumpur", days: [day("2026-09-08", {profileViews: 5})],
    previous: {fromDay: "2026-09-07", toDay: "2026-09-07", days: [{counters: emptyCounters()}]},
    hasAnyHistory: true,
  });
  assert.equal(emptyPrev.comparison.available, false);
  assert.deepEqual(emptyPrev.comparison.changes, {});
});

test("25. the summary carries no user identity of any kind", () => {
  const summary = buildMerchantSummary({
    canonicalPlaceId: PLACE, fromDay: "2026-09-08", toDay: "2026-09-08",
    timezone: "Asia/Kuala_Lumpur", days: [day("2026-09-08", {profileViews: 4})],
    previous: null, hasAnyHistory: true,
  });
  const json = JSON.stringify(summary);
  for (const forbidden of ["userId", "uid", "email", "phone", "followerUid", "user-a", "@"]) {
    assert.equal(json.includes(forbidden), false, `summary leaked ${forbidden}`);
  }
});

test("26. a segment smaller than the anonymity threshold is not reportable", () => {
  assert.equal(segmentIsReportable(4), false);
  assert.equal(segmentIsReportable(5), true);
});

// ── MIRROR ─────────────────────────────────────────────────────────────────

test("27. the Control Center mirror row carries counts, never identity", () => {
  const doc: AnalyticsDailyDocument = {
    canonicalPlaceId: PLACE,
    dayKey: "2026-09-08",
    counters: {...emptyCounters(), profileViews: 7, callTaps: 2},
    distinctUserCount: 6,
    appliedEventIds: ["e1", "e2", "e3"],
    updatedAtMs: NOW,
  };
  const row = toAnalyticsMirrorRecord(doc);
  assert.equal(row.profile_views, 7);
  assert.equal(row.call_taps, 2);
  assert.equal(row.distinct_user_count, 6);
  const json = JSON.stringify(row);
  for (const forbidden of ["userId", "uid", "email", "appliedEventIds", "e1"]) {
    assert.equal(json.includes(forbidden), false, `mirror leaked ${forbidden}`);
  }
});

test("28. summing days is order independent and additive", () => {
  const a = {...emptyCounters(), profileViews: 2, callTaps: 1};
  const b = {...emptyCounters(), profileViews: 3};
  assert.deepEqual(sumCounters([a, b]), sumCounters([b, a]));
  assert.equal(sumCounters([a, b]).profileViews, 5);
});

// ── AUTHORIZATION POSTURE (asserted against source) ────────────────────────

const CALLABLE = read("src/callable/getMerchantAnalytics.ts");

test("29. the read plane reuses the Wave 1 merchant authority, fail-closed", () => {
  assert.ok(CALLABLE.includes("authorizeMerchantPlace"));
  assert.ok(CALLABLE.includes("merchant_place_access_required"));
  assert.ok(CALLABLE.includes('throw new HttpsError("unauthenticated"'),
    "an anonymous caller is refused before anything is read");
});

test("30. it reads the AUTHORIZED id, never the one the caller sent", () => {
  assert.ok(CALLABLE.includes("const canonicalPlaceId = auth.canonicalPlaceId;"),
    "the authorized id is what the reads use");
  const readsRequested = /readDays\(\s*requested/.test(CALLABLE);
  assert.equal(readsRequested, false, "the caller-supplied id must never address a read");
});

test("31. the range is validated before any read, so a scan cannot be provoked", () => {
  const rangeAt = CALLABLE.indexOf("resolveRange(data, nowMs)");
  const readAt = CALLABLE.indexOf("await readDays(");
  assert.ok(rangeAt > 0 && readAt > rangeAt, "validation must precede reads");
  assert.ok(CALLABLE.includes("range_too_large") || CALLABLE.includes("dayKeysBetween"));
});

test("32. the response echoes no merchant or user identifier", () => {
  const start = CALLABLE.indexOf("return {\n      status: \"OK\",");
  const body = CALLABLE.slice(start, CALLABLE.indexOf("};", start));
  for (const leak of ["uid", "merchantId", "memberId", "email", "auth.canonicalPlaceId"]) {
    assert.equal(body.includes(leak), false, `response leaked ${leak}`);
  }
  assert.ok(body.includes("restaurantName"), "the shop's own public name is fine");
});

// ── METRICS WHOSE BUTTON DOES NOT EXIST ────────────────────────────────────

test("33. a metric with no working button is never reported as zero", () => {
  const summary = buildMerchantSummary({
    canonicalPlaceId: PLACE, fromDay: "2026-09-08", toDay: "2026-09-08",
    timezone: "Asia/Kuala_Lumpur",
    days: [day("2026-09-08", {profileViews: 40})],
    previous: null, hasAnyHistory: true,
  });
  for (const key of ["callTaps", "websiteTaps", "promotionTaps"]) {
    assert.equal(summary.metrics[key].state, "not_tracked", `${key} must not read as measured`);
    assert.equal(summary.metrics[key].value, null,
      `${key}: zero would claim nobody did it, when in fact nobody could`);
    assert.ok((summary.metrics[key].note ?? "").length > 10, `${key} must explain itself`);
  }
  // ...while a metric that IS wired keeps reporting normally.
  assert.equal(summary.metrics.profileViews.state, "recorded");
  assert.equal(summary.metrics.profileViews.value, 40);
});

test("34. CTR is refused while taps are unmeasurable, even with impressions", () => {
  const summary = buildMerchantSummary({
    canonicalPlaceId: PLACE, fromDay: "2026-09-08", toDay: "2026-09-08",
    timezone: "Asia/Kuala_Lumpur",
    days: [day("2026-09-08", {promotionImpressions: 500})],
    previous: null, hasAnyHistory: true,
  });
  assert.equal(summary.metrics.promotionCtr.state, "not_tracked");
  assert.equal(summary.metrics.promotionCtr.value, null,
    "500 impressions and 0 measurable taps is not a 0% click rate");
});

test("35. an uninstrumented metric never produces a comparison percentage", () => {
  const summary = buildMerchantSummary({
    canonicalPlaceId: PLACE, fromDay: "2026-09-08", toDay: "2026-09-08",
    timezone: "Asia/Kuala_Lumpur",
    days: [day("2026-09-08", {profileViews: 10})],
    previous: {fromDay: "2026-09-07", toDay: "2026-09-07",
      days: [{counters: {...emptyCounters(), profileViews: 5}}]},
    hasAnyHistory: true,
  });
  assert.equal(summary.comparison.available, true);
  assert.equal(summary.comparison.changes.profileViews, 1);
  for (const key of Object.keys(NOT_YET_INSTRUMENTED)) {
    assert.equal(key in summary.comparison.changes, false,
      `${key} must not carry a change figure`);
  }
});

test("36. every not-tracked reason reaches the merchant payload", () => {
  const summary = buildMerchantSummary({
    canonicalPlaceId: PLACE, fromDay: "2026-09-08", toDay: "2026-09-08",
    timezone: "Asia/Kuala_Lumpur", days: [day("2026-09-08", {})],
    previous: null, hasAnyHistory: true,
  });
  for (const key of [...Object.keys(NOT_TRACKED_METRICS), ...Object.keys(NOT_YET_INSTRUMENTED)]) {
    assert.ok(summary.notTracked[key], `${key} must be explained to the merchant`);
  }
});
