// Pengesahan langganan App Store yang server-authoritative. Klien hanya
// menghantar produk dan `originalTransactionId` legap; ia tidak pernah memberi
// pelan kepada dirinya sendiri.
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";

import {db} from "../config/firebase";

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
/**
 * WAVE 4A (S-3) — appAppleId aplikasi PRODUKSI. Tanpanya kita tidak boleh
 * membuktikan muatan bertandatangan merujuk aplikasi KITA, jadi produksi
 * gagal-TERTUTUP. Dikongsi dengan laluan notifikasi.
 */
export const appleAppAppleIdForVerify = defineSecret("APPLE_APP_APPLE_ID");
interface VerifyInput {
  productId?: string;
  originalTransactionId?: string;
}

/**
 * TestFlight IAP runs in Apple Sandbox even for the production bundle.
 *
 * The client cannot enable this. An owner must create
 * billing_runtime/testflight_sandbox with:
 *   enabled: true
 *   expiresAt: Firestore Timestamp (future)
 *   allowedUids: [uid, ...] and/or
 *   allowedEmails: ["verified@example.com", ...]
 *
 * Missing, expired, or non-matching configuration fails closed.
 */
async function testFlightSandboxAllowed(
  uid: string,
  token: Record<string, unknown>,
): Promise<boolean> {
  const snap = await db
    .collection("billing_runtime")
    .doc("testflight_sandbox")
    .get();
  if (!snap.exists) return false;

  const data = snap.data() ?? {};
  if (data.enabled !== true) return false;

  const rawExpiry = data.expiresAt;
  const expiryMillis =
    typeof rawExpiry === "number" ?
      rawExpiry :
      rawExpiry && typeof rawExpiry.toMillis === "function" ?
        rawExpiry.toMillis() :
        0;
  if (!Number.isFinite(expiryMillis) || expiryMillis <= Date.now()) {
    return false;
  }

  const allowedUids = Array.isArray(data.allowedUids) ?
    data.allowedUids.filter((value): value is string => typeof value === "string") :
    [];
  if (allowedUids.includes(uid)) return true;

  const email =
    typeof token.email === "string" ? token.email.trim().toLowerCase() : "";
  const emailVerified = token.email_verified === true;
  const allowedEmails = Array.isArray(data.allowedEmails) ?
    data.allowedEmails
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().toLowerCase()) :
    [];

  return emailVerified && email.length > 0 && allowedEmails.includes(email);
}

export const verifyAppleSubscription = onCall(
  {
    secrets: [
      appleIapIssuerId,
      appleIapKeyId,
      appleIapPrivateKey,
      appleRootCertificates,
      appleAppAppleIdForVerify,
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
    }

    const input = (request.data ?? {}) as VerifyInput;
    const productId = typeof input.productId === "string" ? input.productId.trim() : "";
    const originalTransactionId = typeof input.originalTransactionId === "string" ? input.originalTransactionId.trim() : "";
    if (!productId) {
      throw new HttpsError("invalid-argument", "Produk tidak sah.");
    }
    if (!/^[0-9]{4,64}$/.test(originalTransactionId)) {
      throw new HttpsError("invalid-argument", "ID transaksi tidak sah.");
    }

    // Gagal-tertutup: tanpa kredensial, TIADA kelayakan diberikan.
    const config = readAppleConfig({
      issuerId: appleIapIssuerId.value(),
      keyId: appleIapKeyId.value(),
      privateKeyPem: appleIapPrivateKey.value(),
      trustedRootsPem: appleRootCertificates.value(),
      appAppleId: appleAppAppleIdForVerify.value(),
      qaAppAppleId: null,
    });

    const allowTestFlightSandbox = await testFlightSandboxAllowed(
      uid,
      request.auth?.token ?? {},
    );

    const result = await processAppleSubscription({
      uid,
      originalTransactionId,
      expectedProductId: productId,
      config,
      source: "verifyAppleSubscription",
      allowTestFlightSandbox,
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
      localCompletionAllowed: true,
    };
  },
);
