import {GoogleAuth} from "google-auth-library";

import {
  PLAY_PACKAGE_NAME,
  PlaySubscriptionPurchaseV2,
} from "./googlePlayDomain";

const ANDROID_PUBLISHER_SCOPE =
  "https://www.googleapis.com/auth/androidpublisher";
const ANDROID_PUBLISHER_ROOT =
  "https://androidpublisher.googleapis.com/androidpublisher/v3";

const auth = new GoogleAuth({scopes: [ANDROID_PUBLISHER_SCOPE]});

function subscriptionV2Url(purchaseToken: string): string {
  return `${ANDROID_PUBLISHER_ROOT}/applications/${encodeURIComponent(PLAY_PACKAGE_NAME)}` +
    `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
}

function acknowledgeUrl(productId: string, purchaseToken: string): string {
  return `${ANDROID_PUBLISHER_ROOT}/applications/${encodeURIComponent(PLAY_PACKAGE_NAME)}` +
    `/purchases/subscriptions/${encodeURIComponent(productId)}` +
    `/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
}

export async function getGooglePlaySubscription(
  purchaseToken: string,
): Promise<PlaySubscriptionPurchaseV2> {
  if (!purchaseToken || purchaseToken.length > 4096) {
    throw new Error("Invalid Google Play purchase token");
  }
  const client = await auth.getClient();
  const response = await client.request<PlaySubscriptionPurchaseV2>({
    url: subscriptionV2Url(purchaseToken),
    method: "GET",
  });
  return response.data;
}

export async function acknowledgeGooglePlaySubscription(
  productId: string,
  purchaseToken: string,
): Promise<void> {
  const client = await auth.getClient();
  await client.request({
    url: acknowledgeUrl(productId, purchaseToken),
    method: "POST",
    data: {},
  });
}
