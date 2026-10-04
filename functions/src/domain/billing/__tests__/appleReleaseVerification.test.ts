import {strict as assert} from "node:assert";
import {test} from "node:test";
import {Environment, SignedDataVerifier, type JWSTransactionDecodedPayload} from "@apple/app-store-server-library";
import {verifyAppleStatus, type AppleStatusResponse} from "../applePurchaseVerification";
import {createAppleSignedDataVerifier, type AppleSignedData} from "../appleSignedData";
import {appleAccountTokenFor} from "../appleAccountToken";
import {mapAppleSubscriptionToEntitlement, isAllowedAppleProduct, planForAppleProduct} from "../appStoreSubscription";
import {APPLE_PRODUCTION_APP_ID, resolveAppleAppIdentity, type AppleAppIdentity} from "../appleAppIdentity";

const NOW = 1_700_000_000_000;
const identity: AppleAppIdentity = {
  bundleId: "com.makanmana.apps", environment: "Production", appAppleId: APPLE_PRODUCTION_APP_ID,
  host: "https://api.storekit.itunes.apple.com", projectClass: "PRODUCTION",
};
const transaction: JWSTransactionDecodedPayload = {
  bundleId: identity.bundleId, environment: Environment.PRODUCTION,
  originalTransactionId: "1000000001", transactionId: "1000000002",
  productId: "makanmana_plus_monthly", type: "Auto-Renewable Subscription",
  appAccountToken: appleAccountTokenFor("owner"), expiresDate: NOW + 10000, signedDate: NOW,
};

/** Only the signature boundary is faked. Real domain decisions run offline. */
function fixture(over: Partial<JWSTransactionDecodedPayload> = {}) {
  const tx = {...transaction, ...over};
  const verifier: AppleSignedData = {
    async verifyAndDecodeTransaction() {return tx;},
    async verifyAndDecodeRenewalInfo() {
      // Real schema intentionally has no bundleId or appAppleId.
      return {environment: Environment.PRODUCTION, originalTransactionId: tx.originalTransactionId,
        productId: tx.productId, autoRenewStatus: 1};
    },
    async verifyAndDecodeNotification() {throw new Error("unused");},
  };
  const body: AppleStatusResponse = {
    bundleId: identity.bundleId, environment: identity.environment, appAppleId: identity.appAppleId,
    data: [{lastTransactions: [{status: 1, originalTransactionId: tx.originalTransactionId,
      signedTransactionInfo: "test-transaction", signedRenewalInfo: "test-renewal"}]}],
  };
  return {body, verifier, identity, uid: "owner", expectedProductId: "makanmana_plus_monthly", nowMillis: NOW};
}

test("Apple's real transaction/renewal schemas grant a verified plus subscription", async () => {
  const result = await verifyAppleStatus(fixture());
  assert.equal(result.entitlement.plan, "plus");
  assert.equal(result.entitlement.entitled, true);
});

test("pro allowlist maps to pro only after server verification", async () => {
  const input = fixture({productId: "makanmana_pro_monthly"});
  input.expectedProductId = "makanmana_pro_monthly";
  assert.equal((await verifyAppleStatus(input)).entitlement.plan, "pro");
});

test("unknown products including Object prototype names fail closed", () => {
  for (const product of ["unlisted", "toString", "constructor", "__proto__"]) {
    assert.equal(isAllowedAppleProduct(product), false);
    assert.equal(planForAppleProduct(product), null);
  }
});

test("wrong/missing account binding rejects purchase and restore", async () => {
  for (const token of [undefined, "", appleAccountTokenFor("other-user")]) {
    await assert.rejects(verifyAppleStatus(fixture({appAccountToken: token})), /owner_mismatch/);
  }
});

test("Sandbox and other bundles cannot grant production entitlement", async () => {
  await assert.rejects(verifyAppleStatus(fixture({environment: Environment.SANDBOX})), /Persekitaran/);
  await assert.rejects(verifyAppleStatus(fixture({bundleId: "com.other.app"})), /bundle_mismatch/);
});

test("authenticated App Store status response must match authoritative app ID", async () => {
  for (const appAppleId of [undefined, 123]) {
    const input = fixture(); input.body.appAppleId = appAppleId;
    await assert.rejects(verifyAppleStatus(input), /identity_mismatch/);
  }
});

test("production config rejects a different App Store app", () => {
  const result = resolveAppleAppIdentity({env: {GCLOUD_PROJECT: "makanmana-c59f3"}, productionAppAppleId: "123"});
  assert.equal(result.ok, false);
});

test("renewal is bound to the same original transaction, product and environment", async () => {
  for (const over of [{originalTransactionId: "other"}, {productId: "other"}, {environment: Environment.SANDBOX}]) {
    const input = fixture();
    input.verifier.verifyAndDecodeRenewalInfo = async () => ({
      environment: Environment.PRODUCTION, originalTransactionId: transaction.originalTransactionId,
      productId: transaction.productId, autoRenewStatus: 1, ...over,
    });
    await assert.rejects(verifyAppleStatus(input), /renewal_mismatch/);
  }
});

test("transaction IDs, signature date and subscription type are mandatory", async () => {
  for (const over of [{originalTransactionId: undefined}, {transactionId: undefined},
    {signedDate: undefined}, {type: "Consumable"}]) {
    await assert.rejects(verifyAppleStatus(fixture(over)), /transaction_invalid/);
  }
});

test("signature failure does not produce an entitlement", async () => {
  const input = fixture();
  input.verifier.verifyAndDecodeTransaction = async () => {throw new Error("invalid signature");};
  await assert.rejects(verifyAppleStatus(input), /invalid signature/);
});

test("missing/nonfinite/expired expiry never grants active entitlement", () => {
  for (const expiresDate of [undefined, null, Number.NaN, NOW, NOW - 1]) {
    assert.equal(mapAppleSubscriptionToEntitlement({status: 1,
      transaction: {...transaction, expiresDate}, renewal: {autoRenewStatus: 1}}, NOW).entitled, false);
  }
});

test("cancellation keeps access until expiry; refund and retry remove access", async () => {
  const input = fixture();
  input.verifier.verifyAndDecodeRenewalInfo = async () => ({
    environment: Environment.PRODUCTION, originalTransactionId: transaction.originalTransactionId,
    productId: transaction.productId, autoRenewStatus: 0,
  });
  assert.equal((await verifyAppleStatus(input)).entitlement.planStatus, "cancelled_but_active");
  assert.equal((await verifyAppleStatus(fixture({revocationDate: NOW}))).entitlement.entitled, false);
  input.body.data![0].lastTransactions![0].status = 3;
  assert.equal((await verifyAppleStatus(input)).entitlement.entitled, false);
});

test("grace requires its own expiry and persists that access deadline", () => {
  assert.equal(mapAppleSubscriptionToEntitlement({status: 4, transaction, renewal: {}}, NOW).entitled, false);
  const result = mapAppleSubscriptionToEntitlement({status: 4, transaction,
    renewal: {gracePeriodExpiresDate: NOW + 20000}}, NOW);
  assert.equal(result.expiryMillis, NOW + 20000);
});

test("Apple library rejects malformed/tampered data without network or credentials", async () => {
  const verifier = new SignedDataVerifier([], true, Environment.PRODUCTION, identity.bundleId, identity.appAppleId);
  for (const jws of ["", "unsigned", "eyJhbGciOiJub25lIn0.eyJwbGFuIjoicHJvIn0."]) {
    await assert.rejects(verifier.verifyAndDecodeTransaction(jws));
    await assert.rejects(verifier.verifyAndDecodeRenewalInfo(jws));
    await assert.rejects(verifier.verifyAndDecodeNotification(jws));
  }
});

test("default verifier cannot perform external OCSP from an emulator", () => {
  const saved = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = "true";
  try {
    assert.throws(() => createAppleSignedDataVerifier({trustedRoots: [],
      bundleId: identity.bundleId, environment: "Production", appAppleId: identity.appAppleId}), /egress_denied/);
  } finally {
    if (saved === undefined) delete process.env.FUNCTIONS_EMULATOR; else process.env.FUNCTIONS_EMULATOR = saved;
  }
});
