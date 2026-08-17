/**
 * PROMPT 3 — canonical PUSH DELIVERY service (I/O).
 *
 * Consumes a created Notification V2 record and delivers FCM push to the
 * recipient's ACTIVE devices only. Feature producers NEVER call Admin Messaging
 * directly — they go createNotification() → notifySafely() → here.
 *
 * SAFE: failure-safe (never throws to caller / never undoes the in-app record),
 * device-level idempotent, prunes only PERMANENTLY invalid tokens, keeps
 * transient failures, never logs raw tokens. Admin Messaging is injectable for
 * tests (no real push in Prompt 3).
 */
import * as admin from "firebase-admin";

import {db, FieldValue} from "../config/firebase";
import {
  NotificationCategory,
  NotificationType,
} from "../domain/notifications/notificationContract";
import {
  buildDeviceRecord,
  buildPushPayload,
  deliveryId,
  DeliveryStatus,
  evaluatePushPolicy,
  maskToken,
  PushDevice,
  resolveDeliveryOutcomes,
} from "../domain/notifications/pushDelivery";
import {pushCopyFor} from "../domain/notifications/pushCopy";

export interface DeliverableRecord {
  notificationId: string;
  recipientUid: string;
  type: NotificationType;
  category: NotificationCategory;
  titleKey: string;
  bodyKey: string;
  isCritical: boolean;
  expiresAtMs: number | null;
  schemaVersion: number;
}

/** One outbound message. */
export interface OutboundMessage {
  token: string;
  deviceId: string;
  data: Record<string, string>;
  title: string;
  body: string;
}
export interface SendOutcome {
  success: boolean;
  errorCode?: string | null;
}
/** Injectable Admin Messaging boundary — mocked in tests. */
export interface MessagingSender {
  send(messages: OutboundMessage[]): Promise<SendOutcome[]>;
}

/** Default sender: Admin multicast-equivalent (sendEach). No raw token logs. */
export const adminMessagingSender: MessagingSender = {
  async send(messages) {
    const res = await admin.messaging().sendEach(
      messages.map((m) => ({
        token: m.token,
        data: m.data,
        notification: {title: m.title, body: m.body},
        android: {priority: "high" as const},
      })),
    );
    return res.responses.map((r) => ({
      success: r.success,
      errorCode: r.error?.code ?? null,
    }));
  },
};

export interface DeliverOptions {
  sender?: MessagingSender;
  now?: number;
}

/** Recipient's local minute-of-day for quiet-hours (tz default MYT). */
function localMinuteOfDay(nowMs: number, timezone: string | null): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "Asia/Kuala_Lumpur",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = fmt.formatToParts(new Date(nowMs));
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return ((h % 24) * 60 + m) % 1440;
  } catch {
    return (((new Date(nowMs).getUTCHours() + 8) % 24) * 60 + new Date(nowMs).getUTCMinutes()) % 1440;
  }
}

/** Active devices from the multi-device registry; legacy fcmToken fallback. */
async function loadActiveDevices(uid: string, now: number): Promise<PushDevice[]> {
  const snap = await db.collection("users").doc(uid).collection("pushDevices")
    .where("enabled", "==", true).limit(20).get();
  if (!snap.empty) {
    return snap.docs.map((d) => d.data() as PushDevice).filter((d) => !!d.token);
  }
  // Phase B legacy fallback: single users/{uid}.fcmToken as a synthetic device.
  const u = await db.collection("users").doc(uid).get();
  const legacy = u.data()?.fcmToken as string | undefined;
  if (legacy) {
    return [buildDeviceRecord({deviceId: "legacy_fcm_token", token: legacy}, now)];
  }
  return [];
}

async function recordDelivery(
  uid: string, notificationId: string, deviceId: string, token: string,
  status: DeliveryStatus, now: number,
): Promise<void> {
  const id = deliveryId(notificationId, deviceId);
  await db.collection("users").doc(uid).collection("push_deliveries").doc(id).set({
    notificationId, deviceId, tokenMask: maskToken(token),
    status, attemptedAt: now,
  }, {merge: true});
}

/** Has this device already been attempted for this notification? (idempotency) */
async function alreadyDelivered(uid: string, notificationId: string, deviceId: string): Promise<boolean> {
  const id = deliveryId(notificationId, deviceId);
  const s = await db.collection("users").doc(uid).collection("push_deliveries").doc(id).get();
  return s.exists && (s.data()?.status === "sent");
}

/**
 * Deliver push for a created NotificationRecord. Returns a small diagnostic
 * (no PII / no raw tokens). NEVER throws.
 */
export async function deliverNotificationPush(
  record: DeliverableRecord,
  opts: DeliverOptions = {},
): Promise<{sent: number; pruned: number; reason: string}> {
  const now = opts.now ?? Date.now();
  const sender = opts.sender ?? adminMessagingSender;
  try {
    const uid = record.recipientUid;
    const [devices, userSnap] = await Promise.all([
      loadActiveDevices(uid, now),
      db.collection("users").doc(uid).get(),
    ]);
    const prefs = (userSnap.data()?.notificationPreferences ?? {}) as Record<string, Record<string, unknown>>;
    const catPref = (prefs[record.category] ?? {}) as {pushEnabled?: boolean};
    const quiet = (prefs.quietHours ?? userSnap.data()?.notificationQuietHours ?? {}) as {
      quietHoursEnabled?: boolean; quietHoursStart?: number; quietHoursEnd?: number; timezone?: string;
    };
    const lang = userSnap.data()?.languageCode as string | undefined;
    const tz = quiet.timezone ?? (devices[0]?.timezone ?? null);

    const decision = evaluatePushPolicy({
      type: record.type, category: record.category, isCritical: record.isCritical,
      expiresAtMs: record.expiresAtMs, categoryPreference: catPref, quiet,
      localMinuteOfDay: localMinuteOfDay(now, tz), activeDeviceCount: devices.length, nowMs: now,
    });
    if (!decision.send) {
      // Record a single suppression marker (no per-device spam) for observability.
      if (decision.reason !== "no_device" && decision.reason !== "not_push_eligible_type") {
        await recordDelivery(uid, record.notificationId, "_policy", "",
          decision.reason as DeliveryStatus, now).catch(() => {});
      }
      return {sent: 0, pruned: 0, reason: decision.reason};
    }

    const copy = pushCopyFor(record.type, lang) ??
      {title: record.titleKey, body: record.bodyKey};
    const payload = buildPushPayload(record);

    // Only devices not already delivered (idempotency across retries).
    const pending: PushDevice[] = [];
    for (const d of devices) {
      if (!(await alreadyDelivered(uid, record.notificationId, d.deviceId))) pending.push(d);
    }
    if (pending.length === 0) return {sent: 0, pruned: 0, reason: "already_delivered"};

    const messages: OutboundMessage[] = pending.map((d) => ({
      token: d.token, deviceId: d.deviceId, data: payload.data, title: copy.title, body: copy.body,
    }));
    const results = await sender.send(messages);
    const outcomes = resolveDeliveryOutcomes(pending, results);

    let sent = 0; let pruned = 0;
    await Promise.all(outcomes.map(async (o, i) => {
      const d = pending[i];
      if (o.status === "sent") sent++;
      if (o.prune === "device") {
        pruned++;
        await db.collection("users").doc(uid).collection("pushDevices").doc(d.deviceId)
          .set({enabled: false, disabledReason: "invalid_token", updatedAt: now}, {merge: true}).catch(() => {});
      } else if (o.prune === "legacy") {
        pruned++;
        await db.collection("users").doc(uid)
          .set({fcmToken: FieldValue.delete()}, {merge: true}).catch(() => {});
      }
      await recordDelivery(uid, record.notificationId, d.deviceId, d.token, o.status, now).catch(() => {});
    }));
    return {sent, pruned, reason: "eligible"};
  } catch (e) {
    // Failure-safe: push must NEVER undo the action or the in-app record.
    console.error("deliverNotificationPush error:", e instanceof Error ? e.message : e);
    return {sent: 0, pruned: 0, reason: "delivery_error"};
  }
}
