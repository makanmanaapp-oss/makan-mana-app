// Server-authoritative Google Play subscription verification. The client only
// forwards the product and opaque purchase token; it never grants a plan.
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";

import {
  processGooglePlaySubscription,
} from "../services/googlePlaySubscriptionService";

/** Owner-configured Play Developer API service-account JSON. */
export const playServiceAccount = defineSecret("PLAY_SERVICE_ACCOUNT_JSON");

interface VerifyInput {
  productId?: string;
  purchaseToken?: string;
}

export const verifyGooglePlaySubscription = onCall(
  {secrets: [playServiceAccount]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
    }

    const input = (request.data ?? {}) as VerifyInput;
    const productId = (input.productId ?? "").trim();
    const purchaseToken = (input.purchaseToken ?? "").trim();
    if (!productId) {
      throw new HttpsError("invalid-argument", "Produk tidak sah.");
    }
    if (purchaseToken.length < 8) {
      throw new HttpsError("invalid-argument", "Token pembelian tidak sah.");
    }

    const serviceAccountJson = playServiceAccount.value();
    if (!serviceAccountJson || serviceAccountJson.trim().length === 0) {
      throw new HttpsError(
        "failed-precondition",
        "play_verification_not_configured",
      );
    }

    const result = await processGooglePlaySubscription({
      uid,
      purchaseToken,
      expectedProductId: productId,
      serviceAccountJson,
      source: "verifyGooglePlaySubscription",
    });
    const fields = result.entitlement;
    return {
      entitled: fields.entitled,
      plan: fields.plan,
      planStatus: fields.planStatus,
      productId: fields.productId,
      expiryMillis: fields.expiryMillis,
      autoRenewing: fields.autoRenewing,
      acknowledgementStatus: result.acknowledgementStatus,
      localCompletionAllowed: result.localCompletionAllowed,
    };
  },
);
