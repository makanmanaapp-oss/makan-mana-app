import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";

import {
  APPROVED_QA_PROJECT_ID,
  decideEgress,
  type EgressEnvironment,
} from "../egressGuard";

/**
 * Penguatkuasaan, bukan sekadar keputusan.
 *
 * Bahagian pertama menjalankan corak tapak panggilan terhadap pengangkutan
 * PALSU — tiada HTTP sebenar, tiada FCM sebenar, tiada perkhidmatan produksi
 * dihubungi. Bahagian kedua membaca fail perkhidmatan SEBENAR dan menegaskan
 * pagar itu benar-benar mendahului pengangkutan, supaya ujian ini tidak boleh
 * lulus sementara kod sebenar tidak berpagar.
 */

const PROD_MIRROR =
  "https://makanmana-control-center.vercel.app/api/internal/sync/mirror";
const LOOPBACK_MIRROR = "http://127.0.0.1:3000/api/internal/sync/mirror";

const QA: EgressEnvironment = {projectId: APPROVED_QA_PROJECT_ID, inEmulator: true};
const PROD: EgressEnvironment = {projectId: "makanmana-prod", inEmulator: false};

/** Pengangkutan HTTP palsu — merekod panggilan, tidak pernah keluar. */
function fakeHttp() {
  const calls: string[] = [];
  return {
    calls,
    send(destination: string, env: EgressEnvironment) {
      const egress = decideEgress({
        kind: "control_center_mirror",
        destination,
        env,
      });
      if (!egress.allowed) throw new Error(egress.reason);
      calls.push(destination);
    },
  };
}

/** Pengangkutan FCM palsu — merekod panggilan, tidak pernah menghantar. */
function fakeFcm() {
  const calls: number[] = [];
  return {
    calls,
    send(count: number, env: EgressEnvironment) {
      const egress = decideEgress({kind: "fcm_push", env});
      if (!egress.allowed) throw new Error(egress.reason);
      calls.push(count);
    },
  };
}

test("QA: pengangkutan HTTP palsu TIDAK PERNAH dipanggil untuk destinasi produksi", () => {
  const http = fakeHttp();
  assert.throws(() => http.send(PROD_MIRROR, QA), /DISEKAT/);
  assert.deepEqual(http.calls, [], "pengangkutan tidak sepatutnya dicapai");
});

test("QA: pengangkutan HTTP palsu dipanggil untuk gelung-balik", () => {
  const http = fakeHttp();
  http.send(LOOPBACK_MIRROR, QA);
  assert.deepEqual(http.calls, [LOOPBACK_MIRROR]);
});

test("PRODUKSI: pengangkutan HTTP palsu dipanggil seperti biasa", () => {
  const http = fakeHttp();
  http.send(PROD_MIRROR, PROD);
  assert.deepEqual(http.calls, [PROD_MIRROR]);
});

test("QA: pengangkutan FCM palsu TIDAK PERNAH dipanggil", () => {
  const fcm = fakeFcm();
  assert.throws(() => fcm.send(3, QA), /fcm_push DISEKAT/);
  assert.deepEqual(fcm.calls, []);
});

test("PRODUKSI: pengangkutan FCM palsu dipanggil seperti biasa", () => {
  const fcm = fakeFcm();
  fcm.send(3, PROD);
  assert.deepEqual(fcm.calls, [3]);
});

/** Baca fail sumber sebenar dari akar pakej `functions`. */
function source(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

test("tapak SEBENAR berpagar: pagar mendahului pengangkutan", () => {
  const cases: Array<{file: string; guard: RegExp; transport: RegExp}> = [
    {
      file: "src/controlCenter/mirrorEventPush.ts",
      guard: /decideEgress\(\{\s*\n?\s*kind: "control_center_mirror"/,
      transport: /await fetch\(CONTROL_CENTER_MIRROR_URL/,
    },
    {
      file: "src/services/pushDeliveryService.ts",
      guard: /decideEgress\(\{kind: "fcm_push"\}\)/,
      transport: /admin\.messaging\(\)\.sendEach\(/,
    },
    {
      file: "src/services/pushService.ts",
      guard: /decideEgress\(\{kind: "fcm_push"\}\)/,
      transport: /admin\.messaging\(\)\.send\(\{/,
    },
    {
      file: "src/services/appleSubscriptionService.ts",
      guard: /decideEgress\(\{kind: "app_store_api"\}\)/,
      transport: /await fetch\(/,
    },
  ];

  for (const c of cases) {
    const text = source(c.file);
    const g = text.search(c.guard);
    const t = text.search(c.transport);
    assert.notEqual(g, -1, `${c.file}: panggilan pagar tidak dijumpai`);
    assert.notEqual(t, -1, `${c.file}: panggilan pengangkutan tidak dijumpai`);
    assert.ok(g < t, `${c.file}: pagar mesti mendahului pengangkutan`);
    assert.match(
      text,
      /if \(!egress\.allowed\) throw new Error\(egress\.reason\)/,
      `${c.file}: keputusan pagar mesti dikuatkuasakan`,
    );
  }
});

test("setiap penghantaran FCM sebenar dilindungi", () => {
  // Kedua-dua `pushToUser` dan `pushToTopic` menghantar; kedua-duanya perlu
  // pagar sendiri. Kira supaya satu tapak baharu tanpa pagar akan gagal.
  const text = source("src/services/pushService.ts");
  const sends = text.match(/admin\.messaging\(\)\.send\(/g) ?? [];
  const guards = text.match(/decideEgress\(\{kind: "fcm_push"\}\)/g) ?? [];
  assert.equal(sends.length, 2, "bilangan tapak penghantaran berubah");
  assert.equal(guards.length, sends.length, "setiap penghantaran perlukan pagar");
});
