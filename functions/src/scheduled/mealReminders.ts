/**
 * PROMPT 5A — meal reminders: recipient-local, schedule-driven, bounded.
 *
 * Two bounded scheduled functions replace the old fixed-MYT lunch/dinner crons:
 *
 *  • mealReminderBackfill (daily) — the authoritative reminder AUDIENCE. Scans
 *    accounts with an active app installation (an enabled push device is the
 *    evidence of an active installation, Part 7 — NOT the business audience by
 *    itself), and upserts a `meal_reminder_schedules` doc per slot with
 *    `nextDueAt` computed from THAT user's canonical IANA timezone. Also picks
 *    up timezone changes (Part 24, eventual within 24h; a preference save can
 *    refresh sooner).
 *
 *  • mealReminderDispatch (every 15 min) — queries only DUE schedules
 *    (`enabled && nextDueAt <= now`, indexed), fans each through Notification V2
 *    (createNotification → preference resolver → in-app + push decision), then
 *    advances `nextDueAt` one local day. In-app vs push is decided by the
 *    resolver, NOT by device presence. Bounded per invocation; anything left
 *    due is continued by the next run (no silent 5000-recipient loss). Dedup by
 *    recipient-LOCAL date makes retries/overlaps/concurrency idempotent.
 *
 * The legacy `pushToTopic("meal_reminders")` stays removed — one path only.
 */
import {onSchedule} from "firebase-functions/v2/scheduler";
import {logger} from "firebase-functions";

import {db, Timestamp} from "../config/firebase";
import {notifySafely} from "../domain/notifications/notificationProducers";
import {
  MEAL_REMINDER_COPY,
  MealSlot,
  mealReminderSourceEventId,
  mealScheduleAction,
  nextMealBackfillCursor,
  nextMealDueAtMs,
  recipientLocalDate,
} from "../domain/notifications/mealReminder";
import {
  MEAL_SCHEDULES,
  upsertMealSchedules,
} from "../services/mealReminderSchedule";

// ---- backfill: resumable reconciliation sweep (Part 14-18) --------------------
// registerPushDevice now syncs NEW installs immediately, so this is REPAIR /
// reconciliation infrastructure (Part 17): it walks every active installation
// over time via a persistent cursor so no candidate (incl. 20,001+) is ever
// starved, refreshes timezones, and re-enables schedules for reactivated
// accounts. Bounded per run; resumes where the last run stopped; resets the
// cursor on a full pass so the cycle repeats.
const BACKFILL_PAGE = 400;
const BACKFILL_MAX_PER_RUN = 20000; // bounded work per invocation.
const RECONCILE_STATE = "notification_reconcile_state";
const MEAL_BACKFILL_CURSOR = "meal_backfill";

export const mealReminderBackfill = onSchedule(
  {schedule: "30 3 * * *", timeZone: "Asia/Kuala_Lumpur"},
  async () => {
    const now = Date.now();
    const stateRef = db.collection(RECONCILE_STATE).doc(MEAL_BACKFILL_CURSOR);
    const state = (await stateRef.get()).data() as {cursorPath?: string} | undefined;

    // Resume after the last-processed pushDevice (crash-safe: reprocessing a few
    // is harmless — upsertMealSchedules is idempotent, Part 19/30).
    let startRef: FirebaseFirestore.DocumentReference | undefined =
      state?.cursorPath ? db.doc(state.cursorPath) : undefined;
    let processed = 0;
    let upserts = 0;
    let lastPath: string | null = state?.cursorPath ?? null;
    let reachedEnd = false;
    const seenUid = new Set<string>();

    while (processed < BACKFILL_MAX_PER_RUN) {
      let q = db.collectionGroup("pushDevices")
        .where("enabled", "==", true).orderBy("__name__").limit(BACKFILL_PAGE);
      if (startRef) q = q.startAfter(startRef);
      const snap = await q.get();
      if (snap.empty) {
        reachedEnd = true;
        break;
      }
      for (const d of snap.docs) {
        lastPath = d.ref.path;
        processed++;
        const uid = d.ref.parent.parent?.id;
        if (!uid || seenUid.has(uid)) continue;
        seenUid.add(uid);
        try {
          const user = await db.collection("users").doc(uid).get();
          if (user.exists && !user.data()?.deletedAt && user.data()?.disabled !== true) {
            await upsertMealSchedules(uid, user.data(), now); // Part 19 idempotent
            upserts++;
          }
        } catch (e) {
          // Part 18: one bad candidate never aborts the sweep; it is retried on
          // a future cycle. No PII/token in the log.
          logger.warn("meal backfill candidate failed", {
            uid, error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      startRef = snap.docs[snap.docs.length - 1].ref;
      if (snap.size < BACKFILL_PAGE) {
        reachedEnd = true;
        break;
      }
    }

    // Persist / reset the cursor (Part 16): null on a full pass so the next
    // cycle restarts; otherwise resume from lastPath next run.
    await stateRef.set({
      cursorPath: nextMealBackfillCursor(reachedEnd, lastPath),
      updatedAt: now,
      ...(reachedEnd ? {lastCycleCompletedAt: now} : {}),
    }, {merge: true});
    logger.info("meal_reminder backfill", {processed, upserts, reachedEnd});
  },
);

// ---- dispatch (recipient-local due-scanner) ----------------------------------
const DISPATCH_PAGE = 500;
const DISPATCH_MAX_PAGES = 20; // ≤10k reminders/run; leftovers continue next run.

async function recipientActive(uid: string): Promise<boolean> {
  const user = await db.collection("users").doc(uid).get();
  if (!user.exists) return false; // Part 29/31: deleted/missing → skip
  const d = user.data();
  return !d?.deletedAt && d?.disabled !== true; // Part 30: disabled → skip
}

export const mealReminderDispatch = onSchedule(
  {schedule: "*/15 * * * *", timeZone: "Etc/UTC"},
  async () => {
    const now = Date.now();
    const nowTs = Timestamp.fromMillis(now);
    let processed = 0;
    for (let page = 0; page < DISPATCH_MAX_PAGES; page++) {
      // Processed docs get nextDueAt advanced past `now`, so they drop out of
      // this query — re-reading the top DUE page each loop is a natural cursor.
      const snap = await db.collection(MEAL_SCHEDULES)
        .where("enabled", "==", true)
        .where("nextDueAt", "<=", nowTs)
        .orderBy("nextDueAt")
        .limit(DISPATCH_PAGE)
        .get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        const s = doc.data() as {
          uid: string; slot: MealSlot; timezone: string; localMinute: number;
          nextDueAt: FirebaseFirestore.Timestamp;
        };
        const active = await recipientActive(s.uid);
        let outcome: {ok: boolean} | null = null;
        if (active) {
          const localDate = recipientLocalDate(s.timezone, s.nextDueAt.toMillis());
          const copy = MEAL_REMINDER_COPY[s.slot];
          // Idempotent: dedup by recipient-local date (retry/concurrency safe).
          outcome = await notifySafely({
            recipientUid: s.uid,
            type: "meal_reminder",
            sourceEventId: mealReminderSourceEventId(s.slot, localDate),
            titleKey: copy.titleKey,
            bodyKey: copy.bodyKey,
          });
        }
        switch (mealScheduleAction(active, outcome)) {
          case "disable":
            // Terminal/ineligible → leave the due working set (Part 2/4/5);
            // reconciliation re-enables if the account becomes active (Part 3).
            await doc.ref.update({
              enabled: false, disabledReason: "recipient_ineligible", updatedAt: now,
            });
            break;
          case "advance":
            // Handled (created/duplicate/suppressed) → next local occurrence;
            // suppression is never replayed later (Part 6/7).
            await doc.ref.update({
              nextDueAt: Timestamp.fromMillis(nextMealDueAtMs(s.timezone, s.localMinute, now)),
              updatedAt: now,
            });
            break;
          case "retry":
            // Transient persistence failure → leave due, retried next dispatch
            // (Part 8); no advance, no lost occurrence.
            break;
        }
        processed++;
      }
      if (snap.size < DISPATCH_PAGE) break;
    }
    logger.info("meal_reminder dispatch", {processed});
  },
);
