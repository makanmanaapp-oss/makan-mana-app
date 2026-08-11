/**
 * HOTFIX 4.5C — server-mediated group image V2 authorization + validation,
 * against the REAL Firestore + Storage emulators.
 *
 * Run: npm run test:emulator:groupImage
 *   (firebase emulators:exec --only firestore,storage --project demo-mm)
 * Skipped when the emulators are not running.
 *
 * These prove the SERVER (Admin SDK) enforces owner/admin/membership/privacy/
 * status + object validation WITHOUT any cross-service Storage rule. Real signed
 * URL round-trips are production-only (signBlob) — here signUrl is stubbed and
 * uploads are simulated via Admin SDK .save(), which is exactly what a finalized
 * signed PUT leaves behind.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {App, initializeApp} from "firebase-admin/app";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";

import * as core from "../../groupImageV2";

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU
  ? false
  : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator:groupImage)";

const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-mm";
const BUCKET = process.env.GROUP_IMAGE_BUCKET ?? `${PROJECT}.appspot.com`;

let app: App | undefined;
let seq = 0;
function firebaseApp(): App {
  if (!app) app = initializeApp({projectId: PROJECT});
  return app;
}
function db() {
  return getFirestore(firebaseApp());
}
function bucket() {
  return getStorage(firebaseApp()).bucket(BUCKET);
}

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

function deps(): core.GroupImageDeps {
  return {
    db: db(),
    bucket: bucket() as unknown as core.StorageBucketLike,
    fieldDelete: () => FieldValue.delete(),
    serverTimestamp: () => FieldValue.serverTimestamp(),
    randomId: () => `asset${seq++}`,
    now: () => 1_700_000_000_000,
    signUploadUrl: async (p) => `https://emu.upload/${encodeURIComponent(p)}`,
    signReadUrl: async (p) => `https://emu.read/${encodeURIComponent(p)}`,
  };
}

interface SeedOpts {
  privacy?: "public" | "private";
  status?: string;
  members?: Record<string, string>; // uid -> role
  imagePath?: string;
}
async function seedGroup(owner: string, opts: SeedOpts = {}): Promise<string> {
  const gid = `g${seq++}`;
  const ref = db().collection("groups").doc(gid);
  const data: Record<string, unknown> = {
    name: "G",
    privacy: opts.privacy ?? "public",
    ownerUid: owner,
  };
  if (opts.status) data.status = opts.status;
  if (opts.imagePath) {
    data.imagePath = opts.imagePath;
    data.imageVersion = "seed";
  }
  await ref.set(data);
  const members = opts.members ?? {[owner]: "owner"};
  for (const [uid, role] of Object.entries(members)) {
    await ref.collection("members").doc(uid).set({uid, role});
  }
  return gid;
}

async function saveObject(
  path: string,
  buf: Buffer,
  contentType = core.CONTENT_TYPE
): Promise<void> {
  await bucket().file(path).save(buf, {contentType, resumable: false});
}

async function code(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "NO_ERROR";
  } catch (e) {
    return e instanceof core.GroupImageError ? e.code : `OTHER:${String(e)}`;
  }
}

// ---------------- PREPARE ----------------
test("prepare: owner allowed → path belongs to group + pending doc", {skip}, async () => {
  const owner = `o${seq++}`;
  const gid = await seedGroup(owner);
  const r = await core.prepareGroupImageUpload(owner, {groupId: gid}, deps());
  assert.ok(r.objectPath.startsWith(`group_images/${gid}/`));
  assert.equal(r.contentType, core.CONTENT_TYPE);
  assert.equal(core.parseObjectPath(r.objectPath, gid), r.assetId);
  const pend = await db()
    .collection("groups").doc(gid)
    .collection("image_uploads").doc(r.assetId).get();
  assert.equal(pend.exists, true);
});

test("prepare: admin allowed", {skip}, async () => {
  const owner = `o${seq++}`; const admin = `a${seq++}`;
  const gid = await seedGroup(owner, {members: {[owner]: "owner", [admin]: "admin"}});
  const r = await core.prepareGroupImageUpload(admin, {groupId: gid}, deps());
  assert.ok(r.objectPath.startsWith(`group_images/${gid}/`));
});

test("prepare: member DENIED", {skip}, async () => {
  const owner = `o${seq++}`; const mem = `m${seq++}`;
  const gid = await seedGroup(owner, {members: {[owner]: "owner", [mem]: "member"}});
  assert.equal(
    await code(() => core.prepareGroupImageUpload(mem, {groupId: gid}, deps())),
    "permission-denied");
});

test("prepare: non-member DENIED", {skip}, async () => {
  const owner = `o${seq++}`;
  const gid = await seedGroup(owner);
  assert.equal(
    await code(() => core.prepareGroupImageUpload(`x${seq++}`, {groupId: gid}, deps())),
    "permission-denied");
});

test("prepare: deleted group DENIED", {skip}, async () => {
  const owner = `o${seq++}`;
  const gid = await seedGroup(owner, {status: "deleted"});
  assert.equal(
    await code(() => core.prepareGroupImageUpload(owner, {groupId: gid}, deps())),
    "failed-precondition");
});

test("prepare: unauthenticated DENIED", {skip}, async () => {
  const gid = await seedGroup(`o${seq++}`);
  assert.equal(
    await code(() => core.prepareGroupImageUpload(null, {groupId: gid}, deps())),
    "unauthenticated");
});

// ---------------- FINALIZE ----------------
test("finalize: owner + valid object → commits imagePath, clears legacy, pending gone", {skip}, async () => {
  const owner = `o${seq++}`;
  const gid = await seedGroup(owner);
  // simulate legacy field present to prove it is cleaned
  await db().collection("groups").doc(gid).set({imageUrl: "https://old"}, {merge: true});
  const prep = await core.prepareGroupImageUpload(owner, {groupId: gid}, deps());
  await saveObject(prep.objectPath, jpeg);
  const r = await core.finalizeGroupImageUpload(
    owner, {groupId: gid, objectPath: prep.objectPath}, deps());
  assert.equal(r.status, "OK");
  const g = (await db().collection("groups").doc(gid).get()).data()!;
  assert.equal(g.imagePath, prep.objectPath);
  assert.equal(g.imageVersion, prep.assetId);
  assert.equal(g.imageUrl, undefined); // legacy cleared
  const pend = await db().collection("groups").doc(gid)
    .collection("image_uploads").doc(prep.assetId).get();
  assert.equal(pend.exists, false);
});

test("finalize: cross-group objectPath DENIED", {skip}, async () => {
  const owner = `o${seq++}`;
  const gidA = await seedGroup(owner);
  const gidB = await seedGroup(owner);
  const prepB = await core.prepareGroupImageUpload(owner, {groupId: gidB}, deps());
  await saveObject(prepB.objectPath, jpeg);
  // owner IS manager of gidA, but objectPath belongs to gidB → invalid-argument.
  assert.equal(
    await code(() => core.finalizeGroupImageUpload(
      owner, {groupId: gidA, objectPath: prepB.objectPath}, deps())),
    "invalid-argument");
});

test("finalize: object missing DENIED", {skip}, async () => {
  const owner = `o${seq++}`;
  const gid = await seedGroup(owner);
  const prep = await core.prepareGroupImageUpload(owner, {groupId: gid}, deps());
  // never upload
  assert.equal(
    await code(() => core.finalizeGroupImageUpload(
      owner, {groupId: gid, objectPath: prep.objectPath}, deps())),
    "failed-precondition");
});

test("finalize: oversized object DENIED + object deleted", {skip}, async () => {
  const owner = `o${seq++}`;
  const gid = await seedGroup(owner);
  const prep = await core.prepareGroupImageUpload(owner, {groupId: gid}, deps());
  await saveObject(prep.objectPath, Buffer.alloc(core.MAX_BYTES + 1024, 1));
  assert.equal(
    await code(() => core.finalizeGroupImageUpload(
      owner, {groupId: gid, objectPath: prep.objectPath}, deps())),
    "invalid-argument");
  const [exists] = await bucket().file(prep.objectPath).exists();
  assert.equal(exists, false); // invalid object cleaned up
});

test("finalize: non-image MIME DENIED", {skip}, async () => {
  const owner = `o${seq++}`;
  const gid = await seedGroup(owner);
  const prep = await core.prepareGroupImageUpload(owner, {groupId: gid}, deps());
  await saveObject(prep.objectPath, jpeg, "text/plain");
  assert.equal(
    await code(() => core.finalizeGroupImageUpload(
      owner, {groupId: gid, objectPath: prep.objectPath}, deps())),
    "invalid-argument");
});

test("finalize: group deleted AFTER upload DENIED", {skip}, async () => {
  const owner = `o${seq++}`;
  const gid = await seedGroup(owner);
  const prep = await core.prepareGroupImageUpload(owner, {groupId: gid}, deps());
  await saveObject(prep.objectPath, jpeg);
  await db().collection("groups").doc(gid).set({status: "deleted"}, {merge: true});
  assert.equal(
    await code(() => core.finalizeGroupImageUpload(
      owner, {groupId: gid, objectPath: prep.objectPath}, deps())),
    "failed-precondition");
});

test("finalize: manager removed AFTER upload DENIED", {skip}, async () => {
  const owner = `o${seq++}`; const admin = `a${seq++}`;
  const gid = await seedGroup(owner, {members: {[owner]: "owner", [admin]: "admin"}});
  const prep = await core.prepareGroupImageUpload(admin, {groupId: gid}, deps());
  await saveObject(prep.objectPath, jpeg);
  await db().collection("groups").doc(gid).collection("members").doc(admin).delete();
  assert.equal(
    await code(() => core.finalizeGroupImageUpload(
      admin, {groupId: gid, objectPath: prep.objectPath}, deps())),
    "permission-denied");
});

test("finalize: replace keeps commit + deletes OLD object", {skip}, async () => {
  const owner = `o${seq++}`;
  const gid = await seedGroup(owner);
  const p1 = await core.prepareGroupImageUpload(owner, {groupId: gid}, deps());
  await saveObject(p1.objectPath, jpeg);
  await core.finalizeGroupImageUpload(owner, {groupId: gid, objectPath: p1.objectPath}, deps());
  const p2 = await core.prepareGroupImageUpload(owner, {groupId: gid}, deps());
  await saveObject(p2.objectPath, jpeg);
  await core.finalizeGroupImageUpload(owner, {groupId: gid, objectPath: p2.objectPath}, deps());
  const g = (await db().collection("groups").doc(gid).get()).data()!;
  assert.equal(g.imagePath, p2.objectPath);
  const [oldExists] = await bucket().file(p1.objectPath).exists();
  assert.equal(oldExists, false); // old object cleaned after new commit
});

// ---------------- RESOLVE ----------------
async function seedWithImage(owner: string, opts: SeedOpts = {}): Promise<string> {
  const gid = await seedGroup(owner, opts);
  const prep = await core.prepareGroupImageUpload(owner, {groupId: gid}, deps());
  await saveObject(prep.objectPath, jpeg);
  await core.finalizeGroupImageUpload(owner, {groupId: gid, objectPath: prep.objectPath}, deps());
  return gid;
}

test("resolve: public group by non-member ALLOWED (signed url)", {skip}, async () => {
  const owner = `o${seq++}`;
  const gid = await seedWithImage(owner, {privacy: "public"});
  const r = await core.getGroupImageUrl(`x${seq++}`, gid, deps());
  assert.ok(r.imageUrl && r.imageUrl.startsWith("https://emu.read/"));
});

test("resolve: private group by member ALLOWED", {skip}, async () => {
  const owner = `o${seq++}`; const mem = `m${seq++}`;
  const gid = await seedWithImage(owner, {
    privacy: "private", members: {[owner]: "owner", [mem]: "member"}});
  const r = await core.getGroupImageUrl(mem, gid, deps());
  assert.ok(r.imageUrl);
});

test("resolve: private group by non-member DENIED", {skip}, async () => {
  const owner = `o${seq++}`;
  const gid = await seedWithImage(owner, {privacy: "private"});
  assert.equal(
    await code(() => core.getGroupImageUrl(`x${seq++}`, gid, deps())),
    "permission-denied");
});

test("resolve: deleted group DENIED", {skip}, async () => {
  const owner = `o${seq++}`;
  const gid = await seedWithImage(owner, {privacy: "public"});
  await db().collection("groups").doc(gid).set({status: "deleted"}, {merge: true});
  assert.equal(
    await code(() => core.getGroupImageUrl(owner, gid, deps())),
    "failed-precondition");
});

test("resolve: no image → null url (no throw)", {skip}, async () => {
  const owner = `o${seq++}`;
  const gid = await seedGroup(owner, {privacy: "public"});
  const r = await core.getGroupImageUrl(owner, gid, deps());
  assert.equal(r.imageUrl, null);
});

test("resolve batch: only authorized + imaged returned", {skip}, async () => {
  const owner = `o${seq++}`; const viewer = `v${seq++}`;
  const pub = await seedWithImage(owner, {privacy: "public"});
  const priv = await seedWithImage(owner, {privacy: "private"}); // viewer not member
  const none = await seedGroup(owner, {privacy: "public"}); // no image
  const r = await core.getGroupImageUrls(viewer, [pub, priv, none], deps());
  assert.ok(r.images[pub]);
  assert.equal(r.images[priv], undefined); // private, viewer unauthorized
  assert.equal(r.images[none], undefined); // no image
});

// ---------------- REMOVE ----------------
test("remove: owner ALLOWED → clears imagePath + deletes object", {skip}, async () => {
  const owner = `o${seq++}`;
  const gid = await seedGroup(owner);
  const prep = await core.prepareGroupImageUpload(owner, {groupId: gid}, deps());
  await saveObject(prep.objectPath, jpeg);
  await core.finalizeGroupImageUpload(owner, {groupId: gid, objectPath: prep.objectPath}, deps());
  await core.removeGroupImage(owner, gid, deps());
  const g = (await db().collection("groups").doc(gid).get()).data()!;
  assert.equal(g.imagePath, undefined);
  const [exists] = await bucket().file(prep.objectPath).exists();
  assert.equal(exists, false);
});

test("remove: member DENIED", {skip}, async () => {
  const owner = `o${seq++}`; const mem = `m${seq++}`;
  const gid = await seedGroup(owner, {members: {[owner]: "owner", [mem]: "member"}});
  assert.equal(await code(() => core.removeGroupImage(mem, gid, deps())), "permission-denied");
});

test("remove: non-member DENIED", {skip}, async () => {
  const owner = `o${seq++}`;
  const gid = await seedGroup(owner);
  assert.equal(await code(() => core.removeGroupImage(`x${seq++}`, gid, deps())), "permission-denied");
});
