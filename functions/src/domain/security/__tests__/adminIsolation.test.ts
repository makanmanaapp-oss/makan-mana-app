import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";

import {
  APPROVED_QA_PROJECT_ID,
  PRODUCTION_PROJECT_ID,
  decideFirebaseAdminIsolation,
  decideStorageAccess,
  emulatorHostDestination,
  storageSigningMode,
  type AdminService,
} from "../egressGuard";

/**
 * WAVE 3E — pengasingan Firestore/Auth Admin dan tandatangan Storage.
 *
 * Firestore dan Auth bukan egress, jadi pagar egress tidak melindunginya. Tetapi
 * firebase-admin memilih projek sasaran mereka melalui peraturan yang sama
 * seperti FCM — bukan daripada identiti yang pagar lihat. Semua fikstur di
 * sini ialah objek persekitaran pakai-buang; tiada Firestore, Auth atau
 * Storage sebenar disentuh.
 */

const QA = "makanmana-qa-dummy-for-tests";
const PROD = PRODUCTION_PROJECT_ID;
const PROD_CONFIG = JSON.stringify({projectId: PROD});
const SERVICES: AdminService[] = ["firestore", "auth"];

function decide(
  service: AdminService,
  env: Record<string, string>,
  extra: {optionsProjectId?: string | null; serviceAccountProjectId?: string | null; realQa?: string | null} = {},
) {
  return decideFirebaseAdminIsolation({
    service,
    env: env as NodeJS.ProcessEnv,
    optionsProjectId: extra.optionsProjectId,
    serviceAccountProjectId: extra.serviceAccountProjectId,
    approvedRealQaProjectId: extra.realQa ?? QA,
  });
}

// ---------------------------------------------------------------------------
// Firestore / Auth Admin
// ---------------------------------------------------------------------------

test("konfigurasi produksi yang BETUL dibenarkan — tingkah laku tidak berubah", () => {
  // Runtime produksi: FIREBASE_CONFIG (JSON) dan GCLOUD_PROJECT bersetuju;
  // options.projectId dimuatkan daripada FIREBASE_CONFIG.
  const env = {GCLOUD_PROJECT: PROD, FIREBASE_CONFIG: PROD_CONFIG};
  for (const service of SERVICES) {
    const d = decide(service, env, {optionsProjectId: PROD});
    assert.equal(d.allowed, true, `${service}: ${d.reason}`);
    assert.equal(d.target, PROD);
    assert.equal(d.targetClass, "PRODUCTION");
  }
  // Dengan GOOGLE_CLOUD_PROJECT yang BERSETUJU juga.
  assert.equal(
    decide("firestore", {...env, GOOGLE_CLOUD_PROJECT: PROD}, {optionsProjectId: PROD}).allowed,
    true,
  );
});

test("identiti projek HILANG -> disekat (SDK akan meneka melalui ADC)", () => {
  for (const service of SERVICES) {
    const d = decide(service, {});
    assert.equal(d.allowed, false, service);
    assert.equal(d.target, null);
    assert.match(d.reason, /tidak dapat disahkan/);
  }
});

test("identiti BERCANGGAH -> disekat, dan sasaran sebenar ialah PRODUKSI", () => {
  // Kes yang disahkan dalam sumber SDK: tanpa FIREBASE_CONFIG, firebase-admin
  // membaca GOOGLE_CLOUD_PROJECT SEBELUM GCLOUD_PROJECT. Egress disekat oleh
  // percanggahan, tetapi Firestore akan menulis ke produksi.
  const env = {GCLOUD_PROJECT: QA, GOOGLE_CLOUD_PROJECT: PROD};
  for (const service of SERVICES) {
    const d = decide(service, env);
    assert.equal(d.target, PROD, "SDK akan menyasar produksi");
    assert.equal(d.allowed, false, service);
    assert.match(d.reason, /tidak bersetuju/);
  }
});

test("kelayakan PRODUKSI dalam QA -> sasaran produksi, disekat", () => {
  // Kelayakan akaun perkhidmatan produksi, tiada FIREBASE_CONFIG: SDK menyasar
  // projek kelayakan, bukan runtime.
  for (const service of SERVICES) {
    const d = decide(service, {GCLOUD_PROJECT: QA}, {serviceAccountProjectId: PROD});
    assert.equal(d.target, PROD);
    assert.equal(d.allowed, false, service);
    assert.match(d.reason, /sasaran bukan identiti runtime/);
  }
});

test("sasaran Firestore/Auth SALAH (options != runtime) -> disekat", () => {
  for (const service of SERVICES) {
    const d = decide(
      service,
      {GCLOUD_PROJECT: QA},
      {optionsProjectId: PROD},
    );
    assert.equal(d.allowed, false, service);
  }
});

test("projek TIDAK DIKENALI -> disekat walaupun sumber bersetuju", () => {
  const env = {GCLOUD_PROJECT: "projek-lain", FIREBASE_CONFIG: JSON.stringify({projectId: "projek-lain"})};
  for (const service of SERVICES) {
    const d = decide(service, env, {optionsProjectId: "projek-lain"});
    assert.equal(d.allowed, false, service);
    assert.equal(d.targetClass, "UNKNOWN");
  }
});

test("REAL_QA yang konsisten dibenarkan; REAL_QA yang belum diumpukkan tidak", () => {
  const env = {GCLOUD_PROJECT: QA, FIREBASE_CONFIG: JSON.stringify({projectId: QA})};
  assert.equal(decide("firestore", env, {optionsProjectId: QA}).allowed, true);
  // Tanpa ID diluluskan (pemalar kekal null), projek yang sama ialah UNKNOWN.
  const unassigned = decideFirebaseAdminIsolation({
    service: "firestore",
    env: env as NodeJS.ProcessEnv,
    optionsProjectId: QA,
  });
  assert.equal(unassigned.allowed, false);
  assert.equal(unassigned.targetClass, "UNKNOWN");
});

test("QA emulator dihala ke emulator GELUNG-BALIK -> dibenarkan", () => {
  const base = {
    FUNCTIONS_EMULATOR: "true",
    GCLOUD_PROJECT: APPROVED_QA_PROJECT_ID,
    FIREBASE_CONFIG: JSON.stringify({projectId: APPROVED_QA_PROJECT_ID}),
  };
  assert.equal(
    decide("firestore", {...base, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080"}).allowed,
    true,
  );
  assert.equal(
    decide("auth", {...base, FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099"}).allowed,
    true,
  );
  // firebase-tools menulis [::1]:port untuk emulator yang terikat pada ::
  assert.equal(
    decide("firestore", {...base, FIRESTORE_EMULATOR_HOST: "[::1]:8080"}).allowed,
    true,
  );
});

test("emulator Functions TANPA emulator Firestore/Auth -> disekat", () => {
  // Dengan identiti PRODUKSI inilah amaran ADC: emulator tempatan akan
  // menulis ke Firestore produksi SEBENAR dengan kelayakan pemilik.
  for (const projectId of [PROD, APPROVED_QA_PROJECT_ID]) {
    const env = {
      FUNCTIONS_EMULATOR: "true",
      GCLOUD_PROJECT: projectId,
      FIREBASE_CONFIG: JSON.stringify({projectId}),
    };
    for (const service of SERVICES) {
      const d = decide(service, env, {optionsProjectId: projectId});
      assert.equal(d.allowed, false, `${projectId}/${service}`);
      assert.match(d.reason, /tanpa (FIRESTORE_EMULATOR_HOST|FIREBASE_AUTH_EMULATOR_HOST)/);
    }
  }
});

test("hos emulator BUKAN gelung-balik -> disekat", () => {
  const d = decide("firestore", {
    FUNCTIONS_EMULATOR: "true",
    GCLOUD_PROJECT: APPROVED_QA_PROJECT_ID,
    FIRESTORE_EMULATOR_HOST: "10.0.0.5:8080",
  });
  assert.equal(d.allowed, false);
  assert.match(d.reason, /bukan-gelung-balik/);
});

test("projek demo- pada Firestore SEBENAR (tanpa emulator) -> disekat", () => {
  const env = {
    GCLOUD_PROJECT: APPROVED_QA_PROJECT_ID,
    FIREBASE_CONFIG: JSON.stringify({projectId: APPROVED_QA_PROJECT_ID}),
  };
  assert.equal(decide("firestore", env, {optionsProjectId: APPROVED_QA_PROJECT_ID}).allowed, false);
});

test("FIREBASE_CONFIG sebagai laluan fail -> disekat", () => {
  const d = decide("firestore", {GCLOUD_PROJECT: PROD, FIREBASE_CONFIG: "/etc/fb.json"});
  assert.equal(d.allowed, false);
  assert.match(d.reason, /laluan fail/);
});

// ---------------------------------------------------------------------------
// Storage: baldi dan penandatangan
// ---------------------------------------------------------------------------

function storage(bucket: string | null | undefined, env: Record<string, string>, realQa: string | null = QA) {
  return decideStorageAccess({bucket, env: env as NodeJS.ProcessEnv, approvedRealQaProjectId: realQa});
}

const QA_EMULATOR = {
  FUNCTIONS_EMULATOR: "true",
  GCLOUD_PROJECT: APPROVED_QA_PROJECT_ID,
  FIREBASE_CONFIG: JSON.stringify({projectId: APPROVED_QA_PROJECT_ID}),
};

test("baldi HILANG -> disekat dalam setiap kelas", () => {
  for (const bucket of ["", "   ", null, undefined]) {
    const envs: Array<Record<string, string>> = [
      {GCLOUD_PROJECT: PROD, FIREBASE_CONFIG: PROD_CONFIG},
      {...QA_EMULATOR, FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199"},
      {GCLOUD_PROJECT: QA},
    ];
    for (const env of envs) {
      const d = storage(bucket, env);
      assert.equal(d.allowed, false, `${String(bucket)} / ${env.GCLOUD_PROJECT}`);
      assert.match(d.reason, /nama baldi kosong/);
    }
  }
});

test("baldi SALAH (produksi) dari REAL_QA -> disekat", () => {
  const d = storage("makanmana-c59f3.firebasestorage.app", {GCLOUD_PROJECT: QA});
  assert.equal(d.allowed, false);
  assert.equal(d.signingMode, "sdk_credentials");
});

test("identiti projek SALAH untuk baldi -> disekat", () => {
  // Runtime produksi yang menandatangani untuk baldi QA ialah salah konfigurasi.
  const d = storage(`${QA}.firebasestorage.app`, {GCLOUD_PROJECT: PROD, FIREBASE_CONFIG: PROD_CONFIG});
  assert.equal(d.allowed, false);
  // Percanggahan identiti juga menyekat.
  assert.equal(storage("makanmana-c59f3.firebasestorage.app", {GCLOUD_PROJECT: PROD, GOOGLE_CLOUD_PROJECT: QA}).allowed, false);
});

test("emulator Storage TIDAK tersedia -> disekat", () => {
  const d = storage("makanmana-c59f3.firebasestorage.app", QA_EMULATOR);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /emulator Storage tidak aktif/);
});

test("produksi betul: baldi produksi, penandatangan SDK biasa", () => {
  const d = storage("makanmana-c59f3.firebasestorage.app", {GCLOUD_PROJECT: PROD, FIREBASE_CONFIG: PROD_CONFIG});
  assert.equal(d.allowed, true, d.reason);
  assert.equal(d.signingMode, "sdk_credentials", "penandatangan produksi TIDAK berubah");
});

test("QA emulator dengan emulator Storage: kunci PAKAI-BUANG, bukan kelayakan pemilik", () => {
  const d = storage("makanmana-c59f3.firebasestorage.app", {
    ...QA_EMULATOR,
    FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  });
  assert.equal(d.allowed, true, d.reason);
  assert.equal(d.signingMode, "emulator_disposable_key");
});

test("REAL_QA yang betul menggunakan penandatangan SDK projek QA sendiri", () => {
  const d = storage(`${QA}.firebasestorage.app`, {GCLOUD_PROJECT: QA});
  assert.equal(d.allowed, true, d.reason);
  assert.equal(d.signingMode, "sdk_credentials");
});

test("mod penandatangan: pakai-buang HANYA untuk QA emulator yang dibenarkan", () => {
  for (const projectClass of ["PRODUCTION", "REAL_QA", "UNKNOWN"] as const) {
    assert.equal(storageSigningMode({allowed: true, reason: "", projectClass}), "sdk_credentials");
  }
  assert.equal(
    storageSigningMode({allowed: false, reason: "", projectClass: "LOCAL_EMULATOR_QA"}),
    "sdk_credentials",
    "keputusan yang ditolak tidak boleh memilih laluan penandatangan",
  );
});

test("hos emulator host:port menjadi URL gelung-balik", () => {
  assert.equal(emulatorHostDestination("127.0.0.1:8080"), "http://127.0.0.1:8080");
  assert.equal(emulatorHostDestination("[::1]:8080"), "http://[::1]:8080");
  assert.equal(emulatorHostDestination("http://localhost:9199"), "http://localhost:9199");
  assert.equal(emulatorHostDestination(""), "");
  assert.equal(emulatorHostDestination(undefined), "");
});

// ---------------------------------------------------------------------------
// Pariti dengan SDK yang DIPASANG — naik taraf yang mengubah tingkah laku
// menggagalkan ujian ini, bukan menjadikan keputusan salah secara senyap.
// ---------------------------------------------------------------------------

function sdk(path: string): string {
  return readFileSync(resolve(process.cwd(), "node_modules", path), "utf8");
}

test("pariti SDK: Firestore memilih projek melalui getExplicitProjectId", () => {
  const src = sdk("firebase-admin/lib/firestore/firestore-internal.js");
  assert.match(src, /const projectId = utils\.getExplicitProjectId\(app\);/);
  // Tanpa projectId eksplisit, klien Firestore menemuinya sendiri (ADC).
  assert.match(src, /let Firestore client discover one from the/);
});

test("pariti SDK: Auth memilih projek melalui findProjectId; emulator melalui env", () => {
  const src = sdk("firebase-admin/lib/auth/auth-api-request.js");
  assert.match(src, /utils\.findProjectId\(this\.app\)/);
  assert.match(src, /process\.env\.FIREBASE_AUTH_EMULATOR_HOST/);
});

test("pariti SDK: penandatangan Storage SENTIASA memanggil auth.sign, walaupun dalam emulator", () => {
  const signer = sdk("@google-cloud/storage/build/cjs/src/signer.js");
  assert.ok((signer.match(/auth\.sign\(blobToSign/g) ?? []).length >= 2);
  const auth = sdk("google-auth-library/build/src/auth/googleauth.js");
  // ADC impersonated -> IAM sebenar; JWT dengan kunci -> tempatan.
  assert.match(auth, /if \(client instanceof impersonated_1\.Impersonated\) \{\s*const signed = await client\.sign\(data\);/);
  assert.match(auth, /if \(client instanceof jwtclient_1\.JWT && client\.key\) \{\s*const sign = await crypto\.sign\(client\.key, data\);/);
});

test("pariti SDK: firebase-admin membina Storage dengan kunci untuk ServiceAccountCredential", () => {
  const src = sdk("firebase-admin/lib/storage/storage.js");
  assert.match(src, /credentials: \{\s*private_key: credential\.privateKey,\s*client_email: credential\.clientEmail,/);
});

// ---------------------------------------------------------------------------
// Pendawaian
// ---------------------------------------------------------------------------

test("Firestore disahkan pada operasi PERTAMA, sebelum akses diteruskan", () => {
  const src = readFileSync(resolve(process.cwd(), "src/config/firebase.ts"), "utf8").replace(/\r\n/g, "\n");
  const init = src.indexOf("initializeApp();");
  const proxy = src.indexOf("export const db: Firestore = new Proxy(firestore, {");
  const assertCall = src.indexOf('assertFirebaseAdminIsolation("firestore");');
  const forward = src.indexOf("Reflect.get(target, property, target)");
  assert.ok(init > -1 && proxy > -1 && assertCall > -1 && forward > -1, "config/firebase.ts berubah");
  assert.ok(init < proxy && proxy < assertCall && assertCall < forward,
    "semakan mesti berlaku di dalam perangkap get, sebelum akses dimajukan");
  // `db` yang dieksport ialah Proxy — tiada eksport klien mentah yang memintasnya.
  assert.equal(/export const db = getFirestore\(\)/.test(src), false);
});

test("Auth disahkan sebelum getAuth(), dan hanya ada satu titik laluan Admin", () => {
  const user = readFileSync(resolve(process.cwd(), "src/controlCenter/userMirrorSync.ts"), "utf8");
  assert.ok(user.indexOf('assertFirebaseAdminIsolation("auth");') < user.indexOf("const auth = getAuth();"));
  // Satu initializeApp lalai, satu getFirestore, satu getAuth — semakan di
  // atas meliputi semuanya. Pengamulaan baharu mesti ditambah dengan sengaja.
  const {readdirSync, statSync} = require("node:fs") as typeof import("node:fs");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const full = resolve(dir, n);
      if (statSync(full).isDirectory()) return n === "__tests__" ? [] : walk(full);
      return n.endsWith(".ts") ? [full] : [];
    });
  const counts = {initializeApp: 0, getFirestore: 0, getAuth: 0};
  for (const file of walk(resolve(process.cwd(), "src"))) {
    // Buang komen blok DAN baris: JSDoc yang menyebut `initializeApp()` bukan panggilan.
    const text = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
    counts.initializeApp += (text.match(/\binitializeApp\(/g) ?? []).length;
    counts.getFirestore += (text.match(/\bgetFirestore\(/g) ?? []).length;
    counts.getAuth += (text.match(/\bgetAuth\(/g) ?? []).length;
  }
  // initializeApp: config/firebase.ts (lalai) + egressTargets.ts (penandatangan
  // pakai-buang QA emulator, aplikasi BERNAMA).
  assert.deepEqual(counts, {initializeApp: 2, getFirestore: 1, getAuth: 1});
});
