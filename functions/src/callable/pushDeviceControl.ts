/**
 * PROMPT 3 — push device registry callables (server-authoritative).
 *
 * Client provides only bounded, non-sensitive device info + an installation-
 * scoped deviceId + the FCM token. The RECIPIENT is ALWAYS request.auth.uid —
 * a client can never register a token under another user, mark it admin, or set
 * critical status. Follows the existing App Check policy (unchanged here).
 */
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db} from "../config/firebase";
import {disableMealSchedules, upsertMealSchedules} from "../services/mealReminderSchedule";
import {
  buildDeviceRecord,
  DeviceRegistrationInput,
  PushDevice,
  validRegistration,
} from "../domain/notifications/pushDelivery";

/** Register/refresh the CURRENT installation's push token for the auth user. */
export const registerPushDevice = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const input = (request.data ?? {}) as DeviceRegistrationInput;
  if (!validRegistration(input)) {
    throw new HttpsError("invalid-argument", "deviceId & token diperlukan.");
  }
  const now = Date.now();
  const ref = db.collection("users").doc(uid).collection("pushDevices").doc(input.deviceId!.trim().slice(0, 128));
  const existing = await ref.get();
  const record = buildDeviceRecord(input, now, existing.exists ? (existing.data() as PushDevice) : null);
  await ref.set(record, {merge: true});

  // Account-switch / token-migration safety (Part 7/10): the same FCM token must
  // not remain active under ANOTHER user, or a stale binding could leak private
  // pushes to the wrong account. AUTHORITATIVE path — backed by the deployed
  // collectionGroup index on pushDevices.token (firestore.indexes.json). A query
  // failure is NOT silently ignored: it is logged (no token exposed) so stale
  // ownership is observable, with client unregister-on-logout as defence-in-depth.
  try {
    const dup = await db.collectionGroup("pushDevices")
      .where("token", "==", record.token).limit(25).get();
    await Promise.all(dup.docs.map(async (d) => {
      const ownerUid = d.ref.parent.parent?.id;
      if (ownerUid && ownerUid !== uid && d.data()?.enabled === true) {
        await d.ref.set({enabled: false, disabledReason: "token_reassigned", updatedAt: now}, {merge: true});
      }
    }));
  } catch (e) {
    // Must never fail the registration, but must be observable (Part 10): a
    // broken dedup query means potential stale cross-user ownership.
    console.warn("registerPushDevice: token dedup query failed:",
      e instanceof Error ? e.message : e);
  }

  // PROMPT 5A.1 (Part 9): a successful registration is the trusted signal of an
  // authenticated account + active installation — sync this user's meal-reminder
  // schedules NOW so a new install doesn't wait for the daily backfill. Uses the
  // canonical IANA timezone (Part 20); NOT gated on push preference/OS permission
  // (Part 10). Failure-isolated: a schedule-sync error NEVER fails registration.
  try {
    const userSnap = await db.collection("users").doc(uid).get();
    await upsertMealSchedules(uid, userSnap.data(), now);
  } catch (e) {
    console.warn("registerPushDevice: meal schedule sync failed:",
      e instanceof Error ? e.message : e);
  }

  return {status: "OK", deviceId: record.deviceId};
});

/** Disable the CURRENT installation's device only (logout / opt-out). */
export const unregisterPushDevice = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {deviceId} = (request.data ?? {}) as {deviceId?: string};
  const id = (deviceId ?? "").trim().slice(0, 128);
  if (id.length < 8) throw new HttpsError("invalid-argument", "deviceId diperlukan.");
  // Disable ONLY this user's own installation — never touch other devices/users.
  await db.collection("users").doc(uid).collection("pushDevices").doc(id)
    .set({enabled: false, disabledReason: "unregistered", updatedAt: Date.now()}, {merge: true})
    .catch(() => {});

  // PROMPT 5A.1 (Part 12/13): if this was the account's LAST active installation,
  // disable its meal-reminder schedules (policy: reminders require an active
  // installation). If ANOTHER installation is still enabled, schedules stay —
  // account-scoped, never cross-user. Failure-isolated.
  try {
    const others = await db.collection("users").doc(uid).collection("pushDevices")
      .where("enabled", "==", true).limit(1).get();
    if (others.empty) await disableMealSchedules(uid);
  } catch (e) {
    console.warn("unregisterPushDevice: meal schedule disable failed:",
      e instanceof Error ? e.message : e);
  }
  return {status: "OK"};
});
