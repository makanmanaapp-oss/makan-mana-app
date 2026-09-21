// MAKANMANA iOS WAVE 2 — App Store Server Notifications V2, keputusan TULEN.
//
// Nama peristiwa di bawah diambil daripada `NotificationTypeV2` dan `Subtype`
// dalam pustaka rasmi Apple `@apple/app-store-server-library@3.1.0`, BUKAN
// direka. Senarai ini lengkap setakat versi itu.
//
// PRINSIP: notifikasi memberitahu kita SESUATU berlaku; ia tidak memberitahu
// kita apa kelayakan pengguna sepatutnya. Kelayakan sentiasa dikira semula
// daripada transaksi dan maklumat pembaharuan YANG DISAHKAN, melalui
// `mapAppleSubscriptionToEntitlement` yang sama dengan laluan pengesahan
// klien. Memetakan setiap jenis notifikasi terus kepada pelan akan menjadi
// takrifan "berbayar" yang KEDUA, dan ia akan menyimpang.

import {
  mapAppleSubscriptionToEntitlement,
  type AppleRenewalInfoLike,
  type AppleSubscriptionStatusLike,
  type AppleTransactionInfoLike,
} from "./appStoreSubscription";
import type {EntitlementResult} from "./googlePlaySubscription";

/** `NotificationTypeV2` — daripada pustaka rasmi Apple. */
export const NOTIFICATION_TYPES = [
  "CONSUMPTION_REQUEST",
  "DID_CHANGE_RENEWAL_PREF",
  "DID_CHANGE_RENEWAL_STATUS",
  "DID_FAIL_TO_RENEW",
  "DID_RENEW",
  "EXPIRED",
  "EXTERNAL_PURCHASE_TOKEN",
  "GRACE_PERIOD_EXPIRED",
  "METADATA_UPDATE",
  "MIGRATION",
  "OFFER_REDEEMED",
  "ONE_TIME_CHARGE",
  "PRICE_CHANGE",
  "PRICE_INCREASE",
  "REFUND",
  "REFUND_DECLINED",
  "REFUND_REVERSED",
  "RENEWAL_EXTENDED",
  "RENEWAL_EXTENSION",
  "RESCIND_CONSENT",
  "REVOKE",
  "SUBSCRIBED",
  "TEST",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Jenis yang MENCABUT akses. Pencabutan melekat. */
const REVOKING_TYPES = new Set<string>(["REFUND", "REVOKE"]);

/** Jenis yang MEMBATALKAN pencabutan terdahulu. */
const UNREVOKING_TYPES = new Set<string>(["REFUND_REVERSED"]);

/** Jenis yang tidak pernah mengubah kelayakan. */
const INFORMATIONAL_TYPES = new Set<string>([
  "CONSUMPTION_REQUEST",
  "EXTERNAL_PURCHASE_TOKEN",
  "METADATA_UPDATE",
  "PRICE_CHANGE",
  "PRICE_INCREASE",
  "REFUND_DECLINED",
  "RENEWAL_EXTENSION",
  "TEST",
]);

export interface NotificationClassification {
  known: boolean;
  revokes: boolean;
  unrevokes: boolean;
  informational: boolean;
  /** Adakah kelayakan patut dikira semula daripada data yang disahkan. */
  recompute: boolean;
}

/**
 * Klasifikasikan satu notifikasi.
 *
 * Jenis yang TIDAK DIKENALI dianggap maklumat sahaja dan TIDAK mengubah
 * kelayakan. Apple menambah jenis baharu dari semasa ke semasa; meneka
 * maksudnya berisiko memberi atau menarik akses atas sesuatu yang kita tidak
 * faham.
 */
export function classifyNotification(
  notificationType: string | null | undefined,
): NotificationClassification {
  const type = typeof notificationType === "string" ? notificationType : "";
  const known = (NOTIFICATION_TYPES as readonly string[]).includes(type);
  const revokes = REVOKING_TYPES.has(type);
  const unrevokes = UNREVOKING_TYPES.has(type);
  const informational = !known || INFORMATIONAL_TYPES.has(type);
  return {
    known,
    revokes,
    unrevokes,
    informational: informational && !revokes && !unrevokes,
    recompute: !informational || revokes || unrevokes,
  };
}

/** Keadaan berterusan bagi satu `originalTransactionId`. */
export interface StoredSubscriptionState {
  /** `signedDate` notifikasi terakhir yang DIGUNAKAN. */
  lastSignedDate: number | null;
  /** Melekat sehingga pencabutan dibalikkan oleh notifikasi yang LEBIH BAHARU. */
  revoked: boolean;
  /** UUID notifikasi yang sudah diproses. */
  seenUuids: ReadonlySet<string>;
}

export type NotificationOutcome =
  | {action: "duplicate"; reason: string}
  | {action: "stale"; reason: string}
  | {action: "ignored"; reason: string}
  | {action: "apply"; reason: string; revoked: boolean};

export interface IncomingNotification {
  notificationUUID: string | null | undefined;
  notificationType: string | null | undefined;
  subtype?: string | null;
  /** `signedDate` muatan luar, milisaat epoch. */
  signedDate: number | null | undefined;
}

/**
 * Tentukan apa yang perlu dilakukan dengan satu notifikasi.
 *
 * Empat peraturan, mengikut keutamaan:
 *
 *   1. UUID yang sudah dilihat → duplikat. Apple menghantar semula secara
 *      agresif; memproses dua kali mesti selamat, dan cara paling selamat
 *      ialah tidak memprosesnya langsung.
 *   2. `signedDate` lebih lama daripada yang terakhir digunakan → basi.
 *      Notifikasi TIBA DI LUAR URUTAN, jadi masa tiba tidak bermakna.
 *   3. Notifikasi maklumat → diabaikan, kelayakan tidak disentuh.
 *   4. Selainnya → guna.
 *
 * Peraturan 2 ialah yang menghalang peristiwa ACTIVE lama daripada memulihkan
 * akses selepas pencabutan yang lebih baharu dan disahkan.
 */
export function decideNotification(params: {
  incoming: IncomingNotification;
  stored: StoredSubscriptionState;
}): NotificationOutcome {
  const {incoming, stored} = params;
  const uuid = incoming.notificationUUID;

  if (typeof uuid !== "string" || uuid.length === 0) {
    return {action: "ignored", reason: "notificationUUID tiada"};
  }
  if (stored.seenUuids.has(uuid)) {
    return {action: "duplicate", reason: "notificationUUID sudah diproses"};
  }

  const signedDate =
    typeof incoming.signedDate === "number" && Number.isFinite(incoming.signedDate)
      ? incoming.signedDate
      : null;
  if (signedDate === null) {
    return {action: "ignored", reason: "signedDate tiada atau tidak sah"};
  }
  if (stored.lastSignedDate !== null && signedDate < stored.lastSignedDate) {
    return {
      action: "stale",
      reason:
        `signedDate ${signedDate} lebih lama daripada ${stored.lastSignedDate}; ` +
        "notifikasi di luar urutan tidak boleh memulihkan akses",
    };
  }

  const cls = classifyNotification(incoming.notificationType);
  if (cls.informational) {
    return {
      action: "ignored",
      reason: cls.known
        ? `jenis maklumat: ${incoming.notificationType}`
        : `jenis tidak dikenali: ${incoming.notificationType}`,
    };
  }

  const revoked = cls.revokes ? true : cls.unrevokes ? false : stored.revoked;
  return {action: "apply", reason: `guna ${incoming.notificationType}`, revoked};
}

/**
 * Kira kelayakan daripada data notifikasi YANG DISAHKAN.
 *
 * Menggunakan semula `mapAppleSubscriptionToEntitlement` supaya notifikasi dan
 * pengesahan sisi klien tidak boleh menyimpang. Apabila keadaan menunjukkan
 * dicabut, kelayakan dipaksa turun walaupun Apple masih melaporkan status
 * aktif — pencabutan yang disahkan menang.
 */
export function entitlementFromNotification(params: {
  status: number | null | undefined;
  transaction: AppleTransactionInfoLike | null;
  renewal: AppleRenewalInfoLike | null;
  revoked: boolean;
  nowMillis: number;
}): EntitlementResult {
  const sub: AppleSubscriptionStatusLike = {
    status: params.status ?? null,
    transaction: params.transaction,
    renewal: params.renewal,
  };
  const computed = mapAppleSubscriptionToEntitlement(sub, params.nowMillis);
  if (!params.revoked) return computed;
  return {
    ...computed,
    entitled: false,
    plan: "free",
    planStatus: "expired",
    reason: "dicabut oleh notifikasi yang disahkan",
  };
}
