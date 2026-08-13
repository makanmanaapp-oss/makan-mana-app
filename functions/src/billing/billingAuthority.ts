import {createHash} from "crypto";

import {db, FieldValue} from "../config/firebase";
import {
  ALLOWED_SUBSCRIPTION_PRODUCTS,
  MakanManaPlan,
  NormalizedSubscription,
  PlaySubscriptionPurchaseV2,
  hashPurchaseToken,
  normalizeSubscriptionPurchase,
  obfuscatedAccountIdForUid,
  selectCurrentSubscriptionProduct,
} from "./googlePlayDomain";
import {
  acknowledgeGooglePlaySubscription,
  getGooglePlaySubscription,
} from "./googlePlayApi";
import {
  EffectiveSubscriptionMirror,
  mirrorSubscriptionToControlCenter,
} from "./controlCenterBillingMirror";

export class BillingAuthorityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BillingAuthorityError";
  }
}

type TokenRecord = {
  uid?: string;
  purchaseToken?: string;
  tokenHash?: string;
  productId?: string;
  plan?: MakanManaPlan;
  status?: string;
  entitled?: boolean;
  expiryTime?: string | null;
  expiryMillis?: number | null;
  autoRenew?: boolean | null;
  acknowledgementState?: string | null;
  linkedTokenHash?: string | null;
  supersededByTokenHash?: string | null;
};

function safeEventId(prefix: string, value: string): string {
  return `${prefix}:${createHash("sha256").update(value).digest("hex")}`;
}

function expiryMillis(value: string | null): number | null {
  if (!value) return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

function planRank(plan: MakanManaPlan): number {
  return plan === "pro" ? 2 : plan === "plus" ? 1 : 0;
}

export async function prepareBillingAccount(uid: string): Promise<string> {
  if (!uid) throw new BillingAuthorityError("unauthenticated", "Missing user");
  const opaqueId = obfuscatedAccountIdForUid(uid);
  const ref = db.collection("billing_account_links").doc(opaqueId);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists && existing.data()?.uid !== uid) {
      throw new BillingAuthorityError("account-mismatch", "Opaque billing account is already owned");
    }
    tx.set(ref, {
      uid,
      opaqueId,
      ...(existing.exists ? {} : {createdAt: FieldValue.serverTimestamp()}),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
  return opaqueId;
}

async function uidForOpaqueId(opaqueId: string | undefined): Promise<string | undefined> {
  if (!opaqueId) return undefined;
  const link = await db.collection("billing_account_links").doc(opaqueId).get();
  return link.exists ? link.data()?.uid as string | undefined : undefined;
}

async function uidForRawToken(rawToken: string | undefined): Promise<string | undefined> {
  if (!rawToken) return undefined;
  const token = await db.collection("billing_purchase_tokens")
    .doc(hashPurchaseToken(rawToken)).get();
  return token.exists ? token.data()?.uid as string | undefined : undefined;
}

async function resolveUid(
  tokenHash: string,
  purchase: PlaySubscriptionPurchaseV2,
  requestedUid?: string,
): Promise<string> {
  const current = await db.collection("billing_purchase_tokens").doc(tokenHash).get();
  const currentUid = current.exists ? current.data()?.uid as string | undefined : undefined;

  const opaque = purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId;
  const opaqueUid = await uidForOpaqueId(opaque);
  const linkedUid = await uidForRawToken(purchase.linkedPurchaseToken);

  const expiredOpaque = purchase.outOfAppPurchaseContext
    ?.expiredExternalAccountIdentifiers?.obfuscatedExternalAccountId;
  const expiredOpaqueUid = await uidForOpaqueId(expiredOpaque);
  const expiredTokenUid = await uidForRawToken(
    purchase.outOfAppPurchaseContext?.expiredPurchaseToken,
  );

  const resolved = currentUid ?? opaqueUid ?? linkedUid ?? expiredOpaqueUid ??
    expiredTokenUid ?? requestedUid;
  if (!resolved) {
    throw new BillingAuthorityError(
      "account-unresolved",
      "Unable to resolve purchase owner",
    );
  }

  for (const candidate of [
    currentUid,
    opaqueUid,
    linkedUid,
    expiredOpaqueUid,
    expiredTokenUid,
    requestedUid,
  ]) {
    if (candidate && candidate !== resolved) {
      throw new BillingAuthorityError(
        "account-mismatch",
        "Purchase ownership signals do not match",
      );
    }
  }

  if (requestedUid) {
    const expectedOpaque = obfuscatedAccountIdForUid(requestedUid);
    const expectedLink = await db.collection("billing_account_links").doc(expectedOpaque).get();
    if (!expectedLink.exists || expectedLink.data()?.uid !== requestedUid) {
      throw new BillingAuthorityError(
        "account-not-prepared",
        "Billing account was not prepared by the backend",
      );
    }

    const hasServerKnownOwner = Boolean(
      currentUid || linkedUid || expiredOpaqueUid || expiredTokenUid,
    );
    if (!hasServerKnownOwner && opaque !== expectedOpaque) {
      throw new BillingAuthorityError(
        "account-binding-missing",
        "Google Play purchase is not bound to this app account",
      );
    }
  }

  return resolved;
}

async function persistTokenState(
  uid: string,
  purchaseToken: string,
  normalized: NormalizedSubscription,
  purchase: PlaySubscriptionPurchaseV2,
  source: "client_verify" | "rtdn",
  sourceEventId: string,
): Promise<string> {
  const tokenHash = hashPurchaseToken(purchaseToken);
  const linkedTokenHash = purchase.linkedPurchaseToken ?
    hashPurchaseToken(purchase.linkedPurchaseToken) : null;
  const tokenRef = db.collection("billing_purchase_tokens").doc(tokenHash);
  const eventRef = db.collection("billing_events").doc(sourceEventId);

  await db.runTransaction(async (tx) => {
    // Firestore requires transaction reads before transaction writes.
    const existing = await tx.get(tokenRef);
    const linkedRef = linkedTokenHash && linkedTokenHash !== tokenHash ?
      db.collection("billing_purchase_tokens").doc(linkedTokenHash) : null;
    const linked = linkedRef ? await tx.get(linkedRef) : null;

    if (existing.exists && existing.data()?.uid !== uid) {
      throw new BillingAuthorityError(
        "token-already-owned",
        "Purchase token is already associated with another account",
      );
    }

    tx.set(tokenRef, {
      uid,
      // Raw tokens stay server-only. They are never logged or mirrored.
      purchaseToken,
      tokenHash,
      productId: normalized.productId,
      plan: normalized.plan,
      status: normalized.status,
      entitled: normalized.entitled,
      startTime: normalized.startTime,
      expiryTime: normalized.expiryTime,
      expiryMillis: expiryMillis(normalized.expiryTime),
      autoRenew: normalized.autoRenew,
      acknowledgementState: normalized.acknowledgementState,
      linkedTokenHash,
      regionCode: normalized.regionCode,
      isTestPurchase: normalized.isTestPurchase,
      source,
      lastSourceEventId: sourceEventId,
      ...(existing.exists ? {} : {createdAt: FieldValue.serverTimestamp()}),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    if (linkedRef && linked?.exists && linked.data()?.uid === uid) {
      tx.set(linkedRef, {
        supersededByTokenHash: tokenHash,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }

    tx.set(eventRef, {
      eventId: sourceEventId,
      source,
      uid,
      tokenHash,
      productId: normalized.productId,
      plan: normalized.plan,
      status: normalized.status,
      entitled: normalized.entitled,
      expiryTime: normalized.expiryTime,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : {createdAt: FieldValue.serverTimestamp()}),
    }, {merge: true});
  });

  return tokenHash;
}

async function recomputeEffectiveEntitlement(
  uid: string,
  nowMillis: number,
): Promise<EffectiveSubscriptionMirror> {
  const snapshot = await db.collection("billing_purchase_tokens")
    .where("uid", "==", uid)
    .limit(50)
    .get();

  const eligible = snapshot.docs
    .map((doc) => doc.data() as TokenRecord)
    .filter((record) => {
      if (!record.entitled || record.supersededByTokenHash) return false;
      const expiry = typeof record.expiryMillis === "number" ? record.expiryMillis : null;
      return expiry === null || expiry > nowMillis;
    })
    .sort((a, b) => {
      const planDiff = planRank((b.plan ?? "free")) - planRank((a.plan ?? "free"));
      if (planDiff !== 0) return planDiff;
      return (b.expiryMillis ?? Number.MAX_SAFE_INTEGER) -
        (a.expiryMillis ?? Number.MAX_SAFE_INTEGER);
    });

  const selected = eligible[0];
  const entitlementRef = db.collection("billing_entitlements").doc(uid);
  const userRef = db.collection("users").doc(uid);

  if (selected?.plan && selected.plan !== "free") {
    const effective: EffectiveSubscriptionMirror = {
      productId: selected.productId ?? null,
      plan: selected.plan,
      status: selected.status ?? "active",
      expiryTime: selected.expiryTime ?? null,
      autoRenew: typeof selected.autoRenew === "boolean" ? selected.autoRenew : null,
    };
    await db.runTransaction(async (tx) => {
      tx.set(entitlementRef, {
        uid,
        provider: "google_play",
        ...effective,
        activeTokenHash: selected.tokenHash ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tx.set(userRef, {
        plan: effective.plan,
        planStatus: effective.status,
        planSource: "google_play_backend",
        planPeriodEnd: effective.expiryTime,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    });
    return effective;
  }

  const effective: EffectiveSubscriptionMirror = {
    productId: null,
    plan: "free",
    status: "inactive",
    expiryTime: null,
    autoRenew: null,
  };
  const user = await userRef.get();
  const currentSource = user.data()?.planSource as string | undefined;
  const backendOwnedSources = new Set([
    "google_play",
    "google_play_backend",
    "mock",
  ]);

  await db.runTransaction(async (tx) => {
    tx.set(entitlementRef, {
      uid,
      provider: "google_play",
      ...effective,
      activeTokenHash: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    // Never revoke another authoritative entitlement source (coupon/trial/etc.).
    if (!currentSource || backendOwnedSources.has(currentSource)) {
      tx.set(userRef, {
        plan: "free",
        planStatus: "inactive",
        planSource: "google_play_backend",
        planPeriodEnd: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
  });
  return effective;
}

export interface ProcessGooglePlaySubscriptionInput {
  purchaseToken: string;
  productId?: string;
  requestedUid?: string;
  source: "client_verify" | "rtdn";
  sourceEventId?: string;
  nowMillis?: number;
  preloadedPurchase?: PlaySubscriptionPurchaseV2;
}

export interface ProcessGooglePlaySubscriptionResult {
  uid: string;
  tokenHash: string;
  normalized: NormalizedSubscription;
  effective: EffectiveSubscriptionMirror;
  acknowledged: boolean;
}

export async function processGooglePlaySubscription(
  input: ProcessGooglePlaySubscriptionInput,
): Promise<ProcessGooglePlaySubscriptionResult> {
  if (input.productId && !ALLOWED_SUBSCRIPTION_PRODUCTS.has(input.productId)) {
    throw new BillingAuthorityError("unsupported-product", "Unsupported subscription product");
  }
  if (!input.purchaseToken || input.purchaseToken.length > 4096) {
    throw new BillingAuthorityError("invalid-token", "Invalid purchase token");
  }

  let purchase: PlaySubscriptionPurchaseV2;
  try {
    purchase = input.preloadedPurchase ??
      await getGooglePlaySubscription(input.purchaseToken);
  } catch {
    // Never propagate an HTTP error that could contain the raw purchase-token URL.
    throw new BillingAuthorityError("play-verification-failed", "Google Play verification failed");
  }

  const nowMillis = input.nowMillis ?? Date.now();
  let normalized: NormalizedSubscription;
  let resolvedProductId: string;
  try {
    resolvedProductId = input.productId ??
      selectCurrentSubscriptionProduct(purchase, nowMillis);
    normalized = normalizeSubscriptionPurchase(
      resolvedProductId,
      purchase,
      nowMillis,
    );
  } catch {
    throw new BillingAuthorityError(
      "invalid-play-response",
      "Google Play response is not valid for a supported product",
    );
  }

  const tokenHash = hashPurchaseToken(input.purchaseToken);
  const uid = await resolveUid(tokenHash, purchase, input.requestedUid);
  const sourceEventId = input.sourceEventId ?? safeEventId(
    `billing:${input.source}`,
    `${tokenHash}:${normalized.status}:${normalized.expiryTime ?? "none"}`,
  );

  await persistTokenState(
    uid,
    input.purchaseToken,
    normalized,
    purchase,
    input.source,
    sourceEventId,
  );

  const effective = await recomputeEffectiveEntitlement(uid, nowMillis);

  let acknowledged = normalized.acknowledgementState ===
    "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
  if (
    normalized.entitled &&
    normalized.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING"
  ) {
    try {
      await acknowledgeGooglePlaySubscription(
        resolvedProductId,
        input.purchaseToken,
      );
      acknowledged = true;
      await db.collection("billing_purchase_tokens").doc(tokenHash).set({
        acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
        acknowledgedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    } catch {
      throw new BillingAuthorityError(
        "play-acknowledgement-failed",
        "Google Play acknowledgement failed",
      );
    }
  }

  // Control Center is a secondary mirror. Never roll back authoritative
  // entitlement if dashboard synchronization is temporarily unavailable.
  try {
    await mirrorSubscriptionToControlCenter({
      uid,
      subscription: effective,
      eventId: safeEventId(
        "google-play-entitlement",
        `${uid}:${effective.productId ?? "free"}:${effective.status}:${effective.expiryTime ?? "none"}`,
      ),
    });
    await db.collection("billing_events").doc(sourceEventId).set({
      controlCenterMirrorStatus: "succeeded",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  } catch {
    await db.collection("billing_events").doc(sourceEventId).set({
      controlCenterMirrorStatus: "failed",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  }

  return {uid, tokenHash, normalized, effective, acknowledged};
}
