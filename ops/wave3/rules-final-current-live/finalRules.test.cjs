/**
 * WAVE 3 GATE 3G — emulator proof for the FINAL Wave 3 ruleset, rebased onto
 * the CURRENT LIVE (post-G6) production ruleset.
 *
 *   final — ops/wave3/rules-final-current-live/firestore.rules
 *   live  — that directory's live-baseline.rules, a byte-exact copy of ruleset
 *           f77c0ada (current production, post-G6)
 *
 * Proves the lifecycle gates fail closed, that G6 and every unrelated live
 * protection survive, and that the N1 notification clause repairs a defect
 * that is live right now.
 */
const {before, after, beforeEach, test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {resolve} = require("node:path");
const {
  assertFails, assertSucceeds, initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, limit, getDocs,
} = require("firebase/firestore");

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) throw new Error("FIRESTORE_EMULATOR_HOST unset — run via emulators:exec.");
const [host, portStr] = HOST.split(":");
const port = Number(portStr);

const RULES = {
  final: resolve(__dirname, "firestore.rules"),
  live: resolve(__dirname, "live-baseline.rules"),
};

const AUTHOR = "post-author-1";
const ME = "user-me";
const STRANGER = "stranger-1";
const SUSPENDED = "user-suspended";
const CANON = "PLC-379343ea37954e00ac22293c";

const envs = {};

before(async () => {
  for (const [name, path] of Object.entries(RULES)) {
    envs[name] = await initializeTestEnvironment({
      projectId: `demo-mm-g3g-fin-${name}`,
      firestore: {rules: readFileSync(path, "utf8"), host, port},
    });
  }
});
after(async () => {
  for (const e of Object.values(envs)) if (e) await e.cleanup();
});
beforeEach(async () => {
  for (const e of Object.values(envs)) await e.clearFirestore();
});

async function seedAll(path, data) {
  for (const e of Object.values(envs)) {
    await e.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), data);
    });
  }
}
const as = (w, uid) => envs[w].authenticatedContext(uid).firestore();

async function outcome(p) {
  try {
    await p;
    return "ALLOW";
  } catch (e) {
    return "DENY";
  }
}
async function unchanged(expected, op, uid = ME) {
  const f = await outcome(op(as("final", uid)));
  const l = await outcome(op(as("live", uid)));
  assert.equal(f, l, `final (${f}) diverged from live (${l})`);
  assert.equal(f, expected, `expected ${expected}, got ${f}`);
}

const post = (x) =>
  Object.assign({authorUid: AUTHOR, visibility: "public", text: "induk"}, x || {});

// ── A. POST LIFECYCLE (L1 + L2) ─────────────────────────────────────────────

test("A1. non-author reads ONLY status == 'active'; author always sees own", async () => {
  await seedAll("feed_posts/active", post({status: "active"}));
  await seedAll("feed_posts/hidden", post({status: "hidden"}));
  await seedAll("feed_posts/deleted", post({status: "deleted"}));
  await seedAll("feed_posts/unknown", post({status: "whatever"}));
  await seedAll("feed_posts/legacy", post({}));
  const db = as("final", STRANGER);

  await assertSucceeds(getDoc(doc(db, "feed_posts/active")));
  for (const id of ["hidden", "deleted", "unknown", "legacy"]) {
    await assertFails(getDoc(doc(db, `feed_posts/${id}`)));
  }
  // The author keeps their own history in every state.
  for (const id of ["hidden", "deleted", "unknown", "legacy"]) {
    await assertSucceeds(getDoc(doc(as("final", AUTHOR), `feed_posts/${id}`)));
  }
});

test("A2. FAIL-CLOSED is the deploy precondition: live ALLOWS what final DENIES", async () => {
  await seedAll("feed_posts/legacy", post({}));
  // This contrast IS the backfill requirement. Under current live a status-less
  // post is public; under the final ruleset it is invisible to everyone but its
  // author. Deploying before the backfill would hide legacy content.
  assert.equal(await outcome(getDoc(doc(as("live", STRANGER), "feed_posts/legacy"))), "ALLOW");
  assert.equal(await outcome(getDoc(doc(as("final", STRANGER), "feed_posts/legacy"))), "DENY");
});

test("A3. group_only and private visibility still apply on top of lifecycle", async () => {
  await seedAll("feed_posts/grp", post({visibility: "group_only", groupId: "g1", status: "active"}));
  await seedAll("feed_posts/priv", post({visibility: "private", status: "active"}));
  const db = as("final", STRANGER);
  await assertFails(getDoc(doc(db, "feed_posts/grp")));
  await assertFails(getDoc(doc(db, "feed_posts/priv")));
});

// ── B. COMMENT LIFECYCLE (L3 + L4 + L5) ─────────────────────────────────────

test("B1. non-author reads ONLY comments with status == 'active'", async () => {
  await seedAll("feed_posts/p1", post({status: "active"}));
  await seedAll("feed_posts/p1/comments/c-active", {authorUid: AUTHOR, status: "active", text: "a"});
  await seedAll("feed_posts/p1/comments/c-deleted", {authorUid: AUTHOR, status: "deleted", text: "d"});
  await seedAll("feed_posts/p1/comments/c-unknown", {authorUid: AUTHOR, status: "zzz", text: "u"});
  await seedAll("feed_posts/p1/comments/c-legacy", {authorUid: AUTHOR, text: "l"});
  const db = as("final", STRANGER);

  await assertSucceeds(getDoc(doc(db, "feed_posts/p1/comments/c-active")));
  for (const id of ["c-deleted", "c-unknown", "c-legacy"]) {
    await assertFails(getDoc(doc(db, `feed_posts/p1/comments/${id}`)));
  }
  // Author bypass survives.
  await assertSucceeds(getDoc(doc(as("final", AUTHOR), "feed_posts/p1/comments/c-deleted")));
});

test("B2. CREATE must declare status 'active', and suspension still applies", async () => {
  await seedAll("feed_posts/p1", post({status: "active"}));
  await seedAll(`users/${ME}`, {accountStatus: "active"});
  await seedAll(`users/${SUSPENDED}`, {accountStatus: "suspended"});
  const db = as("final", ME);
  const ok = {authorUid: ME, postId: "p1", parentVisibility: "public", text: "hi"};

  await assertSucceeds(setDoc(doc(db, "feed_posts/p1/comments/ok"),
    Object.assign({}, ok, {status: "active"})));
  await assertFails(setDoc(doc(db, "feed_posts/p1/comments/no-status"), ok));
  await assertFails(setDoc(doc(db, "feed_posts/p1/comments/born-deleted"),
    Object.assign({}, ok, {status: "deleted"})));
  await assertFails(setDoc(doc(db, "feed_posts/p1/comments/bogus"),
    Object.assign({}, ok, {status: "zzz"})));
  // Live suspension gate preserved alongside the new lifecycle gate.
  await assertFails(setDoc(doc(as("final", SUSPENDED), "feed_posts/p1/comments/sus"),
    {authorUid: SUSPENDED, postId: "p1", parentVisibility: "public",
     text: "hi", status: "active"}));
});

test("B3. a comment under a hidden/deleted parent stays inaccessible", async () => {
  await seedAll("feed_posts/hidden", post({status: "hidden"}));
  await seedAll("feed_posts/hidden/comments/c1", {authorUid: AUTHOR, status: "active", text: "a"});
  await assertFails(getDoc(doc(as("final", STRANGER), "feed_posts/hidden/comments/c1")));
});

// ── C. G6 ENGAGEMENT — ALREADY LIVE, MUST BE INHERITED UNCHANGED ────────────

test("C1. the G6 engagement rules are inherited and behave identically", async () => {
  await seedAll("restaurant_follows/rf.me", {followerUid: ME, canonicalPlaceId: CANON});
  await seedAll("restaurant_follows/rf.other", {followerUid: STRANGER, canonicalPlaceId: CANON});
  await seedAll(`restaurant_public/${CANON}`, {followerCount: 1});
  await seedAll("menu_comments/mc-visible", {canonicalPlaceId: CANON, menuItemId: "m1",
                                             status: "visible", text: "sedap"});
  await seedAll("menu_comments/mc-hidden", {canonicalPlaceId: CANON, menuItemId: "m1",
                                            status: "hidden", text: "x"});

  await unchanged("ALLOW", (db) => getDoc(doc(db, "restaurant_follows/rf.me")));
  await unchanged("DENY", (db) => getDoc(doc(db, "restaurant_follows/rf.other")));
  await unchanged("ALLOW", (db) => getDoc(doc(db, `restaurant_public/${CANON}`)));
  await unchanged("DENY", (db) => setDoc(doc(db, `restaurant_public/${CANON}`), {followerCount: 9}));
  await unchanged("ALLOW", (db) => getDoc(doc(db, "menu_comments/mc-visible")));
  await unchanged("DENY", (db) => getDoc(doc(db, "menu_comments/mc-hidden")));
  await unchanged("DENY", (db) => setDoc(doc(db, "menu_comments/mc-new"), {status: "visible"}));
  await unchanged("ALLOW", (db) => getDocs(query(
    collection(db, "restaurant_follows"), where("followerUid", "==", ME), limit(1))));
});

// ── D. N1 — THE NOTIFICATION CLAUSE (reported separately in the README) ─────

test("D1. N1 repairs mark-read for the SHIPPED client, which live DENIES", async () => {
  // Production stores 702 notifications with status 'unread'. The shipped
  // client writes {isRead, readAt} only, so the merged result keeps
  // status 'unread' — which the live clause rejects.
  await seedAll(`users/${ME}/notifications/n1`,
    {status: "unread", isRead: false, type: "social_follow"});

  const write = (db) => updateDoc(doc(db, `users/${ME}/notifications/n1`),
    {isRead: true, readAt: new Date()});

  assert.equal(await outcome(write(as("live", ME))), "DENY",
    "live is expected to deny the shipped client's mark-read");
  assert.equal(await outcome(write(as("final", ME))), "ALLOW",
    "the final ruleset must repair it");
});

test("D2. N1 does NOT weaken the notification boundary", async () => {
  await seedAll(`users/${ME}/notifications/n1`,
    {status: "unread", isRead: false, type: "social_follow"});
  const db = as("final", ME);

  // A forged status is still rejected.
  await assertFails(updateDoc(doc(db, `users/${ME}/notifications/n1`),
    {isRead: true, readAt: new Date(), status: "forged"}));
  // Setting status to 'read' explicitly is still fine.
  await assertSucceeds(updateDoc(doc(db, `users/${ME}/notifications/n1`),
    {isRead: true, readAt: new Date(), status: "read"}));
  // Fields outside the allowlist are still rejected.
  await assertFails(updateDoc(doc(db, `users/${ME}/notifications/n1`),
    {isRead: true, readAt: new Date(), type: "forged_type"}));
  // isRead:false is still rejected, and create/delete stay server-only.
  await assertFails(updateDoc(doc(db, `users/${ME}/notifications/n1`),
    {isRead: false, readAt: new Date()}));
  await assertFails(setDoc(doc(db, `users/${ME}/notifications/n2`), {status: "unread"}));
  await assertFails(deleteDoc(doc(db, `users/${ME}/notifications/n1`)));
  // Another user's notification is unreachable.
  await assertFails(getDoc(doc(as("final", STRANGER), `users/${ME}/notifications/n1`)));
});

// ── E. EVERY OTHER LIVE PROTECTION ──────────────────────────────────────────

test("E1. suspension, accountStatus and pollVotes are unchanged", async () => {
  await seedAll(`users/${SUSPENDED}`, {accountStatus: "suspended"});
  await seedAll(`users/${ME}`, {accountStatus: "active", displayName: "u"});
  await seedAll("feed_posts/p1", post({status: "active"}));
  await seedAll(`feed_posts/p1/pollVotes/${ME}`, {optionIndex: 1});

  for (const w of ["final", "live"]) {
    const sus = envs[w].authenticatedContext(SUSPENDED).firestore();
    assert.equal(await outcome(setDoc(doc(sus, `user_profiles/${SUSPENDED}`), {displayName: "x"})), "DENY", w);
    assert.equal(await outcome(setDoc(doc(sus, "meal_logs/m1"), {userId: SUSPENDED})), "DENY", w);
    assert.equal(await outcome(updateDoc(doc(sus, `users/${SUSPENDED}`), {displayName: "e"})), "DENY", w);
  }
  await unchanged("DENY", (db) => updateDoc(doc(db, `users/${ME}`),
    {accountStatus: "active", accountStatusReason: "self"}));
  await unchanged("DENY", (db) => updateDoc(doc(db, `users/${ME}`), {isAdmin: true}));
  await unchanged("ALLOW", (db) => updateDoc(doc(db, `users/${ME}`), {displayName: "ok"}));
  await unchanged("ALLOW", (db) => getDoc(doc(db, `feed_posts/p1/pollVotes/${ME}`)));
  await unchanged("DENY", (db) => getDoc(doc(db, `feed_posts/p1/pollVotes/${ME}`)), STRANGER);
  await unchanged("DENY", (db) => setDoc(doc(db, `feed_posts/p1/pollVotes/${ME}`), {optionIndex: 2}));
});

test("E2. server-only stores and the default-deny catch-all are unchanged", async () => {
  for (const p of [
    "meal_reminder_schedules/s1", "notification_reconcile_state/r1",
    "notification_test_recipients/user-me", "notification_broadcast_runs/run-1",
    "admin_audit_events/e1", "admin_bridge_requests/req-1", "admin_bridge_rate/w1",
    "unknown_collection/x",
  ]) {
    await seedAll(p, {seeded: true});
    await unchanged("DENY", (db) => getDoc(doc(db, p)));
    await unchanged("DENY", (db) => setDoc(doc(db, p), {hacked: true}));
  }
});
