// MAKANMANA iOS WAVE 1 — domain langganan App Store (server-authoritative).
//
// Cerminan `googlePlaySubscription.ts`, dan SENGAJA menumpu kepada
// `EntitlementResult` yang SAMA supaya kedua-dua platform menghasilkan satu
// kontrak kelayakan. Dua kontrak bermakna dua takrifan "berbayar", dan itu
// bagaimana pengguna berakhir dengan pelan yang berbeza mengikut telefon.
//
// KESELAMATAN: logik ini TULEN — tiada rangkaian, tiada Firestore, tiada kripto.
// Klien TIDAK PERNAH menghantar plan, harga atau tarikh luput; ia menghantar
// `originalTransactionId` sahaja. Sumber kebenaran ialah App Store Server API.

import {appleTokenBelongsTo} from "./appleAccountToken";
import {
  PRODUCT_ALLOWLIST,
  type EntitlementResult,
  type Plan,
  type PlanStatus,
} from "./googlePlaySubscription";

/**
 * Status langganan App Store Server API v2.
 * https://developer.apple.com/documentation/appstoreserverapi/status
 */
export const APPLE_STATUS_ACTIVE = 1;
export const APPLE_STATUS_EXPIRED = 2;
export const APPLE_STATUS_BILLING_RETRY = 3;
export const APPLE_STATUS_GRACE_PERIOD = 4;
export const APPLE_STATUS_REVOKED = 5;

/** `expirationIntent` — sebab langganan tidak diperbaharui. */
export const APPLE_EXPIRATION_INTENT_CUSTOMER_CANCELLED = 1;

/**
 * Subset `JWSTransactionDecodedPayload` yang kita perlukan, tahan-null.
 * Masa ialah milisaat epoch (Apple menghantar nombor, bukan ISO).
 */
export interface AppleTransactionInfoLike {
  productId?: string | null;
  expiresDate?: number | null;
  originalTransactionId?: string | null;
  transactionId?: string | null;
  /** UUID yang app tetapkan semasa pembelian — pengikatan akaun kami. */
  appAccountToken?: string | null;
  revocationDate?: number | null;
  revocationReason?: number | null;
  bundleId?: string | null;
  /** "Sandbox" atau "Production". */
  environment?: string | null;
  type?: string | null;
}

/** Subset `JWSRenewalInfoDecodedPayload`. */
export interface AppleRenewalInfoLike {
  /** 0 = auto-renew DIMATIKAN, 1 = hidup. */
  autoRenewStatus?: number | null;
  expirationIntent?: number | null;
  gracePeriodExpiresDate?: number | null;
  isInBillingRetryPeriod?: boolean | null;
  autoRenewProductId?: string | null;
}

/** Satu entri `lastTransactions` yang sudah dinyahkod dan disahkan. */
export interface AppleSubscriptionStatusLike {
  status?: number | null;
  transaction: AppleTransactionInfoLike | null;
  renewal: AppleRenewalInfoLike | null;
}

/** Bundle ID yang DIBENARKAN. Disemak sisi pelayan, bukan dipercayai. */
export const APPLE_BUNDLE_ID = "com.makanmana.apps";

/** Adakah productId dalam allowlist yang SAMA dengan Play. */
export function isAllowedAppleProduct(
  productId: string | null | undefined,
): boolean {
  return typeof productId === "string" && productId in PRODUCT_ALLOWLIST;
}

/** Pelan untuk produk yang dibenarkan, atau null. */
export function planForAppleProduct(
  productId: string | null | undefined,
): Plan | null {
  if (typeof productId === "string" && productId in PRODUCT_ALLOWLIST) {
    return PRODUCT_ALLOWLIST[productId];
  }
  return null;
}

/**
 * Adakah transaksi ini benar-benar milik `uid`.
 *
 * `appAccountToken` ialah setara Apple kepada `obfuscatedExternalAccountId`
 * Play. Ia OPSYENAL pada peringkat Apple — jika app tidak menetapkannya semasa
 * pembelian, ia tiada. Kami memperlakukan KETIADAAN sebagai TIDAK SEPADAN,
 * bukan sebagai lulus, kerana resit tanpa pengikatan tidak boleh dibuktikan
 * milik sesiapa. Itu keputusan gagal-tertutup dan ia disengajakan.
 *
 * WAVE 2: dibandingkan dengan UUID terbitan pelayan, BUKAN dengan UID mentah.
 * Apple menghendaki UUID RFC 4122 dan UID Firebase bukan UUID, jadi
 * perbandingan Wave 1 akan menolak setiap pembelian yang sah.
 * Lihat `appleAccountToken.ts`.
 */
export function appleAccountMatches(
  tx: AppleTransactionInfoLike | null,
  uid: string,
): boolean {
  return appleTokenBelongsTo(tx?.appAccountToken, uid);
}

/** Adakah bundle ID transaksi ialah aplikasi kita. */
export function appleBundleMatches(
  tx: AppleTransactionInfoLike | null,
  expected: string = APPLE_BUNDLE_ID,
): boolean {
  return typeof tx?.bundleId === "string" && tx.bundleId === expected;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Peta status langganan App Store → kelayakan yang pelayan tulis.
 *
 * Kitaran hayat dipadankan dengan Play supaya UI tidak perlu tahu platform:
 *
 *   ACTIVE(1)        → active, atau cancelled_but_active jika auto-renew MATI
 *   GRACE_PERIOD(4)  → grace_period (masih ada akses)
 *   BILLING_RETRY(3) → on_hold (TIADA akses)
 *   EXPIRED(2)       → expired
 *   REVOKED(5)       → expired (bayaran balik / dicabut)
 *
 * Pencabutan MENANG atas setiap keadaan lain: resit yang dikembalikan wangnya
 * tidak boleh mengekalkan akses walaupun Apple masih melaporkannya aktif.
 */
export function mapAppleSubscriptionToEntitlement(
  sub: AppleSubscriptionStatusLike,
  nowMillis: number,
): EntitlementResult {
  const tx = sub.transaction;
  const renewal = sub.renewal;
  const productId = typeof tx?.productId === "string" ? tx.productId : null;
  const plan = planForAppleProduct(productId);
  const expiryMillis = finiteOrNull(tx?.expiresDate);
  const autoRenewing = renewal?.autoRenewStatus === 1;
  const revokedAt = finiteOrNull(tx?.revocationDate);

  const deny = (planStatus: PlanStatus, reason: string): EntitlementResult => ({
    entitled: false,
    plan: "free",
    planStatus,
    productId,
    expiryMillis,
    autoRenewing,
    // Apple tiada langkah "acknowledge" seperti Play; transaksi yang
    // dikembalikan oleh pelayan sudah muktamad.
    acknowledged: true,
    reason,
  });

  if (plan === null) {
    return deny("expired", "produk tiada dalam allowlist");
  }
  if (revokedAt !== null) {
    return deny("expired", `dicabut pada ${revokedAt}`);
  }

  const status = finiteOrNull(sub.status);
  if (status === null) {
    return deny("pending", "status tiada");
  }

  const entitle = (planStatus: PlanStatus, reason: string): EntitlementResult => ({
    entitled: true,
    plan,
    planStatus,
    productId,
    expiryMillis,
    autoRenewing,
    acknowledged: true,
    reason,
  });

  switch (status) {
    case APPLE_STATUS_ACTIVE: {
      // Apple boleh melaporkan ACTIVE sebentar selepas tamat tempoh; masa
      // adalah muktamad.
      if (expiryMillis !== null && expiryMillis <= nowMillis) {
        return deny("expired", "aktif tetapi expiresDate sudah lepas");
      }
      if (!autoRenewing) {
        return entitle("cancelled_but_active", "dibatalkan, belum luput");
      }
      return entitle("active", "aktif");
    }
    case APPLE_STATUS_GRACE_PERIOD: {
      const graceEnds = finiteOrNull(renewal?.gracePeriodExpiresDate);
      if (graceEnds !== null && graceEnds <= nowMillis) {
        return deny("on_hold", "tempoh tangguh sudah tamat");
      }
      return entitle("grace_period", "tempoh tangguh pembayaran");
    }
    case APPLE_STATUS_BILLING_RETRY:
      return deny("on_hold", "cubaan semula pembayaran, tiada tempoh tangguh");
    case APPLE_STATUS_EXPIRED:
      return deny("expired", "luput");
    case APPLE_STATUS_REVOKED:
      return deny("expired", "dicabut");
    default:
      return deny("pending", `status tidak dikenali: ${status}`);
  }
}

/**
 * Medan `users/{uid}` untuk langganan App Store.
 *
 * Berasingan daripada versi Play SEMATA-MATA kerana `planSource` berbeza —
 * setiap medan lain sengaja sama, supaya satu pengguna yang bertukar platform
 * tidak menghasilkan bentuk dokumen yang berbeza.
 */
export function appleEntitlementToUserFields(e: EntitlementResult): {
  plan: Plan;
  planStatus: PlanStatus;
  planSource: string;
  subscriptionProductId: string | null;
  subscriptionExpiryMillis: number | null;
  subscriptionAutoRenewing: boolean;
} {
  return {
    plan: e.entitled ? e.plan : "free",
    planStatus: e.planStatus,
    planSource: "app_store",
    subscriptionProductId: e.productId,
    subscriptionExpiryMillis: e.expiryMillis,
    subscriptionAutoRenewing: e.autoRenewing,
  };
}
