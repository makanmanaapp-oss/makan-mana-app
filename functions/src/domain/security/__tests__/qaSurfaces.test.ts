import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";

import {DUMMY_PLACES} from "../../../data/dummyPlaces";
import {APPROVED_QA_PROJECT_ID, PRODUCTION_PROJECT_ID} from "../egressGuard";
import {
  PRODUCTION_INVITE_BASE_URL,
  SYNTHETIC_NAME_PREFIX,
  SYNTHETIC_PLACE_ID_PREFIX,
  buildSyntheticPlaces,
  decideInviteBaseUrl,
  decideSyntheticPlaces,
} from "../qaSurfaces";

/**
 * WAVE 3E — URL jemputan QA dan data tempat sintetik untuk QA Explore.
 * Semua fikstur ialah objek persekitaran pakai-buang.
 */

const QA = "makanmana-qa-dummy-for-tests";
const PROD_ENV = {
  GCLOUD_PROJECT: PRODUCTION_PROJECT_ID,
  FIREBASE_CONFIG: JSON.stringify({projectId: PRODUCTION_PROJECT_ID}),
};
const REAL_QA_ENV = {GCLOUD_PROJECT: QA, FIREBASE_CONFIG: JSON.stringify({projectId: QA})};
const EMULATOR_QA_ENV = {
  FUNCTIONS_EMULATOR: "true",
  GCLOUD_PROJECT: APPROVED_QA_PROJECT_ID,
  FIREBASE_CONFIG: JSON.stringify({projectId: APPROVED_QA_PROJECT_ID}),
};

function invite(env: Record<string, string>) {
  return decideInviteBaseUrl({env: env as NodeJS.ProcessEnv, approvedRealQaProjectId: QA});
}
function synthetic(env: Record<string, string>, realQa: string | null = QA) {
  return decideSyntheticPlaces({env: env as NodeJS.ProcessEnv, approvedRealQaProjectId: realQa});
}

// ---------------------------------------------------------------------------
// URL jemputan
// ---------------------------------------------------------------------------

test("produksi tanpa konfigurasi: domain lalai SAMA-BAIT seperti sebelum ini", () => {
  const d = invite(PROD_ENV);
  assert.equal(d.ok, true);
  assert.equal(d.ok && d.baseUrl, "https://makanmana-c59f3.web.app");
  assert.equal(PRODUCTION_INVITE_BASE_URL, "https://makanmana-c59f3.web.app");
});

test("produksi dengan domain tersuai https: dihormati", () => {
  const d = invite({...PROD_ENV, INVITE_BASE_URL: "https://makanmana.example/"});
  assert.equal(d.ok && d.baseUrl, "https://makanmana.example");
});

test("jemputan QA dengan URL HILANG -> dilumpuhkan, bukan URL produksi", () => {
  for (const env of [REAL_QA_ENV, EMULATOR_QA_ENV, {...PROD_ENV, FUNCTIONS_EMULATOR: "true"}]) {
    const d = invite(env);
    assert.equal(d.ok, false, JSON.stringify(env));
    assert.match(!d.ok ? d.reason : "", /tidak dikonfigurasikan/);
  }
});

test("jemputan QA yang menunjuk ke PRODUKSI -> dilumpuhkan", () => {
  for (const url of [
    "https://makanmana-c59f3.web.app",
    "https://makanmana-c59f3.web.app/",
    "https://MAKANMANA-C59F3.WEB.APP",
    "https://makanmana-c59f3.firebaseapp.com",
  ]) {
    for (const env of [REAL_QA_ENV, EMULATOR_QA_ENV]) {
      const d = invite({...env, INVITE_BASE_URL: url});
      assert.equal(d.ok, false, `${url} / ${env.GCLOUD_PROJECT}`);
      assert.match(!d.ok ? d.reason : "", /Hosting PRODUKSI/);
    }
  }
});

test("jemputan QA dengan URL QA yang dikonfigurasikan -> dibenarkan, dinormalkan", () => {
  const d = invite({...REAL_QA_ENV, INVITE_BASE_URL: "https://qa.contoh.invalid/"});
  assert.equal(d.ok && d.baseUrl, "https://qa.contoh.invalid");
});

test("http gelung-balik HANYA dalam QA emulator", () => {
  assert.equal(invite({...EMULATOR_QA_ENV, INVITE_BASE_URL: "http://127.0.0.1:5000"}).ok, true);
  assert.equal(invite({...REAL_QA_ENV, INVITE_BASE_URL: "http://127.0.0.1:5000"}).ok, false);
  assert.equal(invite({...EMULATOR_QA_ENV, INVITE_BASE_URL: "http://qa.contoh.invalid"}).ok, false);
});

test("URL tidak sah, query atau fragmen -> dilumpuhkan", () => {
  for (const url of ["bukan-url", "https://qa.contoh.invalid/?x=1", "https://qa.contoh.invalid/#a", "ftp://qa.contoh.invalid"]) {
    assert.equal(invite({...REAL_QA_ENV, INVITE_BASE_URL: url}).ok, false, url);
  }
});

test("identiti tidak dikenali atau bercanggah -> dilumpuhkan", () => {
  assert.equal(invite({GCLOUD_PROJECT: "projek-lain", INVITE_BASE_URL: "https://x.invalid"}).ok, false);
  assert.equal(invite({}).ok, false);
  assert.equal(invite({GCLOUD_PROJECT: PRODUCTION_PROJECT_ID, GOOGLE_CLOUD_PROJECT: QA}).ok, false);
});

// ---------------------------------------------------------------------------
// Data tempat sintetik
// ---------------------------------------------------------------------------

const FLAG = {MM_QA_SYNTHETIC_PLACES: "enabled"};

test("tanpa bendera: TIDAK aktif di mana-mana", () => {
  for (const env of [PROD_ENV, REAL_QA_ENV, EMULATOR_QA_ENV]) {
    assert.equal(synthetic(env).active, false);
  }
});

test("bendera dalam PRODUKSI DIABAIKAN — tiada sandaran produksi", () => {
  const d = synthetic({...PROD_ENV, ...FLAG});
  assert.equal(d.active, false);
  assert.match(d.reason, /DIABAIKAN dalam PRODUCTION/);
});

test("bendera dengan identiti bercanggah atau tidak dikenali -> tidak aktif", () => {
  assert.equal(synthetic({...FLAG, GCLOUD_PROJECT: QA, GOOGLE_CLOUD_PROJECT: PRODUCTION_PROJECT_ID}).active, false);
  assert.equal(synthetic({...FLAG, GCLOUD_PROJECT: "projek-lain"}).active, false);
  assert.equal(synthetic({...FLAG}).active, false);
});

test("bendera + QA emulator DI DALAM emulator -> aktif; di luar -> tidak", () => {
  assert.equal(synthetic({...EMULATOR_QA_ENV, ...FLAG}).active, true);
  const {FUNCTIONS_EMULATOR: _drop, ...outside} = EMULATOR_QA_ENV;
  void _drop;
  assert.equal(synthetic({...outside, ...FLAG}).active, false);
});

test("bendera + REAL_QA -> aktif; REAL_QA yang belum diumpukkan -> tidak", () => {
  assert.equal(synthetic({...REAL_QA_ENV, ...FLAG}).active, true);
  assert.equal(synthetic({...REAL_QA_ENV, ...FLAG}, null).active, false);
});

test("hanya nilai TEPAT 'enabled' mengaktifkan", () => {
  for (const value of ["true", "1", "yes", "ENABLED", " enabled-x", ""]) {
    assert.equal(synthetic({...REAL_QA_ENV, MM_QA_SYNTHETIC_PLACES: value}).active, false, value);
  }
});

test("setiap tempat sintetik dikenal pasti dalam nama, alamat dan placeId", () => {
  const places = buildSyntheticPlaces({lat: 3.139, lng: 101.6869});
  assert.ok(places.length > 0);
  for (const p of places) {
    assert.ok(p.name.startsWith(SYNTHETIC_NAME_PREFIX), p.name);
    assert.ok(p.address.startsWith(SYNTHETIC_NAME_PREFIX), p.address);
    assert.ok(p.placeId.startsWith(SYNTHETIC_PLACE_ID_PREFIX), p.placeId);
    assert.equal(p.photoUrl, null, "tiada foto sebenar");
  }
});

test("tiada nama tempat sebenar atau DUMMY_PLACES dalam data sintetik", () => {
  const dummyNames = new Set(DUMMY_PLACES.map((p) => p.name));
  for (const p of buildSyntheticPlaces({lat: 1, lng: 1, count: 20})) {
    assert.equal(dummyNames.has(p.name), false);
  }
});

test("data sintetik deterministik dan dibatasi", () => {
  const a = buildSyntheticPlaces({lat: 3.1, lng: 101.6});
  const b = buildSyntheticPlaces({lat: 3.1, lng: 101.6});
  assert.deepEqual(a, b);
  assert.equal(buildSyntheticPlaces({lat: 0, lng: 0, count: 500}).length, 20);
  assert.equal(buildSyntheticPlaces({lat: 0, lng: 0, count: 0}).length, 1);
  assert.equal(new Set(a.map((p) => p.placeId)).size, a.length, "placeId unik");
  for (const p of a) {
    assert.ok(Math.abs((p.lat ?? 0) - 3.1) < 0.01 && Math.abs((p.lng ?? 0) - 101.6) < 0.01);
    assert.ok(p.distanceKm < 1.5);
  }
});

// ---------------------------------------------------------------------------
// Pendawaian
// ---------------------------------------------------------------------------

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
}

test("Explore menyemak sintetik SEBELUM sebarang laluan Places", () => {
  const src = source("src/callable/getNearbyPlaces.ts");
  const decide = src.indexOf("decideSyntheticPlaces({env: process.env})");
  const firstPlaces = src.search(/await (searchNearby|getAreaCandidatePool|getExpandedPool)\(/);
  assert.ok(decide > -1 && firstPlaces > -1);
  assert.ok(decide < firstPlaces, "sintetik mesti diputuskan sebelum Places dipanggil");
  assert.match(src, /source = "qa_synthetic";/);
});

test("URL jemputan diputuskan SEBELUM token dicipta; tiada sandaran produksi berkod-keras", () => {
  const src = source("src/callable/groupInviteLinkControl.ts");
  const decide = src.indexOf("decideInviteBaseUrl({env: process.env})");
  const create = src.indexOf("core.createGroupInviteLink(");
  assert.ok(decide > -1 && create > -1 && decide < create);
  assert.equal(/\?\?\s*"https:\/\/makanmana-c59f3\.web\.app"/.test(src), false);
  assert.match(src, /"invite_url_not_configured"/);
});
