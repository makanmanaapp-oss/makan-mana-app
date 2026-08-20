import {HttpsError, onCall} from "firebase-functions/v2/https";

import {
  prepareGooglePlayBillingAccount,
} from "../services/googlePlaySubscriptionService";

/**
 * Authenticated pre-checkout binding for Google Play Billing.
 * Returns only an opaque account id; never exposes billing secrets.
 */
export const prepareGooglePlayBilling = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }

  const opaqueAccountId = await prepareGooglePlayBillingAccount(uid);

  return {
    status: "OK",
    opaqueAccountId,
  };
});
