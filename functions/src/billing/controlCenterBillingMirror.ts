import {defineSecret} from "firebase-functions/params";

import {MakanManaPlan} from "./googlePlayDomain";

export const CONTROL_CENTER_SYNC_SECRET = defineSecret(
  "CONTROL_CENTER_SYNC_SECRET",
);

const CONTROL_CENTER_MIRROR_URL =
  "https://makanmana-control-center.vercel.app/api/internal/sync/mirror";

export interface EffectiveSubscriptionMirror {
  productId: string | null;
  plan: MakanManaPlan;
  status: string;
  expiryTime: string | null;
  autoRenew: boolean | null;
}

export interface SubscriptionMirrorInput {
  uid: string;
  subscription: EffectiveSubscriptionMirror;
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
    current_period_start: null,
    current_period_end: input.subscription.expiryTime,
    auto_renew: input.subscription.autoRenew,
    trial_type: null,
    trial_started_at: null,
    trial_ends_at: null,
    coupon_id: null,
    cancelled_at: null,
    expired_at: input.subscription.status === "expired" ?
      input.subscription.expiryTime : null,
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
