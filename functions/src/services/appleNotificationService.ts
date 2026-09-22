// MAKANMANA iOS WAVE 2.1 — pemprosesan App Store Server Notifications V2.
//
// Fail ini melakukan DUA perkara sahaja: mengesahkan tandatangan, dan
// menyambungkan Firestore kepada `applyVerifiedNotification`. Setiap keputusan
// tentang idempoten, urutan, kelayakan dan ketahanan hidup dalam domain, di
// mana ia diuji dengan simpanan pakai-buang.
//
// TIADA MUATAN MENTAH DILOG. Tiada `signedPayload`, tiada `appAccountToken`,
// tiada kunci. Hanya pengecam yang dicincang dan keputusan.

import {createHash} from "node:crypto";

import {db, FieldValue} from "../config/firebase";
import {
  applyVerifiedNotification,
  type CommitInput,
  type NotificationStore,
  type ProcessOutcome,
  type StoredSubscriptionRecord,
  type VerifiedNotification,
} from "../domain/billing/notificationProcessing";
import type {
  AppleRenewalInfoLike,
  AppleTransactionInfoLike,
} from "../domain/billing/appStoreSubscription";
import {
  APPLE_ENV_PRODUCTION,
  AppleJwsError,
  verifyAppleJws,
  verifyAppleJwsForApp,
} from "../domain/billing/appStoreJws";

export interface AppleNotificationConfig {
  trustedRoots: string[];
  bundleId: string;
  /** Diperlukan untuk Production. */
  appAppleId?: number;
  /**
   * WAVE 4A (S-2) — persekitaran yang DIJANGKA untuk runtime ini, diterbitkan
   * daripada identiti projek backend. Notifikasi Sandbox yang tiba pada titik
   * akhir PRODUKSI ditolak: tanpa ini, pemprosesan notifikasi ialah pintu
   * kedua ke pagar kelayakan yang sama.
   */
  expectedEnvironment?: string;
}

function hashId(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Simpanan Firestore. Resit dan langganan ditulis dalam SATU transaksi. */
const firestoreStore: NotificationStore = {
  async hasReceipt(notificationUUID) {
    const snap = await db
      .collection("apple_notification_receipts")
      .doc(notificationUUID)
      .get();
    return snap.exists;
  },

  async loadSubscription(subscriptionKey): Promise<StoredSubscriptionRecord | null> {
    const snap = await db
      .collection("subscription_verifications")
      .doc(subscriptionKey)
      .get();
    if (!snap.exists) return null;
    return {
      lastSignedDate: asNumber(snap.get("lastNotificationSignedDate")),
      revoked: snap.get("revoked") === true,
      uid: (snap.get("uid") as string | undefined) ?? null,
    };
  },

  async commit(input: CommitInput) {
    const receiptRef = db
      .collection("apple_notification_receipts")
      .doc(input.notificationUUID);
    const subRef = db.collection("subscription_verifications").doc(input.subscriptionKey);

    await db.runTransaction(async (tx) => {
      if (input.entitlement !== null) {
        tx.set(
          subRef,
          {
            platform: "app_store",
            productId: input.productId,
            environment: input.environment,
            planStatus: input.entitlement.planStatus,
            entitled: input.entitlement.entitled,
            revoked: input.revoked,
            lastNotificationSignedDate: input.signedDate,
            lastNotificationType: input.notificationType,
            updatedAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
      }

      if (input.userWrite !== null) {
        tx.set(
          db.collection("users").doc(input.userWrite.uid),
          {...input.userWrite.fields, planUpdatedAt: FieldValue.serverTimestamp()},
          {merge: true},
        );
      }

      // Resit ditulis dalam transaksi yang SAMA. Jika ia terpisah, satu ranap
      // di antaranya akan menghasilkan kesan yang digunakan tanpa resit, dan
      // penghantaran semula akan menggunakannya sekali lagi.
      tx.set(receiptRef, {
        outcome: input.outcome,
        subscriptionKey: input.subscriptionKey,
        notificationType: input.notificationType,
        subtype: input.subtype,
        entitled: input.entitlement?.entitled ?? null,
        ownerResolved: input.userWrite !== null,
        receivedAt: FieldValue.serverTimestamp(),
      });
    });
  },
};

/**
 * Sahkan dan proses satu `signedPayload`.
 *
 * Muatan LUAR disahkan dahulu. Hanya selepas itu muatan bersarang dibaca, dan
 * setiap satu juga disahkan. Tiada laluan membaca data yang tidak disahkan.
 */
export async function processAppleNotification(params: {
  signedPayload: string;
  config: AppleNotificationConfig;
  nowMillis?: number;
  store?: NotificationStore;
}): Promise<ProcessOutcome> {
  const nowMillis = params.nowMillis ?? Date.now();
  const store = params.store ?? firestoreStore;

  let outer: Record<string, unknown>;
  try {
    outer = verifyAppleJws({
      jws: params.signedPayload,
      trustedRoots: params.config.trustedRoots,
      nowMillis,
    });
  } catch (e) {
    if (e instanceof AppleJwsError && /gagal-tertutup/.test(e.message)) {
      // Akar tidak dikonfigurasikan ialah masalah KITA, bukan muatan buruk.
      return {ok: false, failure: {kind: "transient", reason: e.message}};
    }
    return {
      ok: false,
      failure: {kind: "invalid", reason: "sampul notifikasi tidak boleh disahkan"},
    };
  }

  const data = (outer.data ?? {}) as Record<string, unknown>;
  const environment =
    typeof data.environment === "string" ? data.environment : APPLE_ENV_PRODUCTION;

  // S-2 — pagar persekitaran, sama seperti laluan pembelian.
  if (
    params.config.expectedEnvironment !== undefined &&
    environment !== params.config.expectedEnvironment
  ) {
    return {
      ok: false,
      failure: {
        kind: "invalid",
        reason: `persekitaran notifikasi tidak dibenarkan: dijangka ${params.config.expectedEnvironment}`,
      },
    };
  }
  if (typeof data.bundleId !== "string" || data.bundleId !== params.config.bundleId) {
    return {
      ok: false,
      failure: {kind: "invalid", reason: "bundleId notifikasi tidak sepadan"},
    };
  }
  if (environment === APPLE_ENV_PRODUCTION && params.config.appAppleId === undefined) {
    return {
      ok: false,
      failure: {
        kind: "transient",
        reason: "appAppleId diperlukan untuk Production tetapi tidak dikonfigurasikan",
      },
    };
  }
  if (
    params.config.appAppleId !== undefined &&
    asNumber(data.appAppleId) !== params.config.appAppleId
  ) {
    return {
      ok: false,
      failure: {kind: "invalid", reason: "appAppleId notifikasi tidak sepadan"},
    };
  }

  const expected = {
    bundleId: params.config.bundleId,
    environment,
    appAppleId: params.config.appAppleId,
  };

  let transaction: AppleTransactionInfoLike | null = null;
  let renewal: AppleRenewalInfoLike | null = null;
  try {
    if (typeof data.signedTransactionInfo === "string") {
      transaction = verifyAppleJwsForApp({
        jws: data.signedTransactionInfo,
        trustedRoots: params.config.trustedRoots,
        nowMillis,
        expected,
      }) as AppleTransactionInfoLike;
    }
    if (typeof data.signedRenewalInfo === "string") {
      // WAVE 4A — maklumat pembaharuan turut terikat pada identiti aplikasi;
      // dahulu ia hanya disahkan tandatangannya.
      renewal = verifyAppleJwsForApp({
        jws: data.signedRenewalInfo,
        trustedRoots: params.config.trustedRoots,
        nowMillis,
        expected,
      }) as AppleRenewalInfoLike;
    }
  } catch {
    return {
      ok: false,
      failure: {kind: "invalid", reason: "muatan bersarang tidak boleh disahkan"},
    };
  }

  const originalTransactionId =
    typeof transaction?.originalTransactionId === "string"
      ? transaction.originalTransactionId
      : null;

  const verified: VerifiedNotification = {
    notificationUUID:
      typeof outer.notificationUUID === "string" ? outer.notificationUUID : null,
    notificationType:
      typeof outer.notificationType === "string" ? outer.notificationType : null,
    subtype: typeof outer.subtype === "string" ? outer.subtype : null,
    signedDate: asNumber(outer.signedDate),
    environment,
    status: asNumber(data.status),
    transaction,
    renewal,
    subscriptionKey: originalTransactionId === null ? null : hashId(originalTransactionId),
  };

  return applyVerifiedNotification({verified, store, nowMillis});
}
