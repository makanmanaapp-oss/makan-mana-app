// MAKANMANA iOS WAVE 1 — pengesahan langganan App Store (server-authoritative).
//
// Cerminan `googlePlaySubscriptionService.ts`. Klien menghantar
// `originalTransactionId` SAHAJA; pelan, tarikh luput dan status datang dari
// App Store Server API dan tidak pernah dari peranti.
//
// KONFIGURASI IALAH GATE PEMILIK. Tiada kredensial Apple dicipta di sini dan
// tiada nilai lalai dibekalkan — jika mana-mana rahsia tiada, pengesahan
// GAGAL-TERTUTUP dan tiada kelayakan diberikan.

import {createHash, createSign, createPrivateKey} from "node:crypto";
import {HttpsError} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {
  appleEntitlementToUserFields,
} from "../domain/billing/appStoreSubscription";
import {
  APPLE_ENV_SANDBOX,
  buildAppStoreJwtClaims,
} from "../domain/billing/appStoreJws";
import {
  APPLE_SANDBOX_HOST,
  resolveAppleAppIdentity,
  type AppleAppIdentity,
} from "../domain/billing/appleAppIdentity";
import {createAppleSignedDataVerifier, type AppleSignedData} from "../domain/billing/appleSignedData";
import {verifyAppleStatus, type AppleStatusResponse} from "../domain/billing/applePurchaseVerification";
import type {EntitlementResult} from "../domain/billing/googlePlaySubscription";
import {decideEgress} from "../domain/security/egressGuard";

export interface AppleVerificationConfig {
  issuerId: string;
  keyId: string;
  /** Kunci persendirian `.p8` App Store Connect, PEM. */
  privateKeyPem: string;
  /** Apple Root CA G3 (dan mana-mana akar lain), PEM atau DER-base64. */
  trustedRoots: string[];
  /**
   * WAVE 4A — identiti aplikasi yang DIJANGKA, diterbitkan daripada identiti
   * projek backend. TIDAK lagi bundle produksi berkod-keras, dan TIDAK PERNAH
   * dibekalkan oleh klien.
   */
  identity: AppleAppIdentity;
}

/**
 * Baca konfigurasi daripada rahsia, atau lontar `failed-precondition`.
 *
 * Sengaja TIADA nilai lalai. Sistem berbayar yang "berfungsi" tanpa kredensial
 * ialah sistem yang mempercayai klien.
 */
export function readAppleConfig(values: {
  issuerId?: string | null;
  keyId?: string | null;
  privateKeyPem?: string | null;
  trustedRootsPem?: string | null;
  /** appAppleId aplikasi PRODUKSI (rahsia). Wajib dalam produksi. */
  appAppleId?: string | null;
  /** appAppleId aplikasi QA, bila aplikasi ASC QA wujud. */
  qaAppAppleId?: string | null;
  /** Suntikan ujian sahaja. */
  env?: NodeJS.ProcessEnv;
  approvedRealQaProjectId?: string | null;
}): AppleVerificationConfig {
  const issuerId = (values.issuerId ?? "").trim();
  const keyId = (values.keyId ?? "").trim();
  const privateKeyPem = (values.privateKeyPem ?? "").trim();
  const rootsRaw = (values.trustedRootsPem ?? "").trim();
  if (!issuerId || !keyId || !privateKeyPem || !rootsRaw) {
    throw new HttpsError(
      "failed-precondition",
      "apple_verification_not_configured",
    );
  }
  // Beberapa akar boleh dibekalkan, dipisahkan baris kosong berganda.
  const trustedRoots = rootsRaw
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (trustedRoots.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "apple_verification_not_configured",
    );
  }
  // S-1/S-3/S-4 — identiti aplikasi diterbitkan daripada identiti projek,
  // bukan daripada nilai berkod-keras dan bukan daripada klien.
  const decision = resolveAppleAppIdentity({
    env: values.env ?? process.env,
    productionAppAppleId: values.appAppleId ?? null,
    qaAppAppleId: values.qaAppAppleId ?? null,
    approvedRealQaProjectId: values.approvedRealQaProjectId,
  });
  if (!decision.ok) {
    throw new HttpsError("failed-precondition", decision.reason);
  }
  return {
    issuerId,
    keyId,
    privateKeyPem,
    trustedRoots,
    identity: decision.identity,
  };
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Tandatangani token klien App Store Server API (ES256). */
export function signAppStoreJwt(params: {
  config: AppleVerificationConfig;
  nowMillis: number;
}): string {
  const {config} = params;
  const claims = buildAppStoreJwtClaims({
    issuerId: config.issuerId,
    bundleId: config.identity.bundleId,
    nowMillis: params.nowMillis,
  });
  const header = {alg: "ES256", kid: config.keyId, typ: "JWT"};
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(
    JSON.stringify(claims),
  )}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({
    key: createPrivateKey(config.privateKeyPem),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${b64url(signature)}`;
}

/** Bentuk respons `GET /inApps/v1/subscriptions/{id}` yang kita perlukan. */
type StatusResponseLike = AppleStatusResponse;

/** Pengangkutan boleh-suntik supaya ujian tidak pernah menyentuh rangkaian. */
export type AppleStatusFetcher = (params: {
  host: string;
  originalTransactionId: string;
  bearer: string;
}) => Promise<{status: number; body: StatusResponseLike}>;

const defaultFetcher: AppleStatusFetcher = async ({
  host,
  originalTransactionId,
  bearer,
}) => {
  // PAGAR EGRESS — App Store Server API tiada emulator, jadi panggilan dari
  // larian QA akan keluar sebenar dengan kredensial pemilik.
  const egress = decideEgress({kind: "app_store_api"});
  if (!egress.allowed) throw new Error(egress.reason);

  const response = await fetch(
    `${host}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`,
    {headers: {authorization: `Bearer ${bearer}`}, signal: AbortSignal.timeout(15000)},
  );
  const body = response.ok ? ((await response.json()) as StatusResponseLike) : {};
  return {status: response.status, body};
};

let statusFetcher: AppleStatusFetcher = defaultFetcher;

/** Suntikan kebergantungan untuk ujian sahaja. */
export function __setAppleStatusFetcher(f: AppleStatusFetcher): void {
  statusFetcher = f;
}

export interface AppleVerificationResult {
  entitlement: EntitlementResult;
  environment: "Production" | "Sandbox";
  originalTransactionId: string;
}

function hashId(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Sahkan satu langganan dan tulis kelayakan yang terhasil.
 *
 * Setiap semakan di sini ialah gagal-tertutup: produk mesti dalam allowlist,
 * bundle mesti kita, transaksi mesti terikat pada UID ini, dan
 * `originalTransactionId` tidak boleh dituntut oleh akaun lain.
 */
export async function processAppleSubscription(input: {
  uid: string;
  originalTransactionId: string;
  expectedProductId: string;
  config: AppleVerificationConfig;
  nowMillis?: number;
  source: string;
  /**
   * TestFlight uses Apple Sandbox even for the production bundle. This flag is
   * never trusted from the client; the callable derives it from a server-only
   * allowlist with an expiry. Default false keeps production fail-closed.
   */
  allowTestFlightSandbox?: boolean;
  /** Offline test dependencies; never derived from request data. */
  verifier?: AppleSignedData;
}): Promise<AppleVerificationResult> {
  const nowMillis = input.nowMillis ?? Date.now();
  const bearer = signAppStoreJwt({config: input.config, nowMillis});

  // Production App Store remains the first and default authority.
  // TestFlight is the one deliberate exception: Apple serves its IAP
  // transactions from Sandbox even though the binary uses the production
  // bundle id. A server-only, expiring allowlist must opt the tester in before
  // we are allowed to consult Sandbox.
  let identity = input.config.identity;
  let result = await statusFetcher({
    host: identity.host,
    originalTransactionId: input.originalTransactionId,
    bearer,
  });

  if (result.status === 404 &&
      input.allowTestFlightSandbox === true &&
      identity.projectClass === "PRODUCTION") {
    const sandboxIdentity: AppleAppIdentity = {
      bundleId: identity.bundleId,
      environment: APPLE_ENV_SANDBOX,
      // App Store Server Library only requires appAppleId for Production.
      appAppleId: undefined,
      host: APPLE_SANDBOX_HOST,
      projectClass: identity.projectClass,
    };
    const sandboxResult = await statusFetcher({
      host: sandboxIdentity.host,
      originalTransactionId: input.originalTransactionId,
      bearer,
    });
    if (sandboxResult.status === 200) {
      identity = sandboxIdentity;
      result = sandboxResult;
    }
  }

  const environment = identity.environment;
  if (result.status === 404) {
    throw new HttpsError("not-found", "Langganan tidak dijumpai.");
  }
  if (result.status !== 200) {
    throw new HttpsError("unavailable", "Gagal sahkan dengan App Store.");
  }

  let verified: Awaited<ReturnType<typeof verifyAppleStatus>>;
  try {
    verified = await verifyAppleStatus({
      body: result.body,
      verifier: input.verifier ?? createAppleSignedDataVerifier({
        trustedRoots: input.config.trustedRoots,
        bundleId: identity.bundleId,
        environment: identity.environment,
        appAppleId: identity.appAppleId,
      }),
      identity,
      uid: input.uid,
      expectedProductId: input.expectedProductId,
      nowMillis,
    });
  } catch {
    throw new HttpsError("permission-denied", "apple_subscription_verification_failed");
  }
  const {transaction, renewal, entitlement} = verified;
  const originalTransactionId = transaction.originalTransactionId!;
  const idHash = hashId(originalTransactionId);
  const verificationRef = db.collection("subscription_verifications").doc(idHash);
  const userRef = db.collection("users").doc(input.uid);
  const fields = appleEntitlementToUserFields(
    entitlement,
    environment === APPLE_ENV_SANDBOX ? "app_store_testflight" : "app_store",
  );
  const eventHash = hashId(JSON.stringify([
    environment, originalTransactionId, transaction.transactionId,
    transaction.signedDate, entitlement.planStatus, entitlement.expiryMillis,
    renewal?.autoRenewStatus, transaction.revocationDate ?? null,
  ]));
  const eventRef = db.collection("subscription_events").doc(`apple_${eventHash}`);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(verificationRef);
    const owner = existing.exists ? (existing.get("uid") as string | undefined) : undefined;
    if (owner && owner !== input.uid) {
      throw new HttpsError(
        "permission-denied",
        "Transaksi App Store ini milik akaun lain.",
      );
    }
    const event = await tx.get(eventRef);
    const lastSignedDate = existing.exists ? existing.get("lastVerifiedSignedDate") : undefined;
    if (typeof lastSignedDate === "number" && lastSignedDate > transaction.signedDate!) {
      throw new HttpsError("failed-precondition", "apple_subscription_refresh_required");
    }
    // A delayed verify response must never undo a newer refund/notification.
    const notificationDate = existing.exists ? existing.get("lastNotificationSignedDate") : undefined;
    if (existing.get("revoked") === true ||
        (typeof notificationDate === "number" && notificationDate > transaction.signedDate!)) {
      throw new HttpsError("failed-precondition", "apple_subscription_refresh_required");
    }
    if (event.exists) return;
    tx.set(
      verificationRef,
      {
        uid: input.uid,
        platform: "app_store",
        productId: transaction.productId ?? null,
        environment,
        lastVerifiedSignedDate: transaction.signedDate,
        transactionIdHash: hashId(transaction.transactionId!),
        planStatus: entitlement.planStatus,
        entitled: entitlement.entitled,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    tx.set(userRef, {...fields, planUpdatedAt: FieldValue.serverTimestamp()}, {
      merge: true,
    });
    tx.set(eventRef, {
      uid: input.uid,
      platform: "app_store",
      eventType: "verify",
      source: input.source,
      productId: transaction.productId ?? null,
      originalTransactionIdHash: idHash,
      entitled: entitlement.entitled,
      plan: fields.plan,
      planStatus: entitlement.planStatus,
      reason: entitlement.reason,
      environment,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return {entitlement, environment, originalTransactionId};
}
