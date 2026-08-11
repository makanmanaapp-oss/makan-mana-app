// FIX 3.0A — EXECUTABLE Functions Emulator tests for the group callables.
// Runs the REAL onCall functions (auth + Firestore transactions), not grep.
// Run: firebase emulators:exec --only functions,firestore,auth \
//        "node rules_test/functions_test.mjs"
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getFirestore as adminFs } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import {
  getFunctions, connectFunctionsEmulator, httpsCallable,
} from 'firebase/functions';

const PROJECT = process.env.GCLOUD_PROJECT || 'makanmana-c59f3';
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${(e.message || e.code || e).toString().slice(0, 160)}`);
  }
}
async function expectFail(name, p) {
  await check(name, async () => {
    let ok = false;
    try { await p(); ok = true; } catch (_) { /* expected */ }
    if (ok) throw new Error('expected to fail but succeeded');
  });
}

// ---- admin (Firestore seeding + assertions; emulator bypasses auth/rules,
//       no signing/service-account needed) ----
adminInit({ projectId: PROJECT });
const afs = adminFs();

// ---- client (Auth emulator identities + real callable calls) ----
const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-emulator-key' });
const cauth = getAuth(app);
// Emulator hosts are injected by `firebase emulators:exec`.
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const [FN_HOST, FN_PORT] =
  (process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001').split(':');
connectAuthEmulator(cauth, `http://${AUTH_HOST}`, { disableWarnings: true });
const fns = getFunctions(app, 'asia-southeast1'); // functions region (constants.ts)
connectFunctionsEmulator(fns, FN_HOST, Number(FN_PORT));

const call = (name, data) => httpsCallable(fns, name)(data).then((r) => r.data);

// Named identities via email/password (deterministic name→uid map).
const NAMES = ['OWNER_A', 'ADMIN_A', 'MEMBER_A', 'USER_B', 'USER_C'];
const uidOf = {};
const emailOf = (n) => `${n.toLowerCase()}@t.test`;
for (const n of NAMES) {
  const cred = await createUserWithEmailAndPassword(cauth, emailOf(n), 'pw123456');
  uidOf[n] = cred.user.uid;
  await afs.doc(`users/${uidOf[n]}`).set({ displayName: n, photoUrl: null });
}
const UID = (n) => uidOf[n];
async function as(name) { await signInWithEmailAndPassword(cauth, emailOf(name), 'pw123456'); }

const memberDoc = (gid, uid) => afs.doc(`groups/${gid}/members/${uid}`).get();
const groupDoc = (gid) => afs.doc(`groups/${gid}`).get();
async function pendingInvites(gid, invitee) {
  const q = await afs.collection('group_invites')
    .where('groupId', '==', gid).where('inviteeUid', '==', invitee)
    .where('status', '==', 'pending').get();
  return q.docs;
}

// ================= build a PRIVATE group via real callables =================
await as('OWNER_A');
const created = await call('createGroupV2',
  { name: 'Sec Test Group', privacy: 'private' });
const G = created.groupId;
await check('setup: private group created, owner is OWNER_A', async () => {
  const m = await memberDoc(G, UID('OWNER_A'));
  if (m.data().role !== 'owner') throw new Error('owner role missing');
  if ((await groupDoc(G)).data().privacy !== 'private') throw new Error('not private');
});
// owner adds ADMIN_A (admin) and MEMBER_A (member) directly
await call('addGroupMember', { groupId: G, targetUid: UID('ADMIN_A'), role: 'admin' });
await call('addGroupMember', { groupId: G, targetUid: UID('MEMBER_A'), role: 'member' });

// ================= PART 6 — inviteToGroup =================
await as('OWNER_A');
await check('6.1 owner invites USER_B → pending', async () => {
  await call('inviteToGroup', { groupId: G, targetUid: UID('USER_B') });
  const inv = await pendingInvites(G, UID('USER_B'));
  if (inv.length !== 1 || inv[0].data().status !== 'pending') throw new Error('no pending invite');
  // 6.8 metadata: only approved snapshot fields
  const d = inv[0].data();
  if (d.groupName !== 'Sec Test Group') throw new Error('missing groupName snapshot');
});
await as('ADMIN_A');
await check('6.2 admin invites USER_C → allowed', async () => {
  await call('inviteToGroup', { groupId: G, targetUid: UID('USER_C') });
  if ((await pendingInvites(G, UID('USER_C'))).length !== 1) throw new Error('admin invite failed');
});
await as('MEMBER_A');
await expectFail('6.3 ordinary member invites → DENIED',
  () => call('inviteToGroup', { groupId: G, targetUid: UID('USER_B') }));
await as('USER_C');
await expectFail('6.4 non-member invites → DENIED',
  () => call('inviteToGroup', { groupId: G, targetUid: UID('USER_B') }));
await as('OWNER_A');
await expectFail('6.5 invite already-member (ADMIN_A) → rejected',
  () => call('inviteToGroup', { groupId: G, targetUid: UID('ADMIN_A') }));
await check('6.6 duplicate pending invite → deduped (no 2nd doc)', async () => {
  await call('inviteToGroup', { groupId: G, targetUid: UID('USER_B') }); // again
  if ((await pendingInvites(G, UID('USER_B'))).length !== 1) throw new Error('duplicate invite created');
});

// ================= PART 7 — respondGroupInvite =================
const invB = (await pendingInvites(G, UID('USER_B')))[0].id;
await as('USER_C');
await expectFail('7.3 USER_C accepts USER_B invite → DENIED (forgery)',
  () => call('respondGroupInvite', { inviteId: invB, accept: true }));
await check("7.3b USER_B still not a member after forged attempt", async () => {
  if ((await memberDoc(G, UID('USER_B'))).exists) throw new Error('USER_B wrongly added');
});
await as('USER_B');
await check('7.1 recipient accepts → member created once', async () => {
  await call('respondGroupInvite', { inviteId: invB, accept: true });
  if (!(await memberDoc(G, UID('USER_B'))).exists) throw new Error('member not created');
});
await check('7.4 accept twice → idempotent (still one member)', async () => {
  await call('respondGroupInvite', { inviteId: invB, accept: true });
  const before = (await groupDoc(G)).data().memberCount;
  await call('respondGroupInvite', { inviteId: invB, accept: true });
  const after = (await groupDoc(G)).data().memberCount;
  if (after !== before) throw new Error('memberCount changed on repeat accept');
});
// decline path: invite USER_C's invite is pending; USER_C declines
const invC = (await pendingInvites(G, UID('USER_C')))[0].id;
await as('USER_C');
await check('7.2 recipient declines → no membership, invite declined', async () => {
  await call('respondGroupInvite', { inviteId: invC, accept: false });
  if ((await memberDoc(G, UID('USER_C'))).exists) throw new Error('declined but became member');
  const inv = await afs.doc(`group_invites/${invC}`).get();
  if (inv.data().status !== 'declined') throw new Error('status not declined');
});
await check('7.5 accept a DECLINED invite → no mutation (stays declined)', async () => {
  await call('respondGroupInvite', { inviteId: invC, accept: true });
  if ((await memberDoc(G, UID('USER_C'))).exists) throw new Error('declined invite added member');
  const inv = await afs.doc(`group_invites/${invC}`).get();
  if (inv.data().status !== 'declined') throw new Error('status changed from declined');
});

// ================= PART 8 — cancelGroupInvite =================
// Fresh pending invite for USER_C, then cancel by inviter (OWNER_A)
await as('OWNER_A');
await call('inviteToGroup', { groupId: G, targetUid: UID('USER_C') });
const invC2 = (await pendingInvites(G, UID('USER_C')))[0].id;
await as('MEMBER_A');
await expectFail('8.2 ordinary member cannot cancel invite',
  () => call('cancelGroupInvite', { inviteId: invC2 }));
await as('OWNER_A');
await check('8.1 inviter/owner cancels pending invite', async () => {
  await call('cancelGroupInvite', { inviteId: invC2 });
  const inv = await afs.doc(`group_invites/${invC2}`).get();
  if (inv.data().status !== 'cancelled') throw new Error('not cancelled');
});
await as('USER_C');
await check('8.4 cancelled invite cannot be accepted (no member)', async () => {
  try { await call('respondGroupInvite', { inviteId: invC2, accept: true }); } catch (_) {}
  if ((await memberDoc(G, UID('USER_C'))).exists) throw new Error('cancelled invite added member');
});
await as('OWNER_A');
await check('8.5 repeated cancel is safe/idempotent', async () => {
  await call('cancelGroupInvite', { inviteId: invC2 }); // again, no throw
});

// ================= PART 11 — CONCURRENCY =================
// Double-accept race for a fresh invite → exactly one membership, one increment
await as('OWNER_A');
await call('inviteToGroup', { groupId: G, targetUid: UID('USER_C') });
const invRace = (await pendingInvites(G, UID('USER_C')))[0].id;
await as('USER_C');
await check('11.1 two concurrent accepts → one membership, one increment', async () => {
  const before = (await groupDoc(G)).data().memberCount;
  await Promise.allSettled([
    call('respondGroupInvite', { inviteId: invRace, accept: true }),
    call('respondGroupInvite', { inviteId: invRace, accept: true }),
  ]);
  const after = (await groupDoc(G)).data().memberCount;
  if (!(await memberDoc(G, UID('USER_C'))).exists) throw new Error('no membership after race');
  if (after - before !== 1) throw new Error(`memberCount +${after - before}, expected +1`);
});

// ================= PART 9 — deleteGroupV2 =================
await as('MEMBER_A');
await expectFail('9 MEMBER cannot delete group',
  () => call('deleteGroupV2', { groupId: G }));
await as('ADMIN_A');
await expectFail('9 ADMIN cannot delete group (owner-only)',
  () => call('deleteGroupV2', { groupId: G }));
await as('USER_B'); // now a member (accepted) but not owner
await expectFail('9 non-owner member cannot delete group',
  () => call('deleteGroupV2', { groupId: G }));
await as('OWNER_A');
await check('9 OWNER deletes → status=deleted, deletedAt/By set', async () => {
  await call('deleteGroupV2', { groupId: G });
  const g = (await groupDoc(G)).data();
  if (g.status !== 'deleted') throw new Error('status not deleted');
  if (!g.deletedAt) throw new Error('deletedAt missing');
  if (g.deletedBy !== UID('OWNER_A')) throw new Error('deletedBy wrong');
});
// After delete: no new activity
await as('USER_C');
await expectFail('9 after delete: joinGroupV2 denied',
  () => call('joinGroupV2', { groupId: G }));
await as('OWNER_A');
await expectFail('9 after delete: addGroupMember denied',
  () => call('addGroupMember', { groupId: G, targetUid: UID('USER_C') }));
await expectFail('9 after delete: inviteToGroup denied',
  () => call('inviteToGroup', { groupId: G, targetUid: UID('USER_C') }));
await check('9 after delete: existing members preserved (no hard delete)', async () => {
  if (!(await memberDoc(G, UID('MEMBER_A'))).exists) throw new Error('member hard-deleted');
});

// Part 11b — delete-vs-accept race: on a SECOND private group
await as('OWNER_A');
const g2 = (await call('createGroupV2', { name: 'Race G', privacy: 'private' })).groupId;
await call('inviteToGroup', { groupId: g2, targetUid: UID('USER_B') });
const invRace2 = (await pendingInvites(g2, UID('USER_B')))[0].id;
await check('11.2 delete racing accept → deleted; accept-AFTER-delete cannot add', async () => {
  const ownerDel = as('OWNER_A').then(() => call('deleteGroupV2', { groupId: g2 }));
  const userAcc = as('USER_B').then(() =>
    call('respondGroupInvite', { inviteId: invRace2, accept: true }).catch(() => {}));
  await Promise.allSettled([ownerDel, userAcc]);
  const g = (await groupDoc(g2)).data();
  if (g.status !== 'deleted') throw new Error('group not deleted after race');
  // The race is a valid interleave: if ACCEPT commits first (group still alive)
  // a membership legitimately exists; if DELETE commits first, accept's txn
  // re-reads the group, sees deleted, and aborts. The SECURITY invariant is
  // deterministic: once the group is deleted, a further accept CANNOT create a
  // new membership. Prove it directly.
  const before = (await memberDoc(g2, UID('USER_B'))).exists;
  await as('USER_B');
  try { await call('respondGroupInvite', { inviteId: invRace2, accept: true }); } catch (_) {}
  const after = (await memberDoc(g2, UID('USER_B'))).exists;
  if (after && !before) throw new Error('post-delete accept created a NEW membership');
});

await signOut(cauth).catch(() => {});
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
