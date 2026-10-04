/** Database integration against a local emulator only. Apple signatures/API are
 * injected fixtures; this does not claim live Apple certificate validation. */
import {strict as assert} from "node:assert";
import {createHash, generateKeyPairSync} from "node:crypto";
import {before, test} from "node:test";
import {Environment, type JWSTransactionDecodedPayload} from "@apple/app-store-server-library";
import type {AppleSignedData} from "../../appleSignedData";
import type {AppleVerificationConfig} from "../../../../services/appleSubscriptionService";
import {appleAccountTokenFor} from "../../appleAccountToken";

const project = "demo-makanmana-qa";
const host = process.env.FIRESTORE_EMULATOR_HOST ?? "";
if (!/^(127\.0\.0\.1|localhost):[0-9]+$/.test(host)) {
  throw new Error("Local Firestore emulator required; refusing every real backend.");
}
process.env.GCLOUD_PROJECT = project;
process.env.GOOGLE_CLOUD_PROJECT = project;
process.env.FIREBASE_CONFIG = JSON.stringify({projectId: project});
process.env.FUNCTIONS_EMULATOR = "true";

let service: typeof import("../../../../services/appleSubscriptionService");
let notifications: typeof import("../../../../services/appleNotificationService");
let firebase: typeof import("../../../../config/firebase");
before(async () => {
  [service, notifications, firebase] = await Promise.all([
    import("../../../../services/appleSubscriptionService"),
    import("../../../../services/appleNotificationService"),
    import("../../../../config/firebase"),
  ]);
});

const NOW = Date.now();
const {privateKey} = generateKeyPairSync("ec", {namedCurve: "prime256v1"});
const config: AppleVerificationConfig = {
  issuerId: "offline-test-issuer", keyId: "offline-test-key",
  privateKeyPem: privateKey.export({type: "pkcs8", format: "pem"}).toString(),
  trustedRoots: [], // Not used: the signature boundary is injected explicitly.
  identity: {bundleId: "com.makanmana.apps.qa", environment: "Sandbox",
    host: "https://api.storekit-sandbox.itunes.apple.com", projectClass: "LOCAL_EMULATOR_QA"},
};
let sequence = 0;
function fixture() {
  sequence++;
  const uid = `apple-offline-owner-${NOW}-${sequence}`;
  const id = `${NOW}${sequence}`;
  const transaction: JWSTransactionDecodedPayload = {
    bundleId: config.identity.bundleId, environment: Environment.SANDBOX,
    originalTransactionId: id, transactionId: `${id}1`,
    productId: "makanmana_plus_monthly", type: "Auto-Renewable Subscription",
    signedDate: NOW, expiresDate: NOW + 60000, appAccountToken: appleAccountTokenFor(uid),
  };
  const renewal = {environment: Environment.SANDBOX, originalTransactionId: id,
    productId: transaction.productId, autoRenewStatus: 1};
  const verifier: AppleSignedData = {
    async verifyAndDecodeTransaction() {return transaction;},
    async verifyAndDecodeRenewalInfo() {return renewal;},
    async verifyAndDecodeNotification() {throw new Error("unused");},
  };
  service.__setAppleStatusFetcher(async () => ({status: 200, body: {
    bundleId: transaction.bundleId, environment: transaction.environment,
    data: [{lastTransactions: [{status: 1, originalTransactionId: id,
      signedTransactionInfo: "offline", signedRenewalInfo: "offline"}]}],
  }}));
  const verify = () => service.processAppleSubscription({uid, originalTransactionId: id,
    expectedProductId: transaction.productId!, config, verifier, nowMillis: NOW,
    source: "offline_apple_integration"});
  const hash = createHash("sha256").update(id).digest("hex");
  return {uid, id, hash, transaction, renewal, verifier, verify};
}

test("purchase/restore replay and concurrent verification persist one event", async () => {
  const f = fixture();
  await Promise.all([f.verify(), f.verify(), f.verify()]);
  const user = await firebase.db.collection("users").doc(f.uid).get();
  assert.equal(user.get("plan"), "plus");
  const events = await firebase.db.collection("subscription_events")
    .where("uid", "==", f.uid).get();
  assert.equal(events.size, 1);
  const binding = await firebase.db.collection("subscription_verifications").doc(f.hash).get();
  assert.equal(binding.get("uid"), f.uid);
});

test("another authenticated user cannot claim an already bound transaction", async () => {
  const f = fixture(); await f.verify();
  f.transaction.appAccountToken = appleAccountTokenFor("other-owner");
  await assert.rejects(service.processAppleSubscription({uid: "other-owner",
    originalTransactionId: f.id, expectedProductId: "makanmana_plus_monthly",
    config, verifier: f.verifier, nowMillis: NOW, source: "offline_apple_integration"}));
  assert.equal((await firebase.db.collection("users").doc(f.uid).get()).get("plan"), "plus");
});

test("expiry revalidation removes access even when the signed transaction is unchanged", async () => {
  const f = fixture(); await f.verify();
  await service.processAppleSubscription({uid: f.uid, originalTransactionId: f.id,
    expectedProductId: "makanmana_plus_monthly", config, verifier: f.verifier,
    nowMillis: NOW + 60001, source: "offline_apple_integration"});
  assert.equal((await firebase.db.collection("users").doc(f.uid).get()).get("plan"), "free");
});

test("invalid signature or environment produces no user or billing record", async () => {
  for (const mode of ["signature", "environment"]) {
    const f = fixture();
    if (mode === "signature") {
      f.verifier.verifyAndDecodeTransaction = async () => {throw new Error("invalid signature");};
    } else f.transaction.environment = Environment.PRODUCTION;
    await assert.rejects(f.verify());
    assert.equal((await firebase.db.collection("users").doc(f.uid).get()).exists, false);
    assert.equal((await firebase.db.collection("subscription_verifications").doc(f.hash).get()).exists, false);
  }
});

test("concurrent duplicate refund notifications are atomic and cannot be undone by restore", async () => {
  const f = fixture(); await f.verify();
  const notificationDate = NOW + 1000;
  f.transaction.revocationDate = notificationDate;
  f.verifier.verifyAndDecodeNotification = async () => ({
    notificationUUID: `offline-refund-${f.id}`, notificationType: "REFUND",
    signedDate: notificationDate, data: {bundleId: config.identity.bundleId,
      environment: Environment.SANDBOX, status: 5,
      signedTransactionInfo: "offline", signedRenewalInfo: "offline"},
  });
  const notify = () => notifications.processAppleNotification({signedPayload: "offline",
    config: {trustedRoots: [], bundleId: config.identity.bundleId, expectedEnvironment: "Sandbox"},
    verifier: f.verifier, nowMillis: notificationDate});
  const outcomes = await Promise.all([notify(), notify()]);
  assert.ok(outcomes.every((value) => value.ok && value.durable));
  assert.equal((await firebase.db.collection("users").doc(f.uid).get()).get("plan"), "free");
  const receipts = await firebase.db.collection("apple_notification_receipts")
    .where("subscriptionKey", "==", f.hash).get();
  assert.equal(receipts.size, 1);
  delete f.transaction.revocationDate;
  await assert.rejects(f.verify());
  assert.equal((await firebase.db.collection("users").doc(f.uid).get()).get("plan"), "free");
});
