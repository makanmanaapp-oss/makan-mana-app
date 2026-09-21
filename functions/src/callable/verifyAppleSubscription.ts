// Pengesahan langganan App Store yang server-authoritative. Klien hanya
// menghantar produk dan `originalTransactionId` legap; ia tidak pernah memberi
// pelan kepada dirinya sendiri.
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";

import {
  processAppleSubscription,
  readAppleConfig,
} from "../services/appleSubscriptionService";

/** Kredensial App Store Connect yang dikonfigurasikan pemilik. */
export const appleIapIssuerId = defineSecret("APPLE_IAP_ISSUER_ID");
export const appleIapKeyId = defineSecret("APPLE_IAP_KEY_ID");
export const appleIapPrivateKey = defineSecret("APPLE_IAP_PRIVATE_KEY");
/** Apple Root CA G3, dibekalkan pemilik. TIDAK ditanam dalam kod. */
export const appleRootCertificates = defineSecret("APPLE_ROOT_CERTIFICATES");

interface VerifyInput {
  productId?: string;
  originalTransactionId?: string;
}

export const verifyAppleSubscription = onCall(
  {
    secrets: [
      appleIapIssuerId,
      appleIapKeyId,
      appleIapPrivateKey,
      appleRootCertificates,
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
    }

    const input = (request.data ?? {}) as VerifyInput;
    const productId = (input.productId ?? "").trim();
    const originalTransactionId = (input.originalTransactionId ?? "").trim();
    if (!productId) {
      throw new HttpsError("invalid-argument", "Produk tidak sah.");
    }
    if (originalTransactionId.length < 4) {
      throw new HttpsError("invalid-argument", "ID transaksi tidak sah.");
    }

    // Gagal-tertutup: tanpa kredensial, TIADA kelayakan diberikan.
    const config = readAppleConfig({
      issuerId: appleIapIssuerId.value(),
      keyId: appleIapKeyId.value(),
      privateKeyPem: appleIapPrivateKey.value(),
      trustedRootsPem: appleRootCertificates.value(),
    });

    const result = await processAppleSubscription({
      uid,
      originalTransactionId,
      expectedProductId: productId,
      config,
      source: "verifyAppleSubscription",
    });

    const e = result.entitlement;
    return {
      entitled: e.entitled,
      plan: e.plan,
      planStatus: e.planStatus,
      productId: e.productId,
      expiryMillis: e.expiryMillis,
      autoRenewing: e.autoRenewing,
      environment: result.environment,
    };
  },
);
