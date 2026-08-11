// Pure RTDN envelope validation. The handler must not call Play or Firestore
// unless this module has established that the message is a supported, valid
// subscription notification for MakanMana's frozen Android package.
export const SUPPORTED_RTND_VERSION = "1.0";

/** Google Play's currently documented subscription RTDN notification types. */
export const KNOWN_SUBSCRIPTION_NOTIFICATION_TYPES = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 17, 18, 19, 20, 22,
]);

export interface ValidSubscriptionRtdn {
  kind: "subscription";
  packageName: string;
  notificationType: number;
  purchaseToken: string;
}

export interface ValidTestRtdn {
  kind: "test";
  packageName: string;
}

export interface IgnoredRtdn {
  kind: "ignore";
  reason:
    | "missing_message_data"
    | "invalid_base64"
    | "invalid_json"
    | "unsupported_version"
    | "wrong_package"
    | "invalid_payload_shape"
    | "unknown_notification_type"
    | "unsupported_notification";
}

export type ValidatedRtdn = ValidSubscriptionRtdn | ValidTestRtdn | IgnoredRtdn;

interface RawRtdnPayload {
  version?: unknown;
  packageName?: unknown;
  eventTimeMillis?: unknown;
  subscriptionNotification?: {
    version?: unknown;
    notificationType?: unknown;
    purchaseToken?: unknown;
  };
  testNotification?: {version?: unknown};
  oneTimeProductNotification?: unknown;
  voidedPurchaseNotification?: unknown;
  pendingRefundReviewNotification?: unknown;
}

function decodeBase64Json(data: unknown): RawRtdnPayload | IgnoredRtdn {
  if (typeof data !== "string" || data.length === 0) {
    return {kind: "ignore", reason: "missing_message_data"};
  }
  // Buffer accepts some malformed values; reject non-base64 input first.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 !== 0) {
    return {kind: "ignore", reason: "invalid_base64"};
  }
  let decoded: string;
  try {
    decoded = Buffer.from(data, "base64").toString("utf8");
  } catch {
    return {kind: "ignore", reason: "invalid_base64"};
  }
  try {
    const value = JSON.parse(decoded) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {kind: "ignore", reason: "invalid_payload_shape"};
    }
    return value as RawRtdnPayload;
  } catch {
    return {kind: "ignore", reason: "invalid_json"};
  }
}

/**
 * Validates the base64 Pub/Sub body and classifies it without mutating state.
 * A test notification is intentionally distinct from a subscription event.
 */
export function validateGooglePlayRtdn(
  base64Data: unknown,
  expectedPackageName: string,
): ValidatedRtdn {
  const raw = decodeBase64Json(base64Data);
  if ("kind" in raw) return raw;
  if (raw.version !== SUPPORTED_RTND_VERSION) {
    return {kind: "ignore", reason: "unsupported_version"};
  }
  if (raw.packageName !== expectedPackageName) {
    return {kind: "ignore", reason: "wrong_package"};
  }
  const typesPresent = [
    raw.subscriptionNotification,
    raw.testNotification,
    raw.oneTimeProductNotification,
    raw.voidedPurchaseNotification,
    raw.pendingRefundReviewNotification,
  ].filter((value) => value !== undefined).length;
  if (typesPresent !== 1) {
    return {kind: "ignore", reason: "invalid_payload_shape"};
  }
  if (raw.testNotification !== undefined) {
    return raw.testNotification?.version === SUPPORTED_RTND_VERSION
      ? {kind: "test", packageName: expectedPackageName}
      : {kind: "ignore", reason: "unsupported_version"};
  }
  const subscription = raw.subscriptionNotification;
  if (!subscription) {
    return {kind: "ignore", reason: "unsupported_notification"};
  }
  if (subscription.version !== SUPPORTED_RTND_VERSION ||
      typeof subscription.purchaseToken !== "string" ||
      subscription.purchaseToken.length < 8 ||
      typeof subscription.notificationType !== "number" ||
      !Number.isInteger(subscription.notificationType)) {
    return {kind: "ignore", reason: "invalid_payload_shape"};
  }
  if (!KNOWN_SUBSCRIPTION_NOTIFICATION_TYPES.has(subscription.notificationType)) {
    return {kind: "ignore", reason: "unknown_notification_type"};
  }
  return {
    kind: "subscription",
    packageName: expectedPackageName,
    notificationType: subscription.notificationType,
    purchaseToken: subscription.purchaseToken,
  };
}

/** Safe, stable audit event names derived from RTDN types. */
export function rtdnEventType(notificationType: number): string {
  const types: Record<number, string> = {
    1: "subscription_recovered",
    2: "subscription_renewed",
    3: "subscription_cancelled",
    4: "subscription_purchased",
    5: "subscription_on_hold",
    6: "subscription_grace",
    7: "subscription_restarted",
    10: "subscription_paused",
    12: "subscription_revoked",
    13: "subscription_expired",
    20: "subscription_pending_cancelled",
  };
  return types[notificationType] ?? "subscription_updated";
}
