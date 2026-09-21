// MAKANMANA iOS WAVE 2.1 — pemprosesan notifikasi dengan simpanan BOLEH-SUNTIK.
//
// PEMBETULAN SEMANTIK HTTP
// ------------------------
// Wave 2 mendokumenkan "4xx = Apple JANGAN hantar semula". ITU SALAH.
// Dokumentasi Apple: HTTP 200–206 bermakna penghantaran BERJAYA; SEBARANG kod
// lain — termasuk 4xx — dikira TIDAK BERJAYA dan LAYAK dicuba semula. Apple
// mencuba semula mengikut jadualnya (kira-kira 1j, 12j, 24j, 48j, 72j).
//
// Akibatnya penaakulan risiko Wave 2 adalah songsang. Bahaya sebenar BUKAN
// "4xx membuang notifikasi" — Apple akan mencuba semula. Bahaya sebenar ialah
// memulangkan 2xx untuk sesuatu yang kita BELUM simpan dengan kekal: Apple
// kemudian berhenti mencuba dan notifikasi itu hilang untuk selamanya.
//
// Oleh itu satu invarian mengatasi segalanya:
//
//   JANGAN PERNAH pulangkan 2xx melainkan hasilnya KEKAL.
//
// `durable` dalam hasil di bawah wujud khusus supaya lapisan HTTP tidak boleh
// melanggar invarian itu secara tidak sengaja.

import {
  decideNotification,
  entitlementFromNotification,
} from "./appStoreNotifications";
import {appleTokenBelongsTo} from "./appleAccountToken";
import {
  appleEntitlementToUserFields,
  type AppleRenewalInfoLike,
  type AppleTransactionInfoLike,
} from "./appStoreSubscription";
import type {EntitlementResult} from "./googlePlaySubscription";

/** Keadaan langganan yang disimpan, seperti yang dibaca daripada simpanan. */
export interface StoredSubscriptionRecord {
  lastSignedDate: number | null;
  revoked: boolean;
  /** Pemilik yang SUDAH disahkan, atau null jika belum terikat. */
  uid: string | null;
}

export interface CommitInput {
  notificationUUID: string;
  subscriptionKey: string;
  outcome: "applied" | "duplicate" | "stale" | "ignored";
  notificationType: string | null;
  subtype: string | null;
  signedDate: number | null;
  environment: string;
  productId: string | null;
  revoked: boolean;
  entitlement: EntitlementResult | null;
  /** Medan pengguna untuk ditulis, hanya apabila pemilik disahkan. */
  userWrite: {uid: string; fields: Record<string, unknown>} | null;
}

/**
 * Sempadan simpanan. Pelaksanaan sebenar menggunakan transaksi Firestore;
 * ujian menggunakan simpanan pakai-buang dalam memori.
 */
export interface NotificationStore {
  hasReceipt(notificationUUID: string): Promise<boolean>;
  loadSubscription(subscriptionKey: string): Promise<StoredSubscriptionRecord | null>;
  /** MESTI atom. Melontar bermakna TIADA apa-apa disimpan. */
  commit(input: CommitInput): Promise<void>;
}

export type ProcessOutcome =
  | {
      ok: true;
      action: "applied" | "duplicate" | "stale" | "ignored";
      reason: string;
      /** Benar HANYA jika hasil sudah disimpan dengan kekal. */
      durable: boolean;
    }
  | {ok: false; failure: {kind: "invalid" | "transient"; reason: string}};

/** Notifikasi yang tandatangannya SUDAH disahkan oleh pemanggil. */
export interface VerifiedNotification {
  notificationUUID: string | null;
  notificationType: string | null;
  subtype: string | null;
  signedDate: number | null;
  environment: string;
  status: number | null;
  transaction: AppleTransactionInfoLike | null;
  renewal: AppleRenewalInfoLike | null;
  subscriptionKey: string | null;
}

/**
 * Gunakan satu notifikasi yang SUDAH disahkan.
 *
 * Pemanggil bertanggungjawab untuk pengesahan tandatangan. Fungsi ini
 * mengandaikan datanya boleh dipercayai dan hanya menguruskan idempoten,
 * urutan, kelayakan dan ketahanan.
 */
export async function applyVerifiedNotification(params: {
  verified: VerifiedNotification;
  store: NotificationStore;
  nowMillis: number;
}): Promise<ProcessOutcome> {
  const {verified, store, nowMillis} = params;

  if (verified.notificationUUID === null) {
    return {ok: false, failure: {kind: "invalid", reason: "notificationUUID tiada"}};
  }
  // Sesetengah jenis (cth. TEST) tiada transaksi. Itu sah dan tiada apa-apa
  // untuk disimpan, jadi ia BERJAYA dan KEKAL secara remeh.
  if (verified.subscriptionKey === null) {
    return {
      ok: true,
      action: "ignored",
      reason: "tiada originalTransactionId",
      durable: true,
    };
  }

  let seen: boolean;
  let existing: StoredSubscriptionRecord | null;
  try {
    [seen, existing] = await Promise.all([
      store.hasReceipt(verified.notificationUUID),
      store.loadSubscription(verified.subscriptionKey),
    ]);
  } catch (e) {
    // Bacaan gagal ialah infrastruktur. Jangan pulangkan 2xx — biar Apple
    // cuba lagi.
    return {
      ok: false,
      failure: {kind: "transient", reason: `bacaan simpanan gagal: ${errName(e)}`},
    };
  }

  const decision = decideNotification({
    incoming: {
      notificationUUID: verified.notificationUUID,
      notificationType: verified.notificationType,
      subtype: verified.subtype,
      signedDate: verified.signedDate,
    },
    stored: {
      lastSignedDate: existing?.lastSignedDate ?? null,
      revoked: existing?.revoked ?? false,
      seenUuids: new Set(seen ? [verified.notificationUUID] : []),
    },
  });

  // Duplikat sudah kekal mengikut takrif — resitnya wujud. Memberitahu Apple
  // "berjaya" adalah betul dan menghentikan percubaan semula yang sia-sia.
  if (decision.action === "duplicate") {
    return {ok: true, action: "duplicate", reason: decision.reason, durable: true};
  }

  const revoked = decision.action === "apply" ? decision.revoked : (existing?.revoked ?? false);
  const entitlement =
    decision.action === "apply"
      ? entitlementFromNotification({
        status: verified.status,
        transaction: verified.transaction,
        renewal: verified.renewal,
        revoked,
        nowMillis,
      })
      : null;

  // Pemilikan yang SUDAH disahkan dikekalkan. Notifikasi tidak pernah mencipta
  // pengikatan baharu — hanya laluan pengesahan klien boleh, di mana pengguna
  // yang log masuk membuktikan siapa mereka.
  const ownerUid = existing?.uid ?? null;
  const ownerMatches =
    ownerUid !== null &&
    appleTokenBelongsTo(verified.transaction?.appAccountToken, ownerUid);

  const commitInput: CommitInput = {
    notificationUUID: verified.notificationUUID,
    subscriptionKey: verified.subscriptionKey,
    outcome: decision.action === "apply" ? "applied" : decision.action,
    notificationType: verified.notificationType,
    subtype: verified.subtype,
    signedDate: verified.signedDate,
    environment: verified.environment,
    productId: verified.transaction?.productId ?? null,
    revoked,
    entitlement,
    userWrite:
      entitlement !== null && ownerUid !== null && ownerMatches
        ? {uid: ownerUid, fields: appleEntitlementToUserFields(entitlement)}
        : null,
  };

  try {
    await store.commit(commitInput);
  } catch (e) {
    // Ranap atau gangguan SEBELUM penyimpanan: tiada apa-apa ditulis, dan kita
    // TIDAK memulangkan kejayaan. Apple mencuba semula dan kita mula semula
    // dengan bersih.
    return {
      ok: false,
      failure: {kind: "transient", reason: `simpanan gagal: ${errName(e)}`},
    };
  }

  return {
    ok: true,
    action: commitInput.outcome,
    reason: decision.reason,
    durable: true,
  };
}

function errName(e: unknown): string {
  return e instanceof Error ? e.name : "ralat tidak diketahui";
}

/**
 * Peta hasil kepada kod status HTTP.
 *
 * Satu-satunya fungsi yang dibenarkan memilih kod, supaya invarian
 * "2xx hanya jika kekal" boleh diuji di satu tempat.
 */
export function httpStatusForOutcome(outcome: ProcessOutcome): number {
  if (outcome.ok && outcome.durable) return 200;
  if (outcome.ok) {
    // Berjaya tetapi TIDAK kekal tidak sepatutnya berlaku. Jika ia berlaku,
    // minta Apple cuba lagi dan bukan mengakui sesuatu yang kita tidak simpan.
    return 503;
  }
  // Muatan tidak sah: Apple TETAP akan mencuba semula (4xx layak dicuba
  // semula), dan itu selamat kerana tiada pemprosesan berlaku. 4xx dipilih
  // supaya log membezakan muatan buruk daripada masalah kita sendiri.
  return outcome.failure.kind === "transient" ? 503 : 400;
}
