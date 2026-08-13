import {defineSecret} from "firebase-functions/params";

import {NormalizedSubscription, hashPurchaseToken} from "./googlePlayDomain";

export const CONTROL_CENTER_SYNC_SECRET = defineSecret(
  "CONTROL_CENTER_SYNC_SECRET",
);

const CONTROL_CENTER_MIRROR_URL =
  "https://makanmana-control-center.vercel.app/api/internal/sync/mirror";

export interface SubscriptionMirrorInput {
  uid: string;
  purchaseToken: string;
  subscription: NormalizedSubscription;
  eventId: string;
}

export async function mirrorSubscriptionToControlCenter(
  input: SubscriptionMirrorInput,
): Promise<void> {
  const record = {
    firebase_uid: input.uid,
    provider: "google_play",
    product_id: input.subscription.productId,
    plan: input.subscription.plan,
    status: input.subscription.status,
    // Google subscriptionsv2 exposes subscription startTime and expiryTime,
    // but not an unambiguous current-renewal-period start. Keep it unknown.
    current_period_start: null,
    current_period_end: input.subscription.expiryTime,
    auto_renew: input.subscription.autoRenew,
    trial_type: null,
    trial_started_at: null,
    trial_ends_at: null,
    coupon_id: null,
    cancelled_at: input.subscription.status === "canceled" ?
      new Date().toISOString() : null,
    expired_at: input.subscription.status === "expired" ?
      input.subscription.expiryTime : null,
    purchase_token_hash: hashPurchaseToken(input.purchaseToken),
  };

  const response = await fetch(CONTROL_CENTER_MIRROR_URL, {
    method: "POST",
    redirect: "error",
    headers: {
      authorization: `Bearer ${CONTROL_CENTER_SYNC_SECRET.value()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sourceSystem: "google_play_backend",
      eventId: input.eventId,
      entityType: "subscription",
      records: [record],
    }),
  });

  if (!response.ok) {
    const text = (await response.text()).slice(0, 500);
    throw new Error(
      `Control Center subscription mirror rejected (${response.status}): ${text}`,
    );
  }
}
