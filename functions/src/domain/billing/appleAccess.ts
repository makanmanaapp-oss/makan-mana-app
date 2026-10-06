import {isAllowedAppleProduct} from "./appStoreSubscription";

/** Enforce the Apple access deadline at feature-use time even if an expiry
 * notification is delayed. All non-Apple plan sources preserve their existing
 * behavior, including Google Play, coupons and legacy/admin plans. */
export function planForSubscriptionUser(
  data: Record<string, unknown> | undefined,
  nowMillis: number = Date.now(),
): string {
  const plan = (data?.plan as string | undefined) ?? "free";
  const source = data?.planSource;
  if (source !== "app_store" && source !== "app_store_testflight") return plan;
  const expiry = data.subscriptionExpiryMillis;
  if (!isAllowedAppleProduct(data.subscriptionProductId as string | null | undefined) ||
      typeof expiry !== "number" || !Number.isFinite(expiry) || expiry <= nowMillis ||
      !["active", "grace_period", "cancelled_but_active"].includes(data.planStatus as string)) {
    return "free";
  }
  return plan === "plus" || plan === "pro" ? plan : "free";
}
