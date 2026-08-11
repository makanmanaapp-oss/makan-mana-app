import {createHash} from "crypto";
import {HttpsError} from "firebase-functions/v2/https";
import {GoogleAuth} from "google-auth-library";

import {db, FieldValue} from "../config/firebase";
import {
  entitlementToUserFields,
  isAllowedProduct,
  mapSubscriptionToEntitlement,
  type EntitlementResult,
  type SubscriptionPurchaseV2Like,
} from "../domain/billing/googlePlaySubscription";

export const ANDROID_PACKAGE_NAME =
  process.env.ANDROID_PACKAGE_NAME ?? "com.makanmana.apps";

export interface PlaySubscriptionFetcher {
  (params: {
    packageName: string;
    purchaseToken: string;
    serviceAccountJson: string;
  }): Promise<SubscriptionPurchaseV2Like>;
}

export interface PlaySubscriptionAcknowledger {
  (params: {
    packageName: string;
    productId: string;
    purchaseToken: string;
    serviceAccountJson: string;
  }): Promise<void>;
}

export type AcknowledgementStatus =
  | "acknowledged"
  | "pending_retry"
  | "not_required";

export interface PersistedSubscriptionResult {
  entitlement: EntitlementResult;
  acknowledgementStatus: AcknowledgementStatus;
  /** Safe only once Play has confirmed acknowledgement on the backend. */
  localCompletionAllowed: boolean;
}

export interface ProcessSubscriptionInput {
  uid: string;
  purchaseToken: string;
  serviceAccountJson: string;
  /** Supplied only by the authenticated client; never trusted as plan data. */
  expectedProductId?: string;
  source: "verifyGooglePlaySubscription" | "handleGooglePlayRtdn";
  rtdnMessageIdHash?: string;
  rtdnNotificationType?: number;
}

/** sha256 hex. Purchase tokens are never persisted or logged in clear text. */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** The exact opaque account value passed to Google Play from the Flutter app. */
export function obfuscatedAccountId(uid: string): string {
  return sha256(`mm_obfuscated_account_v1:${uid}`).slice(0, 32);
}

let playFetcher: PlaySubscriptionFetcher = defaultPlayFetcher;
let playAcknowledger: PlaySubscriptionAcknowledger = defaultPlayAcknowledger;

/** Test-only dependency injection; production always uses the Play API. */
export function __setPlaySubscriptionFetcher(f: PlaySubscriptionFetcher): void {
  playFetcher = f;
}

/** Test-only dependency injection; production always uses the Play API. */
export function __setPlaySubscriptionAcknowledger(
  f: PlaySubscriptionAcknowledger,
): void {
  playAcknowledger = f;
}

/** Fetches the authoritative subscriptionsv2 resource without persisting it. */
export async function fetchGooglePlaySubscription(params: {
  purchaseToken: string;
  serviceAccountJson: string;
}): Promise<SubscriptionPurchaseV2Like> {
  try {
    return await playFetcher({
      packageName: ANDROID_PACKAGE_NAME,
      purchaseToken: params.purchaseToken,
      serviceAccountJson: params.serviceAccountJson,
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError("unavailable", "Gagal sahkan dengan Google Play.");
  }
}

async function authorizedFetch(
  serviceAccountJson: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const creds = JSON.parse(serviceAccountJson) as Record<string, unknown>;
  const auth = new GoogleAuth({
    credentials: creds as never,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      "Authorization": `Bearer ${token.token}`,
    },
  });
}

async function defaultPlayFetcher(params: {
  packageName: string;
  purchaseToken: string;
  serviceAccountJson: string;
}): Promise<SubscriptionPurchaseV2Like> {
  const url =
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" +
    `${encodeURIComponent(params.packageName)}/purchases/subscriptionsv2/` +
    `tokens/${encodeURIComponent(params.purchaseToken)}`;
  const res = await authorizedFetch(params.serviceAccountJson, url);
  if (!res.ok) {
    throw new HttpsError("unavailable", `play_api_error:${res.status}`);
  }
  return (await res.json()) as SubscriptionPurchaseV2Like;
}

/**
 * The acknowledgement endpoint remains under purchases.subscriptions even
 * though verification uses the newer subscriptionsv2 resource.
 */
async function defaultPlayAcknowledger(params: {
  packageName: string;
  productId: string;
  purchaseToken: string;
  serviceAccountJson: string;
}): Promise<void> {
  const url =
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" +
    `${encodeURIComponent(params.packageName)}/purchases/subscriptions/` +
    `${encodeURIComponent(params.productId)}/tokens/` +
    `${encodeURIComponent(params.purchaseToken)}:acknowledge`;
  const res = await authorizedFetch(params.serviceAccountJson, url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: "{}",
  });
  if (!res.ok) {
    throw new HttpsError("unavailable", `play_acknowledgement_error:${res.status}`);
  }
}

function matchesGoogleAccount(
  sub: SubscriptionPurchaseV2Like,
  uid: string,
): boolean {
  return sub.externalAccountIdentifiers?.obfuscatedExternalAccountId ===
    obfuscatedAccountId(uid);
}

/** Pending acknowledgements are only safe for a trusted, entitled new token. */
export function requiresServerAcknowledgement(
  sub: SubscriptionPurchaseV2Like,
  entitlement: EntitlementResult,
): boolean {
  return sub.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING" &&
    entitlement.entitled &&
    entitlement.productId !== null;
}

function eventData(params: {
  eventType: string;
  uid: string;
  productId: string | null;
  tokenHash: string;
  entitlement: EntitlementResult;
  acknowledgementStatus: AcknowledgementStatus;
  source: ProcessSubscriptionInput["source"];
  rtdnMessageIdHash?: string;
  rtdnNotificationType?: number;
  previousPlanStatus?: string;
}) {
  const fields = entitlementToUserFields(params.entitlement);
  return {
    uid: params.uid,
    eventType: params.eventType,
    obfuscatedAccountId: obfuscatedAccountId(params.uid),
    productId: params.productId,
    purchaseTokenHash: params.tokenHash,
    entitled: params.entitlement.entitled,
    plan: fields.plan,
    planStatus: params.entitlement.planStatus,
    ...(params.previousPlanStatus
      ? {previousPlanStatus: params.previousPlanStatus}
      : {}),
    reason: params.entitlement.reason,
    acknowledgementStatus: params.acknowledgementStatus,
    source: params.source,
    ...(params.rtdnMessageIdHash
      ? {rtdnMessageIdHash: params.rtdnMessageIdHash}
      : {}),
    ...(params.rtdnNotificationType !== undefined
      ? {rtdnNotificationType: params.rtdnNotificationType}
      : {}),
    createdAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Fetches the source-of-truth Play resource, durably binds the token to one
 * Firebase uid, and grants/revokes entitlement before acknowledgement.
 */
export async function processGooglePlaySubscription(
  input: ProcessSubscriptionInput,
): Promise<PersistedSubscriptionResult> {
  const tokenHash = sha256(input.purchaseToken);
  const verificationRef = db.collection("subscription_verifications").doc(tokenHash);
  const userRef = db.collection("users").doc(input.uid);
  const accountId = obfuscatedAccountId(input.uid);
  const accountLinkRef = db.collection("subscription_account_links").doc(accountId);

  const sub = await fetchGooglePlaySubscription({
    purchaseToken: input.purchaseToken,
    serviceAccountJson: input.serviceAccountJson,
  });

  const entitlement = mapSubscriptionToEntitlement(sub, Date.now());
  if (!entitlement.productId || !isAllowedProduct(entitlement.productId)) {
    throw new HttpsError("permission-denied", "Produk Google Play tidak sah.");
  }
  if (input.expectedProductId && input.expectedProductId !== entitlement.productId) {
    throw new HttpsError("permission-denied", "Produk pembelian tidak sepadan.");
  }
  if (input.source === "verifyGooglePlaySubscription" &&
      !matchesGoogleAccount(sub, input.uid)) {
    throw new HttpsError("permission-denied", "Pembelian tidak sepadan dengan akaun ini.");
  }

  const linkedTokenHash = sub.linkedPurchaseToken
    ? sha256(sub.linkedPurchaseToken)
    : undefined;
  const linkedRef = linkedTokenHash
    ? db.collection("subscription_verifications").doc(linkedTokenHash)
    : undefined;
  const needsAcknowledgement = requiresServerAcknowledgement(sub, entitlement);
  const alreadyAcknowledged =
    sub.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
  const initialAcknowledgementStatus: AcknowledgementStatus =
    needsAcknowledgement ? "pending_retry" :
      alreadyAcknowledged ? "acknowledged" : "not_required";

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(verificationRef);
    const owner = (existing.data()?.uid as string | undefined) ?? "";
    if (owner && owner !== input.uid) {
      throw new HttpsError("permission-denied", "Token pembelian ini milik akaun lain.");
    }

    if (linkedRef) {
      const linked = await tx.get(linkedRef);
      const linkedOwner = (linked.data()?.uid as string | undefined) ?? "";
      if (linkedOwner && linkedOwner !== input.uid) {
        throw new HttpsError("permission-denied", "Token langganan terdahulu milik akaun lain.");
      }
      tx.set(linkedRef, {
        supersededByPurchaseTokenHash: tokenHash,
        supersededAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }

    const accountLink = await tx.get(accountLinkRef);
    const linkedAccountUid = (accountLink.data()?.uid as string | undefined) ?? "";
    if (linkedAccountUid && linkedAccountUid !== input.uid) {
      throw new HttpsError("permission-denied", "Akaun Google Play milik pengguna lain.");
    }

    const userSnap = await tx.get(userRef);
    const userData = userSnap.data() ?? {};
    const currentSource = (userData.planSource as string | undefined) ?? "";
    const previousPlanStatus = (userData.planStatus as string | undefined) ?? "";
    const applyDowngrade =
      entitlement.entitled || currentSource === "google_play" || currentSource === "";
    const fields = entitlementToUserFields(entitlement);

    tx.set(accountLinkRef, {
      uid: input.uid,
      obfuscatedAccountId: accountId,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    tx.set(verificationRef, {
      uid: input.uid,
      obfuscatedAccountId: accountId,
      productId: entitlement.productId,
      purchaseTokenHash: tokenHash,
      ...(linkedTokenHash ? {linkedPurchaseTokenHash: linkedTokenHash} : {}),
      planStatus: entitlement.planStatus,
      entitled: entitlement.entitled,
      expiryMillis: entitlement.expiryMillis,
      autoRenewing: entitlement.autoRenewing,
      acknowledgementStatus: initialAcknowledgementStatus,
      reason: entitlement.reason,
      lastVerifiedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    if (applyDowngrade) {
      tx.set(userRef, {
        plan: fields.plan,
        planStatus: fields.planStatus,
        planSource: fields.planSource,
        subscriptionProductId: fields.subscriptionProductId,
        subscriptionExpiryMillis: fields.subscriptionExpiryMillis,
        subscriptionAutoRenewing: fields.subscriptionAutoRenewing,
        planUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }

    tx.set(db.collection("subscription_events").doc(), eventData({
      eventType: "subscription_verified",
      uid: input.uid,
      productId: entitlement.productId,
      tokenHash,
      entitlement,
      acknowledgementStatus: initialAcknowledgementStatus,
      source: input.source,
      rtdnMessageIdHash: input.rtdnMessageIdHash,
      rtdnNotificationType: input.rtdnNotificationType,
      previousPlanStatus,
    }));
  });

  if (!needsAcknowledgement) {
    return {
      entitlement,
      acknowledgementStatus: alreadyAcknowledged ? "acknowledged" : "not_required",
      localCompletionAllowed: entitlement.entitled && alreadyAcknowledged,
    };
  }

  const acknowledgementAttemptAt = FieldValue.serverTimestamp();
  let acknowledgementSucceeded = false;
  try {
    await playAcknowledger({
      packageName: ANDROID_PACKAGE_NAME,
      productId: entitlement.productId,
      purchaseToken: input.purchaseToken,
      serviceAccountJson: input.serviceAccountJson,
    });
    acknowledgementSucceeded = true;
  } catch {
    // A timeout can mean Play accepted the acknowledgement but its response did
    // not reach us. Re-read before marking it retryable; "already acknowledged"
    // is therefore always a successful idempotent result.
    try {
      const refreshed = await fetchGooglePlaySubscription({
        purchaseToken: input.purchaseToken,
        serviceAccountJson: input.serviceAccountJson,
      });
      acknowledgementSucceeded =
        refreshed.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    } catch {
      acknowledgementSucceeded = false;
    }
  }
  if (acknowledgementSucceeded) {
    await verificationRef.set({
      acknowledgementStatus: "acknowledged",
      acknowledgedAt: FieldValue.serverTimestamp(),
      acknowledgementLastAttemptAt: acknowledgementAttemptAt,
    }, {merge: true});
    await db.collection("subscription_events").add(eventData({
      eventType: "subscription_acknowledged",
      uid: input.uid,
      productId: entitlement.productId,
      tokenHash,
      entitlement,
      acknowledgementStatus: "acknowledged",
      source: input.source,
      rtdnMessageIdHash: input.rtdnMessageIdHash,
      rtdnNotificationType: input.rtdnNotificationType,
    }));
    return {entitlement, acknowledgementStatus: "acknowledged", localCompletionAllowed: true};
  }
  {
    // Entitlement was already committed. Keep the retry signal durable rather
    // than pretending the valid purchase failed.
    await verificationRef.set({
      acknowledgementStatus: "pending_retry",
      acknowledgementLastAttemptAt: acknowledgementAttemptAt,
      acknowledgementLastError: "play_acknowledgement_retry_required",
    }, {merge: true});
    await db.collection("subscription_events").add(eventData({
      eventType: "subscription_acknowledgement_failed",
      uid: input.uid,
      productId: entitlement.productId,
      tokenHash,
      entitlement,
      acknowledgementStatus: "pending_retry",
      source: input.source,
      rtdnMessageIdHash: input.rtdnMessageIdHash,
      rtdnNotificationType: input.rtdnNotificationType,
    }));
    return {entitlement, acknowledgementStatus: "pending_retry", localCompletionAllowed: false};
  }
}

/** Resolve RTDN ownership only from durable server-controlled bindings. */
export async function resolveRtdnUid(
  sub: SubscriptionPurchaseV2Like,
  purchaseToken: string,
): Promise<string | null> {
  const candidates = new Set<string>();
  const accountId = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId ??
    sub.outOfAppPurchaseContext?.expiredExternalAccountIdentifiers
      ?.obfuscatedExternalAccountId;
  if (accountId) {
    const link = await db.collection("subscription_account_links").doc(accountId).get();
    const uid = link.data()?.uid as string | undefined;
    if (uid) candidates.add(uid);
  }
  for (const token of [purchaseToken, sub.linkedPurchaseToken,
    sub.outOfAppPurchaseContext?.expiredPurchaseToken]) {
    if (!token) continue;
    const verification = await db.collection("subscription_verifications")
      .doc(sha256(token)).get();
    const uid = verification.data()?.uid as string | undefined;
    if (uid) candidates.add(uid);
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}
