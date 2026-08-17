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

  // Account-switch / token-migration safety (Part 7): the same FCM token must
  // not remain active under ANOTHER user. Best-effort disable of stale bindings.
  // (Requires a collectionGroup index on pushDevices.token; skipped safely if
  // unavailable — the client also unregisters on logout.)
  try {
    const dup = await db.collectionGroup("pushDevices")
      .where("token", "==", record.token).limit(25).get();
    await Promise.all(dup.docs.map(async (d) => {
      const ownerUid = d.ref.parent.parent?.id;
      if (ownerUid && ownerUid !== uid && d.data()?.enabled === true) {
        await d.ref.set({enabled: false, disabledReason: "token_reassigned", updatedAt: now}, {merge: true});
      }
    }));
  } catch {
    // index missing / query unsupported → rely on client unregister-on-logout.
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
  return {status: "OK"};
});
