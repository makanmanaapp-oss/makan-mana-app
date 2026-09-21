import {strict as assert} from "node:assert";
import {test} from "node:test";

import {
  APPROVED_QA_PROJECT_ID,
  decideEgress,
  isLoopbackDestination,
  isQaProjectId,
  readEgressEnvironment,
} from "../egressGuard";

const PROD_MIRROR =
  "https://makanmana-control-center.vercel.app/api/internal/sync/mirror";
const LOOPBACK_MIRROR = "http://127.0.0.1:3000/api/internal/sync/mirror";

const qaEnv = {projectId: APPROVED_QA_PROJECT_ID, inEmulator: true};
const prodEnv = {projectId: "makanmana-prod", inEmulator: false};

test("projek demo- dikenali sebagai QA, projek sebenar tidak", () => {
  assert.equal(isQaProjectId(APPROVED_QA_PROJECT_ID), true);
  assert.equal(isQaProjectId("demo-apa-apa"), true);
  assert.equal(isQaProjectId("makanmana-prod"), false);
  assert.equal(isQaProjectId(null), false);
  // Bukan awalan — tidak boleh dikira QA hanya kerana mengandungi "demo".
  assert.equal(isQaProjectId("makanmana-demo"), false);
});

test("hos gelung-balik dikenali; hos lain tidak", () => {
  assert.equal(isLoopbackDestination(LOOPBACK_MIRROR), true);
  assert.equal(isLoopbackDestination("http://localhost:3000/x"), true);
  assert.equal(isLoopbackDestination("http://[::1]:3000/x"), true);
  assert.equal(isLoopbackDestination(PROD_MIRROR), false);
  assert.equal(isLoopbackDestination("bukan-url"), false);
  // Hos yang menyamar sebagai gelung-balik mesti DITOLAK.
  assert.equal(isLoopbackDestination("http://127.0.0.1.evil.example/x"), false);
});

test("QA TIDAK boleh menghubungi Control Center produksi", () => {
  const d = decideEgress({
    kind: "control_center_mirror",
    destination: PROD_MIRROR,
    env: qaEnv,
  });
  assert.equal(d.allowed, false);
  assert.match(d.reason, /DISEKAT/);
});

test("QA BOLEH menghubungi cermin gelung-balik", () => {
  const d = decideEgress({
    kind: "control_center_mirror",
    destination: LOOPBACK_MIRROR,
    env: qaEnv,
  });
  assert.equal(d.allowed, true);
});

test("QA TIDAK boleh menghantar FCM sebenar, walaupun ke gelung-balik", () => {
  for (const destination of [undefined, LOOPBACK_MIRROR]) {
    const d = decideEgress({kind: "fcm_push", destination, env: qaEnv});
    assert.equal(d.allowed, false);
    assert.match(d.reason, /fcm_push DISEKAT/);
  }
});

test("PRODUKSI kekal dibenarkan — cermin dan FCM", () => {
  const mirror = decideEgress({
    kind: "control_center_mirror",
    destination: PROD_MIRROR,
    env: prodEnv,
  });
  assert.equal(mirror.allowed, true);

  const push = decideEgress({kind: "fcm_push", env: prodEnv});
  assert.equal(push.allowed, true);
});

test("PERCANGGAHAN: emulator menjalankan projek sebenar → disekat", () => {
  const env = {projectId: "makanmana-prod", inEmulator: true};
  for (const kind of ["control_center_mirror", "fcm_push"] as const) {
    const d = decideEgress({kind, destination: LOOPBACK_MIRROR, env});
    assert.equal(d.allowed, false, `${kind} sepatutnya disekat`);
    assert.match(d.reason, /bukan-QA/);
  }
});

test("PERCANGGAHAN: projek QA di luar emulator → disekat", () => {
  const env = {projectId: APPROVED_QA_PROJECT_ID, inEmulator: false};
  const d = decideEgress({
    kind: "control_center_mirror",
    destination: LOOPBACK_MIRROR,
    env,
  });
  assert.equal(d.allowed, false);
  assert.match(d.reason, /di luar emulator/);
});

test("identiti projek tidak diketahui → gagal TERTUTUP", () => {
  const env = {projectId: null, inEmulator: false};
  const d = decideEgress({
    kind: "control_center_mirror",
    destination: PROD_MIRROR,
    env,
  });
  assert.equal(d.allowed, false);
  assert.match(d.reason, /tidak dapat ditentukan/);
});

test("rahsia TIDAK boleh memintas pagar — pagar tidak pernah membacanya", () => {
  // Mensimulasikan `.secret.local` yang tersilap diletakkan: rahsia hadir dan
  // kelihatan sah. Keputusan mesti kekal SAMA, kerana ia hanya bergantung pada
  // identiti projek dan mod emulator.
  const withSecrets = {
    ...process.env,
    CONTROL_CENTER_SYNC_SECRET: "rahsia-palsu-yang-kelihatan-sah",
    PLAY_SERVICE_ACCOUNT_JSON: "{\"type\":\"service_account\"}",
    GOOGLE_MAPS_API_KEY: "AIzaPalsu0000000000000000000000000000",
    GCLOUD_PROJECT: APPROVED_QA_PROJECT_ID,
    FUNCTIONS_EMULATOR: "true",
  } as NodeJS.ProcessEnv;

  const env = readEgressEnvironment(withSecrets);
  assert.equal(env.projectId, APPROVED_QA_PROJECT_ID);
  assert.equal(env.inEmulator, true);

  const d = decideEgress({
    kind: "control_center_mirror",
    destination: PROD_MIRROR,
    env,
  });
  assert.equal(d.allowed, false, "rahsia tidak boleh membuka laluan produksi");
});

test("identiti dibaca dari GCLOUD_PROJECT, GCP_PROJECT, lalu FIREBASE_CONFIG", () => {
  assert.equal(
    readEgressEnvironment({GCLOUD_PROJECT: "a"} as NodeJS.ProcessEnv).projectId,
    "a",
  );
  assert.equal(
    readEgressEnvironment({GCP_PROJECT: "b"} as NodeJS.ProcessEnv).projectId,
    "b",
  );
  assert.equal(
    readEgressEnvironment({
      FIREBASE_CONFIG: JSON.stringify({projectId: "c"}),
    } as NodeJS.ProcessEnv).projectId,
    "c",
  );
  // FIREBASE_CONFIG cacat tidak boleh melontar; ia menjadi "tidak diketahui".
  assert.equal(
    readEgressEnvironment({FIREBASE_CONFIG: "{bukan json"} as NodeJS.ProcessEnv)
      .projectId,
    null,
  );
  assert.equal(readEgressEnvironment({} as NodeJS.ProcessEnv).projectId, null);
});

test("diagnostik TIDAK PERNAH membocorkan rahsia", () => {
  const secret = "rahsia-sangat-sulit-jangan-bocor";
  const d = decideEgress({
    kind: "control_center_mirror",
    destination: `${PROD_MIRROR}?token=${secret}`,
    env: qaEnv,
  });
  assert.equal(d.allowed, false);
  assert.equal(d.reason.includes(secret), false);
});

test("App Store Server API TIDAK boleh dipanggil dari QA", () => {
  const d = decideEgress({kind: "app_store_api", env: qaEnv});
  assert.equal(d.allowed, false);
  assert.match(d.reason, /tiada emulator/);
});

test("App Store Server API dibenarkan dalam PRODUKSI", () => {
  const d = decideEgress({kind: "app_store_api", env: prodEnv});
  assert.equal(d.allowed, true);
});

test("FCM kekal disekat dalam QA selepas pagar diluaskan", () => {
  const d = decideEgress({kind: "fcm_push", env: qaEnv});
  assert.equal(d.allowed, false);
  assert.match(d.reason, /tiada emulator/);
});
