/**
 * WAVE 3 GATE 3G — emulator proof for the ENGAGEMENT-ONLY (G6) ruleset.
 *
 * Two rulesets are loaded side by side in one emulator so every claim is a
 * contrast rather than an isolated assertion:
 *
 *   g6   — ops/wave3/rules-engagement-g6/firestore.rules      (to be deployed)
 *   live — ops/wave3/rules-engagement-g6/live-baseline.rules  (production, exact)
 *
 * The suite proves three things:
 *   A. the engagement reads production currently DENIES now succeed, under the
 *      exact query contracts the Flutter client issues;
 *   B. nothing in the engagement domain became client-writable, and the
 *      follower list is still not enumerable;
 *   C. every unrelated live behaviour is BIT-FOR-BIT unchanged — including the
 *      deliberate ABSENCE of the G1-G5 lifecycle rules, which this gate does
 *      not authorise.
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
const {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit, getDocs,
} = require("firebase/firestore");

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST unset — run this file via `firebase emulators:exec`."
  );
}
const [host, portStr] = HOST.split(":");
const port = Number(portStr);

const RULES = {
  g6: resolve(__dirname, "firestore.rules"),
  live: resolve(__dirname, "live-baseline.rules"),
};

// The real fixture this gate exists for.
const CANON = "PLC-379343ea37954e00ac22293c";
const ME = "user-me";
const OTHER = "user-other";
const SUSPENDED = "user-suspended";

/** @type {Record<string, import("@firebase/rules-unit-testing").RulesTestEnvironment>} */
const envs = {};

before(async () => {
  for (const [name, path] of Object.entries(RULES)) {
    envs[name] = await initializeTestEnvironment({
      projectId: `demo-mm-w3-g3g-${name}`,
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
const anon = (which) => envs[which].unauthenticatedContext().firestore();

/** ALLOW / DENY, so a rule's effect can be compared across two rulesets. */
async function outcome(promise) {
  try {
    await promise;
    return "ALLOW";
  } catch (e) {
    return "DENY";
  }
}

/**
 * Assert an operation behaves IDENTICALLY under g6 and live, and that the
 * shared behaviour is `expected`. This is how "unchanged" is proven: not by
 * reading the rule text, but by running the operation against both rulesets.
 */
async function unchanged(expected, op) {
  const g6 = await outcome(op(as("g6", ME), "g6"));
  const live = await outcome(op(as("live", ME), "live"));
  assert.equal(g6, live, `g6 (${g6}) diverged from live (${live})`);
  assert.equal(g6, expected, `expected ${expected}, got ${g6}`);
}

// ───────────────────────────────────────────────────────────────────────────
// A. THE READS THIS GATE UNBLOCKS
// ───────────────────────────────────────────────────────────────────────────

test("1. signed-in user CAN read the restaurant_public aggregate (live DENIES)", async () => {
  await seedAll(`restaurant_public/${CANON}`, {followerCount: 1, updatedAt: new Date()});
  // The exact failure behind the Gate 3F report:
  await assertFails(getDoc(doc(as("live", ME), `restaurant_public/${CANON}`)));
  // ...and its fix.
  const snap = await assertSucceeds(getDoc(doc(as("g6", ME), `restaurant_public/${CANON}`)));
  assert.equal(snap.data().followerCount, 1);
});

test("2. a SIGNED-OUT caller is denied the aggregate (signedIn contract holds)", async () => {
  await seedAll(`restaurant_public/${CANON}`, {followerCount: 1});
  await assertFails(getDoc(doc(anon("g6"), `restaurant_public/${CANON}`)));
  await assertFails(getDoc(doc(anon("live"), `restaurant_public/${CANON}`)));
});

test("3. user CAN read their OWN follow state — get AND the client's exact query", async () => {
  await seedAll(`restaurant_follows/rf.me.${CANON}`, {
    followerUid: ME, canonicalPlaceId: CANON, createdAt: new Date(),
  });
  await assertFails(getDoc(doc(as("live", ME), `restaurant_follows/rf.me.${CANON}`)));
  await assertSucceeds(getDoc(doc(as("g6", ME), `restaurant_follows/rf.me.${CANON}`)));

  // The Flutter provider issues exactly this query; it must be admissible.
  const q = query(
    collection(as("g6", ME), "restaurant_follows"),
    where("followerUid", "==", ME),
    where("canonicalPlaceId", "==", CANON),
    limit(1),
  );
  const res = await assertSucceeds(getDocs(q));
  assert.equal(res.size, 1);
});

test("7. a VISIBLE menu comment is readable under the client's exact query", async () => {
  await seedAll("menu_comments/mc-visible", {
    canonicalPlaceId: CANON, menuItemId: "m1", status: "visible",
    text: "sedap", createdAt: new Date("2026-09-01T00:00:00Z"),
  });
  await assertFails(getDoc(doc(as("live", ME), "menu_comments/mc-visible")));
  await assertSucceeds(getDoc(doc(as("g6", ME), "menu_comments/mc-visible")));

  const q = query(
    collection(as("g6", ME), "menu_comments"),
    where("canonicalPlaceId", "==", CANON),
    where("menuItemId", "==", "m1"),
    where("status", "==", "visible"),
    orderBy("createdAt"),
    limit(100),
  );
  const res = await assertSucceeds(getDocs(q));
  assert.equal(res.size, 1);
});

// ───────────────────────────────────────────────────────────────────────────
// B. NOTHING BECAME WRITABLE, NOTHING BECAME ENUMERABLE
// ───────────────────────────────────────────────────────────────────────────

test("4. the follower UID list is NOT enumerable", async () => {
  await seedAll(`restaurant_follows/rf.me.${CANON}`, {followerUid: ME, canonicalPlaceId: CANON});
  await seedAll(`restaurant_follows/rf.other.${CANON}`, {followerUid: OTHER, canonicalPlaceId: CANON});
  const db = as("g6", ME);

  // Another user's follow document, read directly.
  await assertFails(getDoc(doc(db, `restaurant_follows/rf.other.${CANON}`)));
  // An UNCONSTRAINED list over the collection.
  await assertFails(getDocs(query(collection(db, "restaurant_follows"))));
  // A list constrained only by the restaurant — i.e. "who follows Akarr?".
  await assertFails(getDocs(query(
    collection(db, "restaurant_follows"),
    where("canonicalPlaceId", "==", CANON),
  )));
  // A list explicitly asking for someone else's follows.
  await assertFails(getDocs(query(
    collection(db, "restaurant_follows"),
    where("followerUid", "==", OTHER),
  )));
  // Anonymous gets nothing at all.
  await assertFails(getDoc(doc(anon("g6"), `restaurant_follows/rf.me.${CANON}`)));
});

test("5. direct create/update/delete of restaurant_follows is DENIED", async () => {
  await seedAll(`restaurant_follows/rf.me.${CANON}`, {followerUid: ME, canonicalPlaceId: CANON});
  const db = as("g6", ME);
  // Not even a self-consistent, correctly-owned document.
  await assertFails(setDoc(doc(db, "restaurant_follows/rf.me.canon-2"), {followerUid: ME, canonicalPlaceId: "canon-2"}));
  await assertFails(updateDoc(doc(db, `restaurant_follows/rf.me.${CANON}`), {canonicalPlaceId: "canon-9"}));
  await assertFails(deleteDoc(doc(db, `restaurant_follows/rf.me.${CANON}`)));
  // Nor a forged one naming another user.
  await assertFails(setDoc(doc(db, "restaurant_follows/rf.forged"), {followerUid: OTHER, canonicalPlaceId: CANON}));
});

test("6. direct writes to restaurant_public are DENIED (count stays server-owned)", async () => {
  await seedAll(`restaurant_public/${CANON}`, {followerCount: 1});
  const db = as("g6", ME);
  await assertFails(setDoc(doc(db, `restaurant_public/${CANON}`), {followerCount: 9999}));
  await assertFails(updateDoc(doc(db, `restaurant_public/${CANON}`), {followerCount: 9999}));
  await assertFails(deleteDoc(doc(db, `restaurant_public/${CANON}`)));
  await assertFails(setDoc(doc(db, "restaurant_public/canon-new"), {followerCount: 5}));
});

test("8+9. HIDDEN and REMOVED menu comments are denied; status-less fails closed", async () => {
  await seedAll("menu_comments/mc-hidden", {canonicalPlaceId: CANON, menuItemId: "m1", status: "hidden", text: "x"});
  await seedAll("menu_comments/mc-removed", {canonicalPlaceId: CANON, menuItemId: "m1", status: "removed", text: "x"});
  await seedAll("menu_comments/mc-legacy", {canonicalPlaceId: CANON, menuItemId: "m1", text: "no status"});
  const db = as("g6", ME);

  await assertFails(getDoc(doc(db, "menu_comments/mc-hidden")));
  await assertFails(getDoc(doc(db, "menu_comments/mc-removed")));
  await assertFails(getDoc(doc(db, "menu_comments/mc-legacy")));

  // A query that tries to widen past 'visible' fails ENTIRELY — it could
  // return a document the rules reject, so Firestore refuses the whole list.
  await assertFails(getDocs(query(
    collection(db, "menu_comments"),
    where("canonicalPlaceId", "==", CANON),
    where("menuItemId", "==", "m1"),
  )));
  await assertFails(getDocs(query(
    collection(db, "menu_comments"),
    where("canonicalPlaceId", "==", CANON),
    where("menuItemId", "==", "m1"),
    where("status", "==", "hidden"),
  )));
});

test("10. direct writes to menu_comments are DENIED (no author spoofing possible)", async () => {
  await seedAll("menu_comments/mc-visible", {canonicalPlaceId: CANON, menuItemId: "m1", status: "visible", text: "ok"});
  const db = as("g6", ME);
  await assertFails(setDoc(doc(db, "menu_comments/mc-new"), {
    canonicalPlaceId: CANON, menuItemId: "m1", authorUid: ME, status: "visible", text: "spoof",
  }));
  // Nor impersonating a restaurant reply.
  await assertFails(setDoc(doc(db, "menu_comments/mc-fake-restaurant"), {
    canonicalPlaceId: CANON, menuItemId: "m1", authorType: "restaurant",
    displayNameSnapshot: "Akarr Cafe", status: "visible", text: "fake official reply",
  }));
  await assertFails(updateDoc(doc(db, "menu_comments/mc-visible"), {text: "edited"}));
  await assertFails(deleteDoc(doc(db, "menu_comments/mc-visible")));
});

// ───────────────────────────────────────────────────────────────────────────
// C. EVERYTHING ELSE IS UNCHANGED (proven by running it against BOTH rulesets)
// ───────────────────────────────────────────────────────────────────────────

test("11+12. accountActive(): suspended-account protections are UNCHANGED", async () => {
  await seedAll(`users/${SUSPENDED}`, {accountStatus: "suspended"});
  await seedAll(`users/${ME}`, {accountStatus: "active"});

  for (const which of ["g6", "live"]) {
    const sus = envs[which].authenticatedContext(SUSPENDED).firestore();
    assert.equal(await outcome(setDoc(doc(sus, `user_profiles/${SUSPENDED}`), {displayName: "x"})), "DENY", which);
    assert.equal(await outcome(setDoc(doc(sus, "meal_logs/m-sus"), {userId: SUSPENDED})), "DENY", which);
    assert.equal(await outcome(updateDoc(doc(sus, `users/${SUSPENDED}`), {displayName: "evade"})), "DENY", which);
  }
  // An ACTIVE account is unaffected under both.
  await unchanged("ALLOW", (db) => setDoc(doc(db, `user_profiles/${ME}`), {displayName: "ok"}));
  await unchanged("ALLOW", (db) => setDoc(doc(db, "meal_logs/m-ok"), {userId: ME}));
});

test("13. accountStatus self-unsuspend remains DENIED, identically", async () => {
  await seedAll(`users/${ME}`, {accountStatus: "active", displayName: "u"});
  await unchanged("DENY", (db) => updateDoc(doc(db, `users/${ME}`), {
    accountStatus: "active", accountStatusReason: "self",
  }));
  await unchanged("DENY", (db) => updateDoc(doc(db, `users/${ME}`), {accountStatusChangedBy: ME}));
  await unchanged("DENY", (db) => updateDoc(doc(db, `users/${ME}`), {isAdmin: true}));
  await unchanged("DENY", (db) => updateDoc(doc(db, `users/${ME}`), {plan: "pro"}));
  // A normal field still updates.
  await unchanged("ALLOW", (db) => updateDoc(doc(db, `users/${ME}`), {displayName: "renamed"}));
});

test("14. feed pollVotes behaviour is UNCHANGED", async () => {
  await seedAll("feed_posts/p1", {authorUid: OTHER, visibility: "public", status: "active"});
  await seedAll(`feed_posts/p1/pollVotes/${ME}`, {optionIndex: 1});
  await seedAll(`feed_posts/p1/pollVotes/${OTHER}`, {optionIndex: 0});

  await unchanged("ALLOW", (db) => getDoc(doc(db, `feed_posts/p1/pollVotes/${ME}`)));
  await unchanged("DENY", (db) => getDoc(doc(db, `feed_posts/p1/pollVotes/${OTHER}`)));
  await unchanged("DENY", (db) => setDoc(doc(db, `feed_posts/p1/pollVotes/${ME}`), {optionIndex: 2}));
});

test("15. the default-deny catch-all still governs undeclared collections", async () => {
  await seedAll("some_unknown_collection/x", {a: 1});
  await unchanged("DENY", (db) => getDoc(doc(db, "some_unknown_collection/x")));
  await unchanged("DENY", (db) => setDoc(doc(db, "some_unknown_collection/y"), {a: 1}));

  // The server-only stores stay sealed.
  for (const p of [
    "meal_reminder_schedules/s1", "notification_reconcile_state/r1",
    "notification_test_recipients/user-me", "notification_broadcast_runs/run-1",
    "admin_audit_events/e1", "admin_bridge_requests/req-1", "admin_bridge_rate/w1",
  ]) {
    await seedAll(p, {seeded: true});
    await unchanged("DENY", (db) => getDoc(doc(db, p)));
    await unchanged("DENY", (db) => setDoc(doc(db, p), {hacked: true}));
  }
});

test("16. G1-G5 lifecycle rules are NOT active — legacy reads still behave as live", async () => {
  // This gate deliberately excludes the lifecycle tightening. A status-less
  // legacy post and comment must therefore STILL be readable by a stranger,
  // exactly as they are in production today. If either of these flipped to
  // DENY, the lifecycle rules leaked in and the deploy would hide legacy
  // content from every reader but its author.
  await seedAll("feed_posts/legacy", {authorUid: OTHER, visibility: "public", text: "no status"});
  await seedAll("feed_posts/legacy/comments/c1", {authorUid: OTHER, text: "no status"});

  await unchanged("ALLOW", (db) => getDoc(doc(db, "feed_posts/legacy")));
  await unchanged("ALLOW", (db) => getDoc(doc(db, "feed_posts/legacy/comments/c1")));

  // And a comment CREATE without a lifecycle status is still accepted, as live
  // accepts it today (G4 is not part of this gate).
  await unchanged("ALLOW", (db) => setDoc(doc(db, "feed_posts/legacy/comments/new"), {
    authorUid: ME, text: "komen tanpa status",
  }));
});

test("17. post visibility and moderation boundaries are UNCHANGED", async () => {
  await seedAll("feed_posts/grp", {authorUid: OTHER, visibility: "group_only", groupId: "g1", status: "active"});
  await seedAll("feed_posts/pub", {authorUid: OTHER, visibility: "public", status: "active"});
  await seedAll("feed_posts/priv", {authorUid: OTHER, visibility: "private", status: "active"});

  await unchanged("DENY", (db) => getDoc(doc(db, "feed_posts/grp")));
  await unchanged("ALLOW", (db) => getDoc(doc(db, "feed_posts/pub")));
  await unchanged("DENY", (db) => getDoc(doc(db, "feed_posts/priv")));
  await unchanged("DENY", (db) => setDoc(doc(db, "feed_posts/forged"), {authorUid: ME, visibility: "public"}));
});
