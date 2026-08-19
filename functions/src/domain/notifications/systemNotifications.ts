/**
 * PROMPT 5 — SYSTEM notification boundary (CONTRACT READY, no producer wired).
 *
 * System notices (maintenance / service notice / product update) are distinct
 * from marketing (Part 31) and must originate ONLY from a trusted server/admin
 * source. Prompt 6's Control Center will own the authoritative audience + admin
 * authorization and call this helper. Prompt 5 deliberately exposes NO public
 * callable — there is intentionally no client-reachable `sendSystemNotification`
 * (Part 32). This helper is a thin, server-only adapter over the canonical
 * engine so a system notice inherits preferences (`system` category), quiet
 * hours, in-app visibility, and dedup with no parallel pipeline.
 *
 * Not exported from index.ts. Not a callable. Marketing/Tong-Tong excluded.
 */
import {notifySafely} from "./notificationProducers";

export type SystemNotificationType =
  | "system_announcement"
  | "system_maintenance"
  | "system_feature_update";

export interface SystemNotificationCommand {
  recipientUid: string;
  type: SystemNotificationType;
  /** Stable per broadcast/incident so retries + fan-out never duplicate. */
  sourceEventId: string;
  titleKey: string;
  bodyKey: string;
  localeData?: Record<string, string | number | boolean>;
}

/**
 * Emit one canonical system notification to a single recipient. The CALLER
 * (Control Center, Prompt 6) is responsible for admin authorization and for
 * resolving the authoritative audience — this helper only adapts one already
 * authorized recipient into Notification V2. Never call from client-triggered
 * code paths.
 */
export async function emitSystemNotification(
  command: SystemNotificationCommand,
): Promise<void> {
  await notifySafely({
    recipientUid: command.recipientUid,
    type: command.type,
    sourceEventId: command.sourceEventId,
    titleKey: command.titleKey,
    bodyKey: command.bodyKey,
    localeData: command.localeData,
    source: "trusted_backend",
  });
}
