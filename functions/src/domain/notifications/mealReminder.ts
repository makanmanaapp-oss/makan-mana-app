/**
 * PROMPT 5A — pure meal-reminder time math (recipient-local, DST-aware).
 *
 * A meal reminder fires at the recipient's LOCAL wall-clock time in their
 * canonical IANA timezone — lunch 12:15, dinner 19:00 LOCAL — never a single
 * global Malaysia instant (Part 9). No fixed UTC offsets are stored: the offset
 * is derived from the zone AT the target date, so DST zones stay correct across
 * transitions (Part 10/15). The scheduler stores `nextDueAt` (a UTC instant) and
 * advances it one local day at a time. Dedup uses the recipient-LOCAL date
 * (Part 16). No GPS — timezone comes from Notification Preferences (Part 13).
 */
export type MealSlot = "lunch" | "dinner";

/** Product default meal clock times as local minute-of-day (no per-user times). */
export const MEAL_LOCAL_MINUTE: Record<MealSlot, number> = {
  lunch: 12 * 60 + 15, // 12:15 local
  dinner: 19 * 60, //     19:00 local
};

export const MEAL_REMINDER_COPY: Record<MealSlot, {titleKey: string; bodyKey: string}> = {
  lunch: {titleKey: "notificationMealLunchTitle", bodyKey: "notificationMealLunchBody"},
  dinner: {titleKey: "notificationMealDinnerTitle", bodyKey: "notificationMealDinnerBody"},
};

interface ZonedParts {y: number; mo: number; d: number; h: number; mi: number; s: number}

function zonedParts(timeZone: string, ms: number): ZonedParts {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0");
  return {y: g("year"), mo: g("month"), d: g("day"), h: g("hour"), mi: g("minute"), s: g("second")};
}

/** Offset (local − UTC) in ms for `timeZone` at instant `ms`. DST-aware. */
export function tzOffsetMs(timeZone: string, ms: number): number {
  const p = zonedParts(timeZone, ms);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return asUtc - ms;
}

/** UTC instant of local wall-clock `y-mo-d` at `localMinute` in `timeZone`. */
export function zonedLocalToUtcMs(
  timeZone: string, y: number, mo: number, d: number, localMinute: number,
): number {
  const h = Math.floor(localMinute / 60);
  const mi = localMinute % 60;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off1 = tzOffsetMs(timeZone, guess);
  let utc = guess - off1;
  const off2 = tzOffsetMs(timeZone, utc); // correct across a DST edge
  if (off2 !== off1) utc = guess - off2;
  return utc;
}

/** Recipient-local date (YYYY-MM-DD) for an instant — the dedup anchor. */
export function recipientLocalDate(timeZone: string, ms: number): string {
  const p = zonedParts(timeZone, ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}

/** UTC instant of the NEXT local `localMinute` in `timeZone` strictly after `afterMs`. */
export function nextMealDueAtMs(timeZone: string, localMinute: number, afterMs: number): number {
  const day = 24 * 3600 * 1000;
  for (let addDays = 0; addDays <= 2; addDays++) {
    const p = zonedParts(timeZone, afterMs + addDays * day);
    const utc = zonedLocalToUtcMs(timeZone, p.y, p.mo, p.d, localMinute);
    if (utc > afterMs) return utc;
  }
  // Deterministic fallback (should be unreachable): +1 day from now.
  const p = zonedParts(timeZone, afterMs + day);
  return zonedLocalToUtcMs(timeZone, p.y, p.mo, p.d, localMinute);
}

/**
 * ONE reminder per recipient, per slot, per recipient-LOCAL date. A scheduler
 * retry / overlap / duplicate fire reuses this identity → createNotification
 * dedups it (Part 16).
 */
export function mealReminderSourceEventId(slot: MealSlot, localDate: string): string {
  return `meal:${slot}:${localDate}`;
}

/**
 * PROMPT 5A.1 — reconciliation checkpoint decision (Part 15/16). While a sweep
 * has more candidates, persist the last-processed cursor to resume next run;
 * when the candidate set is exhausted, reset to null so the NEXT cycle restarts
 * safely from the beginning. Every candidate is eventually processed — no
 * permanent starvation past the per-run bound.
 */
export function nextMealBackfillCursor(
  reachedEnd: boolean, lastCursor: string | null,
): string | null {
  return reachedEnd ? null : lastCursor;
}

export type MealScheduleAction = "disable" | "advance" | "retry";

/**
 * PROMPT 5A.1 — what the dispatcher does with a due schedule (pure, Part 2/6/7/8):
 *  • recipient ineligible (missing/deleted/disabled) → DISABLE, so it leaves the
 *    due working set and is never re-queried every 15 min (reconciliation can
 *    re-enable it later).
 *  • recipient eligible + notification HANDLED (created/duplicate, or suppressed
 *    by preference/quiet hours) → ADVANCE to the next local occurrence; a
 *    suppressed occurrence is NOT replayed when the preference/quiet window later
 *    changes.
 *  • recipient eligible + transient PERSISTENCE failure → RETRY next dispatch
 *    (do not advance, do not lose the occurrence).
 */
export function mealScheduleAction(
  recipientActive: boolean,
  notified: {ok: boolean} | null,
): MealScheduleAction {
  if (!recipientActive) return "disable";
  return notified?.ok ? "advance" : "retry";
}
