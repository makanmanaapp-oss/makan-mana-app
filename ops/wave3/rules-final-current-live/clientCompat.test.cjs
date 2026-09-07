/**
 * WAVE 3 GATE 3G — does the RELEASE-CANDIDATE CLIENT actually work under the
 * FINAL rules?
 *
 * The other suites prove the ruleset is correct. This one proves the *client*
 * is compatible: it replays the exact Firestore queries and payloads the app
 * issues, against the final artifact, and against current live for contrast.
 *
 *   final — ops/wave3/rules-final-current-live/firestore.rules
 *   live  — that directory's live-baseline.rules (ruleset f77c0ada)
 *
 * It also replays the OLD shipped client's unconstrained queries, to show
 * exactly what breaks if the final rules land before the new build is released.
 */
const {before, after, beforeEach, test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {resolve} = require("node:path");
const {
  assertFails, assertSucceeds, initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
  doc, getDoc, setDoc, updateDoc, writeBatch,
  collection, collectionGroup, query, where, orderBy, limit, getDocs,
} = require("firebase/firestore");

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) throw new Error("FIRESTORE_EMULATOR_HOST unset — run via emulators:exec.");
const [host, portStr] = HOST.split(":");
const port = Number(portStr);

const RULES = {
  final: resolve(__dirname, "firestore.rules"),
  live: resolve(__dirname, "live-baseline.rules"),
};

const ME = "user-me";
const OTHER = "user-other";
const GROUP = "g1";

// Mirrors the client constants.
const POST_ACTIVE = "active";
const COMMENT_ACTIVE = "active";
const NOTIF_READ = "read";

const envs = {};

before(async () => {
  for (const [name, path] of Object.entries(RULES)) {
    envs[name] = await initializeTestEnvironment({
      projectId: `demo-mm-g3g-cc-${name}`,
      firestore: {rules: readFileSync(path, "utf8"), host, port},
    });
  }
});
after(async () => {
  for (const e of Object.values(envs)) if (e) await e.cleanup();
});

beforeEach(async () => {
  for (const e of Object.values(envs)) {
    await e.clearFirestore();
    await e.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // A realistic mix: active, hidden, deleted and status-less legacy.
      const posts = {
        // createFeedPost always writes groupId explicitly (null when not a
        // group post), so the fixtures must too — `where('groupId','==',null)`
        // matches an explicit null, never a missing field.
        "pub-active": {authorUid: OTHER, visibility: "public", status: "active", groupId: null},
        "pub-hidden": {authorUid: OTHER, visibility: "public", status: "hidden", groupId: null},
        "pub-deleted": {authorUid: OTHER, visibility: "public", status: "deleted", groupId: null},
        "pub-legacy": {authorUid: OTHER, visibility: "public", groupId: null},
        "grp-active": {authorUid: OTHER, visibility: "group_only", groupId: GROUP, status: "active"},
        "grp-hidden": {authorUid: OTHER, visibility: "group_only", groupId: GROUP, status: "hidden"},
        "mine-active": {authorUid: ME, visibility: "public", status: "active", groupId: null},
        "mine-hidden": {authorUid: ME, visibility: "public", status: "hidden", groupId: null},
      };
      for (const [id, data] of Object.entries(posts)) {
        await setDoc(doc(db, `feed_posts/${id}`), {...data, createdAt: new Date(), likeCount: 1});
      }
      await setDoc(doc(db, "feed_posts/pub-active/comments/c-active"),
        {authorUid: OTHER, status: "active", text: "a", createdAt: new Date()});
      await setDoc(doc(db, "feed_posts/pub-active/comments/c-deleted"),
        {authorUid: OTHER, status: "deleted", text: "d", createdAt: new Date()});
      await setDoc(doc(db, "feed_posts/pub-active/comments/c-mine"),
        {authorUid: ME, status: "active", text: "m", createdAt: new Date()});
      // Group membership so group_only reads are admissible.
      await setDoc(doc(db, `groups/${GROUP}/members/${ME}`), {role: "member"});
      await setDoc(doc(db, `users/${ME}/notifications/n1`),
        {status: "unread", isRead: false, type: "social_follow", createdAt: new Date()});
      await setDoc(doc(db, `users/${ME}/notifications/n2`),
        {status: "unread", isRead: false, type: "social_reaction", createdAt: new Date()});
    });
  }
});

const as = (w, uid) => envs[w].authenticatedContext(uid).firestore();

async function outcome(p) {
  try {
    await p;
    return "ALLOW";
  } catch (e) {
    return "DENY";
  }
}

// ── THE NEW CLIENT'S QUERIES, VERBATIM ──────────────────────────────────────

/** Each entry mirrors a provider in lib/features/social/social_providers.dart. */
function newClientQueries(db) {
  return {
    publicFeedProvider: query(collection(db, "feed_posts"),
      where("visibility", "==", "public"),
      where("status", "==", POST_ACTIVE),
      orderBy("createdAt", "desc"), limit(60)),

    followingFeedProvider: query(collection(db, "feed_posts"),
      where("authorUid", "in", [OTHER]),
      where("visibility", "==", "public"),
      where("status", "==", POST_ACTIVE),
      orderBy("createdAt", "desc"), limit(60)),

    trendingFeedProvider: query(collection(db, "feed_posts"),
      where("visibility", "==", "public"),
      where("status", "==", POST_ACTIVE),
      orderBy("likeCount", "desc"), limit(50)),

    groupFeedProvider: query(collection(db, "feed_posts"),
      where("groupId", "==", GROUP),
      where("status", "==", POST_ACTIVE),
      orderBy("createdAt", "desc"), limit(50)),

    "userPublicPostsProvider(other)": query(collection(db, "feed_posts"),
      where("authorUid", "==", OTHER),
      where("visibility", "==", "public"),
      where("status", "==", POST_ACTIVE),
      orderBy("createdAt", "desc"), limit(60)),

    "userPublicPostsProvider(own)": query(collection(db, "feed_posts"),
      where("authorUid", "==", ME),
      where("groupId", "==", null),
      orderBy("createdAt", "desc"), limit(60)),

    myPostsProvider: query(collection(db, "feed_posts"),
      where("authorUid", "==", ME),
      orderBy("createdAt", "desc"), limit(60)),

    myCommentsProvider: query(collectionGroup(db, "comments"),
      where("authorUid", "==", ME), limit(60)),

    commentsProvider: query(collection(db, "feed_posts/pub-active/comments"),
      where("status", "==", COMMENT_ACTIVE),
      orderBy("createdAt", "asc"), limit(100)),
  };
}

/** What the PREVIOUSLY SHIPPED build issues — no lifecycle constraint. */
function oldClientQueries(db) {
  return {
    "publicFeed (old)": query(collection(db, "feed_posts"),
      where("visibility", "==", "public"),
      orderBy("createdAt", "desc"), limit(60)),
    "groupFeed (old)": query(collection(db, "feed_posts"),
      where("groupId", "==", GROUP),
      orderBy("createdAt", "desc"), limit(50)),
    "commentThread (old)": query(collection(db, "feed_posts/pub-active/comments"),
      orderBy("createdAt", "asc"), limit(100)),
  };
}

test("1. every NEW-client query is ALLOWED by the FINAL rules", async () => {
  const db = as("final", ME);
  const qs = newClientQueries(db);
  const failures = [];
  for (const [name, q] of Object.entries(qs)) {
    const r = await outcome(getDocs(q));
    if (r !== "ALLOW") failures.push(name);
  }
  assert.deepEqual(failures, [],
    "these release-candidate queries are rejected by the final rules");
});

test("2. the NEW-client queries return only lifecycle-visible documents", async () => {
  const db = as("final", ME);
  const qs = newClientQueries(db);

  const pub = await getDocs(qs.publicFeedProvider);
  assert.deepEqual(pub.docs.map((d) => d.id).sort(), ["mine-active", "pub-active"]);

  const grp = await getDocs(qs.groupFeedProvider);
  assert.deepEqual(grp.docs.map((d) => d.id), ["grp-active"]);

  const thread = await getDocs(qs.commentsProvider);
  assert.deepEqual(thread.docs.map((d) => d.id).sort(), ["c-active", "c-mine"]);

  // The owner still sees their own hidden post on their own profile.
  const own = await getDocs(qs["userPublicPostsProvider(own)"]);
  assert.ok(own.docs.map((d) => d.id).includes("mine-hidden"),
    "the author must still see their own hidden post");
});

test("3. the OLD shipped client's queries are DENIED — this is the release gate",
  async () => {
    const finalDb = as("final", ME);
    const liveDb = as("live", ME);
    for (const [name, q] of Object.entries(oldClientQueries(finalDb))) {
      assert.equal(await outcome(getDocs(q)), "DENY",
        `${name} should be rejected by the final rules`);
    }
    // The very same queries work today, which is why the client must ship first.
    for (const [name, q] of Object.entries(oldClientQueries(liveDb))) {
      assert.equal(await outcome(getDocs(q)), "ALLOW",
        `${name} is expected to work under current live`);
    }
  });

// ── NOTIFICATION MARK-READ ──────────────────────────────────────────────────

test("4. the NEW-client mark-read payload is accepted by the FINAL rules",
  async () => {
    // Exactly what markRead() now writes.
    const payload = {isRead: true, readAt: new Date(), status: NOTIF_READ};
    assert.equal(
      await outcome(setDoc(doc(as("final", ME), `users/${ME}/notifications/n1`),
        payload, {merge: true})), "ALLOW");
    // And it is accepted by CURRENT LIVE too, so the new build is safe to
    // release BEFORE the final rules land. This is what makes the ordering work.
    assert.equal(
      await outcome(setDoc(doc(as("live", ME), `users/${ME}/notifications/n1`),
        payload, {merge: true})), "ALLOW");
  });

test("5. markAllRead's batch payload is accepted under both rulesets", async () => {
  for (const w of ["final", "live"]) {
    const db = as(w, ME);
    const batch = writeBatch(db);
    for (const id of ["n1", "n2"]) {
      batch.set(doc(db, `users/${ME}/notifications/${id}`),
        {isRead: true, readAt: new Date(), status: NOTIF_READ}, {merge: true});
    }
    assert.equal(await outcome(batch.commit()), "ALLOW", w);
  }
});

test("6. a CHANGED status can only ever become 'read'", async () => {
  // Stored status is 'unread'. Any write that CHANGES it to something other
  // than 'read' must be rejected under both rulesets.
  for (const w of ["final", "live"]) {
    const db = as(w, ME);
    for (const bad of ["archived", "forged", "deleted", ""]) {
      assert.equal(
        await outcome(updateDoc(doc(db, `users/${ME}/notifications/n1`),
          {isRead: true, readAt: new Date(), status: bad})), "DENY",
        `${w}: changing status to '${bad}' must be rejected`);
    }
  }

  // Re-stating the SAME value is not a change, so N1's first branch applies
  // and the write is admissible under the final rules. The resulting document
  // is byte-identical to leaving `status` untouched, so this widens nothing —
  // it is the same permission the shipped client already relies on.
  assert.equal(
    await outcome(updateDoc(doc(as("final", ME), `users/${ME}/notifications/n1`),
      {isRead: true, readAt: new Date(), status: "unread"})), "ALLOW");
  // Under CURRENT LIVE the same write is denied, which is the defect N1 fixes.
  assert.equal(
    await outcome(updateDoc(doc(as("live", ME), `users/${ME}/notifications/n1`),
      {isRead: true, readAt: new Date(), status: "unread"})), "DENY");
});

test("7. mark-read is idempotent — re-running it on a read doc still succeeds",
  async () => {
    const db = as("final", ME);
    const p = {isRead: true, readAt: new Date(), status: NOTIF_READ};
    const ref = doc(db, `users/${ME}/notifications/n1`);
    await assertSucceeds(setDoc(ref, p, {merge: true}));
    await assertSucceeds(setDoc(ref, p, {merge: true}));
    const snap = await getDoc(ref);
    assert.equal(snap.data().status, NOTIF_READ);
    assert.equal(snap.data().isRead, true);
    // Untouched fields survive the merge.
    assert.equal(snap.data().type, "social_follow");
  });

test("8. fields outside the mark-read allowlist are still rejected", async () => {
  const db = as("final", ME);
  await assertFails(updateDoc(doc(db, `users/${ME}/notifications/n1`),
    {isRead: true, readAt: new Date(), status: NOTIF_READ, type: "forged"}));
  await assertFails(updateDoc(doc(db, `users/${ME}/notifications/n1`),
    {isRead: true, readAt: new Date(), status: NOTIF_READ, body: "injected"}));
  // Another user's notification stays unreachable.
  await assertFails(getDoc(doc(as("final", OTHER), `users/${ME}/notifications/n1`)));
});
