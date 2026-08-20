import {createHash} from "node:crypto";

import {db, FieldValue} from "../../config/firebase";
import {
  categoryForType,
  CRITICAL_TYPES,
  NotificationCategory,
  NotificationType,
  resolveNotificationPersistence,
  resolvePreference,
  shouldSuppressSelf,
  stableDedupKey,
} from "./notificationContract";
import {isPushEligibleType} from "./pushDelivery";

export interface CreateNotificationCommand {
  recipientUid: string;
  type: NotificationType;
  sourceEventId: string;
  actorUid?: string;
  actorDisplaySnapshot?: string;
  entityType?: string;
  entityId?: string;
  parentEntityId?: string;
  /** l10n key (domain events). Optional when pre-resolved `title` text is given
   * (PROMPT 6A admin broadcasts author free-form, non-key copy). */
  titleKey?: string;
  bodyKey?: string;
  /** Pre-resolved display text. The client already reads `title`/`body` as the
   * fallback when `titleKey`/`bodyKey` do not resolve (notification tile). Used
   * by trusted admin broadcasts; a command must carry a key OR text for each. */
  title?: string;
  body?: string;
  localeData?: Record<string, string | number | boolean>;
  deepLink?: string;
  metadata?: Record<string, string | number | boolean>;
  priority?: number;
  expiresAt?: Date;
  /** Server-selected provenance; never accepted from a Flutter caller. */
  source?: "trusted_backend" | "qa_fixture";
}

export type CreateNotificationResult =
  | {status: "created"; notificationId: string; inAppVisible: boolean}
  | {status: "duplicate"; notificationId: string}
  | {status: "suppressed_self"}
  | {status: "suppressed_preference"};

function validUid(uid: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(uid);
}

function cleanText(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= max ? trimmed : undefined;
}

function dedupDocId(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Trusted Admin-SDK creation path. Never export this through a client callable.
 * Uses a deterministic document id, making Firestore-trigger retries idempotent.
 */
export async function createNotification(command: CreateNotificationCommand): Promise<CreateNotificationResult> {
  const hasTitle = Boolean(command.titleKey?.trim() || command.title?.trim());
  const hasBody = Boolean(command.bodyKey?.trim() || command.body?.trim());
  if (!validUid(command.recipientUid) || !command.sourceEventId.trim() || !hasTitle || !hasBody) {
    throw new Error("invalid_notification_command");
  }
  if (command.actorUid && !validUid(command.actorUid)) throw new Error("invalid_actor_uid");
  if (shouldSuppressSelf(command.actorUid, command.recipientUid, command.type)) return {status: "suppressed_self"};

  const category = categoryForType(command.type);
  const isCritical = CRITICAL_TYPES.has(command.type);
  const userRef = db.collection("users").doc(command.recipientUid);
  const key = stableDedupKey(command.type, command.recipientUid, command.sourceEventId);
  const notificationId = dedupDocId(key);
  const ref = userRef.collection("notifications").doc(notificationId);

  return db.runTransaction(async (tx) => {
    const [existing, user] = await Promise.all([tx.get(ref), tx.get(userRef)]);
    if (existing.exists) return {status: "duplicate", notificationId};
    // PROMPT 4/4A: INDEPENDENT channels. Resolve in-app AND push eligibility.
    // - both OFF  → no record at all (no visible noise, no push) — Part 10.
    // - in-app ON → visible canonical record (bell counts it).
    // - in-app OFF + push ON → ONE canonical record persisted but
    //   inAppVisible:false, so Push V2's tap→fetch-canonical-record→resolver
    //   still works while it never shows in the Center or bumps the bell
    //   (Part 4/5). Critical bypasses both (resolver returns all-true).
    const preferences = (user.data()?.notificationPreferences ?? {}) as Record<string, unknown>;
    const pref = resolvePreference(preferences, category, isCritical);
    const decision = resolveNotificationPersistence(
      pref, isPushEligibleType(command.type, category));
    if (!decision.persist) {
      return {status: "suppressed_preference"};
    }

    tx.create(ref, {
      inAppVisible: decision.inAppVisible,
      recipientUid: command.recipientUid,
      type: command.type,
      category: category as NotificationCategory,
      actorUid: command.actorUid ?? null,
      actorDisplaySnapshot: cleanText(command.actorDisplaySnapshot, 80) ?? null,
      entityType: cleanText(command.entityType, 48) ?? null,
      entityId: cleanText(command.entityId, 256) ?? null,
      parentEntityId: cleanText(command.parentEntityId, 256) ?? null,
      titleKey: command.titleKey?.trim() ?? null,
      bodyKey: command.bodyKey?.trim() ?? null,
      title: cleanText(command.title, 200) ?? null,
      body: cleanText(command.body, 1000) ?? null,
      localeData: command.localeData ?? {},
      deepLink: cleanText(command.deepLink, 512) ?? null,
      metadata: command.metadata ?? {},
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
      openedAt: null,
      status: "unread",
      priority: Math.max(0, Math.min(3, Math.trunc(command.priority ?? 0))),
      isCritical,
      source: command.source ?? "trusted_backend",
      dedupKey: key,
      expiresAt: command.expiresAt ?? null,
      schemaVersion: 2,
    });
    return {status: "created", notificationId, inAppVisible: decision.inAppVisible};
  });
}
