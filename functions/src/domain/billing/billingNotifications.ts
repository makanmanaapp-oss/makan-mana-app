/**
 * PROMPT 5 — pure mapping from a VERIFIED Google Play RTDN notificationType to a
 * canonical billing notification (or null = audit-only, no user notification).
 *
 * Runs ONLY downstream of verified entitlement processing (never trusts client
 * lifecycle state). on_hold(5) / grace(6) = payment_issue (the approved critical
 * type). purchased(4) / renewed(2) / cancelled(3) = non-critical lifecycle.
 * Every other RTDN state (recovered/restarted/paused/revoked/expired/pending/
 * deferred/…) is intentionally audit-only to avoid notification noise.
 *
 * No billing secrets (purchase token, order id, Play response) ever cross into a
 * notification — only the canonical type + generic localized copy.
 */
import {NotificationType} from "../notifications/notificationContract";

export interface BillingNotificationSpec {
  type: NotificationType;
  titleKey: string;
  bodyKey: string;
}

export function billingNotificationForRtdn(
  notificationType: number,
): BillingNotificationSpec | null {
  switch (notificationType) {
    case 4: // SUBSCRIPTION_PURCHASED — a new paid subscription (not coupon trial).
      return {
        type: "subscription_started",
        titleKey: "notificationSubscriptionStartedTitle",
        bodyKey: "notificationSubscriptionStartedBody",
      };
    case 2: // SUBSCRIPTION_RENEWED
      return {
        type: "subscription_renewed",
        titleKey: "notificationSubscriptionRenewedTitle",
        bodyKey: "notificationSubscriptionRenewedBody",
      };
    case 3: // SUBSCRIPTION_CANCELED — won't renew; access stays until period end.
      return {
        type: "subscription_cancelled",
        titleKey: "notificationSubscriptionCancelledTitle",
        bodyKey: "notificationSubscriptionCancelledBody",
      };
    case 5: // SUBSCRIPTION_ON_HOLD
    case 6: // SUBSCRIPTION_IN_GRACE_PERIOD
      return {
        type: "payment_issue", // critical (CRITICAL_TYPES) — bypasses prefs/quiet.
        titleKey: "notificationPaymentIssueTitle",
        bodyKey: "notificationPaymentIssueBody",
      };
    default:
      return null;
  }
}

/** One notification per RTDN message; retries reuse the same identity. */
export function billingSourceEventId(messageIdHash: string): string {
  return `rtdn:${messageIdHash}`;
}
