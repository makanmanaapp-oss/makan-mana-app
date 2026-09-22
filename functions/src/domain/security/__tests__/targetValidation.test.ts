import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";

import {
  APPROVED_QA_PROJECT_ID,
  PRODUCTION_PROJECT_ID,
  decideEgress,
  projectOfStorageBucket,
  readEgressEnvironment,
  resolveFirebaseAdminTargetProject,
  storageEmulatorDestination,
  type EgressEnvironment,
  type EgressKind,
} from "../egressGuard";

/**
 * WAVE 3D — REAL_QA tidak boleh mencapai sumber produksi walaupun konfigurasi
 * atau kelayakan SALAH.
 *
 * Setiap senario menggunakan pengangkutan PALSU yang merekod panggilan dan
 * kelayakan tiruan. Tiada permintaan keluar sebenar. Setiap penolakan
 * menegaskan pengangkutan TIDAK dipanggil — kebenaran mesti mendahului
 * penghantaran, bukan sekadar menghasilkan keputusan yang betul.
 */

const QA = "makanmana-qa-dummy-for-tests";
const PROD = PRODUCTION_PROJECT_ID;
const DUMMY_SECRET = "rahsia-tiruan-boleh-buang";

function realQa(inEmulator = false): EgressEnvironment {
  return {projectId: QA, inEmulator};
}
function production(inEmulator = false): EgressEnvironment {
  return {projectId: PROD, inEmulator};
}

/** Pengangkutan palsu: pagar dahulu, kemudian rekod — tidak pernah keluar. */
function fakeTransport() {
  const sent: Array<{kind: EgressKind; target: string | null}> = [];
  return {
    sent,
    send(params: {
      kind: EgressKind;
      env: EgressEnvironment;
      target?: string | null;
      destination?: string;
      secret?: string;
    }): boolean {
      const decision = decideEgress({
        kind: params.kind,
        env: params.env,
        destination: params.destination,
        targetProjectId: params.target,
        approvedRealQaProjectId: QA,
      });
      if (!decision.allowed) return false;
      sent.push({kind: params.kind, target: params.target ?? null});
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// Senario taklimat
// ---------------------------------------------------------------------------

test("runtime QA betul + destinasi QA betul -> DIBENARKAN", () => {
  const t = fakeTransport();
  for (const kind of ["fcm_push", "google_cloud_api", "firebase_storage"] as EgressKind[]) {
    assert.equal(t.send({kind, env: realQa(), target: QA}), true, kind);
  }
  assert.equal(t.sent.length, 3);
});

test("runtime QA betul + destinasi PRODUKSI -> DISEKAT, pengangkutan tidak dipanggil", () => {
  const t = fakeTransport();
  for (const kind of ["fcm_push", "google_cloud_api", "firebase_storage"] as EgressKind[]) {
    assert.equal(t.send({kind, env: realQa(), target: PROD}), false, kind);
  }
  assert.equal(t.sent.length, 0);
});

test("runtime QA + kelayakan PRODUKSI -> sasaran diselesaikan kepada produksi, DISEKAT", () => {
  // Kelayakan akaun perkhidmatan produksi yang tersilap diletakkan dalam QA
  // menjadikan firebase-admin menyasar produksi, walaupun runtime ialah QA.
  const target = resolveFirebaseAdminTargetProject({
    optionsProjectId: null,
    serviceAccountProjectId: PROD,
    env: {GCLOUD_PROJECT: QA} as NodeJS.ProcessEnv,
  });
  assert.equal(target, PROD, "SDK akan menyasar projek kelayakan, bukan runtime");
  const t = fakeTransport();
  assert.equal(t.send({kind: "fcm_push", env: realQa(), target, secret: DUMMY_SECRET}), false);
  assert.equal(t.sent.length, 0);
});

test("runtime QA + GOOGLE_CLOUD_PROJECT produksi -> DISEKAT", () => {
  // firebase-admin membaca GOOGLE_CLOUD_PROJECT DAHULU daripada GCLOUD_PROJECT.
  // Sebelum Wave 3D pagar tidak membacanya langsung, jadi ini lulus senyap.
  const raw = {GCLOUD_PROJECT: QA, GOOGLE_CLOUD_PROJECT: PROD} as NodeJS.ProcessEnv;
  const env = readEgressEnvironment(raw);
  assert.equal(env.projectId, null);
  assert.match(env.conflict ?? "", /GOOGLE_CLOUD_PROJECT/);
  // Dan sasaran FCM tanpa options.projectId akan menjadi produksi.
  assert.equal(resolveFirebaseAdminTargetProject({env: raw}), PROD);
  const t = fakeTransport();
  assert.equal(t.send({kind: "fcm_push", env, target: PROD}), false);
  assert.equal(t.sent.length, 0);
});

test("projek sasaran TIDAK DIKETAHUI dalam REAL_QA -> DISEKAT", () => {
  const t = fakeTransport();
  for (const kind of ["fcm_push", "google_cloud_api", "firebase_storage"] as EgressKind[]) {
    assert.equal(t.send({kind, env: realQa(), target: "projek-lain-sama-sekali"}), false, kind);
  }
  assert.equal(t.sent.length, 0);
});

test("identiti destinasi HILANG dalam REAL_QA -> DISEKAT", () => {
  // Places menggunakan kunci API, yang tidak mendedahkan projek pemiliknya.
  // Kunci produksi yang disalin ke QA akan membilkan produksi — tidak dapat
  // disahkan tanpa I/O, jadi ditolak.
  const t = fakeTransport();
  for (const target of [undefined, null, "", "   "]) {
    for (const kind of ["fcm_push", "google_cloud_api", "firebase_storage"] as EgressKind[]) {
      assert.equal(t.send({kind, env: realQa(), target}), false, `${kind}/${String(target)}`);
    }
  }
  assert.equal(t.sent.length, 0);
});

test("pemboleh ubah persekitaran BERCANGGAH -> DISEKAT", () => {
  const cases: Array<Record<string, string>> = [
    {GCLOUD_PROJECT: QA, GCP_PROJECT: PROD},
    {GCLOUD_PROJECT: QA, GOOGLE_CLOUD_PROJECT: PROD},
    {GCLOUD_PROJECT: QA, gcloud_project: PROD},
    {GCLOUD_PROJECT: QA, FIREBASE_CONFIG: JSON.stringify({projectId: PROD})},
    {GOOGLE_CLOUD_PROJECT: PROD, FIREBASE_CONFIG: JSON.stringify({projectId: QA})},
  ];
  for (const raw of cases) {
    const env = readEgressEnvironment(raw as NodeJS.ProcessEnv);
    assert.ok(env.conflict, JSON.stringify(Object.keys(raw)));
    const d = decideEgress({kind: "fcm_push", env, targetProjectId: QA, approvedRealQaProjectId: QA});
    assert.equal(d.allowed, false, JSON.stringify(Object.keys(raw)));
  }
});

test("FIREBASE_CONFIG sebagai LALUAN FAIL -> DISEKAT", () => {
  // firebase-admin membaca fail itu; pagar tulen tidak boleh. Tidak disahkan.
  const env = readEgressEnvironment({
    GCLOUD_PROJECT: PROD,
    FIREBASE_CONFIG: "/etc/firebase/config.json",
  } as NodeJS.ProcessEnv);
  assert.equal(env.projectId, null);
  assert.match(env.conflict ?? "", /laluan fail/);
  assert.equal(decideEgress({kind: "fcm_push", env}).allowed, false);
});

test("runtime PRODUKSI + destinasi QA yang tidak dijangka -> DISEKAT", () => {
  const t = fakeTransport();
  for (const kind of [
    "fcm_push", "google_cloud_api", "firebase_storage",
    "control_center_mirror", "app_store_api", "google_play_api",
  ] as EgressKind[]) {
    assert.equal(t.send({kind, env: production(), target: QA}), false, kind);
  }
  assert.equal(t.sent.length, 0);
});

test("produksi SAH tidak berubah: sasaran produksi atau tiada sasaran -> DIBENARKAN", () => {
  // Tingkah laku produksi yang sah tidak boleh berubah. Places (kunci API)
  // tiada sasaran yang boleh ditentukan dan kekal dibenarkan dalam produksi.
  const t = fakeTransport();
  for (const kind of [
    "fcm_push", "google_cloud_api", "firebase_storage", "control_center_mirror",
    "control_center_api", "app_store_api", "google_play_api",
  ] as EgressKind[]) {
    assert.equal(t.send({kind, env: production(), target: PROD}), true, `${kind} + sasaran`);
    assert.equal(t.send({kind, env: production()}), true, `${kind} tanpa sasaran`);
  }
});

test("rahsia HILANG atau tiruan tidak mengubah keputusan", () => {
  // Pagar tidak membaca rahsia: keputusan sama dengan atau tanpanya.
  for (const secret of [undefined, "", DUMMY_SECRET]) {
    const t = fakeTransport();
    assert.equal(t.send({kind: "control_center_mirror", env: realQa(), target: QA, secret}), false);
    assert.equal(t.send({kind: "app_store_api", env: realQa(), target: QA, secret}), false);
    assert.equal(t.send({kind: "fcm_push", env: realQa(), target: QA, secret}), true);
  }
});

test("QA emulator tempatan sedia ada: gelung-balik sahaja, termasuk Storage", () => {
  const qa: EgressEnvironment = {projectId: APPROVED_QA_PROJECT_ID, inEmulator: true};
  const t = fakeTransport();
  const emulator = storageEmulatorDestination({
    FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  } as NodeJS.ProcessEnv);
  assert.equal(emulator, "http://127.0.0.1:9199");
  // Baldi lalai ialah nama PRODUKSI, tetapi emulator memintas setiap baldi.
  assert.equal(
    t.send({kind: "firebase_storage", env: qa, destination: emulator, target: PROD}),
    true,
    "emulator Storage aktif: tidak meninggalkan mesin",
  );
  assert.equal(
    t.send({kind: "control_center_mirror", env: qa, destination: "http://127.0.0.1:3000/x"}),
    true,
  );
  assert.equal(t.send({kind: "fcm_push", env: qa, target: APPROVED_QA_PROJECT_ID}), false);
  assert.equal(t.send({kind: "google_cloud_api", env: qa, target: APPROVED_QA_PROJECT_ID}), false);
  assert.equal(t.sent.length, 2);
});

test("QA emulator TANPA emulator Storage -> Storage DISEKAT", () => {
  // Tanpa FIREBASE_STORAGE_EMULATOR_HOST, firebase-admin menghala ke Cloud
  // Storage SEBENAR dengan ADC pemilik — sebelum Wave 3D ini tidak disekat.
  const qa: EgressEnvironment = {projectId: APPROVED_QA_PROJECT_ID, inEmulator: true};
  const destination = storageEmulatorDestination({} as NodeJS.ProcessEnv);
  assert.equal(destination, "");
  const t = fakeTransport();
  assert.equal(t.send({kind: "firebase_storage", env: qa, destination, target: PROD}), false);
  assert.equal(t.sent.length, 0);
});

// ---------------------------------------------------------------------------
// Penyelesai sasaran
// ---------------------------------------------------------------------------

test("penyelesai sasaran Admin mengikut keutamaan firebase-admin", () => {
  const env = {GOOGLE_CLOUD_PROJECT: "g", GCLOUD_PROJECT: "c"} as NodeJS.ProcessEnv;
  assert.equal(resolveFirebaseAdminTargetProject({optionsProjectId: "o", serviceAccountProjectId: "s", env}), "o");
  assert.equal(resolveFirebaseAdminTargetProject({serviceAccountProjectId: "s", env}), "s");
  assert.equal(resolveFirebaseAdminTargetProject({env}), "g");
  assert.equal(resolveFirebaseAdminTargetProject({env: {GCLOUD_PROJECT: "c"} as NodeJS.ProcessEnv}), "c");
  // Jatuh balik ADC/metadata tidak dapat disahkan -> null, bukan tekaan.
  assert.equal(resolveFirebaseAdminTargetProject({env: {} as NodeJS.ProcessEnv}), null);
});

test("penyelesai sasaran SEPADAN sumber firebase-admin yang dipasang", () => {
  // Jika naik taraf SDK mengubah keutamaan, ujian ini gagal dan bukan pagar
  // menjadi salah secara senyap.
  const src = readFileSync(
    resolve(process.cwd(), "node_modules/firebase-admin/lib/utils/index.js"),
    "utf8",
  );
  const body = src.slice(src.indexOf("function getExplicitProjectId(app)"));
  const order = [
    body.indexOf("options.projectId"),
    body.indexOf("ServiceAccountCredential"),
    body.indexOf("process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT"),
  ];
  assert.ok(order.every((i) => i > 0), `bentuk getExplicitProjectId berubah: ${order}`);
  assert.ok(order[0] < order[1] && order[1] < order[2], "keutamaan firebase-admin berubah");
});

test("projek baldi diterbitkan daripada nama baldi lalai sahaja", () => {
  assert.equal(projectOfStorageBucket("makanmana-c59f3.firebasestorage.app"), PROD);
  assert.equal(projectOfStorageBucket("makanmana-c59f3.appspot.com"), PROD);
  assert.equal(projectOfStorageBucket(`${QA}.firebasestorage.app`), QA);
  assert.equal(projectOfStorageBucket("demo-mm.appspot.com"), "demo-mm");
  // Baldi tersuai tidak mendedahkan pemiliknya -> tidak disahkan.
  for (const custom of ["my-bucket", "", null, undefined, ".appspot.com"]) {
    assert.equal(projectOfStorageBucket(custom), null, String(custom));
  }
});

test("baldi LALAI (produksi) dari runtime REAL_QA -> DISEKAT", () => {
  // Inilah kegagalan konfigurasi yang paling mungkin: GROUP_IMAGE_BUCKET tidak
  // ditetapkan dalam projek QA, jadi STORAGE_BUCKET jatuh balik ke produksi.
  const t = fakeTransport();
  const target = projectOfStorageBucket("makanmana-c59f3.firebasestorage.app");
  assert.equal(t.send({kind: "firebase_storage", env: realQa(), target}), false);
  // Baldi tersuai QA yang tidak dapat disahkan juga ditolak.
  assert.equal(t.send({kind: "firebase_storage", env: realQa(), target: projectOfStorageBucket("qa-custom")}), false);
  assert.equal(t.sent.length, 0);
});

test("destinasi emulator Storage mengikut penukaran firebase-admin", () => {
  const src = readFileSync(
    resolve(process.cwd(), "node_modules/firebase-admin/lib/storage/storage.js"),
    "utf8",
  );
  assert.match(src, /process\.env\.STORAGE_EMULATOR_HOST = `http:\/\/\$\{process\.env\.FIREBASE_STORAGE_EMULATOR_HOST\}`/);
  assert.equal(
    storageEmulatorDestination({STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199"} as NodeJS.ProcessEnv),
    "http://127.0.0.1:9199",
  );
});
