/**
 * WAVE 3 GATE 3F — emulator proof for the REBASED post-comment write freeze.
 *
 * The original Gate 3B freeze artifact was derived from repository commit
 * 759f650d, which had already drifted from production. Deploying it would have
 * silently REMOVED live protections. This rebased artifact is the ACTUAL live
 * production ruleset with exactly one clause changed:
 *
 *     feed_posts/{postId}/comments   allow create: if false;
 *
 * Three rulesets are loaded side by side so every claim is a contrast:
 *
 *   freeze    — ops/wave3/comment-write-freeze-rebased/firestore.rules
 *   live      — ops/wave3/rules-rebase/live-baseline.rules  (production, exact)
 *   oldFreeze — ops/wave3/comment-write-freeze/firestore.rules  (759f650d)
 *
 * Run: see README.md. Nothing here deploys anything.
 */
const {before, after, beforeEach, test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {resolve} = require("node:path");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {doc, getDoc, setDoc, updateDoc, deleteDoc} = require("firebase/firestore");

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST unset — run this file via `firebase emulators:exec`."
  );
}
const [host, portStr] = HOST.split(":");
const port = Number(portStr);

const RULES = {
  freeze: resolve(__dirname, "firestore.rules"),
  live: resolve(__dirname, "..", "rules-rebase", "live-baseline.rules"),
  oldFreeze: resolve(__dirname, "..", "comment-write-freeze", "firestore.rules"),
};

const POST_AUTHOR = "post-author-1";
const COMMENTER = "commenter-1";
const STRANGER = "stranger-1";
const SUSPENDED = "user-suspended";

/** @type {Record<string, import("@firebase/rules-unit-testing").RulesTestEnvironment>} */
const envs = {};

before(async () => {
  for (const [name, path] of Object.entries(RULES)) {
    envs[name] = await initializeTestEnvironment({
      projectId: `demo-mm-w3-gate3f-frz-${name.toLowerCase()}`,
      firestore: {rules: readFileSync(path, "utf8"), host, port},
    });
  }
});

after(async () => {
  for (const env of Object.values(envs)) if (env) await env.cleanup();
});

beforeEach(async () => {
  for (const env of Object.values(envs)) await env.clearFirestore();
});

async function seedAll(path, data) {
  for (const env of Object.values(envs)) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), data);
    });
  }
}

const as = (which, uid) => envs[which].authenticatedContext(uid).firestore();

/** Parent post owned by POST_AUTHOR. Live posts carry NO lifecycle status. */
const post = (extra) =>
  Object.assign({authorUid: POST_AUTHOR, visibility: "public", text: "induk"}, extra || {});

/** A payload that is FULLY VALID under the LIVE create rule. */
const validLiveComment = (extra) =>
  Object.assign(
    {authorUid: COMMENTER, postId: "p1", parentVisibility: "public", text: "komen ujian"},
    extra || {}
  );

// ───────────────────────────────────────────────────────────────────────────
// 1. THE FREEZE IS UNCONDITIONAL.
// ───────────────────────────────────────────────────────────────────────────

test("F1. a create that LIVE accepts is denied by the freeze (contrast)", async () => {
  await seedAll("feed_posts/p1", post());
  await assertSucceeds(
    setDoc(doc(as("live", COMMENTER), "feed_posts/p1/comments/c1"), validLiveComment())
  );
  await assertFails(
    setDoc(doc(as("freeze", COMMENTER), "feed_posts/p1/comments/c1"), validLiveComment())
  );
});

test("F2. no status value gets a client past the freeze", async () => {
  await seedAll("feed_posts/p1", post({commentEnabled: true}));
  for (const payload of [
    validLiveComment(),
    validLiveComment({status: "active"}),
    validLiveComment({status: "deleted"}),
  ]) {
    await assertFails(
      setDoc(doc(as("freeze", COMMENTER), "feed_posts/p1/comments/cx"), payload)
    );
  }
  // Not even the post author on their own comment-enabled post.
  await assertFails(
    setDoc(
      doc(as("freeze", POST_AUTHOR), "feed_posts/p1/comments/cy"),
      validLiveComment({authorUid: POST_AUTHOR})
    )
  );
});

// ───────────────────────────────────────────────────────────────────────────
// 2. READS STAY LIVE BEHAVIOUR — the freeze must not activate Wave 3.
// ───────────────────────────────────────────────────────────────────────────

test("F3. a status-less legacy comment and post stay readable (LIVE, not Wave 3)", async () => {
  await seedAll("feed_posts/p1", post());
  await seedAll("feed_posts/p1/comments/c1", {authorUid: COMMENTER, text: "legasi"});
  // Under the FINAL Wave 3 ruleset both of these reads are DENIED. Succeeding
  // here is the proof that the freeze does not activate Wave 3 early.
  await assertSucceeds(getDoc(doc(as("freeze", STRANGER), "feed_posts/p1/comments/c1")));
  await assertSucceeds(getDoc(doc(as("freeze", STRANGER), "feed_posts/p1")));
});

test("F4. deleted-comment read boundary and author bypass are unchanged", async () => {
  await seedAll("feed_posts/p1", post());
  await seedAll("feed_posts/p1/comments/c1", {authorUid: COMMENTER, text: "dipadam", status: "deleted"});
  await assertFails(getDoc(doc(as("freeze", STRANGER), "feed_posts/p1/comments/c1")));
  await assertSucceeds(getDoc(doc(as("freeze", COMMENTER), "feed_posts/p1/comments/c1")));
});

test("F5. comment UPDATE denied, author DELETE allowed, stranger DELETE denied", async () => {
  await seedAll("feed_posts/p1", post());
  await seedAll("feed_posts/p1/comments/c1", {authorUid: COMMENTER, text: "asal"});
  await assertFails(updateDoc(doc(as("freeze", COMMENTER), "feed_posts/p1/comments/c1"), {text: "diubah"}));
  await assertFails(deleteDoc(doc(as("freeze", STRANGER), "feed_posts/p1/comments/c1")));
  await assertSucceeds(deleteDoc(doc(as("freeze", COMMENTER), "feed_posts/p1/comments/c1")));
});

test("F6. post create/update denied, author delete allowed, group_only still private", async () => {
  await assertFails(setDoc(doc(as("freeze", POST_AUTHOR), "feed_posts/p9"), post()));
  await seedAll("feed_posts/p1", post());
  await seedAll("feed_posts/p2", post({visibility: "group_only", groupId: "g1"}));
  await assertFails(updateDoc(doc(as("freeze", POST_AUTHOR), "feed_posts/p1"), {text: "diubah"}));
  await assertFails(getDoc(doc(as("freeze", STRANGER), "feed_posts/p2")));
  await assertSucceeds(deleteDoc(doc(as("freeze", POST_AUTHOR), "feed_posts/p1")));
});

// ───────────────────────────────────────────────────────────────────────────
// 3. THE REASON FOR THE REBASE — live protections the OLD freeze had lost.
// ───────────────────────────────────────────────────────────────────────────

test("R1. accountActive(): suspended writes stay blocked — the OLD freeze allowed them", async () => {
  await seedAll(`users/${SUSPENDED}`, {accountStatus: "suspended"});

  await assertFails(setDoc(doc(as("freeze", SUSPENDED), `user_profiles/${SUSPENDED}`), {displayName: "x"}));
  await assertFails(setDoc(doc(as("freeze", SUSPENDED), "meal_logs/m1"), {userId: SUSPENDED}));

  // Deploying the 759f650d-derived freeze would have handed a suspended
  // account write access back.
  await assertSucceeds(setDoc(doc(as("oldFreeze", SUSPENDED), `user_profiles/${SUSPENDED}`), {displayName: "x"}));
  await assertSucceeds(setDoc(doc(as("oldFreeze", SUSPENDED), "meal_logs/m1"), {userId: SUSPENDED}));
});

test("R2. accountStatus* stays protected — the OLD freeze permitted self-unsuspend", async () => {
  await seedAll(`users/${COMMENTER}`, {accountStatus: "active", displayName: "u"});
  await assertFails(
    updateDoc(doc(as("freeze", COMMENTER), `users/${COMMENTER}`), {accountStatus: "active", accountStatusReason: "self"})
  );
  await assertSucceeds(
    updateDoc(doc(as("oldFreeze", COMMENTER), `users/${COMMENTER}`), {accountStatus: "active", accountStatusReason: "self"})
  );
});

test("R3. feed pollVotes stays readable to its own voter — the OLD freeze broke it", async () => {
  await seedAll("feed_posts/p1", post());
  await seedAll(`feed_posts/p1/pollVotes/${COMMENTER}`, {optionIndex: 1});
  await assertSucceeds(getDoc(doc(as("freeze", COMMENTER), `feed_posts/p1/pollVotes/${COMMENTER}`)));
  await assertFails(getDoc(doc(as("freeze", STRANGER), `feed_posts/p1/pollVotes/${COMMENTER}`)));
  await assertFails(getDoc(doc(as("oldFreeze", COMMENTER), `feed_posts/p1/pollVotes/${COMMENTER}`)));
});

test("R4. server-only notification + admin-bridge stores stay denied", async () => {
  const paths = [
    "meal_reminder_schedules/s1",
    "notification_reconcile_state/r1",
    "notification_test_recipients/commenter-1",
    "notification_broadcast_runs/run-1",
    "admin_audit_events/e1",
    "admin_bridge_requests/req-1",
    "admin_bridge_rate/w1",
  ];
  for (const p of paths) await seedAll(p, {seeded: true});
  for (const p of paths) {
    await assertFails(getDoc(doc(as("freeze", COMMENTER), p)));
    await assertFails(setDoc(doc(as("freeze", COMMENTER), p), {hacked: true}));
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 4. SOURCE-LEVEL: no Wave 3 construct leaked into the freeze.
// ───────────────────────────────────────────────────────────────────────────

test("N1. the freeze carries NO Wave 3 construct, and matches live everywhere else", () => {
  const freezeSrc = readFileSync(RULES.freeze, "utf8");
  const liveSrc = readFileSync(RULES.live, "utf8");

  for (const construct of [
    "commentLifecycleActive",
    "postLifecycleActive",
    "restaurant_follows",
    "restaurant_public",
    "menu_comments",
  ]) {
    const pattern = new RegExp(construct, "g");
    assert.equal(
      (freezeSrc.match(pattern) || []).length,
      (liveSrc.match(pattern) || []).length,
      `${construct} count must equal the LIVE count (no Wave 3 activation)`
    );
  }

  // The live-only protections are physically present.
  for (const token of [
    "function accountActive(",
    "match /pollVotes/{voterUid}",
    "match /admin_bridge_rate/",
    "match /meal_reminder_schedules/",
    "'accountStatus', 'accountStatusReason'",
  ]) {
    assert.ok(freezeSrc.includes(token), `missing live protection: ${token}`);
  }

  // Exactly ONE clause differs from live: the comment-create deny.
  assert.ok(freezeSrc.includes("allow create: if false;"));
  const liveCreate = "&& request.resource.data.text.size() <= 300";
  assert.ok(liveSrc.includes(liveCreate));
  assert.ok(!freezeSrc.includes(liveCreate), "the live comment-create rule must be gone");
});

test("N2. menu_comments stays default-deny under the freeze", async () => {
  await seedAll("menu_comments/mc1", {text: "x", status: "visible"});
  await assertFails(getDoc(doc(as("freeze", STRANGER), "menu_comments/mc1")));
  await assertFails(setDoc(doc(as("freeze", COMMENTER), "menu_comments/mc2"), {text: "x"}));
});
