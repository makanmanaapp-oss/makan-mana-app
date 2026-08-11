/**
 * HOTFIX 4.6 — secure invite-link create/join/revoke/info against the REAL
 * Firestore emulator. Run: npm run test:emulator:inviteLink
 * Covers Part 34 (17 cases) + info + block policy + concurrency.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";

import {App, initializeApp} from "firebase-admin/app";
import {FieldValue, getFirestore} from "firebase-admin/firestore";

import * as core from "../../inviteLinkV2";

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (npm run test:emulator:inviteLink)";
const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-mm";
let app: App | undefined;
let seq = 0;
let clock = 1_700_000_000_000;
let tok = 0;
function db() { if (!app) app = initializeApp({projectId: PROJECT}); return getFirestore(app); }
function deps(): core.InviteLinkDeps {
  return {
    db: db(),
    serverTimestamp: () => FieldValue.serverTimestamp(),
    increment: (n) => FieldValue.increment(n),
    now: () => clock,
    randomToken: () => `tok_${tok++}`,
    hashToken: (t) => createHash("sha256").update(t).digest("hex"),
    signReadUrl: async (p) => `https://emu.read/${encodeURIComponent(p)}`,
  };
}
async function seedGroup(owner: string, o: {privacy?: string; status?: string; members?: Record<string,string>; imagePath?: string; memberCount?: number} = {}): Promise<string> {
  const gid = `g${seq++}`;
  const ref = db().collection("groups").doc(gid);
  const data: Record<string, unknown> = {name: "G", privacy: o.privacy ?? "public", ownerUid: owner, memberCount: o.memberCount ?? 1};
  if (o.status) data.status = o.status;
  if (o.imagePath) data.imagePath = o.imagePath;
  await ref.set(data);
  const members = o.members ?? {[owner]: "owner"};
  for (const [uid, role] of Object.entries(members)) await ref.collection("members").doc(uid).set({uid, role});
  return gid;
}
async function code(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); return "NO_ERROR"; }
  catch (e) { return e instanceof core.InviteLinkError ? e.code : `OTHER:${String(e)}`; }
}
async function memberCount(gid: string): Promise<number> {
  return Number(((await db().collection("groups").doc(gid).get()).data() ?? {}).memberCount ?? 0);
}
async function roleOf(gid: string, uid: string): Promise<string | null> {
  const s = await db().collection("groups").doc(gid).collection("members").doc(uid).get();
  return s.exists ? (s.data()?.role as string) : null;
}

test("1 owner create link ALLOWED", {skip}, async () => {
  const gid = await seedGroup("o1");
  const r = await core.createGroupInviteLink("o1", {groupId: gid}, deps());
  assert.ok(r.token && r.linkId && r.expiresAt > clock);
});
test("2 admin create link ALLOWED", {skip}, async () => {
  const gid = await seedGroup("o2", {members: {o2: "owner", a2: "admin"}});
  const r = await core.createGroupInviteLink("a2", {groupId: gid}, deps());
  assert.ok(r.token);
});
test("3 member create DENIED", {skip}, async () => {
  const gid = await seedGroup("o3", {members: {o3: "owner", m3: "member"}});
  assert.equal(await code(() => core.createGroupInviteLink("m3", {groupId: gid}, deps())), "permission-denied");
});
test("4 non-member create DENIED", {skip}, async () => {
  const gid = await seedGroup("o4");
  assert.equal(await code(() => core.createGroupInviteLink("x4", {groupId: gid}, deps())), "permission-denied");
});
test("5 deleted group create DENIED", {skip}, async () => {
  const gid = await seedGroup("o5", {status: "deleted"});
  assert.equal(await code(() => core.createGroupInviteLink("o5", {groupId: gid}, deps())), "failed-precondition");
});
test("6 valid token join ALLOWED (member role, counts++)", {skip}, async () => {
  const gid = await seedGroup("o6");
  const {token} = await core.createGroupInviteLink("o6", {groupId: gid}, deps());
  const before = await memberCount(gid);
  const r = await core.joinGroupByInviteLink("u6", token, deps());
  assert.equal(r.already, false);
  assert.equal(await roleOf(gid, "u6"), "member");
  assert.equal(await memberCount(gid), before + 1);
});
test("7 invalid token join DENIED", {skip}, async () => {
  assert.equal(await code(() => core.joinGroupByInviteLink("u7", "not-a-real-token", deps())), "not-found");
});
test("8 expired token join DENIED", {skip}, async () => {
  const gid = await seedGroup("o8");
  const {token} = await core.createGroupInviteLink("o8", {groupId: gid, expiresInDays: 1}, deps());
  clock += 2 * 24 * 60 * 60 * 1000; // +2 days
  assert.equal(await code(() => core.joinGroupByInviteLink("u8", token, deps())), "failed-precondition");
  clock = 1_700_000_000_000;
});
test("9 revoked token join DENIED", {skip}, async () => {
  const gid = await seedGroup("o9");
  const {token, linkId} = await core.createGroupInviteLink("o9", {groupId: gid}, deps());
  await core.revokeGroupInviteLink("o9", linkId, deps());
  assert.equal(await code(() => core.joinGroupByInviteLink("u9", token, deps())), "failed-precondition");
});
test("10 existing member idempotent (no double count)", {skip}, async () => {
  const gid = await seedGroup("o10");
  const {token} = await core.createGroupInviteLink("o10", {groupId: gid}, deps());
  await core.joinGroupByInviteLink("u10", token, deps());
  const mid = await memberCount(gid);
  const r = await core.joinGroupByInviteLink("u10", token, deps());
  assert.equal(r.already, true);
  assert.equal(await memberCount(gid), mid); // unchanged
});
test("11 PRIVATE group valid token join ALLOWED", {skip}, async () => {
  const gid = await seedGroup("o11", {privacy: "private"});
  const {token} = await core.createGroupInviteLink("o11", {groupId: gid}, deps());
  const r = await core.joinGroupByInviteLink("u11", token, deps());
  assert.equal(r.already, false);
  assert.equal(await roleOf(gid, "u11"), "member");
});
test("12 PRIVATE group no/invalid token join DENIED", {skip}, async () => {
  await seedGroup("o12", {privacy: "private"});
  assert.equal(await code(() => core.joinGroupByInviteLink("u12", "guessed-token", deps())), "not-found");
});
test("13 token cannot grant admin (role forced member)", {skip}, async () => {
  const gid = await seedGroup("o13");
  const {token} = await core.createGroupInviteLink("o13", {groupId: gid}, deps());
  await core.joinGroupByInviteLink("u13", token, deps());
  assert.equal(await roleOf(gid, "u13"), "member");
});
test("14 concurrent redemption safe (maxUses=1, two users → one wins)", {skip}, async () => {
  const gid = await seedGroup("o14");
  const {token} = await core.createGroupInviteLink("o14", {groupId: gid, maxUses: 1}, deps());
  const before = await memberCount(gid);
  const results = await Promise.allSettled([
    core.joinGroupByInviteLink("uA14", token, deps()),
    core.joinGroupByInviteLink("uB14", token, deps()),
  ]);
  const ok = results.filter((r) => r.status === "fulfilled").length;
  assert.equal(ok, 1, "exactly one join succeeds under maxUses=1");
  assert.equal(await memberCount(gid), before + 1);
});
test("15 usageCount correct after N joins", {skip}, async () => {
  const gid = await seedGroup("o15");
  const {token, linkId} = await core.createGroupInviteLink("o15", {groupId: gid}, deps());
  await core.joinGroupByInviteLink("uA15", token, deps());
  await core.joinGroupByInviteLink("uB15", token, deps());
  const link = (await db().collection(core.LINKS).doc(linkId).get()).data() ?? {};
  assert.equal(Number(link.usageCount), 2);
});
test("16 group deleted during redeem DENIED", {skip}, async () => {
  const gid = await seedGroup("o16");
  const {token} = await core.createGroupInviteLink("o16", {groupId: gid}, deps());
  await db().collection("groups").doc(gid).set({status: "deleted"}, {merge: true});
  assert.equal(await code(() => core.joinGroupByInviteLink("u16", token, deps())), "failed-precondition");
});
test("17 duplicate membership prevented (self twice)", {skip}, async () => {
  const gid = await seedGroup("o17");
  const {token} = await core.createGroupInviteLink("o17", {groupId: gid}, deps());
  await core.joinGroupByInviteLink("u17", token, deps());
  await core.joinGroupByInviteLink("u17", token, deps());
  const members = await db().collection("groups").doc(gid).collection("members").where("uid", "==", "u17").get();
  assert.equal(members.size, 1);
});
test("18 block policy: blocked user join DENIED", {skip}, async () => {
  const gid = await seedGroup("o18");
  const {token} = await core.createGroupInviteLink("o18", {groupId: gid}, deps());
  await db().collection("blocks").doc("o18_u18").set({blockerUid: "o18", blockedUid: "u18"});
  assert.equal(await code(() => core.joinGroupByInviteLink("u18", token, deps())), "permission-denied");
});
test("19 getInfo returns preview + link-scoped image + alreadyMember", {skip}, async () => {
  const gid = await seedGroup("o19", {privacy: "private", imagePath: "group_images/x/a.jpg"});
  const {token} = await core.createGroupInviteLink("o19", {groupId: gid}, deps());
  const infoNon = await core.getGroupInviteLinkInfo("u19", token, deps());
  assert.equal(infoNon.privacy, "private");
  assert.ok(infoNon.imageUrl && infoNon.imageUrl.startsWith("https://emu.read/")); // link-scoped
  assert.equal(infoNon.alreadyMember, false);
  const infoOwner = await core.getGroupInviteLinkInfo("o19", token, deps());
  assert.equal(infoOwner.alreadyMember, true);
});

// ---- RATE LIMIT (Part 19) ----
test("R1 rate: 5 creations allowed, 6th DENIED (resource-exhausted)", {skip}, async () => {
  const gid = await seedGroup("or1");
  for (let i = 0; i < core.RATE_MAX; i++) {
    await core.createGroupInviteLink("or1", {groupId: gid}, deps());
  }
  assert.equal(await code(() => core.createGroupInviteLink("or1", {groupId: gid}, deps())), "resource-exhausted");
});
test("R2 rate independent per group", {skip}, async () => {
  const gA = await seedGroup("or2");
  const gB = await seedGroup("or2");
  for (let i = 0; i < core.RATE_MAX; i++) await core.createGroupInviteLink("or2", {groupId: gA}, deps());
  // gA exhausted, gB still allowed
  assert.equal(await code(() => core.createGroupInviteLink("or2", {groupId: gA}, deps())), "resource-exhausted");
  const r = await core.createGroupInviteLink("or2", {groupId: gB}, deps());
  assert.ok(r.token);
});
test("R3 rate window resets after window elapses", {skip}, async () => {
  const gid = await seedGroup("or3");
  for (let i = 0; i < core.RATE_MAX; i++) await core.createGroupInviteLink("or3", {groupId: gid}, deps());
  assert.equal(await code(() => core.createGroupInviteLink("or3", {groupId: gid}, deps())), "resource-exhausted");
  clock += core.RATE_WINDOW_MS + 1000; // advance past window
  const r = await core.createGroupInviteLink("or3", {groupId: gid}, deps());
  assert.ok(r.token);
  clock = 1_700_000_000_000;
});
test("R4 authorization evaluated BEFORE rate (non-member = permission-denied)", {skip}, async () => {
  const gid = await seedGroup("or4");
  assert.equal(await code(() => core.createGroupInviteLink("x4", {groupId: gid}, deps())), "permission-denied");
});
test("R5 concurrent creates cannot exceed limit", {skip}, async () => {
  const gid = await seedGroup("or5");
  // 4 sequential, then fire 4 concurrent (only 1 slot left)
  for (let i = 0; i < 4; i++) await core.createGroupInviteLink("or5", {groupId: gid}, deps());
  const results = await Promise.allSettled(
    Array.from({length: 4}, () => core.createGroupInviteLink("or5", {groupId: gid}, deps()))
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  assert.equal(ok, 1, "only one more create allowed under the cap");
});

// ---- LIST (Part 13) ----
test("L1 list returns metadata (no token) + reflects revoke", {skip}, async () => {
  const gid = await seedGroup("ol1");
  const {linkId} = await core.createGroupInviteLink("ol1", {groupId: gid}, deps());
  const before = await core.listGroupInviteLinks("ol1", gid, deps());
  assert.equal(before.links.length, 1);
  assert.equal(before.links[0].linkId, linkId);
  assert.equal((before.links[0] as unknown as Record<string, unknown>).token, undefined); // never exposes token
  assert.equal(before.links[0].status, "active");
  await core.revokeGroupInviteLink("ol1", linkId, deps());
  const after = await core.listGroupInviteLinks("ol1", gid, deps());
  assert.equal(after.links.length, 0); // revoked hidden
});
test("L2 list manager-only", {skip}, async () => {
  const gid = await seedGroup("ol2", {members: {ol2: "owner", ml2: "member"}});
  await core.createGroupInviteLink("ol2", {groupId: gid}, deps());
  assert.equal(await code(() => core.listGroupInviteLinks("ml2", gid, deps())), "permission-denied");
});
