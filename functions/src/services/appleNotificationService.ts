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
import {
  appleEntitlementToUserFields,
  isAllowedAppleProduct,
  type AppleRenewalInfoLike,
  type AppleTransactionInfoLike,
} from "../domain/billing/appStoreSubscription";
import {appleTokenBelongsTo} from "../domain/billing/appleAccountToken";
import {createAppleSignedDataVerifier, type AppleSignedData} from "../domain/billing/appleSignedData";

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
  expectedEnvironment: string;
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
      const [receipt, current] = await Promise.all([tx.get(receiptRef), tx.get(subRef)]);
      if (receipt.exists) return;
      const currentDate = current.get("lastNotificationSignedDate");
      const stale = typeof currentDate === "number" &&
        (input.signedDate === null || input.signedDate <= currentDate);
      const cannotUnrevoke = current.get("revoked") === true && !input.revoked;
      const currentOwner = current.get("uid");
      const lastVerifiedDate = current.get("lastVerifiedSignedDate");
      const olderThanVerification = typeof lastVerifiedDate === "number" &&
        (input.signedDate === null || input.signedDate < lastVerifiedDate);
      const mayApply = !stale && !cannotUnrevoke && !olderThanVerification;
      // Binding may have appeared after loadSubscription. Resolve it again
      // within this transaction to avoid losing a concurrent refund/expiry.
      const userWrite = input.entitlement !== null && typeof currentOwner === "string" &&
        appleTokenBelongsTo(input.verifiedAccountToken, currentOwner)
        ? {uid: currentOwner, fields: appleEntitlementToUserFields(input.entitlement)} : null;
      if (input.entitlement !== null && mayApply) {
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

      if (userWrite !== null && mayApply) {
        tx.set(
          db.collection("users").doc(userWrite.uid),
          {...userWrite.fields, planUpdatedAt: FieldValue.serverTimestamp()},
          {merge: true},
        );
      }

      // Resit ditulis dalam transaksi yang SAMA. Jika ia terpisah, satu ranap
      // di antaranya akan menghasilkan kesan yang digunakan tanpa resit, dan
      // penghantaran semula akan menggunakannya sekali lagi.
      tx.set(receiptRef, {
        outcome: mayApply ? input.outcome : "stale",
        subscriptionKey: input.subscriptionKey,
        notificationType: input.notificationType,
        subtype: input.subtype,
        entitled: input.entitlement?.entitled ?? null,
        ownerResolved: userWrite !== null,
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
  verifier?: AppleSignedData;
}): Promise<ProcessOutcome> {
  const nowMillis = params.nowMillis ?? Date.now();
  const store = params.store ?? firestoreStore;

  let transaction: AppleTransactionInfoLike | null = null;
  let renewal: AppleRenewalInfoLike | null = null;
  let outer;
  try {
    const verifier = params.verifier ?? createAppleSignedDataVerifier({
      trustedRoots: params.config.trustedRoots,
      bundleId: params.config.bundleId,
      environment: params.config.expectedEnvironment,
      appAppleId: params.config.appAppleId,
    });
    outer = await verifier.verifyAndDecodeNotification(params.signedPayload);
    const data = outer.data;
    if (!data || data.bundleId !== params.config.bundleId ||
        data.environment !== params.config.expectedEnvironment ||
        (params.config.expectedEnvironment === "Production" &&
          data.appAppleId !== params.config.appAppleId)) {
      throw new Error("apple_notification_identity_mismatch");
    }
    if (data.signedTransactionInfo) {
      transaction = await verifier.verifyAndDecodeTransaction(data.signedTransactionInfo);
      if (transaction.bundleId !== params.config.bundleId ||
          transaction.environment !== params.config.expectedEnvironment ||
          !isAllowedAppleProduct(transaction.productId) ||
          !transaction.originalTransactionId || transaction.type !== "Auto-Renewable Subscription") {
        throw new Error("apple_transaction_identity_mismatch");
      }
    }
    if (data.signedRenewalInfo) {
      const decodedRenewal = await verifier.verifyAndDecodeRenewalInfo(data.signedRenewalInfo);
      if (!transaction || decodedRenewal.environment !== params.config.expectedEnvironment ||
          decodedRenewal.originalTransactionId !== transaction.originalTransactionId ||
          decodedRenewal.productId !== transaction.productId) {
        throw new Error("apple_renewal_mismatch");
      }
      renewal = decodedRenewal;
    }
  } catch {
    // Includes certificate/OCSP outages: never acknowledge data not verified.
    return {ok: false, failure: {kind: "transient", reason: "apple_notification_verification_failed"}};
  }
  const data = outer.data!;
  const environment = params.config.expectedEnvironment;

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
