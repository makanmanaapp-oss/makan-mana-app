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
  appleAccountMatches,
  appleBundleMatches,
  appleEntitlementToUserFields,
  APPLE_BUNDLE_ID,
  isAllowedAppleProduct,
  mapAppleSubscriptionToEntitlement,
  type AppleRenewalInfoLike,
  type AppleTransactionInfoLike,
} from "../domain/billing/appStoreSubscription";
import {
  AppleJwsError,
  buildAppStoreJwtClaims,
  verifyAppleJws,
} from "../domain/billing/appStoreJws";
import type {EntitlementResult} from "../domain/billing/googlePlaySubscription";
import {decideEgress} from "../domain/security/egressGuard";

const PRODUCTION_HOST = "https://api.storekit.itunes.apple.com";
const SANDBOX_HOST = "https://api.storekit-sandbox.itunes.apple.com";

export interface AppleVerificationConfig {
  issuerId: string;
  keyId: string;
  /** Kunci persendirian `.p8` App Store Connect, PEM. */
  privateKeyPem: string;
  /** Apple Root CA G3 (dan mana-mana akar lain), PEM atau DER-base64. */
  trustedRoots: string[];
  bundleId?: string;
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
  bundleId?: string | null;
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
  return {
    issuerId,
    keyId,
    privateKeyPem,
    trustedRoots,
    bundleId: (values.bundleId ?? "").trim() || APPLE_BUNDLE_ID,
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
    bundleId: config.bundleId ?? APPLE_BUNDLE_ID,
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
interface StatusResponseLike {
  data?: Array<{
    lastTransactions?: Array<{
      status?: number | null;
      originalTransactionId?: string | null;
      signedTransactionInfo?: string | null;
      signedRenewalInfo?: string | null;
    }> | null;
  }> | null;
}

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
    {headers: {authorization: `Bearer ${bearer}`}},
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
}): Promise<AppleVerificationResult> {
  const nowMillis = input.nowMillis ?? Date.now();
  const bearer = signAppStoreJwt({config: input.config, nowMillis});

  // Produksi dahulu; Apple memulangkan 404 untuk transaksi sandbox.
  let environment: "Production" | "Sandbox" = "Production";
  let result = await statusFetcher({
    host: PRODUCTION_HOST,
    originalTransactionId: input.originalTransactionId,
    bearer,
  });
  if (result.status === 404) {
    environment = "Sandbox";
    result = await statusFetcher({
      host: SANDBOX_HOST,
      originalTransactionId: input.originalTransactionId,
      bearer,
    });
  }
  if (result.status !== 200) {
    throw new HttpsError("unavailable", "Gagal sahkan dengan App Store.");
  }

  const last = result.body.data?.[0]?.lastTransactions?.[0];
  if (!last) {
    throw new HttpsError("not-found", "Langganan tidak dijumpai.");
  }

  let transaction: AppleTransactionInfoLike | null = null;
  let renewal: AppleRenewalInfoLike | null = null;
  try {
    transaction = verifyAppleJws({
      jws: last.signedTransactionInfo ?? "",
      trustedRoots: input.config.trustedRoots,
      nowMillis,
    }) as AppleTransactionInfoLike;
    if (last.signedRenewalInfo) {
      renewal = verifyAppleJws({
        jws: last.signedRenewalInfo,
        trustedRoots: input.config.trustedRoots,
        nowMillis,
      }) as AppleRenewalInfoLike;
    }
  } catch (e) {
    // Tandatangan tidak sah bermakna muatan itu tidak boleh dipercayai
    // LANGSUNG. Tiada laluan degradasi.
    const detail = e instanceof AppleJwsError ? e.message : "tidak sah";
    throw new HttpsError("permission-denied", `Resit App Store ${detail}.`);
  }

  if (!appleBundleMatches(transaction, input.config.bundleId ?? APPLE_BUNDLE_ID)) {
    throw new HttpsError("permission-denied", "Resit bukan untuk aplikasi ini.");
  }
  if (!isAllowedAppleProduct(transaction.productId)) {
    throw new HttpsError("permission-denied", "Produk App Store tidak sah.");
  }
  if (transaction.productId !== input.expectedProductId) {
    throw new HttpsError("permission-denied", "Produk pembelian tidak sepadan.");
  }
  if (!appleAccountMatches(transaction, input.uid)) {
    throw new HttpsError(
      "permission-denied",
      "Pembelian tidak sepadan dengan akaun ini.",
    );
  }

  const entitlement = mapAppleSubscriptionToEntitlement(
    {status: last.status ?? null, transaction, renewal},
    nowMillis,
  );

  const originalTransactionId =
    transaction.originalTransactionId ?? input.originalTransactionId;
  const idHash = hashId(originalTransactionId);
  const verificationRef = db.collection("subscription_verifications").doc(idHash);
  const userRef = db.collection("users").doc(input.uid);
  const fields = appleEntitlementToUserFields(entitlement);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(verificationRef);
    const owner = existing.exists ? (existing.get("uid") as string | undefined) : undefined;
    if (owner && owner !== input.uid) {
      throw new HttpsError(
        "permission-denied",
        "Transaksi App Store ini milik akaun lain.",
      );
    }
    tx.set(
      verificationRef,
      {
        uid: input.uid,
        platform: "app_store",
        productId: transaction.productId ?? null,
        environment,
        planStatus: entitlement.planStatus,
        entitled: entitlement.entitled,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    tx.set(userRef, {...fields, planUpdatedAt: FieldValue.serverTimestamp()}, {
      merge: true,
    });
    tx.set(db.collection("subscription_events").doc(), {
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
