import {createHash} from "crypto";

export const PLAY_PACKAGE_NAME = "com.makanmana.apps";
export const PLUS_PRODUCT_ID = "makanmana_plus_monthly";
export const PRO_PRODUCT_ID = "makanmana_pro_monthly";

export const ALLOWED_SUBSCRIPTION_PRODUCTS = new Set([
  PLUS_PRODUCT_ID,
  PRO_PRODUCT_ID,
]);

export type MakanManaPlan = "free" | "plus" | "pro";

export interface PlaySubscriptionLineItem {
  productId?: string;
  expiryTime?: string;
  latestSuccessfulOrderId?: string;
  autoRenewingPlan?: {
    autoRenewEnabled?: boolean;
  };
  offerDetails?: {
    basePlanId?: string;
    offerId?: string;
  };
}

export interface PlaySubscriptionPurchaseV2 {
  regionCode?: string;
  lineItems?: PlaySubscriptionLineItem[];
  startTime?: string;
  subscriptionState?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  externalAccountIdentifiers?: {
    externalAccountId?: string;
    obfuscatedExternalAccountId?: string;
    obfuscatedExternalProfileId?: string;
  };
  testPurchase?: Record<string, unknown>;
}

export interface NormalizedSubscription {
  productId: string;
  plan: MakanManaPlan;
  status: string;
  entitled: boolean;
  startTime: string | null;
  expiryTime: string | null;
  autoRenew: boolean | null;
  acknowledgementState: string | null;
  linkedPurchaseToken: string | null;
  latestSuccessfulOrderId: string | null;
  regionCode: string | null;
  isTestPurchase: boolean;
}

export function hashPurchaseToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function obfuscatedAccountIdForUid(uid: string): string {
  return createHash("sha256")
    .update(`makanmana:${uid}`, "utf8")
    .digest("hex");
}

export function maskOrderId(orderId: string | null | undefined): string | null {
  if (!orderId) return null;
  if (orderId.length <= 8) return "****";
  return `${orderId.slice(0, 4)}…${orderId.slice(-4)}`;
}

export function planForProduct(productId: string): MakanManaPlan {
  if (productId === PLUS_PRODUCT_ID) return "plus";
  if (productId === PRO_PRODUCT_ID) return "pro";
  throw new Error("Unsupported Google Play subscription product");
}

function parseTime(value: string | undefined): number | null {
  if (!value) return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

function latestExpiry(items: PlaySubscriptionLineItem[]): string | null {
  let selected: {value: string; millis: number} | null = null;
  for (const item of items) {
    const millis = parseTime(item.expiryTime);
    if (millis === null || !item.expiryTime) continue;
    if (!selected || millis > selected.millis) {
      selected = {value: item.expiryTime, millis};
    }
  }
  return selected?.value ?? null;
}

export function normalizedStatus(subscriptionState: string | undefined): string {
  switch (subscriptionState) {
    case "SUBSCRIPTION_STATE_ACTIVE":
      return "active";
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return "grace_period";
    case "SUBSCRIPTION_STATE_CANCELED":
      return "canceled";
    case "SUBSCRIPTION_STATE_ON_HOLD":
      return "on_hold";
    case "SUBSCRIPTION_STATE_PAUSED":
      return "paused";
    case "SUBSCRIPTION_STATE_PENDING":
      return "pending";
    case "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED":
      return "pending_canceled";
    case "SUBSCRIPTION_STATE_EXPIRED":
      return "expired";
    default:
      return "unknown";
  }
}

export function isEntitledState(
  subscriptionState: string | undefined,
  expiryTime: string | null,
  nowMillis: number,
): boolean {
  const expiryMillis = expiryTime ? parseTime(expiryTime) : null;
  if (expiryMillis !== null && expiryMillis <= nowMillis) return false;

  // Google Play keeps access during grace period. A canceled auto-renewing
  // subscription remains entitled until its paid period actually expires.
  return subscriptionState === "SUBSCRIPTION_STATE_ACTIVE" ||
    subscriptionState === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" ||
    subscriptionState === "SUBSCRIPTION_STATE_CANCELED";
}

export function normalizeSubscriptionPurchase(
  requestedProductId: string,
  purchase: PlaySubscriptionPurchaseV2,
  nowMillis: number,
): NormalizedSubscription {
  if (!ALLOWED_SUBSCRIPTION_PRODUCTS.has(requestedProductId)) {
    throw new Error("Unsupported Google Play subscription product");
  }

  const items = Array.isArray(purchase.lineItems) ? purchase.lineItems : [];
  const matched = items.find((item) => item.productId === requestedProductId);
  if (!matched) {
    throw new Error("Google Play response does not contain requested product");
  }

  const expiryTime = latestExpiry(
    items.filter((item) => item.productId === requestedProductId),
  );
  const status = normalizedStatus(purchase.subscriptionState);
  const autoRenewValues = items
    .filter((item) => item.productId === requestedProductId)
    .map((item) => item.autoRenewingPlan?.autoRenewEnabled)
    .filter((value): value is boolean => typeof value === "boolean");

  return {
    productId: requestedProductId,
    plan: planForProduct(requestedProductId),
    status,
    entitled: isEntitledState(
      purchase.subscriptionState,
      expiryTime,
      nowMillis,
    ),
    startTime: purchase.startTime ?? null,
    expiryTime,
    autoRenew: autoRenewValues.length > 0 ? autoRenewValues.some(Boolean) : null,
    acknowledgementState: purchase.acknowledgementState ?? null,
    linkedPurchaseToken: purchase.linkedPurchaseToken ?? null,
    latestSuccessfulOrderId: matched.latestSuccessfulOrderId ?? null,
    regionCode: purchase.regionCode ?? null,
    isTestPurchase: purchase.testPurchase != null,
  };
}

export function rtdnTransactionType(notificationType: number): string | null {
  switch (notificationType) {
    case 4:
      return "purchase";
    case 2:
      return "renewal";
    case 12:
      return "reversal";
    case 13:
      return "expiration";
    case 3:
      return "cancellation";
    default:
      return null;
  }
}
