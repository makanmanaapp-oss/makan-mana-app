// MAKANMANA FINAL PRE-AAB — domain langganan Google Play (server-authoritative).
//
// KESELAMATAN (Part 13-19): logik ini TULEN (tiada rangkaian / Firestore) supaya
// boleh diuji sepenuhnya. Ia memetakan ressource `purchases.subscriptionsv2`
// SEBENAR dari Google Play Developer API kepada kelayakan (entitlement) yang
// pelayan tulis. Klien TIDAK PERNAH menghantar plan/harga/tarikh luput —
// hanya {productId, purchaseToken}. Sumber kebenaran = Google Play sahaja.

/** Allowlist produk sisi-pelayan. Klien tidak boleh minta plan sembarangan. */
export const PRODUCT_ALLOWLIST: Readonly<Record<string, "plus" | "pro">> = {
  makanmana_plus_monthly: "plus",
  makanmana_pro_monthly: "pro",
};

export type Plan = "free" | "plus" | "pro";

/**
 * Status pelan kanonikal (Part 16) — dipetakan dari subscriptionState Play.
 * Nilai ini konsisten dengan planStatus sedia ada ('active').
 */
export type PlanStatus =
  | "active"
  | "cancelled_but_active"
  | "grace_period"
  | "on_hold"
  | "paused"
  | "expired"
  | "pending";

/** Subset resource SubscriptionPurchaseV2 yang kita perlukan (tahan-null). */
export interface SubscriptionPurchaseV2Like {
  subscriptionState?: string | null;
  lineItems?: Array<{
    productId?: string | null;
    expiryTime?: string | null;
    autoRenewingPlan?: {autoRenewEnabled?: boolean | null} | null;
  }> | null;
  acknowledgementState?: string | null;
  latestOrderId?: string | null;
  /** Returned only when the opaque account ID was set during the Billing flow. */
  externalAccountIdentifiers?: {
    obfuscatedExternalAccountId?: string | null;
    obfuscatedExternalProfileId?: string | null;
  } | null;
  /** Present for an upgrade, downgrade, or resubscription token transition. */
  linkedPurchaseToken?: string | null;
  /** Lets RTDN associate an out-of-app resubscription with the prior account. */
  outOfAppPurchaseContext?: {
    expiredPurchaseToken?: string | null;
    expiredExternalAccountIdentifiers?: {
      obfuscatedExternalAccountId?: string | null;
      obfuscatedExternalProfileId?: string | null;
    } | null;
  } | null;
}

export interface EntitlementResult {
  /** Adakah pengguna patut memiliki pelan berbayar SEKARANG. */
  entitled: boolean;
  plan: Plan;
  planStatus: PlanStatus;
  productId: string | null;
  expiryMillis: number | null;
  autoRenewing: boolean;
  acknowledged: boolean;
  /** Sebab boleh-baca untuk jejak audit (bukan untuk logik keputusan). */
  reason: string;
}

/** Adakah productId dibenarkan (dalam allowlist). */
export function isAllowedProduct(productId: string | null | undefined): boolean {
  return typeof productId === "string" && productId in PRODUCT_ALLOWLIST;
}

/** Pelan untuk product yang dibenarkan, atau null jika tidak. */
export function planForProduct(productId: string | null | undefined): Plan | null {
  if (typeof productId === "string" && productId in PRODUCT_ALLOWLIST) {
    return PRODUCT_ALLOWLIST[productId];
  }
  return null;
}

function parseExpiryMillis(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Peta resource subscriptionsv2 → kelayakan yang pelayan tulis.
 *
 * Kitaran hayat (Part 17): ACTIVE / CANCELLED-tetapi-aktif / GRACE_PERIOD /
 * ON_HOLD / PAUSED / EXPIRED / PENDING. Hanya keadaan yang MASIH memberi akses
 * (active, grace, dibatalkan-tetapi-belum-luput) mengekalkan pelan berbayar.
 * ON_HOLD / PAUSED / EXPIRED / PENDING → turun ke free (planStatus dilaporkan).
 *
 * @param sub resource dari Play (sumber kebenaran)
 * @param nowMillis masa semasa (disuntik untuk ujian menentukan)
 */
export function mapSubscriptionToEntitlement(
  sub: SubscriptionPurchaseV2Like,
  nowMillis: number,
): EntitlementResult {
  // Ambil line item PERTAMA yang produknya dibenarkan (allowlist) — abai produk
  // yang tak dikenali supaya produk asing tak boleh memberi pelan.
  const items = Array.isArray(sub.lineItems) ? sub.lineItems : [];
  const item =
    items.find((li) => isAllowedProduct(li?.productId)) ?? items[0] ?? null;

  const productId = item?.productId ?? null;
  const plan = planForProduct(productId);
  const expiryMillis = parseExpiryMillis(item?.expiryTime);
  const autoRenewing = item?.autoRenewingPlan?.autoRenewEnabled === true;
  const acknowledged =
    sub.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";

  const notEntitled = (
    planStatus: PlanStatus,
    reason: string,
  ): EntitlementResult => ({
    entitled: false,
    plan: "free",
    planStatus,
    productId,
    expiryMillis,
    autoRenewing,
    acknowledged,
    reason,
  });

  // Produk tak dikenali → JANGAN beri apa-apa pelan.
  if (plan === null) {
    return notEntitled("expired", "product_not_in_allowlist");
  }

  const state = sub.subscriptionState ?? "SUBSCRIPTION_STATE_UNSPECIFIED";
  const stillValid = expiryMillis !== null && expiryMillis > nowMillis;

  switch (state) {
    case "SUBSCRIPTION_STATE_ACTIVE":
      return {
        entitled: true,
        plan,
        planStatus: "active",
        productId,
        expiryMillis,
        autoRenewing,
        acknowledged,
        reason: "active",
      };

    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      // Pembayaran gagal tetapi Play masih beri akses sementara.
      return {
        entitled: true,
        plan,
        planStatus: "grace_period",
        productId,
        expiryMillis,
        autoRenewing,
        acknowledged,
        reason: "grace_period",
      };

    case "SUBSCRIPTION_STATE_CANCELED":
      // Auto-renew dimatikan; akses kekal sehingga tarikh luput.
      if (stillValid) {
        return {
          entitled: true,
          plan,
          planStatus: "cancelled_but_active",
          productId,
          expiryMillis,
          autoRenewing: false,
          acknowledged,
          reason: "cancelled_active_until_expiry",
        };
      }
      return notEntitled("expired", "cancelled_and_expired");

    case "SUBSCRIPTION_STATE_ON_HOLD":
      return notEntitled("on_hold", "on_hold");

    case "SUBSCRIPTION_STATE_PAUSED":
      return notEntitled("paused", "paused");

    case "SUBSCRIPTION_STATE_PENDING":
      // Pembelian belum selesai (cth. kaedah bayaran tertangguh). BUKAN jaya.
      return notEntitled("pending", "pending_purchase");

    case "SUBSCRIPTION_STATE_EXPIRED":
      return notEntitled("expired", "expired");

    default:
      // Tak dikenali → selamat: jangan beri pelan. Kalau masih ada masa luput
      // yang sah kita masih tak percaya keadaan tak dikenali.
      return notEntitled("expired", `unknown_state:${state}`);
  }
}

/**
 * Bina medan users/{uid} yang pelayan tulis (Part 16) — nama kanonikal sedia
 * ada digunakan semula (plan, planStatus, planSource). Bila tidak entitled,
 * pelan turun ke free tetapi planStatus sebenar (on_hold/expired/pending)
 * dikekalkan supaya UI boleh jujur.
 */
export function entitlementToUserFields(e: EntitlementResult): {
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
    planSource: "google_play",
    subscriptionProductId: e.productId,
    subscriptionExpiryMillis: e.expiryMillis,
    subscriptionAutoRenewing: e.autoRenewing,
  };
}
