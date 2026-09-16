/**
 * B5 — CMS banner analytics: the aggregation contract.
 *
 * Client events are ASSERTIONS. Everything below is about what the server
 * refuses to believe, and about the two properties that make the nightly
 * reconcile a repair rather than a second guess: determinism and idempotence.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CMS_ANALYTICS_MIRROR_ENTITY_TYPE,
  CMS_CTA_TAPPED_EVENT,
  CMS_IMPRESSION_EVENT,
  aggregateCmsEvents,
  cmsAnalyticsDailyDocId,
  cmsAnalyticsMirrorEventId,
  cmsCtr,
  cmsEventOccurredAtMs,
  emptyCmsCounters,
  sumCmsCounters,
  toCmsAnalyticsMirrorRecord,
  toCountableCmsEvent,
  type RawCmsEvent,
} from "../cmsAnalytics";

/** 16 Sep 2026 12:00 MYT. */
const NOW = Date.UTC(2026, 8, 16, 4, 0, 0);

let seq = 0;
function ev(overrides: Partial<RawCmsEvent> & {
  contentId?: string; placement?: string; visible?: unknown;
} = {}): RawCmsEvent {
  const {contentId, placement, visible, ...rest} = overrides;
  return {
    eventId: `e${seq++}`,
    eventType: CMS_IMPRESSION_EVENT,
    userId: "u1",
    serverTimestampMs: NOW,
    metadata: {
      contentId: contentId ?? "banner-1",
      placement: placement ?? "home_top",
      ...(visible === undefined ? {visible: true} : {visible}),
    },
    ...rest,
  };
}

// ── 1. WHAT THE SERVER REFUSES TO COUNT ────────────────────────────────────

test("1. an unknown event type is not a CMS signal", () => {
  assert.equal(toCountableCmsEvent(ev({eventType: "suggestion_viewed"}), NOW), null);
  assert.equal(toCountableCmsEvent(ev({eventType: ""}), NOW), null);
  assert.equal(toCountableCmsEvent(ev({eventType: null}), NOW), null);
  assert.equal(toCountableCmsEvent(ev({eventType: 42}), NOW), null);
});

test("2. an impression that does not assert visibility is refused", () => {
  // This is the line between "the widget existed" and "a person saw it".
  assert.equal(toCountableCmsEvent(ev({visible: false}), NOW), null);
  assert.equal(toCountableCmsEvent(ev({visible: "true"}), NOW), null);
  assert.equal(toCountableCmsEvent(ev({visible: 1}), NOW), null);
  assert.equal(toCountableCmsEvent(ev({visible: null}), NOW), null);
  const missing = {...ev(), metadata: {contentId: "banner-1", placement: "home_top"}};
  assert.equal(toCountableCmsEvent(missing, NOW), null);
});

test("3. a CTA tap needs no visibility flag — activation speaks for itself", () => {
  const tap = ev({eventType: CMS_CTA_TAPPED_EVENT, visible: null});
  const countable = toCountableCmsEvent(tap, NOW);
  assert.ok(countable);
  assert.equal(countable!.metric, "ctaTaps");
});

test("4. an event with no content identity is refused, never bucketed as ''", () => {
  assert.equal(toCountableCmsEvent(ev({contentId: ""}), NOW), null);
  assert.equal(toCountableCmsEvent(ev({contentId: "   "}), NOW), null);
  const noMeta = {...ev(), metadata: undefined};
  assert.equal(toCountableCmsEvent(noMeta, NOW), null);
  const wrongMeta = {...ev(), metadata: "banner-1"};
  assert.equal(toCountableCmsEvent(wrongMeta, NOW), null);
});

test("5. an unknown placement is refused", () => {
  assert.equal(toCountableCmsEvent(ev({placement: "sidebar"}), NOW), null);
  assert.equal(toCountableCmsEvent(ev({placement: ""}), NOW), null);
  assert.equal(toCountableCmsEvent(ev({placement: "HOME_TOP"}), NOW), null);
  for (const good of ["home_top", "home_mid", "explore_top", "restaurant_detail"]) {
    assert.ok(toCountableCmsEvent(ev({placement: good}), NOW), good);
  }
});

test("6. an event with no user cannot be deduplicated, so it is not counted", () => {
  assert.equal(toCountableCmsEvent(ev({userId: ""}), NOW), null);
  assert.equal(toCountableCmsEvent(ev({userId: null}), NOW), null);
  assert.equal(toCountableCmsEvent(ev({userId: 7}), NOW), null);
});

test("7. an absurdly long content id is refused rather than stored as a key", () => {
  assert.equal(toCountableCmsEvent(ev({contentId: "x".repeat(201)}), NOW), null);
  assert.ok(toCountableCmsEvent(ev({contentId: "x".repeat(200)}), NOW));
});

// ── 2. THE CLOCK ───────────────────────────────────────────────────────────

test("8. the server stamp wins over the device clock", () => {
  const skewed = ev({
    serverTimestampMs: NOW,
    clientTimestampMs: Date.UTC(2019, 0, 1),
  });
  assert.equal(cmsEventOccurredAtMs(skewed, 0), NOW);
});

test("9. the client stamp is only a fallback, and `now` the last resort", () => {
  const noServer = {...ev(), serverTimestampMs: undefined, clientTimestampMs: 1234};
  assert.equal(cmsEventOccurredAtMs(noServer, NOW), 1234);
  const neither = {...ev(), serverTimestampMs: undefined, clientTimestampMs: undefined};
  assert.equal(cmsEventOccurredAtMs(neither, NOW), NOW);
  const rubbish = {...ev(), serverTimestampMs: NaN, clientTimestampMs: "x"};
  assert.equal(cmsEventOccurredAtMs(rubbish, NOW), NOW);
});

// ── 3. MALAYSIA BUSINESS DAY ───────────────────────────────────────────────

test("10. the day boundary is Malaysia midnight, not UTC midnight", () => {
  // 2026-09-16 23:59:59.999 MYT === 2026-09-16T15:59:59.999Z
  const lastMomentOfDay = Date.UTC(2026, 8, 16, 15, 59, 59, 999);
  // One millisecond later is the NEXT Malaysia day, though UTC is still on
  // the 16th for another eight hours.
  const firstMomentOfNext = lastMomentOfDay + 1;

  const buckets = aggregateCmsEvents({
    events: [
      ev({userId: "a", serverTimestampMs: lastMomentOfDay}),
      ev({userId: "b", serverTimestampMs: firstMomentOfNext}),
    ],
    nowMs: NOW,
  });
  const days = buckets.map((b) => b.dayKey).sort();
  assert.deepEqual(days, ["2026-09-16", "2026-09-17"]);
  assert.equal(new Date(firstMomentOfNext).toISOString(), "2026-09-16T16:00:00.000Z");
});

test("11. an evening event does not leak into the previous UTC day", () => {
  // 21:00 MYT on the 16th is 13:00Z on the 16th — same day either way, but the
  // early hours are where a UTC bucket would be wrong.
  const earlyMorningMyt = Date.UTC(2026, 8, 16, 0, 30, 0); // 08:30 MYT on the 16th
  const buckets = aggregateCmsEvents({
    events: [ev({serverTimestampMs: earlyMorningMyt})],
    nowMs: NOW,
  });
  assert.equal(buckets[0].dayKey, "2026-09-16");
});

// ── 4. IDENTITY ────────────────────────────────────────────────────────────

test("12. banners, placements and days are separate buckets", () => {
  const buckets = aggregateCmsEvents({
    events: [
      ev({contentId: "a", placement: "home_top"}),
      ev({contentId: "b", placement: "home_top"}),
      ev({contentId: "a", placement: "home_mid"}),
      ev({contentId: "a", placement: "home_top", serverTimestampMs: NOW + 86_400_000}),
    ],
    nowMs: NOW,
  });
  assert.equal(buckets.length, 4);
});

test("13. the document id carries all three parts of the identity", () => {
  assert.equal(
    cmsAnalyticsDailyDocId("banner-1", "home_top", "2026-09-16"),
    "banner-1__home_top__2026-09-16",
  );
  // Two different banners can never collide on one row.
  assert.notEqual(
    cmsAnalyticsDailyDocId("a", "home_top", "2026-09-16"),
    cmsAnalyticsDailyDocId("b", "home_top", "2026-09-16"),
  );
});

// ── 5. IDEMPOTENCE AND DETERMINISM ─────────────────────────────────────────

test("14. the same person seeing a banner all day is one impression", () => {
  const events = Array.from({length: 40}, (_, i) =>
    ev({userId: "u1", serverTimestampMs: NOW + i * 60_000}));
  const [bucket] = aggregateCmsEvents({events, nowMs: NOW});
  assert.equal(bucket.counters.impressions, 1);
  assert.equal(bucket.distinctUsers, 1);
});

test("15. the same person tapping repeatedly is one tap", () => {
  // Without this, one enthusiastic user produces a click-through rate above
  // 100% and the whole metric stops meaning anything.
  const events = [
    ev({userId: "u1"}),
    ...Array.from({length: 9}, () =>
      ev({userId: "u1", eventType: CMS_CTA_TAPPED_EVENT})),
  ];
  const [bucket] = aggregateCmsEvents({events, nowMs: NOW});
  assert.equal(bucket.counters.impressions, 1);
  assert.equal(bucket.counters.ctaTaps, 1);
  assert.equal(cmsCtr(bucket.counters), 100);
});

test("16. the rate can never exceed 100%", () => {
  const events = [
    ev({userId: "a"}), ev({userId: "b"}), ev({userId: "c"}),
    ...["a", "b", "c"].flatMap((u) =>
      Array.from({length: 5}, () => ev({userId: u, eventType: CMS_CTA_TAPPED_EVENT}))),
  ];
  const [bucket] = aggregateCmsEvents({events, nowMs: NOW});
  assert.equal(bucket.counters.impressions, 3);
  assert.equal(bucket.counters.ctaTaps, 3);
  assert.equal(cmsCtr(bucket.counters), 100);
});

test("17. replaying the whole day changes nothing — the repair is safe", () => {
  const events = [
    ev({userId: "a"}), ev({userId: "b"}),
    ev({userId: "a", eventType: CMS_CTA_TAPPED_EVENT}),
  ];
  const once = aggregateCmsEvents({events, nowMs: NOW});
  const twice = aggregateCmsEvents({events: [...events, ...events], nowMs: NOW});
  assert.deepEqual(twice, once);
});

test("18. the result does not depend on the order events arrive in", () => {
  const events = [
    ev({userId: "a"}), ev({userId: "b", eventType: CMS_CTA_TAPPED_EVENT}),
    ev({userId: "b"}), ev({userId: "c"}),
  ];
  const forward = aggregateCmsEvents({events, nowMs: NOW});
  const backward = aggregateCmsEvents({events: [...events].reverse(), nowMs: NOW});
  assert.deepEqual(
    backward.map((b) => b.counters).sort(),
    forward.map((b) => b.counters).sort(),
  );
});

test("19. a tap with no matching impression still counts, and the rate refuses", () => {
  // Real: the impression can land in yesterday's bucket while the tap lands in
  // today's. Inventing an impression to make the rate tidy would be a lie.
  const [bucket] = aggregateCmsEvents({
    events: [ev({eventType: CMS_CTA_TAPPED_EVENT})],
    nowMs: NOW,
  });
  assert.equal(bucket.counters.impressions, 0);
  assert.equal(bucket.counters.ctaTaps, 1);
  assert.equal(cmsCtr(bucket.counters), null, "no denominator, so no rate");
});

test("20. rejected events do not create empty buckets", () => {
  const buckets = aggregateCmsEvents({
    events: [
      ev({contentId: ""}), ev({placement: "nope"}), ev({visible: false}),
      ev({userId: ""}), ev({eventType: "unrelated"}),
    ],
    nowMs: NOW,
  });
  assert.deepEqual(buckets, []);
});

// ── 6. THE RATE ────────────────────────────────────────────────────────────

test("21. no impressions means no rate, not nought per cent", () => {
  assert.equal(cmsCtr({impressions: 0, ctaTaps: 0}), null);
  assert.equal(cmsCtr({impressions: 0, ctaTaps: 5}), null);
  assert.equal(cmsCtr(emptyCmsCounters()), null);
  assert.equal(cmsCtr({impressions: NaN, ctaTaps: 1}), null);
  assert.equal(cmsCtr({impressions: -3, ctaTaps: 1}), null);
});

test("22. a real rate is a percentage", () => {
  assert.equal(cmsCtr({impressions: 100, ctaTaps: 0}), 0);
  assert.equal(cmsCtr({impressions: 100, ctaTaps: 25}), 25);
  assert.equal(cmsCtr({impressions: 3, ctaTaps: 1}), (1 / 3) * 100);
});

test("23. totals add up across days", () => {
  assert.deepEqual(
    sumCmsCounters([
      {impressions: 10, ctaTaps: 1},
      {impressions: 5, ctaTaps: 2},
      {impressions: NaN, ctaTaps: 3},
    ]),
    {impressions: 15, ctaTaps: 6},
  );
  assert.deepEqual(sumCmsCounters([]), emptyCmsCounters());
});

// ── 7. WHAT LEAVES FIREBASE ────────────────────────────────────────────────

test("24. the mirror record is aggregates only — no user ever travels", () => {
  const record = toCmsAnalyticsMirrorRecord({
    contentId: "banner-1",
    placement: "home_top",
    dayKey: "2026-09-16",
    counters: {impressions: 120, ctaTaps: 9},
    distinctUserCount: 118,
    updatedAtMs: NOW,
  });
  assert.deepEqual(record, {
    content_id: "banner-1",
    placement: "home_top",
    day_key: "2026-09-16",
    impressions: 120,
    cta_taps: 9,
    distinct_user_count: 118,
    updated_at_ms: NOW,
  });
  // An allowlist by construction: the record is built field by field, so a
  // field added to the document later cannot leak by being forgotten.
  const serialised = JSON.stringify(record);
  for (const forbidden of ["userId", "uid", "users", "events", "dedupe"]) {
    assert.ok(!serialised.includes(forbidden), forbidden);
  }
  assert.equal(Object.keys(record).length, 7);
});

test("25. the entity type is its own, never the merchant one", () => {
  assert.equal(CMS_ANALYTICS_MIRROR_ENTITY_TYPE, "cms_analytics_daily");
  assert.notEqual(CMS_ANALYTICS_MIRROR_ENTITY_TYPE, "merchant_analytics_daily");
});

test("26. the mirror event id changes only when the snapshot does", () => {
  const a = cmsAnalyticsMirrorEventId("b1", "home_top", "2026-09-16", 1000);
  const same = cmsAnalyticsMirrorEventId("b1", "home_top", "2026-09-16", 1000);
  const changed = cmsAnalyticsMirrorEventId("b1", "home_top", "2026-09-16", 2000);
  assert.equal(a, same, "an unchanged row is a safe duplicate");
  assert.notEqual(a, changed, "a repaired count must replace, not be rejected");
});

test("27. an unidentifiable row produces no event id at all", () => {
  assert.equal(cmsAnalyticsMirrorEventId("", "home_top", "2026-09-16", 1), null);
  assert.equal(cmsAnalyticsMirrorEventId("b1", "sidebar", "2026-09-16", 1), null);
  assert.equal(cmsAnalyticsMirrorEventId("b1", "home_top", "", 1), null);
});

test("28. history survives the banner — nothing here reads the content doc", () => {
  // An archived banner's events still aggregate: the pipeline keys on the id in
  // the event, never on a lookup that could come back empty.
  const [bucket] = aggregateCmsEvents({
    events: [ev({contentId: "archived-banner"})],
    nowMs: NOW,
  });
  assert.equal(bucket.contentId, "archived-banner");
  assert.equal(bucket.counters.impressions, 1);
});
