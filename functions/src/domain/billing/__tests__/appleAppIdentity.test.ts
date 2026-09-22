import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";

import {
  APPLE_PRODUCTION_BUNDLE_ID,
  APPLE_PRODUCTION_HOST,
  APPLE_QA_BUNDLE_ID,
  APPLE_SANDBOX_HOST,
  assertAppleEntitlementEnvironment,
  resolveAppleAppIdentity,
  type AppleAppIdentity,
} from "../appleAppIdentity";
import {APPLE_ENV_PRODUCTION, APPLE_ENV_SANDBOX, assertAppleClaims} from "../appStoreJws";
import {PRODUCTION_PROJECT_ID, APPROVED_QA_PROJECT_ID} from "../../security/egressGuard";

/**
 * WAVE 4A — S-1..S-4 (reka bentuk Sandbox diluluskan pemilik).
 *
 *  S-1 persekitaran diterbitkan daripada identiti projek, bukan daripada hos
 *      mana yang menjawab
 *  S-2 muatan Sandbox tidak pernah memberikan kelayakan produksi
 *  S-3 appAppleId disemak; hilang dalam produksi = gagal-tertutup
 *  S-4 bundle terikat projek — QA tidak pernah diterima sebagai produksi
 *
 * Tiada rangkaian. Tiada kredensial. Tiada Apple dihubungi.
 */

const REAL_QA = "makanmana-qa-sebenar";
const PROD_APP_ID = "6478000000";
const QA_APP_ID = "6479000000";

const PROD_ENV = {
  GCLOUD_PROJECT: PRODUCTION_PROJECT_ID,
  FIREBASE_CONFIG: JSON.stringify({projectId: PRODUCTION_PROJECT_ID}),
};
const REAL_QA_ENV = {
  GCLOUD_PROJECT: REAL_QA,
  FIREBASE_CONFIG: JSON.stringify({projectId: REAL_QA}),
};
const EMULATOR_QA_ENV = {
  FUNCTIONS_EMULATOR: "true",
  GCLOUD_PROJECT: APPROVED_QA_PROJECT_ID,
  FIREBASE_CONFIG: JSON.stringify({projectId: APPROVED_QA_PROJECT_ID}),
};

function resolveWith(env: NodeJS.ProcessEnv, extra: {
  productionAppAppleId?: string | null;
  qaAppAppleId?: string | null;
  approvedRealQaProjectId?: string | null;
} = {}) {
  // `null` bermakna "tidak dikonfigurasikan" dan MESTI dihormati; hanya
  // ketiadaan kunci menggunakan lalai ujian.
  return resolveAppleAppIdentity({
    env,
    productionAppAppleId:
      "productionAppAppleId" in extra ? extra.productionAppAppleId : PROD_APP_ID,
    qaAppAppleId: "qaAppAppleId" in extra ? extra.qaAppAppleId : QA_APP_ID,
    approvedRealQaProjectId:
      "approvedRealQaProjectId" in extra ? extra.approvedRealQaProjectId : REAL_QA,
  });
}

function identityOf(env: NodeJS.ProcessEnv): AppleAppIdentity {
  const d = resolveWith(env);
  assert.equal(d.ok, true, d.ok ? "" : d.reason);
  return (d as {ok: true; identity: AppleAppIdentity}).identity;
}

// ---------------------------------------------------------------------------
// S-1 / S-4 — identiti terbitan
// ---------------------------------------------------------------------------

test("PRODUKSI -> bundle produksi, Production, hos produksi sahaja", () => {
  const id = identityOf(PROD_ENV);
  assert.equal(id.bundleId, APPLE_PRODUCTION_BUNDLE_ID);
  assert.equal(id.environment, APPLE_ENV_PRODUCTION);
  assert.equal(id.host, APPLE_PRODUCTION_HOST);
  assert.equal(id.appAppleId, Number(PROD_APP_ID));
  assert.equal(id.projectClass, "PRODUCTION");
});

test("REAL_QA -> bundle QA, Sandbox, hos sandbox sahaja", () => {
  const id = identityOf(REAL_QA_ENV);
  assert.equal(id.bundleId, APPLE_QA_BUNDLE_ID);
  assert.equal(id.environment, APPLE_ENV_SANDBOX);
  assert.equal(id.host, APPLE_SANDBOX_HOST);
  assert.equal(id.projectClass, "REAL_QA");
});

test("emulator tempatan -> identiti QA (pengangkutan palsu sahaja)", () => {
  const id = identityOf(EMULATOR_QA_ENV);
  assert.equal(id.bundleId, APPLE_QA_BUNDLE_ID);
  assert.equal(id.environment, APPLE_ENV_SANDBOX);
  assert.equal(id.projectClass, "LOCAL_EMULATOR_QA");
});

test("bundle QA tidak pernah diterima sebagai produksi, dan sebaliknya", () => {
  assert.notEqual(APPLE_QA_BUNDLE_ID, APPLE_PRODUCTION_BUNDLE_ID);
  const prod = identityOf(PROD_ENV);
  const qa = identityOf(REAL_QA_ENV);
  // Muatan QA terhadap jangkaan produksi.
  assert.throws(() => assertAppleClaims(
    {bundleId: APPLE_QA_BUNDLE_ID, environment: APPLE_ENV_SANDBOX, appAppleId: Number(QA_APP_ID)},
    {bundleId: prod.bundleId, environment: prod.environment, appAppleId: prod.appAppleId},
  ), /bundleId tidak sepadan/);
  // Muatan produksi terhadap jangkaan QA.
  assert.throws(() => assertAppleClaims(
    {bundleId: APPLE_PRODUCTION_BUNDLE_ID, environment: APPLE_ENV_PRODUCTION},
    {bundleId: qa.bundleId, environment: qa.environment},
  ), /bundleId tidak sepadan/);
});

// ---------------------------------------------------------------------------
// S-2 — pengasingan kelayakan
// ---------------------------------------------------------------------------

test("muatan Sandbox DITOLAK dalam produksi", () => {
  const prod = identityOf(PROD_ENV);
  assert.throws(
    () => assertAppleEntitlementEnvironment({
      expected: prod, payloadEnvironment: APPLE_ENV_SANDBOX,
    }),
    /tidak dibenarkan dalam PRODUCTION/,
  );
  // Tuntutan bertandatangan yang sah untuk aplikasi KITA, tetapi Sandbox.
  assert.throws(() => assertAppleClaims(
    {bundleId: APPLE_PRODUCTION_BUNDLE_ID, environment: APPLE_ENV_SANDBOX, appAppleId: Number(PROD_APP_ID)},
    {bundleId: prod.bundleId, environment: prod.environment, appAppleId: prod.appAppleId},
  ), /environment tidak sepadan/);
});

test("muatan Production DITOLAK dalam REAL_QA", () => {
  const qa = identityOf(REAL_QA_ENV);
  assert.throws(
    () => assertAppleEntitlementEnvironment({
      expected: qa, payloadEnvironment: APPLE_ENV_PRODUCTION,
    }),
    /tidak dibenarkan dalam REAL_QA/,
  );
});

test("persekitaran yang sepadan diterima; nilai hilang atau pelik ditolak", () => {
  const prod = identityOf(PROD_ENV);
  assertAppleEntitlementEnvironment({
    expected: prod, payloadEnvironment: APPLE_ENV_PRODUCTION,
  });
  for (const bad of [undefined, null, 1, "production", "PRODUCTION", ""]) {
    assert.throws(() => assertAppleEntitlementEnvironment({
      expected: prod, payloadEnvironment: bad,
    }));
  }
});

// ---------------------------------------------------------------------------
// S-3 — appAppleId
// ---------------------------------------------------------------------------

test("appAppleId produksi HILANG -> gagal-tertutup", () => {
  for (const missing of [null, "", "   ", "bukan-nombor", "0", "-5"]) {
    const d = resolveWith(PROD_ENV, {productionAppAppleId: missing});
    assert.equal(d.ok, false, `diterima: ${missing}`);
    assert.match((d as {reason: string}).reason, /appAppleId/);
  }
});

test("appAppleId QA pilihan, dan Sandbox tidak menuntutnya", () => {
  const d = resolveWith(REAL_QA_ENV, {qaAppAppleId: null});
  assert.equal(d.ok, true);
  const id = (d as {ok: true; identity: AppleAppIdentity}).identity;
  assert.equal(id.appAppleId, undefined);
  // assertAppleClaims hanya menuntut appAppleId untuk Production.
  assertAppleClaims(
    {bundleId: APPLE_QA_BUNDLE_ID, environment: APPLE_ENV_SANDBOX},
    {bundleId: id.bundleId, environment: id.environment},
  );
});

test("appAppleId yang tidak sepadan ditolak walaupun bundle betul", () => {
  const prod = identityOf(PROD_ENV);
  assert.throws(() => assertAppleClaims(
    {
      bundleId: APPLE_PRODUCTION_BUNDLE_ID,
      environment: APPLE_ENV_PRODUCTION,
      appAppleId: 1234,
    },
    {bundleId: prod.bundleId, environment: prod.environment, appAppleId: prod.appAppleId},
  ), /appAppleId tidak sepadan/);
});

// ---------------------------------------------------------------------------
// Identiti tidak dikenali / bercanggah
// ---------------------------------------------------------------------------

test("projek TIDAK DIKENALI -> ditolak", () => {
  const d = resolveWith({GCLOUD_PROJECT: "projek-asing"});
  assert.equal(d.ok, false);
  assert.equal((d as {projectClass: string}).projectClass, "UNKNOWN");
});

test("REAL_QA yang BELUM diluluskan -> ditolak", () => {
  const d = resolveWith(REAL_QA_ENV, {approvedRealQaProjectId: null});
  assert.equal(d.ok, false);
});

test("identiti BERCANGGAH -> ditolak", () => {
  const d = resolveWith({
    GCLOUD_PROJECT: PRODUCTION_PROJECT_ID,
    GOOGLE_CLOUD_PROJECT: REAL_QA,
  });
  assert.equal(d.ok, false);
  assert.match((d as {reason: string}).reason, /DITOLAK/);
});

test("identiti produksi DI DALAM emulator -> ditolak", () => {
  const d = resolveWith({...PROD_ENV, FUNCTIONS_EMULATOR: "true"});
  assert.equal(d.ok, false);
  assert.match((d as {reason: string}).reason, /emulator/);
});

test("identiti emulator tempatan DI LUAR emulator -> ditolak", () => {
  const d = resolveWith({
    GCLOUD_PROJECT: APPROVED_QA_PROJECT_ID,
    FIREBASE_CONFIG: JSON.stringify({projectId: APPROVED_QA_PROJECT_ID}),
  });
  assert.equal(d.ok, false);
});

test("kredensial tidak boleh mengubah keputusan", () => {
  // Rahsia hadir atau tiada — identiti datang daripada projek sahaja.
  const withSecrets = resolveWith({
    ...REAL_QA_ENV,
    APPLE_IAP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----palsu",
    GOOGLE_APPLICATION_CREDENTIALS: "/palsu/produksi.json",
  });
  assert.equal(withSecrets.ok, true);
  assert.equal(
    (withSecrets as {ok: true; identity: AppleAppIdentity}).identity.environment,
    APPLE_ENV_SANDBOX,
  );
});

// ---------------------------------------------------------------------------
// Pendawaian — laluan pembelian dan notifikasi mesti berkongsi kontrak
// ---------------------------------------------------------------------------

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("laluan pembelian menggunakan pengesah berskop-aplikasi, bukan yang telanjang", () => {
  const text = source("src/services/appleSubscriptionService.ts");
  assert.ok(/verifyAppleJwsForApp/.test(text), "masih menggunakan verifyAppleJws telanjang");
  assert.equal(
    /\bverifyAppleJws\s*\(/.test(text.replace(/verifyAppleJwsForApp\s*\(/g, "")),
    false,
    "masih ada panggilan verifyAppleJws telanjang",
  );
});

test("laluan pembelian TIDAK LAGI jatuh produksi->sandbox pada 404", () => {
  const text = source("src/services/appleSubscriptionService.ts");
  // Hos tunggal, dipilih oleh identiti.
  assert.ok(/host: identity\.host/.test(text));
  assert.equal(/SANDBOX_HOST/.test(text), false, "hos sandbox masih dipilih sendiri");
  assert.equal(/environment = "Sandbox"/.test(text), false, "persekitaran masih diterbitkan daripada hos");
});

test("pagar kelayakan dipanggil SEBELUM sebarang tulisan", () => {
  const text = source("src/services/appleSubscriptionService.ts");
  const gate = text.indexOf("assertAppleEntitlementEnvironment");
  const write = text.indexOf("db.runTransaction");
  assert.ok(gate > 0, "pagar kelayakan tiada");
  assert.ok(write > 0 && gate < write, "pagar selepas tulisan");
});

test("laluan notifikasi berkongsi penyelesai identiti dan pagar persekitaran", () => {
  const callable = source("src/callable/appStoreServerNotifications.ts");
  assert.ok(/resolveAppleAppIdentity/.test(callable));
  assert.equal(/APPLE_BUNDLE_ID/.test(callable), false, "bundle masih berkod-keras");
  const service = source("src/services/appleNotificationService.ts");
  assert.ok(/expectedEnvironment/.test(service));
  assert.equal(
    /\bverifyAppleJws\s*\(/.test(
      service.replace(/verifyAppleJwsForApp\s*\(/g, ""),
    ),
    true,
    "sampul luar masih disahkan tanpa skop (dijangka: identiti belum diketahui pada ketika itu)",
  );
});
