// MAKANMANA iOS WAVE 2 — pemetaan akaun ↔ `appAccountToken`.
//
// PEMBETULAN KEPADA WAVE 2 TERHADAP WAVE 1
// ----------------------------------------
// Wave 1 membandingkan `appAccountToken` Apple terus dengan UID Firebase. Itu
// SALAH pada dua kiraan:
//
//   1. Apple menghendaki `appAccountToken` menjadi **UUID** RFC 4122. UID
//      Firebase ialah rentetan alfanumerik ~28 aksara dan BUKAN UUID, jadi
//      StoreKit 2 tidak akan menerimanya dan medan itu tidak akan pernah
//      kembali daripada App Store Server API.
//   2. Laluan Play yang setara tidak pernah menghantar UID mentah — ia
//      menghantar nilai legap milik pelayan (`obfuscatedAccountId`). Menghantar
//      UID mentah kepada gedung mendedahkan pengecam dalaman tanpa sebab.
//
// Kesan gabungan: dengan peraturan gagal-tertutup Wave 1 ("token tiada =
// tidak sepadan"), SETIAP pembelian iOS akan ditolak.
//
// Modul ini memperbaikinya dengan UUIDv5 yang stabil dan boleh diterbitkan
// semula daripada UID, supaya pelayan boleh menyemak pemilikan tanpa menyimpan
// apa-apa tambahan dan tanpa mempercayai klien.

import {createHash} from "node:crypto";

/**
 * Ruang nama UUID MakanMana untuk token akaun App Store.
 *
 * Ini BUKAN rahsia — ia pemalar ruang nama, sama seperti ruang nama DNS/URL
 * dalam RFC 4122. Mengubahnya akan memutuskan setiap pengikatan sedia ada.
 */
export const MAKANMANA_APPLE_NAMESPACE = "6b2f1c34-9e71-4f0a-b3d5-2c8e7a41d905";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Adakah rentetan ini UUID yang berbentuk betul. */
export function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * UUIDv5 RFC 4122 (SHA-1 atas ruang nama + nama).
 *
 * Deterministik: UID yang sama sentiasa menghasilkan token yang sama, jadi
 * pemulihan pembelian dan akses merentas peranti berfungsi tanpa keadaan
 * tambahan. Satu arah: token tidak mendedahkan UID.
 */
export function uuidV5(namespaceUuid: string, name: string): string {
  if (!isUuid(namespaceUuid)) {
    throw new Error("ruang nama mesti UUID");
  }
  const hash = createHash("sha1")
    .update(uuidToBytes(namespaceUuid))
    .update(Buffer.from(name, "utf8"))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  // Versi 5 dan varian RFC 4122 — tanpa ini ia bukan UUID yang sah.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

/**
 * Token akaun App Store untuk satu UID.
 *
 * Klien menerima nilai ini daripada pelayan sebelum pembelian dan
 * menyerahkannya sebagai `appAccountToken`. Pelayan kemudian mengira semula
 * nilai yang sama semasa pengesahan, jadi tiada apa-apa yang dihantar klien
 * boleh mengaku sebagai akaun lain.
 */
export function appleAccountTokenFor(uid: string): string {
  const trimmed = uid.trim();
  if (trimmed.length === 0) throw new Error("uid kosong");
  return uuidV5(MAKANMANA_APPLE_NAMESPACE, `mm_apple_account_v1:${trimmed}`);
}

/**
 * Adakah token yang dibentangkan Apple milik UID ini.
 *
 * Perbandingan tidak peka huruf kerana Apple menormalkan UUID kepada huruf
 * kecil. Token yang TIADA dikira TIDAK SEPADAN — resit tanpa pengikatan tidak
 * boleh dibuktikan milik sesiapa, dan meneka akan memberi akses berbayar
 * kepada orang yang salah.
 */
export function appleTokenBelongsTo(
  presentedToken: unknown,
  uid: string,
): boolean {
  if (!isUuid(presentedToken)) return false;
  if (uid.trim().length === 0) return false;
  return (
    (presentedToken as string).toLowerCase() ===
    appleAccountTokenFor(uid).toLowerCase()
  );
}
