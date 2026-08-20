/**
 * PROMPT 6A — trusted ADMIN broadcast adapter (server-only).
 *
 * Control Center is the ONLY caller. This adapter turns ONE already-authorized
 * recipient + admin-authored copy into a canonical Notification V2 record via
 * `notifySafely` — inheriting preferences, marketing opt-in, quiet hours, dedup,
 * inAppVisible, push policy, multi-device delivery and the safe destination
 * resolver. It builds NO parallel pipeline and can NEVER mark a notification
 * critical or bypass any preference. Marketing is included here (unlike the
 * system-only `emitSystemNotification`) but stays non-critical + opt-in-gated by
 * the resolver. Pure helpers are exported for unit tests.
 */
import {notifySafely} from "./notificationProducers";

/** The ONLY types Control Center may generate. Everything else is a domain event. */
export const ADMIN_BROADCAST_TYPES = [
  "system_announcement",
  "system_maintenance",
  "system_feature_update",
  "marketing_campaign",
] as const;
export type AdminBroadcastType = (typeof ADMIN_BROADCAST_TYPES)[number];

export function isAdminBroadcastType(value: unknown): value is AdminBroadcastType {
  return typeof value === "string" && (ADMIN_BROADCAST_TYPES as readonly string[]).includes(value);
}

/** Fields that would escalate/bypass policy. Their mere presence is rejected. */
export const FORBIDDEN_OVERRIDE_FIELDS = [
  "critical", "isCritical", "bypassPreference", "bypassPreferences",
  "bypassQuietHours", "forcePush", "ignoreMarketingConsent", "ignorePreference",
  "priority", "source",
] as const;

/** Throws if a caller tries to smuggle an escalation/bypass field. */
export function assertNoForbiddenOverride(payload: Record<string, unknown>): void {
  for (const field of FORBIDDEN_OVERRIDE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      throw new Error(`forbidden_override_field:${field}`);
    }
  }
}

export const ADMIN_LANGS = ["bm", "en", "zh", "ta"] as const;
export type AdminLang = (typeof ADMIN_LANGS)[number];
export const ADMIN_FALLBACK_LANG: AdminLang = "bm";

/** Pick the recipient-language copy, falling back to the fallback language. */
export function resolveLocalizedCopy(
  map: Partial<Record<string, string>> | undefined,
  lang: string | undefined,
  fallback: AdminLang = ADMIN_FALLBACK_LANG,
): string {
  const normalized = typeof lang === "string" ? lang.toLowerCase().slice(0, 2) : "";
  const byLang = map?.[normalized];
  if (typeof byLang === "string" && byLang.trim()) return byLang.trim();
  const byFallback = map?.[fallback];
  return typeof byFallback === "string" ? byFallback.trim() : "";
}

/** One record per Test Send execution identity → retries never duplicate. */
export function adminBroadcastSourceEventId(requestId: string): string {
  return `admin_broadcast:${requestId}`;
}

/** Content limits mirrored from the Control Center contract. */
export const ADMIN_CONTENT_LIMITS = {title: 80, body: 240} as const;

export interface AdminBroadcastCommand {
  recipientUid: string;
  type: AdminBroadcastType;
  requestId: string;
  /** Pre-resolved for the recipient's language by the bridge. */
  title: string;
  body: string;
  /** Approved internal route already resolved by Control Center. */
  destinationRoute?: string | null;
  deliveryPurpose?: "test";
}

/**
 * Emit one admin broadcast through Notification V2. Returns notifySafely's
 * `{ok, status}` so the bridge can report created vs suppressed vs retry.
 */
export async function emitAdminNotification(command: AdminBroadcastCommand) {
  if (!isAdminBroadcastType(command.type)) {
    throw new Error("forbidden_admin_type");
  }
  const title = command.title.trim();
  const body = command.body.trim();
  if (!title || !body) throw new Error("empty_admin_copy");
  if (title.length > ADMIN_CONTENT_LIMITS.title) throw new Error("admin_title_too_long");
  if (body.length > ADMIN_CONTENT_LIMITS.body) throw new Error("admin_body_too_long");

  return notifySafely({
    recipientUid: command.recipientUid,
    type: command.type,
    sourceEventId: adminBroadcastSourceEventId(command.requestId),
    // Free-form authored copy (no static l10n key). createNotification persists
    // title/body which the client tile renders when titleKey does not resolve.
    title,
    body,
    deepLink: command.destinationRoute ?? undefined,
    metadata: command.deliveryPurpose ? {deliveryPurpose: command.deliveryPurpose} : undefined,
    // NEVER critical; source is server-selected, never caller-supplied.
    source: "trusted_backend",
  });
}
