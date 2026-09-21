import {strict as assert} from "node:assert";
import {test} from "node:test";

import {
  MAKANMANA_APPLE_NAMESPACE,
  appleAccountTokenFor,
  appleTokenBelongsTo,
  isUuid,
  uuidV5,
} from "../appleAccountToken";

test("uuidV5 memadankan vektor ujian kanonikal", () => {
  // Vektor UUIDv5 yang paling meluas diterbitkan: ruang nama DNS +
  // "www.example.org". Jika pelaksanaan salah pada bit versi, varian, susunan
  // bait atau input SHA-1, nilai ini TIDAK akan sepadan.
  //
  // Hanya SATU vektor digunakan, dan ia yang boleh disahkan. Menambah vektor
  // kedua daripada ingatan ialah bagaimana ujian menjadi salah dengan yakin.
  const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  assert.equal(
    uuidV5(DNS_NAMESPACE, "www.example.org"),
    "74738ff5-5367-5958-9aee-98fffdcd1876",
  );
});

test("uuidV5 menetapkan bit versi dan varian", () => {
  const u = uuidV5(MAKANMANA_APPLE_NAMESPACE, "apa-apa");
  assert.equal(isUuid(u), true);
  // Digit pertama kumpulan ketiga ialah versi; mesti 5.
  assert.equal(u.split("-")[2][0], "5");
  // Digit pertama kumpulan keempat ialah varian; mesti 8, 9, a atau b.
  assert.match(u.split("-")[3][0], /^[89ab]$/);
});

test("uuidV5 menolak ruang nama yang bukan UUID", () => {
  assert.throws(() => uuidV5("bukan-uuid", "x"), /ruang nama/);
});

test("isUuid menerima hanya bentuk RFC yang betul", () => {
  assert.equal(isUuid("6b2f1c34-9e71-4f0a-b3d5-2c8e7a41d905"), true);
  assert.equal(isUuid("6B2F1C34-9E71-4F0A-B3D5-2C8E7A41D905"), true);
  // Ini yang Wave 1 cuba gunakan — UID Firebase. BUKAN UUID.
  assert.equal(isUuid("mPDs8kQx2aYbN7vZ1cRt3eUw9oIl"), false);
  // Ini `obfuscatedAccountId` Play — 32 hex, juga BUKAN UUID.
  assert.equal(isUuid("a".repeat(32)), false);
  assert.equal(isUuid(""), false);
  assert.equal(isUuid(null), false);
  assert.equal(isUuid(12345), false);
  assert.equal(isUuid("6b2f1c34-9e71-4f0a-b3d5-2c8e7a41d90"), false);
});

test("token akaun stabil dan berbeza mengikut uid", () => {
  const a = appleAccountTokenFor("uid-abc");
  const b = appleAccountTokenFor("uid-abc");
  const c = appleAccountTokenFor("uid-lain");
  assert.equal(a, b, "mesti deterministik — pemulihan bergantung padanya");
  assert.notEqual(a, c);
  assert.equal(isUuid(a), true, "mesti UUID sah atau Apple menolaknya");
});

test("token akaun tidak mendedahkan uid", () => {
  const uid = "mPDs8kQx2aYbN7vZ1cRt3eUw9oIl";
  const token = appleAccountTokenFor(uid);
  assert.equal(token.includes(uid), false);
  assert.equal(token.toLowerCase().includes(uid.toLowerCase()), false);
});

test("uid kosong ditolak", () => {
  assert.throws(() => appleAccountTokenFor(""), /uid kosong/);
  assert.throws(() => appleAccountTokenFor("   "), /uid kosong/);
});

test("pemilikan: hanya token terbitan yang sepadan", () => {
  const uid = "uid-abc";
  const token = appleAccountTokenFor(uid);

  assert.equal(appleTokenBelongsTo(token, uid), true);
  assert.equal(appleTokenBelongsTo(token.toUpperCase(), uid), true);
  assert.equal(appleTokenBelongsTo(token, "uid-lain"), false);

  // REGRESI WAVE 1: UID mentah tidak boleh diterima lagi.
  assert.equal(appleTokenBelongsTo(uid, uid), false);

  // Ketiadaan dan sampah ialah gagal-tertutup.
  assert.equal(appleTokenBelongsTo(null, uid), false);
  assert.equal(appleTokenBelongsTo(undefined, uid), false);
  assert.equal(appleTokenBelongsTo("", uid), false);
  assert.equal(appleTokenBelongsTo("bukan-uuid", uid), false);
  assert.equal(appleTokenBelongsTo(token, ""), false);
});

test("token akaun pengguna lain tidak boleh menuntut akaun ini", () => {
  const mine = appleAccountTokenFor("uid-saya");
  assert.equal(appleTokenBelongsTo(mine, "uid-anda"), false);
});
