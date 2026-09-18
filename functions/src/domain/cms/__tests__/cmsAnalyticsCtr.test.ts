/**
 * B5 CORRECTNESS GATE — the seven ways a click-through rate goes wrong.
 *
 * An earlier version of this module claimed that deduplicating both events
 * guaranteed CTR <= 100%. That claim was FALSE. Impressions and taps are counts
 * of two INDEPENDENT sets of people, and dividing one by the other produced
 * 300% on the very first adversarial fixture below.
 *
 * The contract now is EXPOSED-USER CTR: the numerator is the intersection —
 * people who both had a qualifying impression and tapped, in the same bucket —
 * so the subset relationship is structural rather than hoped for. No tap is
 * discarded to achieve it; `ctaTaps` still reports every one, and
 * `unattributedTaps` names the difference instead of hiding it.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CMS_CTA_TAPPED_EVENT,
  CMS_IMPRESSION_EVENT,
  aggregateCmsEvents,
  cmsExposedUserCtr,
  unattributedTaps,
  type CmsDailyBucket,
  type RawCmsEvent,
} from "../cmsAnalytics";

/** 16 Sep 2026 12:00 MYT. */
const NOW = Date.UTC(2026, 8, 16, 4, 0, 0);
/** 2026-09-16 23:59:59 MYT. */
const LATE_ON_16TH = Date.UTC(2026, 8, 16, 15, 59, 59);
/** 2026-09-17 00:00:01 MYT. */
const JUST_AFTER_MIDNIGHT = Date.UTC(2026, 8, 16, 16, 0, 1);

let seq = 0;
function impression(userId: string, at = NOW): RawCmsEvent {
  return {
    eventId: `i${seq++}`,
    eventType: CMS_IMPRESSION_EVENT,
    userId,
    serverTimestampMs: at,
    metadata: {contentId: "b1", placement: "home_top", visible: true},
  };
}
function tap(userId: string, at = NOW): RawCmsEvent {
  return {
    eventId: `t${seq++}`,
    eventType: CMS_CTA_TAPPED_EVENT,
    userId,
    serverTimestampMs: at,
    metadata: {contentId: "b1", placement: "home_top"},
  };
}
function bucketFor(events: RawCmsEvent[], dayKey = "2026-09-16"): CmsDailyBucket | undefined {
  return aggregateCmsEvents({events, nowMs: NOW}).find((b) => b.dayKey === dayKey);
}

/** The invariant the whole contract exists to guarantee. */
function assertRateIsSane(bucket: CmsDailyBucket, label: string) {
  assert.ok(
    bucket.counters.engagedUsers <= bucket.counters.impressions,
    `${label}: engagedUsers must never exceed impressions`,
  );
  const rate = cmsExposedUserCtr(bucket.counters);
  if (rate !== null) {
    assert.ok(rate >= 0 && rate <= 100, `${label}: rate ${rate} outside 0..100`);
  }
}

// ── THE SEVEN SCENARIOS ────────────────────────────────────────────────────

test("A. fast tappers: a tap without a qualifying impression", () => {
  // The client requires half the card visible for a continuous second before it
  // emits an impression. A tap needs no dwell at all, so somebody who scrolls
  // to a banner and hits it immediately produces a tap and no impression.
  const events = [
    impression("slow"),
    tap("fast1"), tap("fast2"), tap("fast3"),
  ];
  const bucket = bucketFor(events)!;

  assert.equal(bucket.counters.impressions, 1);
  assert.equal(bucket.counters.ctaTaps, 3, "every real tap is still counted");
  assert.equal(bucket.counters.engagedUsers, 0, "none of them had an impression here");

  // THE OLD CONTRACT: 3 / 1 = 300%.
  assert.equal((bucket.counters.ctaTaps / bucket.counters.impressions) * 100, 300);
  // THE NEW ONE.
  assert.equal(cmsExposedUserCtr(bucket.counters), 0);
  assert.equal(unattributedTaps(bucket.counters), 3, "stated, not hidden");
  assertRateIsSane(bucket, "A");
});

test("B. impression recorded, CTA delivery fails", () => {
  // Under-counts the numerator. Honest and unavoidable; the rate reads low
  // rather than impossible, which is the right direction to fail.
  const bucket = bucketFor([impression("u1"), impression("u2")])!;
  assert.equal(bucket.counters.impressions, 2);
  assert.equal(bucket.counters.ctaTaps, 0);
  assert.equal(bucket.counters.engagedUsers, 0);
  assert.equal(cmsExposedUserCtr(bucket.counters), 0);
  assertRateIsSane(bucket, "B");
});

test("C. CTA recorded, impression delivery fails", () => {
  const bucket = bucketFor([tap("u1"), tap("u2")])!;
  assert.equal(bucket.counters.impressions, 0);
  assert.equal(bucket.counters.ctaTaps, 2, "the taps really happened");
  assert.equal(bucket.counters.engagedUsers, 0);
  // No denominator, so no rate — NOT a zero, and certainly not infinity.
  assert.equal(cmsExposedUserCtr(bucket.counters), null);
  assert.equal(unattributedTaps(bucket.counters), 2);
  assertRateIsSane(bucket, "C");
});

test("D. impression at 23:59:59 MYT, CTA after midnight", () => {
  const events = [
    impression("crossover", LATE_ON_16TH),
    tap("crossover", JUST_AFTER_MIDNIGHT),
    // Somebody else, wholly inside the 17th, so that day has a denominator.
    impression("other", JUST_AFTER_MIDNIGHT + 60_000),
  ];
  const day16 = bucketFor(events, "2026-09-16")!;
  const day17 = bucketFor(events, "2026-09-17")!;

  // The impression counts on the 16th, the tap on the 17th. Neither day sees
  // the pair, and that is correct: a daily bucket cannot span midnight.
  assert.equal(day16.counters.impressions, 1);
  assert.equal(day16.counters.ctaTaps, 0);
  assert.equal(day16.counters.engagedUsers, 0);

  assert.equal(day17.counters.impressions, 1, "only `other`");
  assert.equal(day17.counters.ctaTaps, 1, "the crossover tap");
  assert.equal(day17.counters.engagedUsers, 0, "the tapper had no impression here");

  // THE OLD CONTRACT on the 17th: 1 / 1 = 100%, from two different people.
  assert.equal(cmsExposedUserCtr(day17.counters), 0);
  assert.equal(unattributedTaps(day17.counters), 1);
  assertRateIsSane(day16, "D16");
  assertRateIsSane(day17, "D17");
});

test("E. the CTA reaches the backend before its impression", () => {
  // Order independence: the aggregation is a set intersection, so which event
  // arrives first cannot change the answer.
  const out = [tap("u1"), impression("u1")];
  const inOrder = [impression("u1"), tap("u1")];
  const a = bucketFor(out)!;
  const b = bucketFor(inOrder)!;
  assert.deepEqual(a.counters, b.counters);
  assert.equal(a.counters.engagedUsers, 1, "the pair is complete either way");
  assert.equal(cmsExposedUserCtr(a.counters), 100);
  assertRateIsSane(a, "E");
});

test("F. a duplicate impression arrives after reconciliation", () => {
  // Reconciliation recomputes from the whole event stream, so a replayed event
  // is simply a member of a set that already contains it.
  const events = [impression("u1"), impression("u2"), tap("u1")];
  const first = bucketFor(events)!;
  const afterReplay = bucketFor([...events, impression("u1"), impression("u1")])!;
  assert.deepEqual(afterReplay.counters, first.counters);
  assert.equal(afterReplay.counters.impressions, 2);
  assert.equal(afterReplay.counters.engagedUsers, 1);
  assertRateIsSane(afterReplay, "F");
});

test("G. the same user sees the same banner on another day", () => {
  const events = [
    impression("u1", NOW), tap("u1", NOW),
    impression("u1", NOW + 86_400_000), tap("u1", NOW + 86_400_000),
  ];
  const buckets = aggregateCmsEvents({events, nowMs: NOW});
  assert.equal(buckets.length, 2, "two days, two buckets");
  for (const bucket of buckets) {
    assert.equal(bucket.counters.impressions, 1);
    assert.equal(bucket.counters.engagedUsers, 1);
    assert.equal(cmsExposedUserCtr(bucket.counters), 100);
    assertRateIsSane(bucket, `G:${bucket.dayKey}`);
  }
});

// ── THE INVARIANT, UNDER PRESSURE ──────────────────────────────────────────

test("H. the rate stays within 0..100 across a large mixed population", () => {
  // Deliberately adversarial: many more tappers than viewers, overlapping only
  // partially, spread across both sides of the midnight boundary.
  const events: RawCmsEvent[] = [];
  for (let i = 0; i < 40; i++) events.push(impression(`viewer${i}`));
  for (let i = 0; i < 25; i++) events.push(tap(`viewer${i}`));   // engaged
  for (let i = 0; i < 60; i++) events.push(tap(`ghost${i}`));    // never saw it
  for (let i = 0; i < 10; i++) events.push(tap(`viewer${i}`, JUST_AFTER_MIDNIGHT));

  const day = bucketFor(events)!;
  assert.equal(day.counters.impressions, 40);
  assert.equal(day.counters.ctaTaps, 85, "25 viewers + 60 ghosts");
  assert.equal(day.counters.engagedUsers, 25);
  assert.equal(cmsExposedUserCtr(day.counters), 62.5);
  assert.equal(unattributedTaps(day.counters), 60);
  assertRateIsSane(day, "H");

  // The raw ratio would have been 212.5%.
  assert.ok((day.counters.ctaTaps / day.counters.impressions) * 100 > 100);
});

test("I. no ordering of a fixed event set changes the result", () => {
  const events = [
    impression("a"), tap("a"), impression("b"), tap("c"),
    impression("c"), tap("b"), impression("d"),
  ];
  const forward = bucketFor(events)!;
  const backward = bucketFor([...events].reverse())!;
  const shuffled = bucketFor([events[3], events[0], events[6], events[2], events[5], events[1], events[4]])!;
  assert.deepEqual(backward.counters, forward.counters);
  assert.deepEqual(shuffled.counters, forward.counters);
  assert.equal(forward.counters.impressions, 4);
  assert.equal(forward.counters.ctaTaps, 3);
  assert.equal(forward.counters.engagedUsers, 3);
});

test("J. a corrupted stored row cannot produce a rate above 100%", () => {
  // The aggregation cannot emit this, but storage could be tampered with or a
  // future writer could regress. The rate refuses to exceed 100 regardless.
  assert.equal(cmsExposedUserCtr({impressions: 10, ctaTaps: 99, engagedUsers: 99}), 100);
  assert.equal(cmsExposedUserCtr({impressions: 10, ctaTaps: 5, engagedUsers: -3}), 0);
  assert.equal(cmsExposedUserCtr({impressions: 10, ctaTaps: 5, engagedUsers: NaN}), 0);
});

test("K. unattributed taps are never negative and never invented", () => {
  assert.equal(unattributedTaps({impressions: 10, ctaTaps: 3, engagedUsers: 3}), 0);
  assert.equal(unattributedTaps({impressions: 10, ctaTaps: 3, engagedUsers: 10}), 0);
  assert.equal(unattributedTaps({impressions: 0, ctaTaps: 0, engagedUsers: 0}), 0);
  assert.equal(unattributedTaps({impressions: 1, ctaTaps: NaN, engagedUsers: 0}), 0);
});

// ── THE INVARIANT AT ITS SOURCE ────────────────────────────────────────────

test("L. the aggregation can never emit engagedUsers > impressions", () => {
  // The storage clamp is last-resort. THIS is the real guarantee: whatever mix
  // of events arrives, the intersection is computed from set membership and so
  // is bounded by the impression set. Exercised over many shapes rather than
  // asserted once.
  const shapes: RawCmsEvent[][] = [];
  for (let viewers = 0; viewers <= 6; viewers++) {
    for (let tappers = 0; tappers <= 6; tappers++) {
      for (const overlap of [0, 1, 3, 6]) {
        const events: RawCmsEvent[] = [];
        for (let i = 0; i < viewers; i++) events.push(impression(`v${i}`));
        for (let i = 0; i < tappers; i++) {
          // `overlap` of the tappers are people who also viewed.
          events.push(tap(i < overlap ? `v${i}` : `t${i}`));
        }
        shapes.push(events);
      }
    }
  }
  let checked = 0;
  for (const events of shapes) {
    const bucket = bucketFor(events);
    if (!bucket) continue;
    checked += 1;
    assert.ok(
      bucket.counters.engagedUsers <= bucket.counters.impressions,
      `engaged ${bucket.counters.engagedUsers} > impressions ` +
      `${bucket.counters.impressions}`,
    );
    const rate = cmsExposedUserCtr(bucket.counters);
    if (rate !== null) assert.ok(rate >= 0 && rate <= 100, `rate ${rate}`);
  }
  assert.ok(checked > 100, `only ${checked} shapes exercised`);
});
