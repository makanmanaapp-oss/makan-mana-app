/**
 * PROMPT 4 — server-authoritative notification-preference write.
 *
 * The recipient is ALWAYS request.auth.uid (a user can never write another
 * user's preferences). Payload is validated (allowed categories, boolean
 * toggles, 0..1439 quiet-hour minutes, bounded timezone) and admin/critical
 * fields are rejected. Written via Admin SDK so client rules can DENY direct
 * notificationPreferences writes (defence in depth). App Check policy unchanged.
 */
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db} from "../config/firebase";
import {validatePreferenceUpdate} from "../domain/notifications/preferenceValidation";
import {upsertMealSchedules} from "../services/mealReminderSchedule";

export const setNotificationPreferences = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");

  const result = validatePreferenceUpdate(request.data);
  if (!result.ok || !result.update) {
    throw new HttpsError("invalid-argument", result.error ?? "invalid_preferences");
  }

  await db.collection("users").doc(uid).set({
    notificationPreferences: {
      ...result.update,
      schemaVersion: 2,
      updatedAt: Date.now(),
    },
  }, {merge: true});

  // PROMPT 5A (Part 24): if the quiet-hours timezone was part of this update,
  // recalc this user's meal-reminder schedules so a timezone change is reflected
  // promptly (the daily backfill is the eventual fallback). Failure-safe — never
  // fails the preference save.
  const touchedTz =
    (result.update.quietHours as {timezone?: unknown} | undefined)?.timezone !== undefined;
  if (touchedTz) {
    try {
      const fresh = await db.collection("users").doc(uid).get();
      await upsertMealSchedules(uid, fresh.data(), Date.now());
    } catch (_) {/* schedule refresh is best-effort */}
  }

  return {status: "OK"};
});
