import {strict as assert} from "node:assert";
import {readdirSync, readFileSync, statSync} from "node:fs";
import {join, relative, resolve} from "node:path";
import {test} from "node:test";

/**
 * WAVE 3C — sapuan egress SELURUH backend.
 *
 * MENGAPA INI WUJUD
 * -----------------
 * Ujian penguatkuasaan sebelum ini menyemak EMPAT fail yang dipilih dengan
 * tangan. Ia hanya tahu apa yang diberitahu, jadi apabila laporan Wave 3C
 * mula-mula mendakwa "matriks egress lengkap", sembilan tapak Control Center
 * dan tiga tapak API Google masih keluar TANPA pagar — dilindungi hanya oleh
 * rahsia yang kebetulan tiada, iaitu tepat pola yang pagar itu dicipta untuk
 * hapuskan.
 *
 * Ujian ini tidak diberitahu apa-apa. Ia membaca setiap fail sumber, mencari
 * setiap primitif egress, dan menuntut setiap satu didahului oleh keputusan
 * pagar yang DIKUATKUASAKAN. Tapak egress baharu yang ditambah tanpa pagar
 * akan menggagalkan suite ini, di mana-mana ia ditambah.
 */

const SRC = resolve(process.cwd(), "src");

/** Primitif yang meninggalkan proses. */
const TRANSPORTS: RegExp[] = [
  // `fetch(` global — bukan kaedah (`client.fetch(`) dan bukan pengecam lain.
  /(?<![.\w])fetch\(/g,
  // Admin SDK FCM.
  /admin\.messaging\(\)\s*\.\s*(?:send|sendEach|sendEachForMulticast|sendMulticast|sendToDevice|sendToTopic)\(/g,
  /getMessaging\(\)/g,
];

/**
 * Padanan yang BUKAN egress. Setiap satu mesti dijustifikasikan.
 *
 * Tandatangan kaedah antara muka `fetch(subscriptionKey: string)` dalam
 * penyelaras bil ialah klien yang DISUNTIK, bukan panggilan HTTP.
 */
function isDeclaration(line: string): boolean {
  return /^\s*fetch\(\w+:\s/.test(line);
}

const GUARD = /decideEgress\(/g;

interface Site {
  file: string;
  line: number;
  text: string;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__") continue;
      out.push(...walk(full));
    } else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function scan(): {sites: Site[]; unguarded: Site[]; unenforced: Site[]} {
  const sites: Site[] = [];
  const unguarded: Site[] = [];
  const unenforced: Site[] = [];

  for (const full of walk(SRC)) {
    const file = relative(process.cwd(), full).replace(/\\/g, "/");
    if (file.endsWith("domain/security/egressGuard.ts")) continue;
    const text = readFileSync(full, "utf8").replace(/\r\n/g, "\n");
    const lines = text.split("\n");

    type Event = {index: number; kind: "guard" | "transport"};
    const events: Event[] = [];
    for (const pattern of TRANSPORTS) {
      for (const m of text.matchAll(pattern)) {
        const line = lines[lineOf(text, m.index ?? 0) - 1];
        if (isDeclaration(line)) continue;
        events.push({index: m.index ?? 0, kind: "transport"});
      }
    }
    for (const m of text.matchAll(GUARD)) {
      events.push({index: m.index ?? 0, kind: "guard"});
    }
    events.sort((a, b) => a.index - b.index);

    // Setiap tapak egress mesti mempunyai pagarnya SENDIRI: pagar yang dinilai
    // antara tapak sebelumnya dan tapak ini. Satu pagar tidak boleh melindungi
    // dua penghantaran.
    let pendingGuard: number | null = null;
    for (const event of events) {
      if (event.kind === "guard") {
        pendingGuard = event.index;
        continue;
      }
      const line = lineOf(text, event.index);
      const site = {file, line, text: lines[line - 1].trim()};
      sites.push(site);
      if (pendingGuard === null) {
        unguarded.push(site);
        continue;
      }
      // Keputusan yang dikira tetapi tidak dikuatkuasakan tidak melindungi
      // apa-apa.
      const between = text.slice(pendingGuard, event.index);
      if (!/\.allowed\b/.test(between)) unenforced.push(site);
      pendingGuard = null;
    }
  }
  return {sites, unguarded, unenforced};
}

const fmt = (s: Site) => `${s.file}:${s.line}  ${s.text}`;

test("SETIAP tapak egress dalam backend didahului pagarnya sendiri", () => {
  const {unguarded} = scan();
  assert.deepEqual(
    unguarded.map(fmt),
    [],
    "tapak egress tanpa pagar:\n" + unguarded.map(fmt).join("\n"),
  );
});

test("setiap keputusan pagar DIKUATKUASAKAN sebelum penghantaran", () => {
  const {unenforced} = scan();
  assert.deepEqual(
    unenforced.map(fmt),
    [],
    "pagar dikira tetapi tidak disemak:\n" + unenforced.map(fmt).join("\n"),
  );
});

test("sapuan tidak hampa: ia benar-benar menemui tapak egress", () => {
  // Regex yang rosak akan menemui sifar tapak dan membuat kedua-dua ujian di
  // atas lulus secara senyap. Ini tapak yang wujud apabila sapuan ditulis.
  const {sites} = scan();
  assert.ok(sites.length >= 19, `hanya ${sites.length} tapak ditemui:\n${sites.map(fmt).join("\n")}`);

  const files = new Set(sites.map((s) => s.file));
  for (const expected of [
    "src/controlCenter/mirrorEventPush.ts",
    "src/controlCenter/userMirrorSync.ts",
    "src/controlCenter/subscriptionMirrorSync.ts",
    "src/controlCenter/couponMirrorSync.ts",
    "src/controlCenter/aiBrainSync.ts",
    "src/controlCenter/dataVaultSync.ts",
    "src/controlCenter/placeCoverageSync.ts",
    "src/controlCenter/placeReferenceSync.ts",
    "src/scheduled/notificationBroadcastControlPlane.ts",
    "src/services/merchantBridge.ts",
    "src/services/placesService.ts",
    "src/services/googlePlaySubscriptionService.ts",
    "src/services/appleSubscriptionService.ts",
    "src/services/pushService.ts",
    "src/services/pushDeliveryService.ts",
    "src/callable/scanCalories.ts",
  ]) {
    assert.ok(files.has(expected), `${expected} tidak ditemui oleh sapuan`);
  }
});

test("pengesan menolak tapak tanpa pagar — kawalan negatif", () => {
  // Buktikan logik pasangan itu sendiri menangkap kegagalan, menggunakan teks
  // sintetik dan bukan fail sebenar.
  const unguardedText = [
    "async function push() {",
    "  const response = await fetch(URL, {});",
    "}",
  ].join("\n");
  const enforcedText = [
    "async function push() {",
    "  const egress = decideEgress({kind: \"control_center_api\"});",
    "  if (!egress.allowed) throw new Error(egress.reason);",
    "  const response = await fetch(URL, {});",
    "}",
  ].join("\n");
  const computedOnly = [
    "async function push() {",
    "  const egress = decideEgress({kind: \"control_center_api\"});",
    "  const response = await fetch(URL, {});",
    "}",
  ].join("\n");
  const oneGuardTwoSends = [
    "async function push() {",
    "  const egress = decideEgress({kind: \"fcm_push\"});",
    "  if (!egress.allowed) throw new Error(egress.reason);",
    "  await fetch(A, {});",
    "  await fetch(B, {});",
    "}",
  ].join("\n");

  const judge = (text: string) => {
    const events: Array<{index: number; kind: string}> = [];
    for (const m of text.matchAll(/(?<![.\w])fetch\(/g)) {
      events.push({index: m.index ?? 0, kind: "transport"});
    }
    for (const m of text.matchAll(/decideEgress\(/g)) {
      events.push({index: m.index ?? 0, kind: "guard"});
    }
    events.sort((a, b) => a.index - b.index);
    let pending: number | null = null;
    let bad = 0;
    for (const e of events) {
      if (e.kind === "guard") {
        pending = e.index;
        continue;
      }
      if (pending === null || !/\.allowed\b/.test(text.slice(pending, e.index))) bad++;
      pending = null;
    }
    return bad;
  };

  assert.equal(judge(unguardedText), 1, "tanpa pagar mesti ditangkap");
  assert.equal(judge(enforcedText), 0, "pagar yang dikuatkuasakan mesti lulus");
  assert.equal(judge(computedOnly), 1, "pagar yang tidak disemak mesti ditangkap");
  assert.equal(judge(oneGuardTwoSends), 1, "satu pagar tidak boleh melindungi dua penghantaran");
});

test("tandatangan antara muka bukan egress", () => {
  assert.equal(isDeclaration("  fetch(subscriptionKey: string): Promise<X>;"), true);
  assert.equal(isDeclaration("  const r = await fetch(url, {"), false);
  assert.equal(isDeclaration("  return fetch(url, {"), false);
});
