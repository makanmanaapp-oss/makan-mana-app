// MAKANMANA iOS WAVE 2 — pemprosesan App Store Server Notifications V2.
//
// Apple menghantar semula notifikasi secara agresif dan TIDAK menjamin urutan.
// Oleh itu dua sifat adalah wajib, bukan pilihan:
//
//   - IDEMPOTEN: memproses `notificationUUID` yang sama dua kali mesti tidak
//     mengubah apa-apa.
//   - TAHAN LUAR-URUTAN: peristiwa lama tidak boleh menulis ganti yang baharu.
//     Khususnya, satu peristiwa ACTIVE yang lewat tiba TIDAK boleh memulihkan
//     akses selepas pencabutan yang lebih baharu dan disahkan.
//
// TIADA MUATAN MENTAH DILOG. Tiada `signedPayload`, tiada `appAccountToken`,
// tiada kunci, tiada butiran pembelian. Hanya pengecam yang dicincang dan
// keputusan.

import {createHash} from "node:crypto";

import {db, FieldValue} from "../config/firebase";
import {
  decideNotification,
  entitlementFromNotification,
} from "../domain/billing/appStoreNotifications";
import {
  appleEntitlementToUserFields,
  type AppleRenewalInfoLike,
  type AppleTransactionInfoLike,
} from "../domain/billing/appStoreSubscription";
import {appleTokenBelongsTo} from "../domain/billing/appleAccountToken";
import {
  APPLE_ENV_PRODUCTION,
  AppleJwsError,
  verifyAppleJws,
  verifyAppleJwsForApp,
} from "../domain/billing/appStoreJws";

/** Sebab kegagalan yang boleh dibezakan — menentukan kod HTTP. */
export type NotificationFailure =
  /** Muatan tidak sah/tidak boleh dipercayai. Apple TIDAK patut cuba lagi. */
  | {kind: "invalid"; reason: string}
  /** Masalah infrastruktur sementara. Apple PATUT cuba lagi. */
  | {kind: "transient"; reason: string};

export type NotificationResult =
  | {ok: true; action: "applied" | "duplicate" | "stale" | "ignored"; reason: string}
  | {ok: false; failure: NotificationFailure};

export interface AppleNotificationConfig {
  trustedRoots: string[];
  bundleId: string;
  /** Diperlukan untuk Production. */
  appAppleId?: number;
}

function hashId(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Proses satu `signedPayload` App Store Server Notification V2.
 *
 * Muatan LUAR disahkan dahulu. Hanya selepas itu muatan bersarang dibaca, dan
 * setiap satu juga disahkan. Tiada laluan membaca data yang tidak disahkan.
 */
export async function processAppleNotification(params: {
  signedPayload: string;
  config: AppleNotificationConfig;
  nowMillis?: number;
}): Promise<NotificationResult> {
  const nowMillis = params.nowMillis ?? Date.now();

  // 1. Sahkan sampul luar. Kita belum tahu persekitarannya, jadi tandatangan
  //    disahkan dahulu dan identiti aplikasi disemak selepas persekitaran
  //    dibaca daripada muatan yang SUDAH disahkan.
  let outer: Record<string, unknown>;
  try {
    outer = verifyAppleJws({
      jws: params.signedPayload,
      trustedRoots: params.config.trustedRoots,
      nowMillis,
    });
  } catch (e) {
    if (e instanceof AppleJwsError && /gagal-tertutup/.test(e.message)) {
      // Akar tidak dikonfigurasikan ialah masalah pelayan KITA, bukan muatan
      // yang buruk. Apple patut cuba lagi selepas kita membetulkannya.
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
  const expected = {
    bundleId: params.config.bundleId,
    environment,
    appAppleId: params.config.appAppleId,
  };

  // Identiti aplikasi pada sampul: bundleId hidup dalam `data`, bukan di akar.
  try {
    const bundleId = data.bundleId;
    if (typeof bundleId !== "string" || bundleId !== params.config.bundleId) {
      return {
        ok: false,
        failure: {kind: "invalid", reason: "bundleId notifikasi tidak sepadan"},
      };
    }
    if (
      environment === APPLE_ENV_PRODUCTION &&
      params.config.appAppleId === undefined
    ) {
      return {
        ok: false,
        failure: {
          kind: "transient",
          reason: "appAppleId diperlukan untuk Production tetapi tidak dikonfigurasikan",
        },
      };
    }
    if (params.config.appAppleId !== undefined) {
      const appAppleId = asNumber(data.appAppleId);
      if (appAppleId !== params.config.appAppleId) {
        return {
          ok: false,
          failure: {kind: "invalid", reason: "appAppleId notifikasi tidak sepadan"},
        };
      }
    }
  } catch {
    return {ok: false, failure: {kind: "invalid", reason: "data notifikasi cacat"}};
  }

  // 2. Sahkan muatan BERSARANG. Setiap satu ditandatangani berasingan.
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
      renewal = verifyAppleJws({
        jws: data.signedRenewalInfo,
        trustedRoots: params.config.trustedRoots,
        nowMillis,
      }) as AppleRenewalInfoLike;
    }
  } catch {
    return {
      ok: false,
      failure: {kind: "invalid", reason: "muatan bersarang tidak boleh disahkan"},
    };
  }

  const notificationUUID =
    typeof outer.notificationUUID === "string" ? outer.notificationUUID : null;
  const originalTransactionId =
    typeof transaction?.originalTransactionId === "string"
      ? transaction.originalTransactionId
      : null;

  if (notificationUUID === null) {
    return {ok: false, failure: {kind: "invalid", reason: "notificationUUID tiada"}};
  }
  if (originalTransactionId === null) {
    // Sesetengah jenis (cth. TEST) tiada transaksi. Itu sah dan bukan ralat.
    return {ok: true, action: "ignored", reason: "tiada originalTransactionId"};
  }

  const subHash = hashId(originalTransactionId);
  const receiptRef = db.collection("apple_notification_receipts").doc(notificationUUID);
  const subRef = db.collection("subscription_verifications").doc(subHash);

  try {
    return await db.runTransaction(async (tx) => {
      const [receiptSnap, subSnap] = await Promise.all([
        tx.get(receiptRef),
        tx.get(subRef),
      ]);

      const decision = decideNotification({
        incoming: {
          notificationUUID,
          notificationType:
            typeof outer.notificationType === "string" ? outer.notificationType : null,
          subtype: typeof outer.subtype === "string" ? outer.subtype : null,
          signedDate: asNumber(outer.signedDate),
        },
        stored: {
          lastSignedDate: asNumber(subSnap.get("lastNotificationSignedDate")),
          revoked: subSnap.get("revoked") === true,
          seenUuids: new Set(receiptSnap.exists ? [notificationUUID] : []),
        },
      });

      if (decision.action !== "apply") {
        // Rekod resit walaupun tiada apa-apa digunakan, supaya penghantaran
        // semula tidak memasuki semula laluan ini.
        tx.set(
          receiptRef,
          {
            outcome: decision.action,
            originalTransactionIdHash: subHash,
            receivedAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
        return {ok: true as const, action: decision.action, reason: decision.reason};
      }

      const entitlement = entitlementFromNotification({
        status: asNumber(data.status),
        transaction,
        renewal,
        revoked: decision.revoked,
        nowMillis,
      });
      const fields = appleEntitlementToUserFields(entitlement);

      // Pemilikan yang SUDAH DISAHKAN dikekalkan. Notifikasi tidak pernah
      // mencipta pengikatan baharu — hanya laluan pengesahan klien boleh, di
      // mana pengguna yang log masuk membuktikan siapa mereka.
      const ownerUid = subSnap.get("uid") as string | undefined;
      const tokenMatches =
        typeof ownerUid === "string" &&
        appleTokenBelongsTo(transaction?.appAccountToken, ownerUid);

      tx.set(
        subRef,
        {
          platform: "app_store",
          productId: transaction?.productId ?? null,
          environment,
          planStatus: entitlement.planStatus,
          entitled: entitlement.entitled,
          revoked: decision.revoked,
          lastNotificationSignedDate: asNumber(outer.signedDate),
          lastNotificationType: outer.notificationType ?? null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );

      if (typeof ownerUid === "string" && tokenMatches) {
        tx.set(
          db.collection("users").doc(ownerUid),
          {...fields, planUpdatedAt: FieldValue.serverTimestamp()},
          {merge: true},
        );
      }

      tx.set(receiptRef, {
        outcome: "applied",
        originalTransactionIdHash: subHash,
        notificationType: outer.notificationType ?? null,
        subtype: outer.subtype ?? null,
        entitled: entitlement.entitled,
        ownerResolved: typeof ownerUid === "string" && tokenMatches,
        receivedAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true as const,
        action: "applied" as const,
        reason: decision.reason,
      };
    });
  } catch (e) {
    // Kegagalan Firestore ialah infrastruktur, bukan muatan buruk. Apple patut
    // cuba lagi; memulangkan 4xx di sini akan MEMBUANG notifikasi itu selamanya.
    const detail = e instanceof Error ? e.name : "ralat tidak diketahui";
    return {ok: false, failure: {kind: "transient", reason: `simpanan gagal: ${detail}`}};
  }
}
