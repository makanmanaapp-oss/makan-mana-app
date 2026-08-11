// Front Page Redesign 1 — ujian rules Notification Center (Emulator Suite).
// Jalankan: firebase emulators:exec --only firestore \
//   "node rules_test/notifications_test.mjs"
//
// Membuktikan: pengguna hanya boleh BACA notifikasi sendiri; hanya boleh
// KEMAS KINI keadaan-baca (isRead/readAt); TIDAK boleh CIPTA (elak fabrikasi
// + kiraan belum-baca palsu); TIDAK boleh PADAM; dan TIDAK boleh membaca
// notifikasi pengguna lain (elak bocor merentas akaun).
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}: ${e.message?.slice(0, 140)}`); }
}

const env = await initializeTestEnvironment({
  projectId: 'makanmana-notif-rules-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
});

// ---- benih data melalui laluan server (rules dimatikan) ----
// Notifikasi hanya boleh dicipta oleh server/Admin SDK, jadi kita benih di sini.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', 'alice', 'notifications', 'n1'), {
    id: 'n1', type: 'food_suggestion', title: 'Cuba nasi lemak',
    body: 'Pilihan AI untuk anda', isRead: false,
    destinationType: 'restaurant', destinationId: 'place123', priority: 5,
  });
  await setDoc(doc(db, 'users', 'alice', 'notifications', 'n2'), {
    id: 'n2', type: 'coupon', title: 'Kupon Pro', body: 'Tebus sekarang',
    isRead: false, priority: 9,
  });
  await setDoc(doc(db, 'users', 'bob', 'notifications', 'nb'), {
    id: 'nb', type: 'system', title: 'Bob sahaja', body: 'rahsia',
    isRead: false,
  });
});

const alice = env.authenticatedContext('alice').firestore();
const bob = env.authenticatedContext('bob').firestore();
const anon = env.unauthenticatedContext().firestore();

// 1. Pemilik boleh baca notifikasi sendiri.
await check('1 pemilik baca notifikasi sendiri', () =>
  assertSucceeds(getDoc(doc(alice, 'users', 'alice', 'notifications', 'n1'))));

// 2. Pengguna lain TIDAK boleh baca notifikasi orang lain (tiada bocor akaun).
await check('2 pengguna lain TIDAK boleh baca notifikasi alice', () =>
  assertFails(getDoc(doc(bob, 'users', 'alice', 'notifications', 'n1'))));

// 3. Tanpa auth TIDAK boleh baca.
await check('3 tanpa-auth TIDAK boleh baca', () =>
  assertFails(getDoc(doc(anon, 'users', 'alice', 'notifications', 'n1'))));

// 4. Pemilik boleh kemas kini keadaan-baca SAHAJA (isRead + readAt).
await check('4 pemilik tanda dibaca (isRead+readAt) dibenarkan', () =>
  assertSucceeds(updateDoc(doc(alice, 'users', 'alice', 'notifications', 'n1'),
    { isRead: true, readAt: new Date() })));

// 5. Pemilik boleh kemas kini isRead sahaja (tanpa readAt) — masih dibenarkan.
await check('5 pemilik tanda dibaca (isRead sahaja) dibenarkan', () =>
  assertSucceeds(updateDoc(doc(alice, 'users', 'alice', 'notifications', 'n2'),
    { isRead: true })));

// 6. Pemilik TIDAK boleh ubah medan lain (spoof jenis/keutamaan/destinasi).
await check('6 ubah medan bukan-baca (priority) DITOLAK', () =>
  assertFails(updateDoc(doc(alice, 'users', 'alice', 'notifications', 'n1'),
    { isRead: true, priority: 1 })));
await check('7 ubah type/destinationId DITOLAK', () =>
  assertFails(updateDoc(doc(alice, 'users', 'alice', 'notifications', 'n1'),
    { type: 'system', destinationId: 'evil' })));

// 8. Pemilik TIDAK boleh CIPTA notifikasi (elak fabrikasi + badge palsu).
await check('8 klien CIPTA notifikasi DITOLAK', () =>
  assertFails(setDoc(doc(alice, 'users', 'alice', 'notifications', 'fake1'),
    { id: 'fake1', type: 'coupon', title: 'palsu', isRead: false })));

// 9. Pengguna lain TIDAK boleh kemas kini notifikasi orang lain.
await check('9 pengguna lain kemas kini notifikasi alice DITOLAK', () =>
  assertFails(updateDoc(doc(bob, 'users', 'alice', 'notifications', 'n1'),
    { isRead: true })));

// 10. Pemilik TIDAK boleh PADAM (jejak dikekalkan).
await check('10 klien PADAM notifikasi DITOLAK', () =>
  assertFails(deleteDoc(doc(alice, 'users', 'alice', 'notifications', 'n1'))));

await env.cleanup();
console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
