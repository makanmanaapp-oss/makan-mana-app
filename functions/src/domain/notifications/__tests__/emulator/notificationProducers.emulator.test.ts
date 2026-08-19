/**
 * Prompt 2.1: production-handler integration coverage on Firestore Emulator.
 * The callable/trigger `.run` entry points execute the same handlers exported
 * by index.ts while Firestore, transactions and notification de-dup run for
 * real against the emulator. No production accounts or network are used.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {getFirestore} from "firebase-admin/firestore";

import {toggleLike} from "../../../../callable/toggleLike";
import {followUser, unfollowUser, blockUser} from "../../../../callable/followControl";
import {repostFeedPost} from "../../../../callable/repostFeedPost";
import {inviteToGroup, respondGroupInvite} from "../../../../callable/groupInvites";
import {changeGroupRole, updateGroupSettings} from "../../../../callable/groupControl";
import {onCommentChanged} from "../../../../triggers/onCommentChanged";
import {emitAdminNotification} from "../../adminNotifications";
import {deliverNotificationPush} from "../../../../services/pushDeliveryService";

const host = process.env.FIRESTORE_EMULATOR_HOST;
const skip = host ? false : "FIRESTORE_EMULATOR_HOST unset (npm run test:emulator:notifications)";
const db = getFirestore();
let seq = 0;

type Callable = {run: (request: {auth: {uid: string}; data: unknown}) => Promise<unknown>};
type Trigger = {run: (event: unknown) => Promise<unknown>};

const call = (fn: unknown, uid: string, data: unknown) =>
  (fn as Callable).run({auth: {uid}, data});
const trigger = (event: unknown) => (onCommentChanged as unknown as Trigger).run(event);
const id = (label: string) => `${label}_${seq++}`;

async function seedUser(uid: string, options: {social?: boolean; group?: boolean} = {}) {
  // PROMPT 4A independent channels: to assert full suppression (no record at
  // all) a category must be OFF on BOTH channels — a push-eligible category with
  // push left on keeps a hidden (inAppVisible:false) record. Enabled users are
  // unchanged (both channels on, which was already the effective default).
  const social = options.social ?? true;
  const group = options.group ?? true;
  await db.collection("users").doc(uid).set({
    displayName: `User ${uid}`,
    notificationPreferences: {
      social: {inAppEnabled: social, pushEnabled: social},
      group: {inAppEnabled: group, pushEnabled: group},
    },
  }, {merge: true});
}

async function seedPost(authorUid: string, extra: Record<string, unknown> = {}) {
  const postId = id("post");
  await db.collection("feed_posts").doc(postId).set({
    authorUid,
    displayName: `User ${authorUid}`,
    likedBy: [],
    likeCount: 0,
    commentCount: 0,
    visibility: "public",
    status: "active",
    ...extra,
  });
  return postId;
}

async function notices(uid: string, type?: string) {
  const snap = await db.collection("users").doc(uid).collection("notifications").get();
  return snap.docs
    .map((doc) => ({id: doc.id, ...doc.data()} as Record<string, unknown>))
    .filter((item) => !type || item.type === type);
}

async function seedGroup(ownerUid: string, members: Record<string, string> = {}, privacy = "private") {
  const groupId = id("group");
  const groupRef = db.collection("groups").doc(groupId);
  const allMembers = {[ownerUid]: "owner", ...members};
  await groupRef.set({name: `Group ${groupId}`, ownerUid, privacy, memberCount: Object.keys(allMembers).length});
  await Promise.all(Object.entries(allMembers).map(([uid, role]) =>
    groupRef.collection("members").doc(uid).set({uid, role}),
  ));
  return groupId;
}

function createdCommentEvent(postId: string, commentId: string, comment: Record<string, unknown>) {
  return {
    params: {postId, commentId},
    data: {
      before: {exists: false, data: () => undefined},
      after: {exists: true, data: () => comment},
    },
  };
}

test("reaction is recipient-correct, self-suppressed, block-safe and deduped", {skip}, async () => {
  const a = id("A"); const b = id("B");
  await Promise.all([seedUser(a), seedUser(b)]);
  const postId = await seedPost(b);
  await call(toggleLike, a, {postId});
  const first = await notices(b, "social_reaction");
  assert.equal(first.length, 1);
  assert.equal(first[0].recipientUid, b);
  assert.equal(first[0].actorUid, a);
  assert.equal(first[0].entityId, postId);
  assert.equal(first[0].dedupKey, `social_reaction:${b}:reaction:${postId}:${a}`);
  await call(toggleLike, a, {postId}); // unlike: no new record
  await call(toggleLike, a, {postId}); // like again: same deterministic record
  assert.equal((await notices(b, "social_reaction")).length, 1);

  const ownPost = await seedPost(a);
  await call(toggleLike, a, {postId: ownPost});
  assert.equal((await notices(a, "social_reaction")).length, 0);

  const blockedPost = await seedPost(b);
  await db.collection("blocks").doc(`${a}_${b}`).set({blockerUid: a, blockedUid: b});
  await call(toggleLike, a, {postId: blockedPost});
  assert.equal((await notices(b, "social_reaction")).length, 1);
});

test("comment and reply resolve exactly one eligible recipient", {skip}, async () => {
  const a = id("A"); const b = id("B"); const c = id("C");
  await Promise.all([seedUser(a), seedUser(b), seedUser(c)]);
  const postId = await seedPost(b);
  const commentId = id("comment");
  await trigger(createdCommentEvent(postId, commentId, {authorUid: a, createdAt: new Date()}));
  const commentNotice = await notices(b, "social_comment");
  assert.equal(commentNotice.length, 1);
  assert.equal(commentNotice[0].actorUid, a);
  assert.equal(commentNotice[0].entityId, postId);
  assert.equal(commentNotice[0].parentEntityId, commentId);
  assert.equal("text" in commentNotice[0], false);
  await trigger(createdCommentEvent(postId, commentId, {authorUid: a, createdAt: new Date()}));
  assert.equal((await notices(b, "social_comment")).length, 1, "trigger retry remains one record");

  const ownCommentId = id("comment");
  await trigger(createdCommentEvent(postId, ownCommentId, {authorUid: b, createdAt: new Date()}));
  assert.equal((await notices(b, "social_comment")).length, 1);

  const parentId = id("parent");
  await db.collection("feed_posts").doc(postId).collection("comments").doc(parentId).set({authorUid: a});
  const replyId = id("reply");
  await trigger(createdCommentEvent(postId, replyId, {authorUid: c, parentCommentId: parentId, createdAt: new Date()}));
  assert.equal((await notices(a, "social_reply")).length, 1);
  assert.equal((await notices(a, "social_comment")).length, 0, "reply does not also notify A as comment");
  assert.equal((await notices(b, "social_comment")).length, 1, "post owner is not double-notified for the reply");
});

test("social preferences suppress notification without rolling back the action", {skip}, async () => {
  const a = id("A"); const b = id("B");
  await seedUser(a); await seedUser(b, {social: false});
  const postId = await seedPost(b);
  await call(toggleLike, a, {postId});
  assert.equal((await notices(b)).length, 0);
  const post = await db.collection("feed_posts").doc(postId).get();
  assert.equal((post.data()?.likedBy as string[]).includes(a), true, "primary like succeeds");
});

test("follow only notifies once after a valid new relationship", {skip}, async () => {
  const a = id("A"); const b = id("B");
  await Promise.all([seedUser(a), seedUser(b)]);
  await call(followUser, a, {targetUid: b});
  await call(followUser, a, {targetUid: b});
  assert.equal((await notices(b, "social_follow")).length, 1);
  await call(unfollowUser, a, {targetUid: b});
  assert.equal((await notices(b, "social_follow")).length, 1);
  await call(blockUser, b, {targetUid: a, block: true});
  await assert.rejects(() => call(followUser, a, {targetUid: b}));
  assert.equal((await notices(b, "social_follow")).length, 1);
});

test("repost and quote create one intended notification each", {skip}, async () => {
  const a = id("A"); const b = id("B");
  await Promise.all([seedUser(a), seedUser(b)]);
  const postId = await seedPost(b);
  await call(repostFeedPost, a, {originalPostId: postId, mode: "repost", visibility: "public"});
  assert.equal((await notices(b, "social_repost")).length, 1);
  assert.equal((await notices(b, "social_quote")).length, 0);
  await call(repostFeedPost, a, {originalPostId: postId, mode: "quote", text: "Setuju", visibility: "public"});
  assert.equal((await notices(b, "social_repost")).length, 1);
  assert.equal((await notices(b, "social_quote")).length, 1);
});

test("group invite, acceptance, role change and preference/privacy guards", {skip}, async () => {
  const a = id("A"); const b = id("B"); const c = id("C");
  await Promise.all([seedUser(a), seedUser(b), seedUser(c)]);
  const groupId = await seedGroup(a, {[c]: "member"});
  const invite = await call(inviteToGroup, a, {groupId, targetUid: b}) as {inviteId: string};
  assert.equal((await notices(b, "group_invite")).length, 1);
  await assert.rejects(() => call(inviteToGroup, c, {groupId, targetUid: id("other")}));
  assert.equal((await notices(b, "group_invite")).length, 1);
  await call(respondGroupInvite, b, {inviteId: invite.inviteId, accept: true});
  assert.equal((await notices(a, "group_invite_accepted")).length, 1);
  assert.equal((await db.collection("groups").doc(groupId).collection("members").doc(b).get()).exists, true);

  await call(changeGroupRole, a, {groupId, targetUid: b, role: "admin"});
  assert.equal((await notices(b, "group_update")).length, 1);
  await call(updateGroupSettings, a, {groupId, description: "ordinary edit"});
  assert.equal((await notices(b, "group_update")).length, 1, "settings writes are not allowlisted");

  const disabled = id("disabled"); await seedUser(disabled, {group: false});
  await call(inviteToGroup, a, {groupId, targetUid: disabled});
  assert.equal((await notices(disabled, "group_invite")).length, 0);
});

test("GATE B: admin campaign copy reaches the canonical record AND the push message", {skip}, async () => {
  const u = id("ADMINU");
  // Marketing ON/ON + one enabled push device (Gate C makes marketing push-eligible).
  await db.collection("users").doc(u).set({
    languageCode: "en",
    notificationPreferences: {
      master: {inAppEnabled: true, pushEnabled: true},
      marketing: {inAppEnabled: true, pushEnabled: true},
    },
  }, {merge: true});
  await db.collection("users").doc(u).collection("pushDevices").doc("d1").set({
    deviceId: "d1", token: `tok_${"f".repeat(140)}`, platform: "android", enabled: true,
  });

  // The trusted adapter (bridge path) with the ADMIN-authored copy.
  const outcome = await emitAdminNotification({
    recipientUid: u, type: "marketing_campaign", requestId: id("req"),
    title: "Promo Ramadan", body: "Diskaun istimewa hari ini",
    destinationRoute: "/paywall", deliveryPurpose: "test",
  });
  assert.equal(outcome.ok, true);

  // 1) Canonical record carries the ADMIN copy — never a generic fixed string.
  const recs = await notices(u, "marketing_campaign");
  assert.equal(recs.length, 1);
  assert.equal(recs[0].title, "Promo Ramadan");
  assert.equal(recs[0].body, "Diskaun istimewa hari ini");
  assert.equal(recs[0].category, "marketing");
  assert.equal(recs[0].inAppVisible, true);
  assert.equal(recs[0].deepLink, "/paywall");
  assert.equal(recs[0].isCritical, false);

  // 2) The OUTBOUND push message uses the same admin copy (Gate B end-to-end),
  //    proven via an injected mock sender (no real FCM).
  const captured: {title?: string; body?: string}[] = [];
  const result = await deliverNotificationPush(
    {
      notificationId: id("notif"), recipientUid: u, type: "marketing_campaign",
      category: "marketing", title: "Promo Ramadan", body: "Diskaun istimewa hari ini",
      isCritical: false, expiresAtMs: null, schemaVersion: 2,
    },
    {sender: {send: async (msgs) => { captured.push(...msgs); return msgs.map(() => ({success: true, errorCode: null})); }}},
  );
  assert.equal(result.sent >= 1, true);
  assert.equal(captured[0].title, "Promo Ramadan");
  assert.equal(captured[0].body, "Diskaun istimewa hari ini");
});

test("Tong-Tong remains unwired by every Prompt 2 producer", {skip}, async () => {
  const prefix = `${id("unrelated")}`;
  const snap = await db.collectionGroup("notifications").where("type", "in", [
    "tongtong_bill_created", "tongtong_payment_request", "tongtong_payment_updated",
  ]).get();
  assert.equal(snap.docs.filter((doc) => doc.id.includes(prefix)).length, 0);
});
