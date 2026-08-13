import {HttpsError, onCall} from "firebase-functions/v2/https";

import {
  BillingAuthorityError,
  prepareBillingAccount,
  processGooglePlaySubscription,
} from "./billingAuthority";
import {CONTROL_CENTER_SYNC_SECRET} from "./controlCenterBillingMirror";

function billingHttpsError(error: unknown): HttpsError {
  if (error instanceof BillingAuthorityError) {
    if (error.code === "unsupported-product" || error.code === "invalid-token") {
      return new HttpsError("invalid-argument", "Maklumat pembelian tidak sah.");
    }
    if (
      error.code === "account-mismatch" ||
      error.code === "token-already-owned" ||
      error.code === "account-binding-missing"
    ) {
      return new HttpsError("permission-denied", "Pembelian tidak sepadan dengan akaun ini.");
    }
    if (error.code === "account-not-prepared") {
      return new HttpsError("failed-precondition", "Sesi pembelian belum disediakan.");
    }
    if (error.code === "play-verification-failed" ||
        error.code === "play-acknowledgement-failed") {
      return new HttpsError("unavailable", "Google Play belum dapat mengesahkan pembelian.");
    }
  }
  return new HttpsError("internal", "Pengesahan langganan gagal.");
}

export const prepareGooglePlayBilling = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");

  const opaqueAccountId = await prepareBillingAccount(uid);
  return {
    status: "OK",
    opaqueAccountId,
  };
});

export const verifyGooglePlaySubscription = onCall(
  {
    secrets: [CONTROL_CENTER_SYNC_SECRET],
    timeoutSeconds: 60,
    memory: "256MiB",
    maxInstances: 20,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");

    const input = (request.data ?? {}) as {
      productId?: unknown;
      purchaseToken?: unknown;
    };
    const productId = typeof input.productId === "string" ? input.productId.trim() : "";
    const purchaseToken = typeof input.purchaseToken === "string" ? input.purchaseToken.trim() : "";

    if (!productId || !purchaseToken) {
      throw new HttpsError("invalid-argument", "Maklumat pembelian tidak lengkap.");
    }

    try {
      const result = await processGooglePlaySubscription({
        requestedUid: uid,
        productId,
        purchaseToken,
        source: "client_verify",
      });
      return {
        status: "OK",
        verified: true,
        allowCompletePurchase: result.acknowledged,
        entitled: result.effective.plan !== "free",
        plan: result.effective.plan,
        planStatus: result.effective.status,
        periodEnd: result.effective.expiryTime,
      };
    } catch (error) {
      throw billingHttpsError(error);
    }
  },
);
