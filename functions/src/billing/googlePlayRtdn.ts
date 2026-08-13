import {onMessagePublished} from "firebase-functions/v2/pubsub";

import {db, FieldValue} from "../config/firebase";
import {
  BillingAuthorityError,
  processGooglePlaySubscription,
} from "./billingAuthority";
import {CONTROL_CENTER_SYNC_SECRET} from "./controlCenterBillingMirror";
import {
  PLAY_PACKAGE_NAME,
  hashPurchaseToken,
} from "./googlePlayDomain";
import {getGooglePlaySubscription} from "./googlePlayApi";

type DeveloperNotification = {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  testNotification?: {version?: string};
  subscriptionNotification?: {
    version?: string;
    notificationType?: number;
    purchaseToken?: string;
  };
};

async function claimReceipt(messageId: string): Promise<boolean> {
  const ref = db.collection("billing_rtdn_receipts").doc(messageId);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      const status = existing.data()?.status as string | undefined;
      if (status === "succeeded" || status === "ignored" || status === "unmatched") {
        return false;
      }
      if (status === "processing") {
        // Another delivery is already handling the same Pub/Sub message.
        return false;
      }
      tx.set(ref, {
        status: "processing",
        attempts: Number(existing.data()?.attempts ?? 0) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return true;
    }
    tx.set(ref, {
      messageId,
      status: "processing",
      attempts: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

async function finishReceipt(
  messageId: string,
  status: "succeeded" | "failed" | "ignored" | "unmatched",
  extra: Record<string, unknown> = {},
): Promise<void> {
  await db.collection("billing_rtdn_receipts").doc(messageId).set({
    status,
    ...extra,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
}

export const handleGooglePlayRtdn = onMessagePublished(
  {
    topic: "play-rtdn",
    secrets: [CONTROL_CENTER_SYNC_SECRET],
    timeoutSeconds: 120,
    memory: "256MiB",
    maxInstances: 10,
  },
  async (event) => {
    const message = event.data.message;
    const messageId = message.messageId || event.id;
    if (!messageId) throw new Error("RTDN message has no id");

    const claimed = await claimReceipt(messageId);
    if (!claimed) return;

    let payload: DeveloperNotification;
    try {
      payload = message.json as DeveloperNotification;
    } catch {
      await finishReceipt(messageId, "ignored", {reason: "invalid_json"});
      return;
    }

    if (payload.packageName !== PLAY_PACKAGE_NAME) {
      await finishReceipt(messageId, "ignored", {reason: "package_mismatch"});
      return;
    }

    if (payload.testNotification) {
      await finishReceipt(messageId, "succeeded", {eventType: "test"});
      return;
    }

    const notification = payload.subscriptionNotification;
    const purchaseToken = notification?.purchaseToken?.trim() ?? "";
    const notificationType = notification?.notificationType;
    if (!notification || !purchaseToken || typeof notificationType !== "number") {
      await finishReceipt(messageId, "ignored", {reason: "not_subscription"});
      return;
    }

    const tokenHash = hashPurchaseToken(purchaseToken);
    let purchase;
    try {
      purchase = await getGooglePlaySubscription(purchaseToken);
    } catch {
      await finishReceipt(messageId, "failed", {
        reason: "play_verification_failed",
        tokenHash,
        notificationType,
      });
      throw new Error("RTDN Google Play verification failed");
    }

    try {
      const result = await processGooglePlaySubscription({
        purchaseToken,
        source: "rtdn",
        sourceEventId: `rtdn:${messageId}`,
        preloadedPurchase: purchase,
      });
      await finishReceipt(messageId, "succeeded", {
        uid: result.uid,
        tokenHash,
        productId: result.normalized.productId,
        plan: result.effective.plan,
        status: result.effective.status,
        notificationType,
        eventTimeMillis: payload.eventTimeMillis ?? null,
      });
    } catch (error) {
      if (error instanceof BillingAuthorityError &&
          error.code === "account-unresolved") {
        await db.collection("billing_unmatched_rtdn").doc(messageId).set({
          messageId,
          tokenHash,
          notificationType,
          eventTimeMillis: payload.eventTimeMillis ?? null,
          status: "unmatched",
          createdAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        await finishReceipt(messageId, "unmatched", {
          tokenHash,
          notificationType,
        });
        return;
      }

      await finishReceipt(messageId, "failed", {
        reason: error instanceof BillingAuthorityError ? error.code : "processing_failed",
        tokenHash,
        notificationType,
      });
      throw new Error("RTDN subscription processing failed");
    }
  },
);
