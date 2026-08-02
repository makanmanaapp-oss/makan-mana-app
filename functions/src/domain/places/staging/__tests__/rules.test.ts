import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Pengesahan STRUKTUR firestore.rules (bukan ujian rules-as-user langsung —
 * @firebase/rules-unit-testing tidak dipasang; lihat dokumen fasa). Ujian ini
 * membuktikan koleksi staging DINAFIKAN secara eksplisit untuk pengguna biasa
 * dan tingkah laku places_cache sedia ada TIDAK berubah.
 */
const RULES = readFileSync(
  resolve(process.cwd(), "..", "firestore.rules"),
  "utf8",
);

function denyBlock(collection: string): boolean {
  // cari "match /<collection>/{...} { allow read, write: if false; }"
  const re = new RegExp(
    `match /${collection}/\\{[^}]+\\}\\s*\\{[^}]*allow read, write: if false;`,
  );
  return re.test(RULES);
}

// 25 & 26. Normal user cannot read/write place_staging (deny eksplisit).
test("place_staging is explicitly denied to normal users", () => {
  assert.equal(denyBlock("place_staging"), true);
});

// 27. Normal user cannot read source snapshots.
test("place_source_snapshots is explicitly denied", () => {
  assert.equal(denyBlock("place_source_snapshots"), true);
});

test("place_import_batches is explicitly denied", () => {
  assert.equal(denyBlock("place_import_batches"), true);
});

test("place_staging audit subcollection is denied", () => {
  assert.match(RULES, /match \/audit\/\{auditId\}\s*\{\s*allow read, write: if false;/);
});

// 30. Existing places_cache behavior unchanged (read:signedIn, write:false).
test("places_cache rule remains unchanged", () => {
  assert.match(
    RULES,
    /match \/places_cache\/\{cacheId\}\s*\{\s*allow read: if signedIn\(\);\s*allow write: if false;/,
  );
  assert.match(
    RULES,
    /match \/place_details\/\{placeId\}\s*\{\s*allow read: if signedIn\(\);\s*allow write: if false;/,
  );
});

// Catch-all deny masih wujud (tiada pintasan).
test("catch-all deny remains present", () => {
  assert.match(RULES, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
});
