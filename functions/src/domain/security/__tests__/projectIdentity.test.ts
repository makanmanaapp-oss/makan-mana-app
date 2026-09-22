import {strict as assert} from "node:assert";
import {test} from "node:test";

import {
  APPROVED_QA_PROJECT_ID,
  APPROVED_REAL_QA_PROJECT_ID,
  PRODUCTION_PROJECT_ID,
  classifyProject,
  decideEgress,
  readEgressEnvironment,
  type EgressEnvironment,
  type EgressKind,
  type ProjectClass,
} from "../egressGuard";

/**
 * WAVE 3C — identiti projek eksplisit dan matriks egress penuh.
 *
 * Sebelum gelombang ini, "produksi" bermaksud *apa-apa yang bukan `demo-`*.
 * Projek yang tidak dikenali — salah taip, projek peribadi jurutera,
 * persekitaran separuh siap — mewarisi keistimewaan penuh produksi secara
 * senyap. Fail ini mengunci pengetatan itu.
 */

/** ID tiruan boleh-buang untuk projek QA sebenar yang BELUM wujud. */
const DUMMY_REAL_QA = "makanmana-qa-dummy-for-tests";

const PROD_MIRROR =
  "https://makanmana-control-center.vercel.app/api/internal/sync/mirror";
const LOOPBACK_MIRROR = "http://127.0.0.1:3000/api/internal/sync/mirror";

const KINDS: EgressKind[] = [
  "control_center_mirror",
  "control_center_api",
  "fcm_push",
  "app_store_api",
  "google_play_api",
  "google_cloud_api",
];

/** Jangkaan untuk SETIAP jenis — diberi nama supaya matriks boleh dibaca. */
function all(allowed: boolean): Record<EgressKind, boolean> {
  return Object.fromEntries(KINDS.map((k) => [k, allowed])) as Record<EgressKind, boolean>;
}

function env(projectId: string | null, inEmulator: boolean): EgressEnvironment {
  return {projectId, inEmulator};
}

// ---------------------------------------------------------------------------
// Klasifikasi
// ---------------------------------------------------------------------------

test("identiti produksi dikenali dengan padanan TEPAT", () => {
  assert.equal(classifyProject(PRODUCTION_PROJECT_ID), "PRODUCTION");
  // Hampir-padanan BUKAN produksi. Ia tidak dikenali.
  for (const near of [
    "makanmana-c59f",
    "makanmana-c59f3-staging",
    "Makanmana-C59F3",
    " makanmana-c59f3",
  ]) {
    assert.equal(classifyProject(near), "UNKNOWN", near);
  }
});

test("QA emulator tempatan dikenali melalui awalan yang dijamin-platform", () => {
  assert.equal(classifyProject(APPROVED_QA_PROJECT_ID), "LOCAL_EMULATOR_QA");
  assert.equal(classifyProject("demo-apa-apa"), "LOCAL_EMULATOR_QA");
});

test("nama yang MENGANDUNGI qa atau test BUKAN QA", () => {
  // Kegagalan yang ditakuti: satu projek dilayan sebagai QA kerana namanya
  // kelihatan seperti QA, lalu dibenarkan melakukan perkara QA terhadap data
  // sebenar — atau lebih teruk, dianggap tidak berbahaya.
  for (const name of [
    "makanmana-qa",
    "qa-makanmana",
    "makanmana-test",
    "test-project",
    "makanmana-staging",
    "makanmana-prod",
  ]) {
    assert.equal(classifyProject(name), "UNKNOWN", name);
  }
});

test("identiti yang hilang ialah UNKNOWN", () => {
  assert.equal(classifyProject(null), "UNKNOWN");
  assert.equal(classifyProject(""), "UNKNOWN");
});

test("REAL_QA TIDAK dapat dicapai sehingga ID diluluskan dikonfigurasikan", () => {
  // Pemilik meluluskan pendekatan itu; projek belum wujud.
  assert.equal(APPROVED_REAL_QA_PROJECT_ID, null);
  assert.equal(classifyProject(DUMMY_REAL_QA), "UNKNOWN");
});

test("REAL_QA dikenali apabila ID diluluskan DIKONFIGURASIKAN", () => {
  assert.equal(classifyProject(DUMMY_REAL_QA, DUMMY_REAL_QA), "REAL_QA");
  // Projek lain masih tidak dikenali walaupun satu telah dikonfigurasikan.
  assert.equal(classifyProject("makanmana-qa", DUMMY_REAL_QA), "UNKNOWN");
});

// ---------------------------------------------------------------------------
// Sumber identiti persekitaran
// ---------------------------------------------------------------------------

test("sumber tunggal dibaca; sumber yang BERSETUJU bukan percanggahan", () => {
  const one = readEgressEnvironment({
    GCLOUD_PROJECT: PRODUCTION_PROJECT_ID,
  } as NodeJS.ProcessEnv);
  assert.equal(one.projectId, PRODUCTION_PROJECT_ID);
  assert.equal(one.conflict, null);

  const agreeing = readEgressEnvironment({
    GCLOUD_PROJECT: PRODUCTION_PROJECT_ID,
    GCP_PROJECT: PRODUCTION_PROJECT_ID,
    FIREBASE_CONFIG: JSON.stringify({projectId: PRODUCTION_PROJECT_ID}),
  } as NodeJS.ProcessEnv);
  assert.equal(agreeing.projectId, PRODUCTION_PROJECT_ID);
  assert.equal(agreeing.conflict, null);
});

test("sumber yang TIDAK BERSETUJU menghasilkan percanggahan, bukan keutamaan", () => {
  // Tingkah laku lama memilih GCLOUD_PROJECT dan mengabaikan bukti
  // bertentangan. Persekitaran yang tidak koheren tidak boleh dipercayai.
  const conflicted = readEgressEnvironment({
    GCLOUD_PROJECT: PRODUCTION_PROJECT_ID,
    GCP_PROJECT: APPROVED_QA_PROJECT_ID,
  } as NodeJS.ProcessEnv);
  assert.equal(conflicted.projectId, null);
  assert.match(conflicted.conflict ?? "", /tidak bersetuju/);
  assert.match(conflicted.conflict ?? "", /GCLOUD_PROJECT/);
  assert.match(conflicted.conflict ?? "", /GCP_PROJECT/);
});

test("FIREBASE_CONFIG yang bercanggah juga menyekat", () => {
  const conflicted = readEgressEnvironment({
    GCLOUD_PROJECT: APPROVED_QA_PROJECT_ID,
    FIREBASE_CONFIG: JSON.stringify({projectId: PRODUCTION_PROJECT_ID}),
    FUNCTIONS_EMULATOR: "true",
  } as NodeJS.ProcessEnv);
  assert.equal(conflicted.projectId, null);
  for (const kind of KINDS) {
    const d = decideEgress({kind, destination: LOOPBACK_MIRROR, env: conflicted});
    assert.equal(d.allowed, false, kind);
    assert.equal(d.projectClass, "UNKNOWN");
  }
});

test("FIREBASE_CONFIG cacat tidak menyumbang identiti", () => {
  const broken = readEgressEnvironment({
    FIREBASE_CONFIG: "{bukan json",
  } as NodeJS.ProcessEnv);
  assert.equal(broken.projectId, null);
  assert.equal(broken.conflict, null);
  assert.equal(decideEgress({kind: "fcm_push", env: broken}).allowed, false);
});

test("persekitaran kosong sepenuhnya gagal tertutup", () => {
  const empty = readEgressEnvironment({} as NodeJS.ProcessEnv);
  assert.equal(empty.projectId, null);
  for (const kind of KINDS) {
    assert.equal(decideEgress({kind, env: empty}).allowed, false, kind);
  }
});

// ---------------------------------------------------------------------------
// Matriks egress penuh
// ---------------------------------------------------------------------------

interface Row {
  label: string;
  env: EgressEnvironment;
  realQa?: string | null;
  expectClass: ProjectClass;
  /** kind -> destination -> dibenarkan */
  expect: Partial<Record<EgressKind, boolean>>;
  destination?: string;
  /** Baris yang sengaja menguji hanya beberapa jenis. */
  focused?: boolean;
}

const MATRIX: Row[] = [
  {
    label: "PRODUKSI di luar emulator",
    env: env(PRODUCTION_PROJECT_ID, false),
    expectClass: "PRODUCTION",
    destination: PROD_MIRROR,
    // Tingkah laku produksi KEKAL untuk setiap operasi.
    expect: all(true),
  },
  {
    label: "PRODUKSI DI DALAM emulator",
    env: env(PRODUCTION_PROJECT_ID, true),
    expectClass: "PRODUCTION",
    destination: PROD_MIRROR,
    expect: all(false),
  },
  {
    label: "QA emulator tempatan, dalam emulator, destinasi gelung-balik",
    env: env(APPROVED_QA_PROJECT_ID, true),
    expectClass: "LOCAL_EMULATOR_QA",
    destination: LOOPBACK_MIRROR,
    // Hanya Control Center mempunyai setara gelung-balik.
    expect: {
      ...all(false),
      control_center_mirror: true,
      control_center_api: true,
    },
  },
  {
    label: "QA emulator tempatan, dalam emulator, destinasi PRODUKSI",
    env: env(APPROVED_QA_PROJECT_ID, true),
    expectClass: "LOCAL_EMULATOR_QA",
    destination: PROD_MIRROR,
    expect: all(false),
  },
  {
    label: "QA emulator tempatan DI LUAR emulator",
    env: env(APPROVED_QA_PROJECT_ID, false),
    expectClass: "LOCAL_EMULATOR_QA",
    destination: LOOPBACK_MIRROR,
    expect: all(false),
  },
  {
    label: "QA SEBENAR, di luar emulator",
    env: env(DUMMY_REAL_QA, false),
    realQa: DUMMY_REAL_QA,
    expectClass: "REAL_QA",
    destination: PROD_MIRROR,
    expect: {
      control_center_mirror: false,
      control_center_api: false,
      fcm_push: true,
      app_store_api: false,
      google_play_api: false,
      google_cloud_api: true,
    },
  },
  {
    label: "QA SEBENAR, di luar emulator, cuba Control Center gelung-balik",
    focused: true,
    env: env(DUMMY_REAL_QA, false),
    realQa: DUMMY_REAL_QA,
    expectClass: "REAL_QA",
    destination: LOOPBACK_MIRROR,
    expect: {control_center_mirror: false, control_center_api: false},
  },
  {
    label: "QA SEBENAR DI DALAM emulator",
    env: env(DUMMY_REAL_QA, true),
    realQa: DUMMY_REAL_QA,
    expectClass: "REAL_QA",
    destination: LOOPBACK_MIRROR,
    expect: all(false),
  },
  {
    label: "projek tidak dikenali di luar emulator",
    env: env("makanmana-prod", false),
    expectClass: "UNKNOWN",
    destination: PROD_MIRROR,
    expect: all(false),
  },
  {
    label: "projek tidak dikenali dalam emulator",
    env: env("some-other-project", true),
    expectClass: "UNKNOWN",
    destination: LOOPBACK_MIRROR,
    expect: all(false),
  },
  {
    label: "identiti hilang",
    env: env(null, false),
    expectClass: "UNKNOWN",
    destination: PROD_MIRROR,
    expect: all(false),
  },
];

for (const row of MATRIX) {
  test(`matriks: ${row.label}`, () => {
    for (const [kind, allowed] of Object.entries(row.expect)) {
      const decision = decideEgress({
        kind: kind as EgressKind,
        destination: row.destination,
        env: row.env,
        approvedRealQaProjectId: row.realQa,
      });
      assert.equal(
        decision.allowed,
        allowed,
        `${row.label} / ${kind}: ${decision.reason}`,
      );
      assert.equal(decision.projectClass, row.expectClass, row.label);
    }
  });
}

test("matriks meliputi SETIAP jenis egress untuk setiap klasifikasi", () => {
  // Jenis baharu yang ditambah kepada EgressKind tanpa jangkaan matriks akan
  // jatuh melalui tanpa diuji. Setiap baris penuh mesti menamakan setiap jenis.
  for (const row of MATRIX) {
    if (row.focused) continue;
    for (const kind of KINDS) {
      assert.ok(kind in row.expect, `${row.label}: tiada jangkaan untuk ${kind}`);
    }
  }
});

test("setiap klasifikasi mempunyai sekurang-kurangnya satu baris matriks PENUH", () => {
  for (const cls of ["PRODUCTION", "LOCAL_EMULATOR_QA", "REAL_QA", "UNKNOWN"] as ProjectClass[]) {
    assert.ok(
      MATRIX.some((r) => r.expectClass === cls && !r.focused),
      `kelas ${cls} hanya diliputi oleh baris fokus`,
    );
  }
});

test("API kedai (Apple, Google Play) hanya dibenarkan dalam produksi tulen", () => {
  for (const kind of ["app_store_api", "google_play_api"] as EgressKind[]) {
    for (const row of MATRIX) {
      if (!(kind in row.expect)) continue;
      const expected = row.expectClass === "PRODUCTION" && !row.env.inEmulator;
      assert.equal(row.expect[kind], expected, `${row.label} / ${kind}`);
    }
  }
});

test("matriks meliputi setiap klasifikasi", () => {
  // Matriks yang kehilangan satu kelas akan lulus sambil meninggalkan laluan
  // itu tidak diuji sepenuhnya.
  const covered = new Set(MATRIX.map((r) => r.expectClass));
  for (const cls of [
    "PRODUCTION",
    "LOCAL_EMULATOR_QA",
    "REAL_QA",
    "UNKNOWN",
  ] as ProjectClass[]) {
    assert.ok(covered.has(cls), `kelas ${cls} tidak diliputi`);
  }
});

// ---------------------------------------------------------------------------
// Invarian
// ---------------------------------------------------------------------------

test("kredensial tidak pernah mengatasi keputusan yang ditolak", () => {
  // Pagar membuat keputusan daripada identiti dan mod SAHAJA. Membekalkan
  // rahsia — sah, palsu atau tiada — tidak mengubah apa-apa.
  const blocked = env(APPROVED_QA_PROJECT_ID, true);
  const secretShapes = [
    {},
    {CONTROL_CENTER_SYNC_SECRET: "rahsia-palsu-boleh-buang"},
    {CONTROL_CENTER_SYNC_SECRET: ""},
    {APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----palsu"},
  ];
  for (const shape of secretShapes) {
    Object.assign(process.env, shape);
    const d = decideEgress({
      kind: "fcm_push",
      destination: LOOPBACK_MIRROR,
      env: blocked,
    });
    assert.equal(d.allowed, false, JSON.stringify(Object.keys(shape)));
    for (const key of Object.keys(shape)) delete process.env[key];
  }
});

test("diagnostik tidak pernah membawa kandungan rahsia", () => {
  process.env.CONTROL_CENTER_SYNC_SECRET = "SUPER-RAHSIA-JANGAN-BOCOR";
  try {
    for (const row of MATRIX) {
      for (const kind of KINDS) {
        const d = decideEgress({
          kind,
          destination: row.destination,
          env: row.env,
          approvedRealQaProjectId: row.realQa,
        });
        assert.ok(!d.reason.includes("SUPER-RAHSIA"), d.reason);
        assert.ok(!d.reason.includes("BEGIN PRIVATE KEY"), d.reason);
      }
    }
  } finally {
    delete process.env.CONTROL_CENTER_SYNC_SECRET;
  }
});

test("destinasi luar tidak dikenali tidak pernah membuka cermin QA", () => {
  const qa = env(APPROVED_QA_PROJECT_ID, true);
  for (const destination of [
    "https://evil.example.com/api/internal/sync/mirror",
    "http://127.0.0.1.evil.com/mirror",
    "http://localhost.evil.com/mirror",
    "file:///etc/passwd",
    "",
    "bukan-url",
  ]) {
    const d = decideEgress({kind: "control_center_mirror", destination, env: qa});
    assert.equal(d.allowed, false, destination);
  }
});

test("setiap kelas bukan-produksi menyekat Control Center produksi", () => {
  const rows: Array<[EgressEnvironment, string | null]> = [
    [env(APPROVED_QA_PROJECT_ID, true), null],
    [env(DUMMY_REAL_QA, false), DUMMY_REAL_QA],
    [env("makanmana-prod", false), null],
    [env(null, false), null],
  ];
  for (const [environment, realQa] of rows) {
    const d = decideEgress({
      kind: "control_center_mirror",
      destination: PROD_MIRROR,
      env: environment,
      approvedRealQaProjectId: realQa,
    });
    assert.equal(d.allowed, false, `${environment.projectId}`);
  }
});

test("Apple API disekat di mana-mana kecuali produksi tulen", () => {
  const nonProduction: Array<[EgressEnvironment, string | null]> = [
    [env(APPROVED_QA_PROJECT_ID, true), null],
    [env(DUMMY_REAL_QA, false), DUMMY_REAL_QA],
    [env(PRODUCTION_PROJECT_ID, true), null],
    [env("makanmana-prod", false), null],
    [env(null, true), null],
  ];
  for (const [environment, realQa] of nonProduction) {
    const d = decideEgress({
      kind: "app_store_api",
      env: environment,
      approvedRealQaProjectId: realQa,
    });
    assert.equal(d.allowed, false, `${environment.projectId}`);
  }
  assert.equal(
    decideEgress({kind: "app_store_api", env: env(PRODUCTION_PROJECT_ID, false)})
      .allowed,
    true,
  );
});

test("tiada bendera meluluskan semua egress sekaligus", () => {
  // Bendera ALLOW_EXTERNAL_REQUESTS akan memusnahkan keseluruhan matriks.
  process.env.ALLOW_EXTERNAL_REQUESTS = "true";
  process.env.MM_ALLOW_EGRESS = "1";
  try {
    const qa = env(APPROVED_QA_PROJECT_ID, true);
    for (const kind of ["fcm_push", "app_store_api"] as EgressKind[]) {
      assert.equal(decideEgress({kind, env: qa}).allowed, false, kind);
    }
  } finally {
    delete process.env.ALLOW_EXTERNAL_REQUESTS;
    delete process.env.MM_ALLOW_EGRESS;
  }
});
