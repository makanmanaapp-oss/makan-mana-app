/**
 * WAVE 3 GATE 3F — CASE C: emulator proof for the LIVE-DERIVED Wave 3 ruleset.
 *
 * This file proves three things about `ops/wave3/rules-rebase/firestore.rules`:
 *
 *   A. It FIXES the Gate 3F blocker — the Wave 3 engagement reads that the
 *      ACTUAL live ruleset denies by default now succeed.
 *   B. It PRESERVES every live protection that the Wave 3 branch ruleset would
 *      have removed — most importantly `accountActive()` suspension
 *      enforcement, the `accountStatus*` protected fields, and the feed
 *      `pollVotes` read rule.
 *   C. The Wave 3C/3D post + comment lifecycle gates are enforced.
 *
 * Each group runs the SAME operation against up to three rulesets loaded side
 * by side in one emulator, so the artifact's behaviour is stated as a contrast,
 * not as an isolated assertion:
 *
 *   rebased  — ops/wave3/rules-rebase/firestore.rules  (this artifact)
 *   live     — ops/wave3/rules-rebase/live-baseline.rules
 *              (byte-exact copy of the deployed production ruleset)
 *   branch   — <repo root>/firestore.rules  (the Wave 3 branch ruleset)
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
  rebased: resolve(__dirname, "firestore.rules"),
  live: resolve(__dirname, "live-baseline.rules"),
  branch: resolve(__dirname, "..", "..", "..", "firestore.rules"),
};

const USER = "user-1";
const OTHER = "user-2";
const SUSPENDED = "user-suspended";

/** @type {Record<string, import("@firebase/rules-unit-testing").RulesTestEnvironment>} */
const envs = {};

before(async () => {
  for (const [name, path] of Object.entries(RULES)) {
    envs[name] = await initializeTestEnvironment({
      projectId: `demo-mm-w3-gate3f-${name}`,
      firestore: {rules: readFileSync(path, "utf8"), host, port},
    });
  }
});

after(async () => {
  for (const env of Object.values(envs)) {
    if (env) await env.cleanup();
  }
});

beforeEach(async () => {
  for (const env of Object.values(envs)) await env.clearFirestore();
});

/** Writes a document bypassing rules, in EVERY loaded ruleset environment. */
async function seedAll(path, data) {
  for (const env of Object.values(envs)) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), data);
    });
  }
}

const as = (which, uid) => envs[which].authenticatedContext(uid).firestore();
const anon = (which) => envs[which].unauthenticatedContext().firestore();

// ───────────────────────────────────────────────────────────────────────────
// A. THE GATE 3F BLOCKER — engagement reads live currently denies.
// ───────────────────────────────────────────────────────────────────────────

test("A1. own restaurant_follows doc: DENIED live, ALLOWED rebased", async () => {
  await seedAll("restaurant_follows/rf.user-1.canon-1", {
    followerUid: USER,
    canonicalPlaceId: "canon-1",
  });
  const path = "restaurant_follows/rf.user-1.canon-1";

  // This is the exact failure behind "the Follow button does nothing".
  await assertFails(getDoc(doc(as("live", USER), path)));
  await assertSucceeds(getDoc(doc(as("rebased", USER), path)));
});

test("A2. follower COUNT: DENIED live, ALLOWED rebased, never client-writable", async () => {
  await seedAll("restaurant_public/canon-1", {followerCount: 1});

  await assertFails(getDoc(doc(as("live", USER), "restaurant_public/canon-1")));
  await assertSucceeds(getDoc(doc(as("rebased", USER), "restaurant_public/canon-1")));
  // The aggregate stays server-authoritative.
  await assertFails(setDoc(doc(as("rebased", USER), "restaurant_public/canon-1"), {followerCount: 999}));
  await assertFails(updateDoc(doc(as("rebased", USER), "restaurant_public/canon-1"), {followerCount: 999}));
  // Anonymous callers get nothing.
  await assertFails(getDoc(doc(anon("rebased"), "restaurant_public/canon-1")));
});

test("A3. the follower LIST is still not enumerable by another user", async () => {
  await seedAll("restaurant_follows/rf.user-1.canon-1", {
    followerUid: USER,
    canonicalPlaceId: "canon-1",
  });
  await assertFails(
    getDoc(doc(as("rebased", OTHER), "restaurant_follows/rf.user-1.canon-1"))
  );
  await assertFails(
    getDoc(doc(anon("rebased"), "restaurant_follows/rf.user-1.canon-1"))
  );
});

test("A4. every client write to the engagement collections is denied", async () => {
  await seedAll("restaurant_follows/rf.user-1.canon-1", {followerUid: USER, canonicalPlaceId: "canon-1"});
  await seedAll("menu_comments/c1", {
    canonicalPlaceId: "canon-1", menuItemId: "m1", authorUid: USER,
    status: "visible", text: "sedap",
  });
  const db = as("rebased", USER);

  await assertFails(setDoc(doc(db, "restaurant_follows/rf.user-1.canon-2"), {followerUid: USER, canonicalPlaceId: "canon-2"}));
  await assertFails(updateDoc(doc(db, "restaurant_follows/rf.user-1.canon-1"), {canonicalPlaceId: "canon-9"}));
  await assertFails(deleteDoc(doc(db, "restaurant_follows/rf.user-1.canon-1")));
  await assertFails(setDoc(doc(db, "menu_comments/c2"), {canonicalPlaceId: "canon-1", menuItemId: "m1", authorUid: USER, status: "visible", text: "spoof"}));
  await assertFails(updateDoc(doc(db, "menu_comments/c1"), {text: "edited"}));
  await assertFails(deleteDoc(doc(db, "menu_comments/c1")));
});

test("A5. menu_comments expose ONLY the 'visible' lifecycle state", async () => {
  await seedAll("menu_comments/visible-1", {status: "visible", text: "ok"});
  await seedAll("menu_comments/hidden-1", {status: "hidden", text: "moderated"});
  await seedAll("menu_comments/removed-1", {status: "removed", text: "gone"});
  await seedAll("menu_comments/legacy-1", {text: "no status field"});
  const db = as("rebased", USER);

  await assertSucceeds(getDoc(doc(db, "menu_comments/visible-1")));
  await assertFails(getDoc(doc(db, "menu_comments/hidden-1")));
  await assertFails(getDoc(doc(db, "menu_comments/removed-1")));
  // Fail-closed: a document with no status is NOT readable.
  await assertFails(getDoc(doc(db, "menu_comments/legacy-1")));
});

// ───────────────────────────────────────────────────────────────────────────
// B. LIVE PROTECTIONS THE BRANCH RULESET WOULD HAVE REMOVED.
// ───────────────────────────────────────────────────────────────────────────

test("B1. accountActive(): a SUSPENDED account cannot write — branch ALLOWS it", async () => {
  await seedAll(`users/${SUSPENDED}`, {accountStatus: "suspended"});
  await seedAll(`users/${USER}`, {accountStatus: "active"});

  // Live and rebased both block the suspended account...
  for (const which of ["live", "rebased"]) {
    await assertFails(setDoc(doc(as(which, SUSPENDED), `user_profiles/${SUSPENDED}`), {displayName: "x"}));
    await assertFails(setDoc(doc(as(which, SUSPENDED), "meal_logs/m-sus"), {userId: SUSPENDED}));
    // ...while an ACTIVE account is unaffected.
    await assertSucceeds(setDoc(doc(as(which, USER), `user_profiles/${USER}`), {displayName: "ok"}));
    await assertSucceeds(setDoc(doc(as(which, USER), "meal_logs/m-ok"), {userId: USER}));
  }

  // The branch ruleset dropped accountActive() entirely: the suspended account
  // writes freely. This is the regression the rebase exists to prevent.
  await assertSucceeds(setDoc(doc(as("branch", SUSPENDED), `user_profiles/${SUSPENDED}`), {displayName: "x"}));
  await assertSucceeds(setDoc(doc(as("branch", SUSPENDED), "meal_logs/m-sus"), {userId: SUSPENDED}));
});

test("B2. accountStatus* stays a protected field — branch allows self-unsuspend", async () => {
  await seedAll(`users/${USER}`, {accountStatus: "active", displayName: "u"});

  for (const which of ["live", "rebased"]) {
    await assertFails(updateDoc(doc(as(which, USER), `users/${USER}`), {accountStatus: "active", accountStatusReason: "self"}));
    await assertFails(updateDoc(doc(as(which, USER), `users/${USER}`), {accountStatusChangedBy: USER}));
    // A normal, non-protected update still works.
    await assertSucceeds(updateDoc(doc(as(which, USER), `users/${USER}`), {displayName: "renamed"}));
  }

  // PRIVILEGE ESCALATION under the branch ruleset: accountStatus is writable.
  await assertSucceeds(updateDoc(doc(as("branch", USER), `users/${USER}`), {accountStatus: "active", accountStatusReason: "self"}));
});

test("B3. a suspended user cannot update their own users/{uid} document", async () => {
  await seedAll(`users/${SUSPENDED}`, {accountStatus: "suspended", displayName: "s"});

  for (const which of ["live", "rebased"]) {
    await assertFails(updateDoc(doc(as(which, SUSPENDED), `users/${SUSPENDED}`), {displayName: "evade"}));
  }
  await assertSucceeds(updateDoc(doc(as("branch", SUSPENDED), `users/${SUSPENDED}`), {displayName: "evade"}));
});

test("B4. feed pollVotes read rule survives — branch DENIES it (poll UI breaks)", async () => {
  await seedAll("feed_posts/p1", {authorUid: OTHER, visibility: "public", status: "active"});
  await seedAll(`feed_posts/p1/pollVotes/${USER}`, {optionIndex: 1});
  await seedAll(`feed_posts/p1/pollVotes/${OTHER}`, {optionIndex: 0});

  for (const which of ["live", "rebased"]) {
    // Own vote readable (so the app can render the user's own choice)...
    await assertSucceeds(getDoc(doc(as(which, USER), `feed_posts/p1/pollVotes/${USER}`)));
    // ...another voter's identity is NOT.
    await assertFails(getDoc(doc(as(which, USER), `feed_posts/p1/pollVotes/${OTHER}`)));
    // Voting stays callable-only.
    await assertFails(setDoc(doc(as(which, USER), `feed_posts/p1/pollVotes/${USER}`), {optionIndex: 2}));
  }

  // The branch ruleset dropped the rule, so the catch-all denies even the
  // user's own vote — the poll surface would silently stop working.
  await assertFails(getDoc(doc(as("branch", USER), `feed_posts/p1/pollVotes/${USER}`)));
});

test("B5. server-only notification + admin-bridge stores stay fully denied", async () => {
  const paths = [
    "meal_reminder_schedules/s1",
    "notification_reconcile_state/r1",
    "notification_test_recipients/user-1",
    "notification_broadcast_runs/run-1",
    "admin_audit_events/e1",
    "admin_bridge_requests/req-1",
    "admin_bridge_rate/w1",
  ];
  for (const path of paths) await seedAll(path, {seeded: true});

  const db = as("rebased", USER);
  for (const path of paths) {
    await assertFails(getDoc(doc(db, path)));
    await assertFails(setDoc(doc(db, path), {hacked: true}));
  }
});

// ───────────────────────────────────────────────────────────────────────────
// C. WAVE 3C / 3D LIFECYCLE GATES.
// ───────────────────────────────────────────────────────────────────────────

test("C1. post lifecycle: non-author reads ONLY status == 'active'", async () => {
  await seedAll("feed_posts/active-1", {authorUid: OTHER, visibility: "public", status: "active"});
  await seedAll("feed_posts/hidden-1", {authorUid: OTHER, visibility: "public", status: "hidden"});
  await seedAll("feed_posts/deleted-1", {authorUid: OTHER, visibility: "public", status: "deleted"});
  await seedAll("feed_posts/legacy-1", {authorUid: OTHER, visibility: "public"});
  const db = as("rebased", USER);

  await assertSucceeds(getDoc(doc(db, "feed_posts/active-1")));
  await assertFails(getDoc(doc(db, "feed_posts/hidden-1")));
  await assertFails(getDoc(doc(db, "feed_posts/deleted-1")));
  // Fail-closed on a status-less legacy document. This is why the backfill is
  // a HARD deploy precondition — see README §5.
  await assertFails(getDoc(doc(db, "feed_posts/legacy-1")));

  // The author always sees their own history.
  await assertSucceeds(getDoc(doc(as("rebased", OTHER), "feed_posts/hidden-1")));
});

test("C2. comment lifecycle: non-author reads ONLY status == 'active'", async () => {
  await seedAll("feed_posts/p1", {authorUid: OTHER, visibility: "public", status: "active"});
  await seedAll("feed_posts/p1/comments/c-active", {authorUid: OTHER, status: "active", text: "hi"});
  await seedAll("feed_posts/p1/comments/c-deleted", {authorUid: OTHER, status: "deleted", text: "bye"});
  await seedAll("feed_posts/p1/comments/c-legacy", {authorUid: OTHER, text: "no status"});
  const db = as("rebased", USER);

  await assertSucceeds(getDoc(doc(db, "feed_posts/p1/comments/c-active")));
  await assertFails(getDoc(doc(db, "feed_posts/p1/comments/c-deleted")));
  await assertFails(getDoc(doc(db, "feed_posts/p1/comments/c-legacy")));
});

test("C3. comment CREATE must declare status 'active' AND respect suspension", async () => {
  await seedAll("feed_posts/p1", {authorUid: OTHER, visibility: "public", status: "active"});
  await seedAll(`users/${USER}`, {accountStatus: "active"});
  await seedAll(`users/${SUSPENDED}`, {accountStatus: "suspended"});
  const db = as("rebased", USER);

  await assertSucceeds(setDoc(doc(db, "feed_posts/p1/comments/ok"), {authorUid: USER, status: "active", text: "hi"}));
  // Wave 3D lifecycle gate.
  await assertFails(setDoc(doc(db, "feed_posts/p1/comments/no-status"), {authorUid: USER, text: "hi"}));
  await assertFails(setDoc(doc(db, "feed_posts/p1/comments/born-deleted"), {authorUid: USER, status: "deleted", text: "hi"}));
  await assertFails(setDoc(doc(db, "feed_posts/p1/comments/bogus"), {authorUid: USER, status: "whatever", text: "hi"}));
  // Live suspension gate, preserved alongside it.
  await assertFails(setDoc(doc(as("rebased", SUSPENDED), "feed_posts/p1/comments/sus"), {authorUid: SUSPENDED, status: "active", text: "hi"}));
});

// ───────────────────────────────────────────────────────────────────────────
// D. THE FLOOR: nothing outside a declared rule is reachable.
// ───────────────────────────────────────────────────────────────────────────

test("D1. the default-deny catch-all still governs undeclared collections", async () => {
  await seedAll("some_unknown_collection/x", {a: 1});
  const db = as("rebased", USER);
  await assertFails(getDoc(doc(db, "some_unknown_collection/x")));
  await assertFails(setDoc(doc(db, "some_unknown_collection/y"), {a: 1}));
});
