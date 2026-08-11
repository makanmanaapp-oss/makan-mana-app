// FIX 3 — ujian rules Firestore untuk PRIVASI GRUP + JEMPUTAN + PADAM.
// Jalankan: firebase emulators:exec --only firestore "node rules_test/groups_test.mjs"
//
// Nota seni bina: SEMUA tulisan grup/keahlian/jemputan/padam melalui Cloud
// Functions (rules: create/update/delete == false). Jadi ujian rules memfokus
// KEBOLEHBACAAN (privacy leak) + kuncian tulisan-klien. Penguatkuasaan
// terima-jemputan / owner-only-delete / anti-forge diuji di lapisan fungsi
// (server-authoritative) — lihat groupInvites.ts.
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  collection, collectionGroup, query, where, limit, getDocs, doc, getDoc, setDoc,
} from 'firebase/firestore';

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}: ${e.message?.slice(0, 160)}`); }
}

const env = await initializeTestEnvironment({
  projectId: 'makanmana-groups-rules-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
});

// ---- benih data (tanpa rules) ----
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  // Grup PUBLIK gPub (owner=alice, ahli=alice,carol)
  await setDoc(doc(db, 'groups', 'gPub'), {
    name: 'Public Group', privacy: 'public', ownerUid: 'alice', memberCount: 2,
  });
  await setDoc(doc(db, 'groups', 'gPub', 'members', 'alice'), { uid: 'alice', role: 'owner' });
  await setDoc(doc(db, 'groups', 'gPub', 'members', 'carol'), { uid: 'carol', role: 'member' });
  // Grup PERIBADI gPriv (owner=alice, ahli=alice,carol) — bob BUKAN ahli
  await setDoc(doc(db, 'groups', 'gPriv'), {
    name: 'Private Group', privacy: 'private', ownerUid: 'alice', memberCount: 2,
    pinnedAnnouncement: 'rahsia ahli sahaja',
  });
  await setDoc(doc(db, 'groups', 'gPriv', 'members', 'alice'), { uid: 'alice', role: 'owner' });
  await setDoc(doc(db, 'groups', 'gPriv', 'members', 'carol'), { uid: 'carol', role: 'member' });
  await setDoc(doc(db, 'groups', 'gPriv', 'status', 'carol'), { uid: 'carol', mood: 'lapar' });
  // Grup LEGASI gLegacy (tiada medan privacy) — kompat: dilayan sebagai awam
  await setDoc(doc(db, 'groups', 'gLegacy'), { name: 'Legacy', ownerUid: 'alice', memberCount: 1 });
  // Grup dipadam gDel
  await setDoc(doc(db, 'groups', 'gDel'), {
    name: 'Deleted', privacy: 'public', ownerUid: 'alice', status: 'deleted', memberCount: 1,
  });
  // Siaran grup peribadi (group_only)
  await setDoc(doc(db, 'feed_posts', 'privPost'), {
    authorUid: 'alice', visibility: 'group_only', groupId: 'gPriv', text: 'rahsia',
  });
  // Jemputan: bob dijemput ke gPriv oleh alice
  await setDoc(doc(db, 'group_invites', 'inv1'), {
    groupId: 'gPriv', groupName: 'Private Group', inviterUid: 'alice',
    inviteeUid: 'bob', status: 'pending',
  });
  // Jemputan orang lain (dave→erin) — bob tak boleh baca
  await setDoc(doc(db, 'group_invites', 'inv2'), {
    groupId: 'gPriv', inviterUid: 'dave', inviteeUid: 'erin', status: 'pending',
  });
});

const alice = env.authenticatedContext('alice').firestore(); // owner+member
const carol = env.authenticatedContext('carol').firestore(); // member gPriv
const bob = env.authenticatedContext('bob').firestore();     // non-member, invitee inv1
const anon = env.unauthenticatedContext().firestore();

// ===== PART 21 =====

// TEST A — non-member baca dokumen grup PERIBADI → DENIED
await check('A: non-member read private group doc DENIED', () =>
  assertFails(getDoc(doc(bob, 'groups', 'gPriv'))));

// TEST B — non-member baca siaran grup peribadi (group_only) → DENIED
await check('B: non-member read private group post DENIED', () =>
  assertFails(getDoc(doc(bob, 'feed_posts', 'privPost'))));

// TEST C — ahli baca grup peribadi + siaran + status → ALLOWED
await check('C: member read private group doc ALLOWED', () =>
  assertSucceeds(getDoc(doc(carol, 'groups', 'gPriv'))));
await check('C: member read private group post ALLOWED', () =>
  assertSucceeds(getDoc(doc(carol, 'feed_posts', 'privPost'))));
await check('C: member read private group status ALLOWED', () =>
  assertSucceeds(getDoc(doc(carol, 'groups', 'gPriv', 'status', 'carol'))));

// Public group doc readable by non-member (discovery/basic info)
await check('Public group doc readable by any signed-in', () =>
  assertSucceeds(getDoc(doc(bob, 'groups', 'gPub'))));

// Legacy group (no privacy) treated public → readable (no lockout)
await check('Legacy group (no privacy) readable (compat)', () =>
  assertSucceeds(getDoc(doc(bob, 'groups', 'gLegacy'))));

// Discovery LIST must filter privacy==public (private not returned/denied)
await check('Discovery list where privacy==public ALLOWED', () =>
  assertSucceeds(getDocs(query(
    collection(bob, 'groups'), where('privacy', '==', 'public'), limit(60)))));
// Non-member cannot enumerate PRIVATE groups (list constrained to private
// returns member-only docs → denied). Client discovery always filters public.
await check('Non-member cannot list PRIVATE groups DENIED', () =>
  assertFails(getDocs(query(
    collection(bob, 'groups'), where('privacy', '==', 'private'), limit(60)))));

// TEST D — normal member cannot self-set role=owner (members write server-only)
await check('D: member cannot write member role (server-only)', () =>
  assertFails(setDoc(doc(carol, 'groups', 'gPriv', 'members', 'carol'),
    { uid: 'carol', role: 'owner' })));
await check('D: non-member cannot self-add to private group members', () =>
  assertFails(setDoc(doc(bob, 'groups', 'gPriv', 'members', 'bob'),
    { uid: 'bob', role: 'member' })));

// TEST E/F — group doc delete/update client-side blocked (soft-delete via fn)
await check('E: member cannot delete group doc (client)', () =>
  assertFails(setDoc(doc(carol, 'groups', 'gPriv'),
    { status: 'deleted' }, { merge: true })));
await check('F: even owner cannot client-write group doc (fn-only path)', () =>
  assertFails(setDoc(doc(alice, 'groups', 'gPriv'),
    { status: 'deleted' }, { merge: true })));

// ===== INVITES (read/query security; accept/decline via fn) =====
// G-read: invitee can read own invite; cannot read someone else's
await check('Invitee reads OWN invite ALLOWED', () =>
  assertSucceeds(getDoc(doc(bob, 'group_invites', 'inv1'))));
await check('Inviter reads invite they sent ALLOWED', () =>
  assertSucceeds(getDoc(doc(alice, 'group_invites', 'inv1'))));
await check("G: user cannot read someone else's invite DENIED", () =>
  assertFails(getDoc(doc(bob, 'group_invites', 'inv2'))));
await check('My-invites query where inviteeUid==me ALLOWED', () =>
  assertSucceeds(getDocs(query(collection(bob, 'group_invites'),
    where('inviteeUid', '==', 'bob'), where('status', '==', 'pending'), limit(20)))));
await check('Broad invites query (no inviteeUid filter) DENIED', () =>
  assertFails(getDocs(query(collection(bob, 'group_invites'), limit(50)))));
// H/I/J: client cannot forge accept (write invite / member) — server-only
await check('H/I: client cannot write invite status (accept via fn only)', () =>
  assertFails(setDoc(doc(bob, 'group_invites', 'inv1'),
    { status: 'accepted' }, { merge: true })));
await check('J: client cannot self-add member for deleted/any group', () =>
  assertFails(setDoc(doc(bob, 'groups', 'gDel', 'members', 'bob'),
    { uid: 'bob', role: 'member' })));

// Unauthenticated cannot read groups/invites at all
await check('Anon cannot read any group', () =>
  assertFails(getDoc(doc(anon, 'groups', 'gPub'))));
await check('Anon cannot read invites', () =>
  assertFails(getDoc(doc(anon, 'group_invites', 'inv1'))));

// ===== FIX 3.0A — MEMBER ENUMERATION LOCKDOWN (Part 4) =====
// 1: non-member cannot read a private group's members (single or list)
await check('3.0A-1: non-member read private member doc DENIED', () =>
  assertFails(getDoc(doc(bob, 'groups', 'gPriv', 'members', 'carol'))));
await check('3.0A-1: non-member LIST private group members DENIED', () =>
  assertFails(getDocs(query(
    collection(bob, 'groups', 'gPriv', 'members'), limit(200)))));
// 2: user cannot collection-group query ANOTHER user's memberships
await check("3.0A-2: collectionGroup members where uid==OTHER DENIED", () =>
  assertFails(getDocs(query(
    collectionGroup(bob, 'members'), where('uid', '==', 'carol'), limit(50)))));
// 3: user CAN discover their OWN memberships (My Groups)
await check('3.0A-3: collectionGroup members where uid==ME ALLOWED', () =>
  assertSucceeds(getDocs(query(
    collectionGroup(carol, 'members'), where('uid', '==', 'carol'), limit(50)))));
// 4/6: member (and owner) can read own private group member list
await check('3.0A-4: member reads private group member LIST ALLOWED', () =>
  assertSucceeds(getDocs(query(
    collection(carol, 'groups', 'gPriv', 'members'), limit(200)))));
await check('3.0A-6: owner reads own group member list ALLOWED', () =>
  assertSucceeds(getDocs(query(
    collection(alice, 'groups', 'gPriv', 'members'), limit(200)))));
// 5: member of X cannot read members of a DIFFERENT private group they are not in
await check('3.0A-5: cross private group member list DENIED', () =>
  assertFails(getDocs(query(
    collection(bob, 'groups', 'gPriv', 'members'), limit(200)))));
// 8: public group member list still readable by members (intended)
await check('3.0A-8: public group member LIST by its member ALLOWED', () =>
  assertSucceeds(getDocs(query(
    collection(carol, 'groups', 'gPub', 'members'), limit(200)))));
await check('3.0A: non-member cannot read OWN (absent) doc in private list', () =>
  assertFails(getDoc(doc(bob, 'groups', 'gPriv', 'members', 'bob'))));

// TEST K — private group post keeps group_only visibility (never public) after
// deletion: soft-delete does NOT touch post docs; a non-member still denied.
await check('K: private post stays restricted (non-member denied) after delete', () =>
  assertFails(getDoc(doc(bob, 'feed_posts', 'privPost'))));

await env.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
