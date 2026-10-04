import type {AppleSignedData} from "./appleSignedData";
import type {AppleAppIdentity} from "./appleAppIdentity";
import {assertAppleEntitlementEnvironment} from "./appleAppIdentity";
import {
  appleAccountMatches, isAllowedAppleProduct, mapAppleSubscriptionToEntitlement,
  type AppleTransactionInfoLike, type AppleRenewalInfoLike,
} from "./appStoreSubscription";

export interface AppleStatusResponse {
  environment?: string;
  bundleId?: string;
  appAppleId?: number;
  data?: Array<{lastTransactions?: Array<{
    status?: number | null;
    originalTransactionId?: string | null;
    signedTransactionInfo?: string | null;
    signedRenewalInfo?: string | null;
  }> | null}> | null;
}

/** No client plan, status, expiry, ownership or environment is accepted. */
export async function verifyAppleStatus(input: {
  body: AppleStatusResponse;
  verifier: AppleSignedData;
  identity: AppleAppIdentity;
  uid: string;
  expectedProductId: string;
  nowMillis: number;
}) {
  const {body, verifier, identity} = input;
  if (body.bundleId !== identity.bundleId || body.environment !== identity.environment ||
      (identity.environment === "Production" && body.appAppleId !== identity.appAppleId)) {
    throw new Error("apple_status_identity_mismatch");
  }
  if (!isAllowedAppleProduct(input.expectedProductId)) throw new Error("apple_product_not_allowed");
  const entries = body.data?.flatMap((group) => group.lastTransactions ?? []) ?? [];
  const verified = [];
  for (const entry of entries) {
    if (!entry.signedTransactionInfo) throw new Error("apple_transaction_missing");
    const transaction = await verifier.verifyAndDecodeTransaction(entry.signedTransactionInfo);
    assertAppleEntitlementEnvironment({expected: identity, payloadEnvironment: transaction.environment});
    if (transaction.bundleId !== identity.bundleId) throw new Error("apple_bundle_mismatch");
    if (!transaction.originalTransactionId || !transaction.transactionId ||
        transaction.originalTransactionId !== entry.originalTransactionId ||
        transaction.type !== "Auto-Renewable Subscription" ||
        !Number.isFinite(transaction.signedDate)) throw new Error("apple_transaction_invalid");
    if (!appleAccountMatches(transaction as AppleTransactionInfoLike, input.uid)) {
      throw new Error("apple_owner_mismatch");
    }
    const renewal = entry.signedRenewalInfo ?
      await verifier.verifyAndDecodeRenewalInfo(entry.signedRenewalInfo) : null;
    if (renewal && (renewal.environment !== identity.environment ||
        renewal.originalTransactionId !== transaction.originalTransactionId ||
        renewal.productId !== transaction.productId)) throw new Error("apple_renewal_mismatch");
    verified.push({entry, transaction, renewal});
  }
  // Apple may return multiple subscription groups. Never depend on array order.
  verified.sort((a, b) => (b.transaction.signedDate ?? 0) - (a.transaction.signedDate ?? 0));
  const latest = verified[0];
  if (!latest) throw new Error("apple_subscription_missing");
  if (!isAllowedAppleProduct(latest.transaction.productId) ||
      latest.transaction.productId !== input.expectedProductId) throw new Error("apple_product_mismatch");
  return {
    transaction: latest.transaction,
    renewal: latest.renewal,
    entitlement: mapAppleSubscriptionToEntitlement({
      status: latest.entry.status,
      transaction: latest.transaction as AppleTransactionInfoLike,
      renewal: latest.renewal as AppleRenewalInfoLike | null,
    }, input.nowMillis),
  };
}
