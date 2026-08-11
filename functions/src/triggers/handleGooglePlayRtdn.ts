// Server-only Google Play Real-time Developer Notifications lifecycle sync.
import {logger} from "firebase-functions";
import {onMessagePublished} from "firebase-functions/v2/pubsub";

import {playServiceAccount} from "../callable/verifyGooglePlaySubscription";
import {db, FieldValue} from "../config/firebase";
import {
  rtdnEventType,
  validateGooglePlayRtdn,
} from "../domain/billing/googlePlayRtdn";
import {
  ANDROID_PACKAGE_NAME,
  fetchGooglePlaySubscription,
  processGooglePlaySubscription,
  resolveRtdnUid,
  sha256,
} from "../services/googlePlaySubscriptionService";

/** Owner must configure this exact topic in Play Console before deployment. */
const googlePlayRtdnTopic = process.env.GOOGLE_PLAY_RTDN_TOPIC ?? "play-rtdn";

async function writeRtdnEvent(params: {
  eventType: string;
  messageIdHash: string;
  result: string;
  packageName?: string;
  notificationType?: number;
  purchaseToken?: string;
  uid?: string;
  productId?: string | null;
  entitled?: boolean;
  planStatus?: string;
  reason?: string;
}): Promise<void> {
  await db.collection("subscription_events").add({
    source: "handleGooglePlayRtdn",
    eventType: params.eventType,
    result: params.result,
    rtdnMessageIdHash: params.messageIdHash,
    ...(params.packageName ? {packageName: params.packageName} : {}),
    ...(params.notificationType !== undefined
      ? {rtdnNotificationType: params.notificationType}
      : {}),
    ...(params.purchaseToken ? {purchaseTokenHash: sha256(params.purchaseToken)} : {}),
    ...(params.uid ? {uid: params.uid} : {}),
    ...(params.productId ? {productId: params.productId} : {}),
    ...(params.entitled !== undefined ? {entitled: params.entitled} : {}),
    ...(params.planStatus ? {planStatus: params.planStatus} : {}),
    ...(params.reason ? {reason: params.reason} : {}),
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function markRtdnHandled(params: {
  messageIdHash: string;
  result: string;
  packageName?: string;
  notificationType?: number;
  purchaseToken?: string;
}): Promise<void> {
  const ref = db.collection("google_play_rtdn_messages").doc(params.messageIdHash);
  await ref.create({
    rtdnMessageIdHash: params.messageIdHash,
    result: params.result,
    ...(params.packageName ? {packageName: params.packageName} : {}),
    ...(params.notificationType !== undefined
      ? {notificationType: params.notificationType}
      : {}),
    ...(params.purchaseToken ? {purchaseTokenHash: sha256(params.purchaseToken)} : {}),
    receivedAt: FieldValue.serverTimestamp(),
    processedAt: FieldValue.serverTimestamp(),
  }).catch((e: {code?: number}) => {
    if (e.code !== 6) throw e; // Firestore ALREADY_EXISTS.
  });
}

/**
 * Each delivery is validated from its base64 envelope before any mutation. A
 * failed Play/Firestore operation throws so Pub/Sub retries; safely ignored
 * invalid messages are recorded and never reach Play or entitlement storage.
 */
export const handleGooglePlayRtdn = onMessagePublished(
  {topic: googlePlayRtdnTopic, secrets: [playServiceAccount], retry: true},
  async (event) => {
    const message = event?.data?.message;
    const messageId = message?.messageId || event.id;
    const messageIdHash = sha256(messageId);
    const dedupRef = db.collection("google_play_rtdn_messages").doc(messageIdHash);
    if ((await dedupRef.get()).exists) {
      await writeRtdnEvent({
        eventType: "rtdn_duplicate",
        result: "duplicate_ignored",
        messageIdHash,
      });
      logger.info("Google Play RTDN duplicate ignored", {messageIdHash});
      return;
    }

    const validated = validateGooglePlayRtdn(message?.data, ANDROID_PACKAGE_NAME);
    if (validated.kind === "ignore") {
      await writeRtdnEvent({
        eventType: "rtdn_ignored",
        result: "ignored",
        messageIdHash,
        reason: validated.reason,
      });
      await markRtdnHandled({messageIdHash, result: validated.reason});
      logger.warn("Google Play RTDN ignored", {messageIdHash, reason: validated.reason});
      return;
    }
    if (validated.kind === "test") {
      // Connectivity evidence only: no Play request and no entitlement writes.
      await writeRtdnEvent({
        eventType: "rtdn_test",
        result: "connectivity_confirmed",
        messageIdHash,
        packageName: validated.packageName,
      });
      await markRtdnHandled({
        messageIdHash,
        result: "test_notification",
        packageName: validated.packageName,
      });
      logger.info("Google Play RTDN test received", {messageIdHash});
      return;
    }

    await writeRtdnEvent({
      eventType: "rtdn_received",
      result: "received",
      messageIdHash,
      packageName: validated.packageName,
      notificationType: validated.notificationType,
      purchaseToken: validated.purchaseToken,
    });

    const serviceAccountJson = playServiceAccount.value();
    if (!serviceAccountJson || serviceAccountJson.trim().length === 0) {
      logger.error("Google Play RTDN missing verifier configuration", {messageIdHash});
      throw new Error("play_verification_not_configured");
    }
    const sub = await fetchGooglePlaySubscription({
      purchaseToken: validated.purchaseToken,
      serviceAccountJson,
    });
    const uid = await resolveRtdnUid(sub, validated.purchaseToken);
    if (!uid) {
      // Do not guess ownership, acknowledge, grant, revoke, or overwrite any
      // account. A later authenticated purchase/restore can reconcile it.
      await writeRtdnEvent({
        eventType: "rtdn_unresolved_user",
        result: "unresolved_ignored",
        messageIdHash,
        packageName: validated.packageName,
        notificationType: validated.notificationType,
        purchaseToken: validated.purchaseToken,
        reason: "unresolved_or_conflicting_account",
      });
      await markRtdnHandled({
        messageIdHash,
        result: "unresolved_user",
        packageName: validated.packageName,
        notificationType: validated.notificationType,
        purchaseToken: validated.purchaseToken,
      });
      logger.warn("Google Play RTDN user unresolved", {messageIdHash});
      return;
    }

    const result = await processGooglePlaySubscription({
      uid,
      purchaseToken: validated.purchaseToken,
      serviceAccountJson,
      source: "handleGooglePlayRtdn",
      rtdnMessageIdHash: messageIdHash,
      rtdnNotificationType: validated.notificationType,
    });
    if (result.acknowledgementStatus === "pending_retry") {
      // The entitlement is safe, but Pub/Sub must retry acknowledgement.
      logger.error("Google Play acknowledgement needs retry", {messageIdHash});
      throw new Error("google_play_acknowledgement_pending_retry");
    }

    await writeRtdnEvent({
      eventType: "rtdn_processed",
      result: "processed",
      messageIdHash,
      packageName: validated.packageName,
      notificationType: validated.notificationType,
      purchaseToken: validated.purchaseToken,
      uid,
      productId: result.entitlement.productId,
      entitled: result.entitlement.entitled,
      planStatus: result.entitlement.planStatus,
      reason: rtdnEventType(validated.notificationType),
    });
    await markRtdnHandled({
      messageIdHash,
      result: "processed",
      packageName: validated.packageName,
      notificationType: validated.notificationType,
      purchaseToken: validated.purchaseToken,
    });
    logger.info("Google Play RTDN processed", {messageIdHash});
  },
);

export const __rtdnTest = {validateGooglePlayRtdn};
