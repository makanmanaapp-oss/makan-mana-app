/**
 * WAVE 3 GATE 3G — emulator proof for the CURRENT-LIVE post-comment freeze.
 *
 * Two rulesets side by side, so every claim is a contrast:
 *   freeze — ops/wave3/comment-write-freeze-current-live/firestore.rules
 *   live   — the same directory's live-baseline.rules, a byte-exact copy of
 *            ruleset f77c0ada (current production, post-G6)
 *
 * The freeze must do exactly one thing — stop NEW post comments — and change
 * nothing else, including the G6 engagement rules that are already live.
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
  freeze: resolve(__dirname, "firestore.rules"),
  live: resolve(__dirname, "live-baseline.rules"),
};

const AUTHOR = "post-author-1";
const COMMENTER = "commenter-1";
const STRANGER = "stranger-1";
const SUSPENDED = "user-suspended";
const CANON = "PLC-379343ea37954e00ac22293c";

const envs = {};

before(async () => {
  for (const [name, path] of Object.entries(RULES)) {
    envs[name] = await initializeTestEnvironment({
      projectId: `demo-mm-g3g-frz-${name}`,
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

/** The operation must behave IDENTICALLY under freeze and live. */
async function unchanged(expected, op, uid = COMMENTER) {
  const f = await outcome(op(as("freeze", uid)));
  const l = await outcome(op(as("live", uid)));
  assert.equal(f, l, `freeze (${f}) diverged from live (${l})`);
  assert.equal(f, expected, `expected ${expected}, got ${f}`);
}

const post = (x) =>
  Object.assign({authorUid: AUTHOR, visibility: "public", text: "induk"}, x || {});
const validComment = (x) =>
  Object.assign({authorUid: COMMENTER, postId: "p1", parentVisibility: "public",
                 text: "komen"}, x || {});

// ── 1. THE FREEZE ITSELF ────────────────────────────────────────────────────

test("F1. a create that CURRENT LIVE accepts is denied by the freeze", async () => {
  await seedAll("feed_posts/p1", post({status: "active"}));
  await assertSucceeds(
    setDoc(doc(as("live", COMMENTER), "feed_posts/p1/comments/c1"), validComment()));
  await assertFails(
    setDoc(doc(as("freeze", COMMENTER), "feed_posts/p1/comments/c1"), validComment()));
});

test("F2. no status value, and no actor, gets past the freeze", async () => {
  await seedAll("feed_posts/p1", post({status: "active", commentEnabled: true}));
  for (const payload of [
    validComment(), validComment({status: "active"}), validComment({status: "deleted"}),
  ]) {
    await assertFails(
      setDoc(doc(as("freeze", COMMENTER), "feed_posts/p1/comments/cx"), payload));
  }
  await assertFails(setDoc(doc(as("freeze", AUTHOR), "feed_posts/p1/comments/cy"),
    validComment({authorUid: AUTHOR})));
});

// ── 2. EXISTING COMMENTS KEEP CURRENT-LIVE READ SEMANTICS ───────────────────

test("F3. existing comments remain readable EXACTLY as under current live", async () => {
  await seedAll("feed_posts/p1", post({status: "active"}));
  await seedAll("feed_posts/p1/comments/c-legacy", {authorUid: COMMENTER, text: "no status"});
  await seedAll("feed_posts/p1/comments/c-active", {authorUid: COMMENTER, status: "active", text: "a"});
  await seedAll("feed_posts/p1/comments/c-deleted", {authorUid: COMMENTER, status: "deleted", text: "d"});

  // Status-less legacy stays READABLE — the freeze must not activate Wave 3.
  await unchanged("ALLOW", (db) => getDoc(doc(db, "feed_posts/p1/comments/c-legacy")), STRANGER);
  await unchanged("ALLOW", (db) => getDoc(doc(db, "feed_posts/p1/comments/c-active")), STRANGER);
  await unchanged("DENY", (db) => getDoc(doc(db, "feed_posts/p1/comments/c-deleted")), STRANGER);
  // Author bypass unchanged.
  await unchanged("ALLOW", (db) => getDoc(doc(db, "feed_posts/p1/comments/c-deleted")), COMMENTER);
});

test("F4. comment UPDATE and DELETE are unchanged", async () => {
  await seedAll("feed_posts/p1", post({status: "active"}));
  await seedAll("feed_posts/p1/comments/c1", {authorUid: COMMENTER, text: "asal"});
  await unchanged("DENY", (db) => updateDoc(doc(db, "feed_posts/p1/comments/c1"), {text: "x"}));
  await unchanged("DENY", (db) => deleteDoc(doc(db, "feed_posts/p1/comments/c1")), STRANGER);
  await unchanged("ALLOW", (db) => deleteDoc(doc(db, "feed_posts/p1/comments/c1")), COMMENTER);
});

test("F5. post read/create/delete and visibility are unchanged", async () => {
  await seedAll("feed_posts/p1", post({status: "active"}));
  await seedAll("feed_posts/legacy", post({}));
  await seedAll("feed_posts/grp", post({visibility: "group_only", groupId: "g1", status: "active"}));
  await unchanged("ALLOW", (db) => getDoc(doc(db, "feed_posts/p1")), STRANGER);
  await unchanged("ALLOW", (db) => getDoc(doc(db, "feed_posts/legacy")), STRANGER);
  await unchanged("DENY", (db) => getDoc(doc(db, "feed_posts/grp")), STRANGER);
  await unchanged("DENY", (db) => setDoc(doc(db, "feed_posts/new"), post()), COMMENTER);
  await unchanged("ALLOW", (db) => deleteDoc(doc(db, "feed_posts/p1")), AUTHOR);
});

// ── 3. THE G6 ENGAGEMENT RULES, ALREADY LIVE, MUST SURVIVE ──────────────────

test("F6. G6 engagement reads still work under the freeze", async () => {
  await seedAll(`restaurant_follows/rf.me`, {followerUid: COMMENTER, canonicalPlaceId: CANON});
  await seedAll(`restaurant_public/${CANON}`, {followerCount: 1});
  await seedAll("menu_comments/mc1", {canonicalPlaceId: CANON, menuItemId: "m1",
                                      status: "visible", text: "sedap"});
  await seedAll("menu_comments/mc2", {canonicalPlaceId: CANON, menuItemId: "m1",
                                      status: "hidden", text: "x"});

  await unchanged("ALLOW", (db) => getDoc(doc(db, "restaurant_follows/rf.me")));
  await unchanged("DENY", (db) => getDoc(doc(db, "restaurant_follows/rf.me")), STRANGER);
  await unchanged("ALLOW", (db) => getDoc(doc(db, `restaurant_public/${CANON}`)));
  await unchanged("ALLOW", (db) => getDoc(doc(db, "menu_comments/mc1")));
  await unchanged("DENY", (db) => getDoc(doc(db, "menu_comments/mc2")));
  await unchanged("DENY", (db) => setDoc(doc(db, `restaurant_public/${CANON}`), {followerCount: 99}));
  // The client's own follow query still works.
  await unchanged("ALLOW", (db) => getDocs(query(
    collection(db, "restaurant_follows"),
    where("followerUid", "==", COMMENTER), limit(1))));
});

// ── 4. EVERY OTHER LIVE PROTECTION ──────────────────────────────────────────

test("F7. suspension, accountStatus and pollVotes are unchanged", async () => {
  await seedAll(`users/${SUSPENDED}`, {accountStatus: "suspended"});
  await seedAll(`users/${COMMENTER}`, {accountStatus: "active", displayName: "u"});
  await seedAll("feed_posts/p1", post({status: "active"}));
  await seedAll(`feed_posts/p1/pollVotes/${COMMENTER}`, {optionIndex: 1});

  for (const w of ["freeze", "live"]) {
    const sus = envs[w].authenticatedContext(SUSPENDED).firestore();
    assert.equal(await outcome(setDoc(doc(sus, `user_profiles/${SUSPENDED}`), {displayName: "x"})), "DENY", w);
    assert.equal(await outcome(updateDoc(doc(sus, `users/${SUSPENDED}`), {displayName: "e"})), "DENY", w);
  }
  await unchanged("DENY", (db) => updateDoc(doc(db, `users/${COMMENTER}`),
    {accountStatus: "active", accountStatusReason: "self"}));
  await unchanged("ALLOW", (db) => updateDoc(doc(db, `users/${COMMENTER}`), {displayName: "ok"}));
  await unchanged("ALLOW", (db) => getDoc(doc(db, `feed_posts/p1/pollVotes/${COMMENTER}`)));
  await unchanged("DENY", (db) => getDoc(doc(db, `feed_posts/p1/pollVotes/${COMMENTER}`)), STRANGER);
});

test("F8. server-only stores and the default-deny catch-all are unchanged", async () => {
  for (const p of [
    "meal_reminder_schedules/s1", "notification_reconcile_state/r1",
    "notification_broadcast_runs/run-1", "admin_audit_events/e1",
    "admin_bridge_requests/req-1", "admin_bridge_rate/w1", "unknown_collection/x",
  ]) {
    await seedAll(p, {seeded: true});
    await unchanged("DENY", (db) => getDoc(doc(db, p)));
    await unchanged("DENY", (db) => setDoc(doc(db, p), {hacked: true}));
  }
});

// ── 5. SOURCE-LEVEL ─────────────────────────────────────────────────────────

test("F9. the freeze carries NO Wave 3 lifecycle construct", () => {
  const src = readFileSync(RULES.freeze, "utf8");
  const live = readFileSync(RULES.live, "utf8");
  for (const c of ["postLifecycleActive", "commentLifecycleActive"]) {
    assert.equal((src.match(new RegExp(c, "g")) || []).length,
                 (live.match(new RegExp(c, "g")) || []).length,
                 `${c} count must equal the live count (no lifecycle activation)`);
  }
  assert.ok(src.includes("allow create: if false;"));
  assert.ok(src.includes("function accountActive("));
  for (const t of ["match /restaurant_follows/{followId}",
                   "match /restaurant_public/{canonicalPlaceId}",
                   "match /menu_comments/{commentId}",
                   "match /pollVotes/{voterUid}"]) {
    assert.ok(src.includes(t), `missing live protection: ${t}`);
  }
});
