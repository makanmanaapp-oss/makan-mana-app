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
  // Wave 3D: Cloud Storage. Nama baldi EKSPLISIT boleh menamakan projek lain.
  // `getStorage()` DAN `getStorage(app)` — kedua-duanya membina klien Storage.
  /\bgetStorage\(/g,
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

// Pagar sebenar: decideEgress, atau decideStorageAccess (yang membungkusnya).
const GUARD = /\bdecide(?:Egress|StorageAccess)\(/g;

/**
 * Buang komen sebelum mengimbas, dengan panjang dikekalkan supaya nombor baris
 * dan indeks kekal betul. Tanpa ini, komen yang MENYEBUT `decideEgress(`
 * dikira sebagai pagar — komen boleh "memuaskan" sapuan tanpa semakan sebenar.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, lead: string) => lead + " ".repeat(m.length - lead.length));
}

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
    const raw = readFileSync(full, "utf8").replace(/\r\n/g, "\n");
    const lines = raw.split("\n");
    const text = stripComments(raw);

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
  assert.ok(sites.length >= 20, `hanya ${sites.length} tapak ditemui:\n${sites.map(fmt).join("\n")}`);

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
    "src/services/egressTargets.ts",
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

// ---------------------------------------------------------------------------
// WAVE 3D — pagar mesti mengesahkan SASARAN, bukan hanya runtime
// ---------------------------------------------------------------------------

function sourcesMatching(pattern: RegExp): Array<{file: string; text: string}> {
  return walk(SRC)
    .map((full) => ({
      file: relative(process.cwd(), full).replace(/\\/g, "/"),
      text: readFileSync(full, "utf8").replace(/\r\n/g, "\n"),
    }))
    .filter((f) => !f.file.endsWith("domain/security/egressGuard.ts"))
    .filter((f) => pattern.test(f.text));
}

test("setiap pagar FCM membawa projek sasaran klien FCM", () => {
  // Identiti runtime QA tidak mengekang klien FCM: firebase-admin memilih
  // projek sasarannya sendiri (options -> akaun perkhidmatan ->
  // GOOGLE_CLOUD_PROJECT -> ADC).
  const offenders: string[] = [];
  let checked = 0;
  for (const f of sourcesMatching(/kind: "fcm_push"/)) {
    for (const m of f.text.matchAll(/decideEgress\(\{[^}]*kind: "fcm_push"[^}]*\}\)/g)) {
      checked++;
      if (!/targetProjectId: firebaseAdminTargetProject\(\)/.test(m[0])) {
        offenders.push(`${f.file}: ${m[0]}`);
      }
    }
  }
  assert.ok(checked >= 3, `hanya ${checked} pagar FCM ditemui`);
  assert.deepEqual(offenders, []);
});

test("Storage hanya dicapai melalui baldi yang diluluskan", () => {
  // Nama baldi ialah rujukan silang-projek. STORAGE_BUCKET jatuh balik kepada
  // baldi PRODUKSI apabila GROUP_IMAGE_BUCKET tiada.
  const direct = sourcesMatching(/\bgetStorage\(/)
    .map((f) => f.file)
    .filter((file) => file !== "src/services/egressTargets.ts");
  assert.deepEqual(direct, [], "getStorage() dipanggil terus, memintas pagar baldi");

  const helper = readFileSync(resolve(SRC, "services/egressTargets.ts"), "utf8");
  assert.match(helper, /decideStorageAccess\(\{bucket: STORAGE_BUCKET, env: process\.env\}\)/);
  const guard = readFileSync(resolve(SRC, "domain/security/egressGuard.ts"), "utf8");
  const access = guard.slice(guard.indexOf("export function decideStorageAccess"));
  assert.match(access, /kind: "firebase_storage"/);
  assert.match(access, /targetProjectId: projectOfStorageBucket\(bucket\)/);
  assert.match(access, /destination: storageEmulatorDestination\(params\.env\)/);
});

test("Vertex disahkan terhadap projek yang membina URL-nya, sebelum token", () => {
  const text = readFileSync(resolve(SRC, "callable/scanCalories.ts"), "utf8").replace(/\r\n/g, "\n");
  const getProject = text.indexOf("await auth.getProjectId()");
  const guard = text.indexOf('decideEgress({kind: "google_cloud_api", targetProjectId: projectId})');
  const token = text.indexOf("await client.getAccessToken()");
  const url = text.indexOf("${projectId}/locations/");
  assert.ok(getProject > -1 && guard > -1 && token > -1 && url > -1, "tapak Vertex berubah");
  assert.ok(getProject < guard, "sasaran mesti diselesaikan sebelum pagar");
  assert.ok(guard < token, "pagar mesti mendahului pemerolehan token");
  assert.ok(guard < url, "URL mesti dibina daripada projectId yang sama yang disahkan");
});

test("komen yang MENYEBUT pagar tidak dikira sebagai pagar", () => {
  // Wave 3E: satu komen dalam egressTargets.ts pernah menyebut
  // `decideEgress({kind: "firebase_storage", ...})`. Regex pagar yang mentah
  // mengiranya — komen boleh "memuaskan" sapuan tanpa semakan sebenar.
  const faked = [
    "// decideEgress({kind: \"fcm_push\"}); if (!egress.allowed) throw",
    "/* decideEgress({kind: \"fcm_push\"}) egress.allowed */",
    "const r = await fetch(URL, {});",
  ].join("\n");
  const stripped = stripComments(faked);
  assert.equal(stripped.length, faked.length, "panjang mesti dikekalkan untuk nombor baris");
  assert.equal(stripped.split("\n").length, faked.split("\n").length);
  assert.equal(/decideEgress\(/.test(stripped), false, "pagar dalam komen masih kelihatan");
  assert.equal(/\.allowed\b/.test(stripped), false);
  assert.match(stripped, /await fetch\(URL/, "kod sebenar mesti kekal");
  // URL dengan `//` dalam rentetan tidak boleh dikoyak.
  assert.equal(stripComments('const u = "https://x.test/a";'), 'const u = "https://x.test/a";');
});
