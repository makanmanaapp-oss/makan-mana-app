/**
 * B5 — catching up after a nightly repair did not run.
 *
 * The failure this guards against is quiet: one missed invocation, and the day
 * it should have repaired is never looked at again, because the next night's
 * "yesterday" has moved on. These tests pin the policy that closes that hole,
 * and pin its BOUNDS just as hard — a recovery that quietly widened its scan
 * would turn one bad week into a full-history rescan.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  RECOVERY_LOOKBACK_DAYS,
  businessDayEndMs,
  mirrorNeedsRepush,
  planRecovery,
  reconcileReceiptId,
  recoveryDayKeys,
} from "../cmsAnalyticsRecovery";

/** 2026-09-18 03:41 MYT — the hour the job actually runs. */
const RUN_AT = Date.UTC(2026, 8, 17, 19, 41, 0);
const TODAY = "2026-09-18";
const YESTERDAY = "2026-09-17";

/** A receipt written by a run on the morning AFTER the given day closed. */
const settledAfter = (dayKey: string) => businessDayEndMs(dayKey) + 3 * 3_600_000 + 41 * 60_000;

function plan(receipts: Record<string, number>, nowMs = RUN_AT, lookbackDays?: number) {
  return planRecovery({
    nowMs,
    lookbackDays,
    receiptCompletedAtMs: (dayKey) => receipts[dayKey] ?? null,
  });
}

test("1. the window is bounded and starts at today", () => {
  const days = recoveryDayKeys(RUN_AT);
  assert.equal(days.length, RECOVERY_LOOKBACK_DAYS);
  assert.equal(days[0], TODAY);
  assert.equal(days[1], YESTERDAY);
  assert.equal(days[days.length - 1], "2026-09-12");
  assert.equal(new Set(days).size, days.length, "no day may be repaired twice in one run");
});

test("2. a healthy night repairs exactly today and yesterday", () => {
  // Steady state: every older day was settled by an earlier run.
  const receipts: Record<string, number> = {};
  for (const dayKey of recoveryDayKeys(RUN_AT).slice(2)) {
    receipts[dayKey] = settledAfter(dayKey);
  }
  const result = plan(receipts);
  assert.deepEqual(result.due, [YESTERDAY, TODAY], "oldest first");
  assert.equal(result.settled.length, RECOVERY_LOOKBACK_DAYS - 2);
  assert.equal(result.beyondHorizon, false);
});

test("3. today is never settled, because the day is still open", () => {
  // A receipt written during the day says nothing about the hours after it.
  const result = plan({[TODAY]: RUN_AT});
  assert.ok(result.due.includes(TODAY));
  assert.ok(!result.settled.includes(TODAY));
});

test("4. a receipt written before the day closed does not settle it", () => {
  const duringYesterday = businessDayEndMs(YESTERDAY) - 60_000;
  const result = plan({[YESTERDAY]: duringYesterday});
  assert.ok(result.due.includes(YESTERDAY),
    "a run that saw only part of the day cannot declare it done");
});

test("5. ONE MISSED NIGHT: the skipped day is repaired by the next run", () => {
  // 2026-09-16 closed, and the night that should have repaired it never ran, so
  // it has no receipt. Under the old yesterday+today rule it was unreachable
  // forever; here the next run picks it up.
  const receipts: Record<string, number> = {};
  for (const dayKey of recoveryDayKeys(RUN_AT).slice(3)) {
    receipts[dayKey] = settledAfter(dayKey);
  }
  const result = plan(receipts);
  assert.deepEqual(result.due, ["2026-09-16", YESTERDAY, TODAY]);
  assert.equal(result.beyondHorizon, false);
});

test("6. several missed nights are all repaired, still within the window", () => {
  const result = plan({
    "2026-09-12": settledAfter("2026-09-12"),
    "2026-09-13": settledAfter("2026-09-13"),
  });
  assert.deepEqual(result.due,
    ["2026-09-14", "2026-09-15", "2026-09-16", YESTERDAY, TODAY]);
  assert.equal(result.beyondHorizon, false,
    "the oldest day in the window is settled, so nothing is out of reach");
});

test("7. an outage longer than the horizon is reported, not silently widened", () => {
  const result = plan({});
  assert.equal(result.due.length, RECOVERY_LOOKBACK_DAYS);
  assert.equal(result.beyondHorizon, true,
    "the oldest day in the window is unsettled, so older days may be unrepaired too");
  // The scan stays bounded whatever the caller is told.
  assert.ok(!result.due.includes("2026-09-11"));
});

test("8. the horizon is a real ceiling: a day outside it is never scanned", () => {
  const result = plan({}, RUN_AT, 2);
  assert.deepEqual(result.due, [YESTERDAY, TODAY]);
  assert.ok(!result.due.includes("2026-09-16"),
    "a bounded lookback must not read days it did not promise to read");
});

test("9. receipts are scoped, so the mirror cannot settle the aggregate's day", () => {
  assert.notEqual(reconcileReceiptId("aggregate", TODAY), reconcileReceiptId("mirror", TODAY));
  assert.match(reconcileReceiptId("mirror", TODAY), /mirror/);
});

test("10. the mirror re-pushes a day only when it is actually behind", () => {
  const dayEnd = businessDayEndMs(YESTERDAY);

  assert.equal(mirrorNeedsRepush({
    dayKey: YESTERDAY, mirrorCompletedAtMs: null, aggregateCompletedAtMs: null,
  }), true, "never pushed");

  assert.equal(mirrorNeedsRepush({
    dayKey: YESTERDAY, mirrorCompletedAtMs: dayEnd - 60_000, aggregateCompletedAtMs: null,
  }), true, "pushed while the day was still open");

  assert.equal(mirrorNeedsRepush({
    dayKey: YESTERDAY,
    mirrorCompletedAtMs: dayEnd + 60_000,
    aggregateCompletedAtMs: dayEnd + 30_000,
  }), false, "pushed after the day closed and after the last repair");

  assert.equal(mirrorNeedsRepush({
    dayKey: YESTERDAY,
    mirrorCompletedAtMs: dayEnd + 60_000,
    aggregateCompletedAtMs: dayEnd + 90_000,
  }), true, "the aggregate was repaired after the mirror last pushed");
});

test("11. a repaired-later aggregate is what keeps the two recoveries in step", () => {
  // The exact sequence the coordination exists for: the mirror pushed a day, and
  // only afterwards did the aggregate job repair that day's counters. Leaving the
  // mirror alone would leave the console showing figures the repair replaced.
  const dayEnd = businessDayEndMs("2026-09-15");
  const mirrorPushed = dayEnd + 3_600_000;
  const aggregateRepairedLater = mirrorPushed + 86_400_000;
  assert.equal(mirrorNeedsRepush({
    dayKey: "2026-09-15",
    mirrorCompletedAtMs: mirrorPushed,
    aggregateCompletedAtMs: aggregateRepairedLater,
  }), true);
});
