import {db} from "../../config/firebase";
import {createNotification} from "./notificationService";
import type {CreateNotificationCommand} from "./notificationService";
import {CRITICAL_TYPES, categoryForType} from "./notificationContract";
import {deliverNotificationPush} from "../../services/pushDeliveryService";

/** Shared producer guard: a notification must never make the primary action
 * fail, and a two-way block suppresses relationship-derived disclosure.
 *
 * PROMPT 3 — after the canonical in-app record is CREATED, delivery to FCM is
 * attempted here (the ONLY push entry point). Producers never call Admin
 * Messaging directly. Push is DELIVERY-only and fully failure-safe: a push
 * failure never undoes the action nor removes the in-app record. */
/**
 * Failure-safe notification entry point. Returns `{ok}` so schedule-driven
 * callers can distinguish a HANDLED occurrence (created/duplicate/suppressed —
 * `ok:true`) from a transient PERSISTENCE failure (`ok:false`) that should be
 * retried, without ever throwing (Prompt 5A.1 Part 8). `status` is the
 * createNotification outcome. Existing callers that ignore the return are
 * unaffected.
 */
export async function notifySafely(
  command: CreateNotificationCommand,
): Promise<{ok: boolean; status?: string; inAppVisible?: boolean; push?: {sent: number; pruned: number; reason: string}}> {
  try {
    const result = await createNotification(command);
    if (result.status === "created") {
      // Fire push for the freshly-created record only (never duplicate/suppressed).
      // PROMPT 7: the push outcome is now returned (additively) so the broadcast
      // fanout can aggregate honest push metrics without a second read.
      const push = await deliverNotificationPush({
        notificationId: result.notificationId,
        recipientUid: command.recipientUid,
        type: command.type,
        category: categoryForType(command.type),
        titleKey: command.titleKey,
        bodyKey: command.bodyKey,
        title: command.title,
        body: command.body,
        isCritical: CRITICAL_TYPES.has(command.type),
        expiresAtMs: command.expiresAt ? command.expiresAt.getTime() : null,
        schemaVersion: 2,
      }).catch((e) => {
        console.error("push_delivery_failed", {type: command.type, e});
        return {sent: 0, pruned: 0, reason: "delivery_error"};
      });
      return {ok: true, status: result.status, inAppVisible: result.inAppVisible, push};
    }
    return {ok: true, status: result.status};
  } catch (error) {
    // A persistence failure — NOT an expected suppression. Signal retry.
    console.error("notification_side_effect_failed", {type: command.type, error});
    return {ok: false};
  }
}

export async function actorDisplaySnapshot(uid: string): Promise<string> {
  try {
    const user = await db.collection("users").doc(uid).get();
    const name = user.data()?.displayName;
    return typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : "MakanMana user";
  } catch (error) {
    console.error("notification_actor_snapshot_failed", {uid, error});
    return "MakanMana user";
  }
}

export async function relationshipBlocked(firstUid: string, secondUid: string): Promise<boolean> {
  if (!firstUid || !secondUid || firstUid === secondUid) return false;
  try {
    const [forward, reverse] = await Promise.all([
      db.collection("blocks").doc(`${firstUid}_${secondUid}`).get(),
      db.collection("blocks").doc(`${secondUid}_${firstUid}`).get(),
    ]);
    return forward.exists || reverse.exists;
  } catch (error) {
    // Fail closed for a notification-only privacy check.  The primary action
    // must remain successful even if this optional side effect cannot run.
    console.error("notification_block_check_failed", {firstUid, secondUid, error});
    return true;
  }
}
