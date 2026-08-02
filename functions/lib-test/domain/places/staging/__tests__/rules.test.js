"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/**
 * Pengesahan STRUKTUR firestore.rules (bukan ujian rules-as-user langsung —
 * @firebase/rules-unit-testing tidak dipasang; lihat dokumen fasa). Ujian ini
 * membuktikan koleksi staging DINAFIKAN secara eksplisit untuk pengguna biasa
 * dan tingkah laku places_cache sedia ada TIDAK berubah.
 */
const RULES = (0, node_fs_1.readFileSync)((0, node_path_1.resolve)(process.cwd(), "..", "firestore.rules"), "utf8");
function denyBlock(collection) {
    // cari "match /<collection>/{...} { allow read, write: if false; }"
    const re = new RegExp(`match /${collection}/\\{[^}]+\\}\\s*\\{[^}]*allow read, write: if false;`);
    return re.test(RULES);
}
// 25 & 26. Normal user cannot read/write place_staging (deny eksplisit).
(0, node_test_1.default)("place_staging is explicitly denied to normal users", () => {
    strict_1.default.equal(denyBlock("place_staging"), true);
});
// 27. Normal user cannot read source snapshots.
(0, node_test_1.default)("place_source_snapshots is explicitly denied", () => {
    strict_1.default.equal(denyBlock("place_source_snapshots"), true);
});
(0, node_test_1.default)("place_import_batches is explicitly denied", () => {
    strict_1.default.equal(denyBlock("place_import_batches"), true);
});
(0, node_test_1.default)("place_staging audit subcollection is denied", () => {
    strict_1.default.match(RULES, /match \/audit\/\{auditId\}\s*\{\s*allow read, write: if false;/);
});
// 30. Existing places_cache behavior unchanged (read:signedIn, write:false).
(0, node_test_1.default)("places_cache rule remains unchanged", () => {
    strict_1.default.match(RULES, /match \/places_cache\/\{cacheId\}\s*\{\s*allow read: if signedIn\(\);\s*allow write: if false;/);
    strict_1.default.match(RULES, /match \/place_details\/\{placeId\}\s*\{\s*allow read: if signedIn\(\);\s*allow write: if false;/);
});
// Catch-all deny masih wujud (tiada pintasan).
(0, node_test_1.default)("catch-all deny remains present", () => {
    strict_1.default.match(RULES, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
});
