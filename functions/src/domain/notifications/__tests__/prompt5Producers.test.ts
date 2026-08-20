/**
 * PROMPT 5 — Fit/Food/Billing/System producer integration (pure logic).
 */
import assert from "node:assert/strict";
import {test} from "node:test";

import {
  billingNotificationForRtdn,
  billingSourceEventId,
} from "../../billing/billingNotifications";
import {
  categoryForType,
  CRITICAL_TYPES,
} from "../notificationContract";
import {isPushEligibleType} from "../pushDelivery";
import {
  MEAL_LOCAL_MINUTE,
  mealReminderSourceEventId,
  mealScheduleAction,
  nextMealBackfillCursor,
  nextMealDueAtMs,
  recipientLocalDate,
  tzOffsetMs,
} from "../mealReminder";

// ---- billing: RTDN → canonical notification ----
test("RTDN purchased(4) → subscription_started (billing, non-critical)", () => {
  const s = billingNotificationForRtdn(4);
  assert.equal(s?.type, "subscription_started");
  assert.equal(categoryForType("subscription_started"), "billing");
  assert.equal(CRITICAL_TYPES.has("subscription_started"), false);
});
test("RTDN renewed(2) → subscription_renewed", () => {
  assert.equal(billingNotificationForRtdn(2)?.type, "subscription_renewed");
});
test("RTDN cancelled(3) → subscription_cancelled", () => {
  assert.equal(billingNotificationForRtdn(3)?.type, "subscription_cancelled");
});
test("RTDN on_hold(5) + grace(6) → payment_issue (CRITICAL)", () => {
  assert.equal(billingNotificationForRtdn(5)?.type, "payment_issue");
  assert.equal(billingNotificationForRtdn(6)?.type, "payment_issue");
  assert.equal(CRITICAL_TYPES.has("payment_issue"), true);
});
test("other RTDN states → no user notification (audit-only)", () => {
  for (const t of [1, 7, 10, 12, 13, 20, 99]) {
    assert.equal(billingNotificationForRtdn(t), null, `type ${t}`);
  }
});
test("billing source id = one notification per RTDN message (dedup)", () => {
  assert.equal(billingSourceEventId("abc123"), "rtdn:abc123");
  assert.equal(billingSourceEventId("abc123"), billingSourceEventId("abc123"));
});

// ---- push eligibility after Prompt 5 category activation + Prompt 6.1 Gate C ----
test("food/fit/report/billing/system/marketing are push-eligible; tongtong is not", () => {
  assert.equal(isPushEligibleType("meal_reminder", "food"), true);
  assert.equal(isPushEligibleType("fit_reminder", "fit"), true);
  assert.equal(isPushEligibleType("weekly_report_ready", "report"), true);
  assert.equal(isPushEligibleType("subscription_started", "billing"), true);
  assert.equal(isPushEligibleType("system_announcement", "system"), true);
  // PROMPT 6.1 Gate C: marketing is push-ELIGIBLE so the push preference is
  // truthful. It stays OPT-IN + default OFF/OFF (resolver-enforced), so this is
  // eligibility, never unsolicited delivery.
  assert.equal(isPushEligibleType("marketing_campaign", "marketing"), true);
  assert.equal(isPushEligibleType("tongtong_bill_created", "tongtong"), false);
});
test("payment_issue push-eligible via critical allowlist even though billing", () => {
  assert.equal(isPushEligibleType("payment_issue", "billing"), true);
});

// ---- meal reminder: recipient-local timing (Part 9/16/30) ----
test("meal reminder source id stable per slot/local-date (retry/concurrency safe)", () => {
  assert.equal(mealReminderSourceEventId("lunch", "2026-08-18"), "meal:lunch:2026-08-18");
  assert.notEqual(
    mealReminderSourceEventId("lunch", "2026-08-18"),
    mealReminderSourceEventId("dinner", "2026-08-18"));
});

test("next lunch (12:15) is 12:15 LOCAL in each recipient zone", () => {
  const after = Date.UTC(2026, 0, 15, 0, 0); // fixed reference instant (winter)
  const L = MEAL_LOCAL_MINUTE.lunch;
  const localHM = (tz: string) => {
    const due = nextMealDueAtMs(tz, L, after);
    const p = new Intl.DateTimeFormat("en-US", {timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit"}).format(new Date(due));
    return p;
  };
  assert.equal(localHM("Asia/Kuala_Lumpur"), "12:15");
  assert.equal(localHM("Asia/Tokyo"), "12:15");
  assert.equal(localHM("Europe/London"), "12:15");
  assert.equal(localHM("America/New_York"), "12:15");
});

test("nextMealDueAt is strictly after the reference instant", () => {
  const after = Date.UTC(2026, 0, 15, 12, 0); // already past some local noons
  for (const tz of ["Asia/Kuala_Lumpur", "America/New_York", "Europe/London"]) {
    assert.ok(nextMealDueAtMs(tz, MEAL_LOCAL_MINUTE.dinner, after) > after, tz);
  }
});

test("DST: dinner stays 19:00 LOCAL across a New York DST transition (Part 15)", () => {
  const D = MEAL_LOCAL_MINUTE.dinner;
  const hm = (afterMs: number) => {
    const due = nextMealDueAtMs("America/New_York", D, afterMs);
    return {
      hm: new Intl.DateTimeFormat("en-US", {timeZone: "America/New_York", hourCycle: "h23", hour: "2-digit", minute: "2-digit"}).format(new Date(due)),
      off: tzOffsetMs("America/New_York", due) / 3600000,
    };
  };
  const winter = hm(Date.UTC(2026, 0, 15, 0, 0)); // EST (UTC-5)
  const summer = hm(Date.UTC(2026, 6, 15, 0, 0)); // EDT (UTC-4)
  assert.equal(winter.hm, "19:00");
  assert.equal(summer.hm, "19:00");
  assert.equal(winter.off, -5); // offset differs...
  assert.equal(summer.off, -4); // ...but local wall-clock is unchanged.
});

test("DST: London dinner 19:00 local GMT vs BST", () => {
  const D = MEAL_LOCAL_MINUTE.dinner;
  const hm = (m: number) => new Intl.DateTimeFormat("en-US", {timeZone: "Europe/London", hourCycle: "h23", hour: "2-digit", minute: "2-digit"}).format(new Date(nextMealDueAtMs("Europe/London", D, m)));
  assert.equal(hm(Date.UTC(2026, 0, 15, 0, 0)), "19:00"); // GMT
  assert.equal(hm(Date.UTC(2026, 6, 15, 0, 0)), "19:00"); // BST
});

test("recipient-local date drives dedup across the UTC date boundary (Part 17)", () => {
  // 2026-08-18T17:00Z: KL is already 2026-08-19; New York is still 2026-08-18.
  const t = Date.UTC(2026, 7, 18, 17, 0);
  assert.equal(recipientLocalDate("Asia/Kuala_Lumpur", t), "2026-08-19");
  assert.equal(recipientLocalDate("America/New_York", t), "2026-08-18");
});

// ---- PROMPT 5A.1: schedule lifecycle actions (Part 2/6/7/8/24/25) ----
test("terminal recipient (missing/deleted/disabled) → DISABLE (leave due set)", () => {
  assert.equal(mealScheduleAction(false, null), "disable");
  assert.equal(mealScheduleAction(false, {ok: true}), "disable"); // active flag wins
});
test("eligible + handled (created/duplicate/suppressed) → ADVANCE (no replay)", () => {
  // notifySafely returns ok:true for created AND for suppressed_preference /
  // suppressed_quiet_hours — all are 'handled', so the occurrence advances.
  assert.equal(mealScheduleAction(true, {ok: true}), "advance");
});
test("eligible + transient persistence failure → RETRY (no advance, no loss)", () => {
  assert.equal(mealScheduleAction(true, {ok: false}), "retry");
});

// ---- PROMPT 5A.1: backfill continuation checkpoint (Part 15/16/29) ----
test("backfill cursor resumes mid-sweep and resets on completion", () => {
  // more candidates remain → persist the last cursor to resume next run.
  assert.equal(nextMealBackfillCursor(false, "users/u/pushDevices/d"), "users/u/pushDevices/d");
  // full pass reached → reset so the NEXT cycle restarts (no permanent stop).
  assert.equal(nextMealBackfillCursor(true, "users/u/pushDevices/d"), null);
  assert.equal(nextMealBackfillCursor(true, null), null);
});
