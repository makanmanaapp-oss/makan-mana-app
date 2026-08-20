/**
 * PROMPT 5A — meal-reminder schedule store (I/O).
 *
 * `meal_reminder_schedules/{uid}__{slot}` is SERVER-managed operational state: it
 * is the authoritative reminder audience (one doc per eligible recipient+slot),
 * NOT the pushDevices registry. Each doc carries the recipient's canonical IANA
 * timezone + `nextDueAt` (a UTC instant of the next LOCAL meal time). The
 * dispatcher queries due docs (`nextDueAt <= now`) — a small indexed set — so it
 * never scans the whole user base. Clients can never write these docs (rules).
 */
import {db, Timestamp} from "../config/firebase";
import {isServerUsableTimezone} from "../domain/notifications/preferenceValidation";
import {
  MEAL_LOCAL_MINUTE,
  MealSlot,
  nextMealDueAtMs,
} from "../domain/notifications/mealReminder";

export const MEAL_SCHEDULES = "meal_reminder_schedules";
const SLOTS: MealSlot[] = ["lunch", "dinner"];
const DEFAULT_TZ = "Asia/Kuala_Lumpur";

export function scheduleId(uid: string, slot: MealSlot): string {
  return `${uid}__${slot}`;
}

/**
 * Canonical recipient timezone (Part 13): the saved Notification-Preferences
 * IANA zone → else the product default. Never an abbreviation/offset.
 */
export function resolveUserTimezone(userData: FirebaseFirestore.DocumentData | undefined): string {
  const prefs = (userData?.notificationPreferences ?? {}) as {
    quietHours?: {timezone?: unknown};
  };
  const tz = prefs.quietHours?.timezone;
  if (typeof tz === "string" && isServerUsableTimezone(tz)) return tz;
  return DEFAULT_TZ;
}

export interface MealScheduleDoc {
  uid: string;
  slot: MealSlot;
  timezone: string;
  localMinute: number;
  nextDueAt: FirebaseFirestore.Timestamp;
  enabled: boolean;
  schemaVersion: number;
  updatedAt: number;
}

/**
 * Create/refresh both meal schedules for one recipient from their timezone.
 * Idempotent: recomputes `nextDueAt` (recipient-local), so a timezone change
 * (Part 24) is picked up on the next preference save or the daily backfill.
 * Preserves an already-future `nextDueAt` for the SAME timezone so a refresh
 * never drags the next reminder backwards or duplicates a same-day fire.
 */
export async function upsertMealSchedules(
  uid: string,
  userData: FirebaseFirestore.DocumentData | undefined,
  nowMs: number,
): Promise<void> {
  const timezone = resolveUserTimezone(userData);
  const batch = db.batch();
  for (const slot of SLOTS) {
    const ref = db.collection(MEAL_SCHEDULES).doc(scheduleId(uid, slot));
    const existing = await ref.get();
    const prev = existing.data() as MealScheduleDoc | undefined;
    let nextDueMs: number;
    if (prev && prev.timezone === timezone &&
        prev.nextDueAt.toMillis() > nowMs) {
      nextDueMs = prev.nextDueAt.toMillis(); // keep the pending fire
    } else {
      nextDueMs = nextMealDueAtMs(timezone, MEAL_LOCAL_MINUTE[slot], nowMs);
    }
    batch.set(ref, {
      uid, slot, timezone,
      localMinute: MEAL_LOCAL_MINUTE[slot],
      nextDueAt: Timestamp.fromMillis(nextDueMs),
      enabled: true,
      schemaVersion: 1,
      updatedAt: nowMs,
    }, {merge: true});
  }
  await batch.commit();
}

/**
 * PROMPT 5A.1 (Part 13) — POLICY: a scheduled meal reminder requires at least
 * one active installation (an in-app record for a fully signed-out account is
 * pointless and would pile up unseen). When an account's LAST installation logs
 * out, disable its schedules so the dispatcher stops producing work. A later
 * registerPushDevice re-enables them (upsertMealSchedules). Idempotent + safe if
 * no schedule docs exist. Never disables another user's schedules.
 */
export async function disableMealSchedules(uid: string): Promise<void> {
  const batch = db.batch();
  for (const slot of SLOTS) {
    batch.set(db.collection(MEAL_SCHEDULES).doc(scheduleId(uid, slot)),
      {enabled: false, disabledReason: "no_active_installation", updatedAt: Date.now()},
      {merge: true});
  }
  await batch.commit();
}
