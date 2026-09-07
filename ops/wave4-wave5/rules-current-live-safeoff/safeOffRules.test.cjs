/**
 * WAVE 4 + WAVE 5 SAFE-OFF RULES — emulator proof.
 *
 * Every test runs against BOTH rulesets:
 *
 *   artifact — this directory's firestore.rules  (live baseline + 3 new blocks)
 *   live     — this directory's live-baseline.rules (ruleset f77c0ada, byte-exact)
 *
 * That pairing is the whole point. The deploy is only safe if the artifact
 * behaves IDENTICALLY to what is already live everywhere except the three new
 * collections — and even there the observable outcome must be the same, because
 * `cms_content` and friends already fall through to the default-deny catch-all
 * today. The new blocks make that denial explicit and local, so a future edit to
 * the catch-all cannot silently open them.
 *
 * Run:
 *   cd ops/wave4-wave5/rules-current-live-safeoff
 *   NODE_PATH=../../../functions/node_modules \
 *   npx --no-install firebase emulators:exec --only firestore \
 *     --project demo-mm-w45-safeoff --config firebase.json \
 *     "node --test safeOffRules.test.cjs"
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
  collection, query, where, getDocs,
} = require("firebase/firestore");

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) throw new Error("FIRESTORE_EMULATOR_HOST unset — run via emulators:exec.");
const [host, portStr] = HOST.split(":");
const port = Number(portStr);

const RULES = {
  artifact: resolve(__dirname, "firestore.rules"),
  live: resolve(__dirname, "live-baseline.rules"),
};

/** The three collections this cutover adds. */
const NEW_COLLECTIONS = ["restaurant_promotions", "cms_content", "cms_collections"];

const ME = "user-me";
const OTHER = "user-other";
const SUSPENDED = "user-suspended";
const PLACE = "canon-place-1";

const envs = {};
const NAMES = Object.keys(RULES);

before(async () => {
  for (const [name, path] of Object.entries(RULES)) {
    envs[name] = await initializeTestEnvironment({
      projectId: `demo-mm-w45-${name}`,
      firestore: {rules: readFileSync(path, "utf8"), host, port},
    });
  }
});

after(async () => {
  for (const e of Object.values(envs)) if (e) await e.cleanup();
});

beforeEach(async () => {
  for (const name of NAMES) {
    const env = envs[name];
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "users", ME), {uid: ME, accountStatus: "active"});
      await setDoc(doc(db, "users", OTHER), {uid: OTHER, accountStatus: "active"});
      await setDoc(doc(db, "users", SUSPENDED), {uid: SUSPENDED, accountStatus: "suspended"});

      // Server-authored rows in the three new collections. A client must not be
      // able to see them even though they exist.
      await setDoc(doc(db, "restaurant_promotions", "promo-1"), {
        canonicalPlaceId: PLACE, status: "active", title: "Set lunch",
      });
      await setDoc(doc(db, "cms_content", "banner-1"), {
        placement: "home_top", status: "active", title: "Raya",
      });
      await setDoc(doc(db, "cms_collections", "col-1"), {
        placement: "explore_top", status: "active", title: "Sedap dekat sini",
      });

      // G6 engagement fixtures, inherited from the live base.
      await setDoc(doc(db, "restaurant_follows", `${ME}_${PLACE}`), {
        followerUid: ME, canonicalPlaceId: PLACE,
      });
      await setDoc(doc(db, "restaurant_follows", `${OTHER}_${PLACE}`), {
        followerUid: OTHER, canonicalPlaceId: PLACE,
      });
      await setDoc(doc(db, "restaurant_public", PLACE), {followerCount: 2, displayName: "Kedai"});
      await setDoc(doc(db, "menu_comments", "c-visible"), {status: "visible", body: "sedap"});
      await setDoc(doc(db, "menu_comments", "c-hidden"), {status: "hidden", body: "spam"});

      // Notification + poll + server-only stores.
      await setDoc(doc(db, "users", ME, "notifications", "n1"), {
        isRead: false, status: "unread", type: "social_reaction",
      });
      await setDoc(doc(db, "users", OTHER, "notifications", "n2"), {
        isRead: false, status: "unread", type: "social_reaction",
      });
      await setDoc(doc(db, "users", ME, "meals", "m1"), {name: "nasi"});
      await setDoc(doc(db, "users", SUSPENDED, "meals", "m1"), {name: "nasi"});
      await setDoc(doc(db, "admin_audit_events", "a1"), {kind: "x"});
      await setDoc(doc(db, "admin_bridge_requests", "r1"), {kind: "x"});
      await setDoc(doc(db, "admin_bridge_rate", "w1"), {count: 1});
      await setDoc(doc(db, "notification_broadcast_runs", "run1"), {state: "done"});
      await setDoc(doc(db, "totally_unknown_collection", "u1"), {x: 1});
    });
  }
});

/** Run `fn(db)` as a signed-in user under every ruleset; returns {name: result}. */
async function forEachRuleset(uid, fn) {
  const out = {};
  for (const name of NAMES) {
    const ctx = uid === null
      ? envs[name].unauthenticatedContext()
      : envs[name].authenticatedContext(uid);
    out[name] = await fn(ctx.firestore(), name);
  }
  return out;
}

// ── THE THREE NEW COLLECTIONS ──────────────────────────────────────────────

test("1. the three new collections deny every client read, signed in or not", async () => {
  for (const uid of [null, ME]) {
    await forEachRuleset(uid, async (db, name) => {
      for (const col of NEW_COLLECTIONS) {
        await assertFails(getDoc(doc(db, col, col === "restaurant_promotions"
          ? "promo-1" : col === "cms_content" ? "banner-1" : "col-1")));
        await assertFails(getDocs(collection(db, col)));
        await assertFails(getDocs(query(collection(db, col),
          where("status", "==", "active"))));
      }
      return name;
    });
  }
});

test("2. the three new collections deny every client write", async () => {
  await forEachRuleset(ME, async (db) => {
    await assertFails(setDoc(doc(db, "restaurant_promotions", "mine"), {
      canonicalPlaceId: PLACE, status: "active", ownerUid: ME,
    }));
    await assertFails(updateDoc(doc(db, "cms_content", "banner-1"), {status: "paused"}));
    await assertFails(deleteDoc(doc(db, "cms_collections", "col-1")));
    // Not even a document the caller claims to own.
    await assertFails(setDoc(doc(db, "cms_content", "mine"), {ownerUid: ME, status: "draft"}));
  });
});

test("3. artifact and live agree exactly: both already deny these paths", async () => {
  // Today the catch-all denies them; after this deploy an explicit block does.
  // The OUTCOME is identical, which is why the deploy is behaviour-neutral.
  const results = await forEachRuleset(ME, async (db) => {
    const outcomes = [];
    for (const col of NEW_COLLECTIONS) {
      let allowed = true;
      try {
        await getDocs(collection(db, col));
      } catch {
        allowed = false;
      }
      outcomes.push(`${col}:${allowed ? "ALLOW" : "DENY"}`);
    }
    return outcomes.join(",");
  });
  assert.equal(results.artifact, results.live,
    "the artifact must not change observable behaviour on these paths");
  assert.equal(results.artifact, NEW_COLLECTIONS.map((c) => `${c}:DENY`).join(","));
});

// ── EVERYTHING ELSE MUST BE UNTOUCHED ──────────────────────────────────────

test("4. G6 engagement reads are inherited and behave identically", async () => {
  const own = await forEachRuleset(ME, async (db) => {
    await assertSucceeds(getDoc(doc(db, "restaurant_follows", `${ME}_${PLACE}`)));
    await assertFails(getDoc(doc(db, "restaurant_follows", `${OTHER}_${PLACE}`)));
    await assertFails(getDocs(collection(db, "restaurant_follows")));
    await assertSucceeds(getDocs(query(collection(db, "restaurant_follows"),
      where("followerUid", "==", ME))));
    await assertSucceeds(getDoc(doc(db, "restaurant_public", PLACE)));
    await assertSucceeds(getDoc(doc(db, "menu_comments", "c-visible")));
    await assertFails(getDoc(doc(db, "menu_comments", "c-hidden")));
    await assertFails(setDoc(doc(db, "restaurant_public", PLACE), {followerCount: 999}));
    return "ok";
  });
  assert.deepEqual(own, {artifact: "ok", live: "ok"});
});

test("5. accountStatus suspension enforcement is unchanged", async () => {
  const active = await forEachRuleset(ME, async (db) => {
    await assertSucceeds(setDoc(doc(db, "users", ME, "meals", "m2"), {name: "mi"}));
    return "ok";
  });
  assert.deepEqual(active, {artifact: "ok", live: "ok"});

  const suspended = await forEachRuleset(SUSPENDED, async (db) => {
    // accountActive() blocks the direct client mutation...
    await assertFails(setDoc(doc(db, "users", SUSPENDED, "meals", "m2"), {name: "mi"}));
    // ...and the profile itself cannot be edited out of suspension.
    await assertFails(updateDoc(doc(db, "users", SUSPENDED), {accountStatus: "active"}));
    return "ok";
  });
  assert.deepEqual(suspended, {artifact: "ok", live: "ok"});
});

test("6. the notification boundary is unchanged", async () => {
  const r = await forEachRuleset(ME, async (db) => {
    await assertSucceeds(getDoc(doc(db, "users", ME, "notifications", "n1")));
    await assertFails(getDoc(doc(db, "users", OTHER, "notifications", "n2")));
    await assertSucceeds(updateDoc(doc(db, "users", ME, "notifications", "n1"), {
      isRead: true, readAt: new Date(), status: "read",
    }));
    await assertFails(setDoc(doc(db, "users", ME, "notifications", "n3"), {isRead: false}));
    await assertFails(deleteDoc(doc(db, "users", ME, "notifications", "n1")));
    return "ok";
  });
  assert.deepEqual(r, {artifact: "ok", live: "ok"});
});

test("7. server-only stores and the default-deny catch-all are unchanged", async () => {
  const r = await forEachRuleset(ME, async (db) => {
    for (const col of [
      "admin_audit_events", "admin_bridge_requests", "admin_bridge_rate",
      "notification_broadcast_runs", "totally_unknown_collection",
    ]) {
      await assertFails(getDocs(collection(db, col)));
      await assertFails(setDoc(doc(db, col, "x"), {x: 1}));
    }
    return "ok";
  });
  assert.deepEqual(r, {artifact: "ok", live: "ok"});
});

test("8. an unauthenticated client is denied everywhere it was before", async () => {
  const r = await forEachRuleset(null, async (db) => {
    await assertFails(getDoc(doc(db, "restaurant_public", PLACE)));
    await assertFails(getDoc(doc(db, "menu_comments", "c-visible")));
    await assertFails(getDoc(doc(db, "users", ME)));
    for (const col of NEW_COLLECTIONS) await assertFails(getDocs(collection(db, col)));
    return "ok";
  });
  assert.deepEqual(r, {artifact: "ok", live: "ok"});
});
