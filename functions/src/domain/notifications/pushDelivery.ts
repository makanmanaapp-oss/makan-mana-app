/**
 * NOTIFICATION V2 / PROMPT 3 — Push delivery DOMAIN (pure, no I/O).
 *
 * Multi-device registry shaping, push-policy evaluation, minimal payload,
 * device-level idempotency, and FCM error classification. FCM is DELIVERY only;
 * the persisted in-app NotificationRecord remains the source of truth.
 *
 * Fully deterministic + unit-testable. No Firestore, no Admin SDK here.
 */
import {
  CRITICAL_TYPES,
  NotificationCategory,
  NotificationType,
} from "./notificationContract";

// ---------------------------------------------------------------------------
// Multi-device registry (Part 2/3/6)
// ---------------------------------------------------------------------------
export const PUSH_DEVICE_SCHEMA_VERSION = 1;

export interface PushDevice {
  deviceId: string;
  token: string;
  platform: string;
  enabled: boolean;
  appVersion: string | null;
  buildNumber: string | null;
  locale: string | null;
  timezone: string | null;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
  tokenUpdatedAt: number;
  schemaVersion: number;
}

/** Raw client input — bounded; NEVER sensitive hardware/identity fields. */
export interface DeviceRegistrationInput {
  deviceId?: string;
  token?: string;
  platform?: string;
  appVersion?: string;
  buildNumber?: string;
  locale?: string;
  timezone?: string;
}

const s = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

/** Validate the two required identifiers. deviceId = installation id (not HW). */
export function validRegistration(input: DeviceRegistrationInput): boolean {
  const id = s(input.deviceId, 128);
  const tok = s(input.token, 4096);
  return id !== null && id.length >= 8 && tok !== null && tok.length >= 20;
}

/**
 * Build/refresh a device record. Same deviceId + new token → token refresh
 * (updatedAt/tokenUpdatedAt bump, createdAt preserved). No duplicate record.
 */
export function buildDeviceRecord(
  input: DeviceRegistrationInput,
  now: number,
  existing?: Partial<PushDevice> | null,
): PushDevice {
  const deviceId = s(input.deviceId, 128)!;
  const token = s(input.token, 4096)!;
  const tokenChanged = !existing || existing.token !== token;
  return {
    deviceId,
    token,
    platform: s(input.platform, 16) ?? existing?.platform ?? "android",
    enabled: true,
    appVersion: s(input.appVersion, 32) ?? existing?.appVersion ?? null,
    buildNumber: s(input.buildNumber, 32) ?? existing?.buildNumber ?? null,
    locale: s(input.locale, 16) ?? existing?.locale ?? null,
    timezone: s(input.timezone, 48) ?? existing?.timezone ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastSeenAt: now,
    tokenUpdatedAt: tokenChanged ? now : (existing?.tokenUpdatedAt ?? now),
    schemaVersion: PUSH_DEVICE_SCHEMA_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Push eligibility + policy (Part 11/12/13/14)
// ---------------------------------------------------------------------------
/**
 * Prompt 3 = USER-EVENT push only (Part 41 no broadcast, Part 42 no Tong-Tong).
 * Push-eligible = social/group category, OR a critical type (security/billing
 * allowlist). tongtong/marketing/food/fit/report/system are NOT pushed here.
 */
const PUSH_ELIGIBLE_CATEGORIES = new Set<NotificationCategory>(["social", "group"]);

export function isPushEligibleType(type: NotificationType, category: NotificationCategory): boolean {
  return PUSH_ELIGIBLE_CATEGORIES.has(category) || CRITICAL_TYPES.has(type);
}

export interface CategoryPreference {
  inAppEnabled?: boolean;
  pushEnabled?: boolean;
}
export interface QuietHoursPreference {
  quietHoursEnabled?: boolean;
  quietHoursStart?: number; // minutes 0..1439
  quietHoursEnd?: number; // minutes 0..1439
  timezone?: string;
}

/** Minutes-of-day in [start,end), wrap-around aware (e.g. 22:00→07:00). */
export function withinQuietWindow(minuteOfDay: number, start: number, end: number): boolean {
  if (start === end) return false; // empty window
  if (start < end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end; // wraps midnight
}

export type PushDecisionReason =
  | "eligible"
  | "not_push_eligible_type"
  | "suppressed_preference"
  | "suppressed_quiet_hours"
  | "expired"
  | "no_device";

export interface PushPolicyInput {
  type: NotificationType;
  category: NotificationCategory;
  isCritical: boolean;
  expiresAtMs: number | null;
  categoryPreference: CategoryPreference;
  quiet: QuietHoursPreference;
  /** recipient's local minute-of-day (caller computes from tz). */
  localMinuteOfDay: number;
  activeDeviceCount: number;
  nowMs: number;
}

export interface PushPolicyDecision {
  send: boolean;
  reason: PushDecisionReason;
}

/**
 * Evaluate whether a created NotificationRecord should push. Critical types
 * bypass preference + quiet-hours (Part 14). Non-critical respect pushEnabled
 * (default ON) and quiet-hours suppression (Part 13, no scheduling).
 */
export function evaluatePushPolicy(input: PushPolicyInput): PushPolicyDecision {
  if (!isPushEligibleType(input.type, input.category)) {
    return {send: false, reason: "not_push_eligible_type"};
  }
  if (input.expiresAtMs !== null && input.expiresAtMs <= input.nowMs) {
    return {send: false, reason: "expired"};
  }
  if (!input.isCritical) {
    if (input.categoryPreference.pushEnabled === false) {
      return {send: false, reason: "suppressed_preference"};
    }
    if (input.quiet.quietHoursEnabled === true &&
        typeof input.quiet.quietHoursStart === "number" &&
        typeof input.quiet.quietHoursEnd === "number" &&
        withinQuietWindow(input.localMinuteOfDay, input.quiet.quietHoursStart, input.quiet.quietHoursEnd)) {
      return {send: false, reason: "suppressed_quiet_hours"};
    }
  }
  if (input.activeDeviceCount <= 0) return {send: false, reason: "no_device"};
  return {send: true, reason: "eligible"};
}

// ---------------------------------------------------------------------------
// Payload minimization + lock-screen privacy (Part 15/16)
// ---------------------------------------------------------------------------
export interface PushPayload {
  /** data-only fields (authoritative record is Firestore). */
  data: Record<string, string>;
  /** privacy-safe presentation (localized by the sender). */
  titleKey: string;
  bodyKey: string;
}

/**
 * Minimal payload. NEVER include private post/comment bodies, member lists,
 * payment/health/auth data, or raw tokens. Only identifiers + safe keys.
 */
export function buildPushPayload(record: {
  notificationId: string;
  type: NotificationType;
  category: NotificationCategory;
  titleKey: string;
  bodyKey: string;
  schemaVersion: number;
}): PushPayload {
  return {
    data: {
      notificationId: record.notificationId,
      type: record.type,
      category: record.category,
      schemaVersion: String(record.schemaVersion),
    },
    titleKey: record.titleKey,
    bodyKey: record.bodyKey,
  };
}

// ---------------------------------------------------------------------------
// Device-level delivery idempotency (Part 18) + status (Part 19)
// ---------------------------------------------------------------------------
/** Stable device-level delivery identity: notificationId × deviceId. */
export function deliveryId(notificationId: string, deviceId: string): string {
  return `${notificationId}__${deviceId}`;
}

export type DeliveryStatus =
  | "sent"
  | "failed"
  | "invalid_token"
  | "suppressed_preference"
  | "suppressed_quiet_hours"
  | "no_device";

// ---------------------------------------------------------------------------
// FCM error classification (Part 20) — prune ONLY permanent, keep transient.
// ---------------------------------------------------------------------------
const PERMANENT_FCM_CODES = new Set<string>([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export type FcmErrorClass = "invalid_token" | "transient";

/** Permanent token errors → prune the device; everything else → transient. */
export function classifyFcmError(code: string | undefined | null): FcmErrorClass {
  return code && PERMANENT_FCM_CODES.has(code) ? "invalid_token" : "transient";
}

/** Sentinel deviceId for the legacy single-token fallback (Part 9). */
export const LEGACY_DEVICE_ID = "legacy_fcm_token";

export interface DeliveryOutcome {
  deviceId: string;
  status: DeliveryStatus;
  /** Which token to prune: a registry device, the legacy token, or none. */
  prune: "device" | "legacy" | null;
}

/**
 * Pure per-device outcome resolution (Part 39/40): success→sent; permanent
 * error→invalid_token+prune; transient→failed (KEEP). Partial multi-device
 * failure is handled independently per device (one bad token never affects
 * the others). Retry-idempotency is enforced upstream (already-sent skipped).
 */
export function resolveDeliveryOutcomes(
  pending: ReadonlyArray<{deviceId: string}>,
  results: ReadonlyArray<{success: boolean; errorCode?: string | null}>,
): DeliveryOutcome[] {
  return pending.map((d, i) => {
    const r = results[i];
    if (r?.success) return {deviceId: d.deviceId, status: "sent", prune: null};
    if (classifyFcmError(r?.errorCode) === "invalid_token") {
      return {
        deviceId: d.deviceId,
        status: "invalid_token",
        prune: d.deviceId === LEGACY_DEVICE_ID ? "legacy" : "device",
      };
    }
    return {deviceId: d.deviceId, status: "failed", prune: null};
  });
}

/** Never log/expose raw tokens (Part 36). Short stable hash for observability. */
export function maskToken(token: string): string {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `tok_${(h >>> 0).toString(16)}`;
}
