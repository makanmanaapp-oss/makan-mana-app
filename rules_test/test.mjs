// ISSUE 004/005 closeout: ujian rules Firestore (Emulator Suite).
// Jalankan: firebase emulators:exec --only firestore "node rules_test/test.mjs"
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { collection, collectionGroup, query, where, limit, getDocs, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}: ${e.message?.slice(0, 140)}`); }
}

const env = await initializeTestEnvironment({
  projectId: 'makanmana-rules-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
});

// ---- data asas (tanpa rules) ----
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const posts = {
    pub1: { authorUid: 'alice', visibility: 'public', text: 'awam' },
    priv1: { authorUid: 'alice', visibility: 'private', text: 'privat' },
    grp1: { authorUid: 'alice', visibility: 'group_only', groupId: 'g1', text: 'grup' },
    fol1: { authorUid: 'alice', visibility: 'followers_only', text: 'pengikut' },
    hid1: { authorUid: 'alice', visibility: 'public', status: 'hidden', text: 'sorok' },
    flip1: { authorUid: 'alice', visibility: 'public', text: 'akan-privat' },
  };
  for (const [id, p] of Object.entries(posts)) {
    await setDoc(doc(db, 'feed_posts', id), p);
    await setDoc(doc(db, 'feed_posts', id, 'comments', `c-${id}`), {
      authorUid: 'alice', text: `balasan ${id}`, postId: id,
      parentVisibility: 'public', // sengaja 'public' untuk semua: uji basi!
    });
  }
  // komen dipadam + ahli grup g1 (bob bukan ahli; carol ahli)
  await setDoc(doc(db, 'feed_posts', 'pub1', 'comments', 'c-del'), {
    authorUid: 'alice', text: 'dipadam', postId: 'pub1',
    parentVisibility: 'public', status: 'deleted',
  });
  await setDoc(doc(db, 'groups', 'g1', 'members', 'carol'), { uid: 'carol' });
});

const bob = env.authenticatedContext('bob').firestore();     // penonton luar
const alice = env.authenticatedContext('alice').firestore(); // pengarang
const carol = env.authenticatedContext('carol').firestore(); // ahli grup

const repliesQ = (db, uid) => query(
  collectionGroup(db, 'comments'),
  where('authorUid', '==', uid),
  where('parentVisibility', '==', 'public'),
  limit(30));

// 1-2. sendiri + awam-oleh-orang-lain
await check('1 pengarang boleh baca balasan sendiri (query)', async () => {
  const snap = await assertSucceeds(getDocs(repliesQ(alice, 'alice')));
  if (snap.size < 1) throw new Error('tiada hasil');
});
// Seni bina closeout: senarai orang-lain melalui indeks ID-sahaja.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'public_reply_activity', 'pub1_c-pub1'), {
    authorUid: 'alice', postId: 'pub1', commentId: 'c-pub1', active: true,
  });
  await setDoc(doc(db, 'public_reply_activity', 'flip1_c-flip1'), {
    authorUid: 'alice', postId: 'flip1', commentId: 'c-flip1', active: true,
  });
});
await check('2a penonton lain: query INDEKS berjaya (ID sahaja)', async () => {
  const snap = await assertSucceeds(getDocs(query(
    collection(bob, 'public_reply_activity'),
    where('authorUid', '==', 'alice'), where('active', '==', true),
    limit(30))));
  if (snap.size < 1) throw new Error('indeks kosong');
  for (const d of snap.docs) {
    if ('text' in d.data()) throw new Error('indeks mengandungi teks!');
  }
});
await check('2b klien TIDAK boleh menulis indeks', () =>
  assertFails(setDoc(doc(bob, 'public_reply_activity', 'x'), {
    authorUid: 'bob', postId: 'pub1', commentId: 'c-pub1', active: true,
  })));
await check('2c LIST collectionGroup orang lain DITOLAK (indeks wajib)', () =>
  assertFails(getDocs(repliesQ(bob, 'alice'))));

// 3. dokumen tunggal: induk awam boleh dibaca
await check('3 doc: balasan induk awam dibenarkan', () =>
  assertSucceeds(getDoc(doc(bob, 'feed_posts', 'pub1', 'comments', 'c-pub1'))));

// 4. BASI: parentVisibility 'public' TETAPI induk kini private -> tolak
await check('4 doc: snapshot basi (induk private) DITOLAK', () =>
  assertFails(getDoc(doc(bob, 'feed_posts', 'priv1', 'comments', 'c-priv1'))));

// 5. group_only: bukan ahli tolak; ahli lulus
await check('5a doc: induk group_only, bukan ahli DITOLAK', () =>
  assertFails(getDoc(doc(bob, 'feed_posts', 'grp1', 'comments', 'c-grp1'))));
await check('5b doc: induk group_only, AHLI dibenarkan', () =>
  assertSucceeds(getDoc(doc(carol, 'feed_posts', 'grp1', 'comments', 'c-grp1'))));

// 6. followers_only (owner-only semasa beta) -> tolak
await check('6 doc: induk followers_only DITOLAK utk bukan pemilik', () =>
  assertFails(getDoc(doc(bob, 'feed_posts', 'fol1', 'comments', 'c-fol1'))));

// 7. induk hidden -> tolak
await check('7 doc: induk hidden DITOLAK', () =>
  assertFails(getDoc(doc(bob, 'feed_posts', 'hid1', 'comments', 'c-hid1'))));

// 8. komen deleted -> tolak
await check('8 doc: komen deleted DITOLAK', () =>
  assertFails(getDoc(doc(bob, 'feed_posts', 'pub1', 'comments', 'c-del'))));

// 9. induk DIPADAM sepenuhnya -> tolak
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'feed_posts', 'gone1', 'comments', 'c-gone'), {
    authorUid: 'alice', text: 'yatim', postId: 'gone1',
    parentVisibility: 'public',
  });
});
await check('9 doc: induk tidak wujud DITOLAK', () =>
  assertFails(getDoc(doc(bob, 'feed_posts', 'gone1', 'comments', 'c-gone'))));

// 10. TRANSISI LIVE public -> private: query/doc tidak lagi berjaya
await check('10 transisi public->private menutup akses SERTA-MERTA', async () => {
  await assertSucceeds(getDoc(doc(bob, 'feed_posts', 'flip1', 'comments', 'c-flip1')));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'feed_posts', 'flip1'), { visibility: 'private' });
  });
  await assertFails(getDoc(doc(bob, 'feed_posts', 'flip1', 'comments', 'c-flip1')));
});

// 11. query LIST selepas satu induk jadi private: adakah SELURUH query pecah?
await check('11 query selepas transisi: kekal boleh guna ATAU ditolak (rekod hasil)', async () => {
  try {
    const snap = await getDocs(repliesQ(bob, 'alice'));
    console.log(`      -> query OK, ${snap.size} dokumen dipulangkan`);
    for (const d of snap.docs) {
      if (d.data().postId === 'flip1' || d.data().postId === 'priv1') {
        throw new Error(`BOCOR: ${d.id} induk tidak boleh dibaca tetapi dipulangkan!`);
      }
    }
  } catch (e) {
    if (String(e.message).includes('BOCOR')) throw e;
    console.log('      -> query DITOLAK sepenuhnya (tiada bocor; tab perlu fallback)');
  }
});

// 12. hardening: klien tak boleh UBAH medan komen (update dilarang)
await check('12 update komen oleh pengarang DITOLAK (immutable)', () =>
  assertFails(updateDoc(doc(alice, 'feed_posts', 'pub1', 'comments', 'c-pub1'),
      { parentVisibility: 'public', text: 'ubah' })));

// 13. penyamaran: cipta komen sebagai orang lain DITOLAK
await check('13 cipta komen menyamar authorUid lain DITOLAK', () =>
  assertFails(setDoc(doc(bob, 'feed_posts', 'pub1', 'comments', 'fake1'),
      { authorUid: 'alice', text: 'palsu', postId: 'pub1', parentVisibility: 'public' })));

// 14. cipta dengan parentVisibility BOHONG ditolak
await check('14 cipta komen dgn parentVisibility bohong DITOLAK', () =>
  assertFails(setDoc(doc(bob, 'feed_posts', 'priv1', 'comments', 'lie1'),
      { authorUid: 'bob', text: 'x', postId: 'priv1', parentVisibility: 'public' })));

// 15. akses luas collectionGroup tanpa penapis DITOLAK
await check('15 query collectionGroup TANPA penapis selamat DITOLAK', () =>
  assertFails(getDocs(query(collectionGroup(bob, 'comments'), limit(10)))));

// 16. rules sedia ada: post awam masih boleh dibaca; post privat tidak
await check('16a post awam kekal boleh dibaca', () =>
  assertSucceeds(getDoc(doc(bob, 'feed_posts', 'pub1'))));
await check('16b post privat kekal DITOLAK', () =>
  assertFails(getDoc(doc(bob, 'feed_posts', 'priv1'))));

await env.cleanup();
console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
