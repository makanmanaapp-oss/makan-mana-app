/**
 * WAVE 3D GATE 3B — TEMPORARY post-comment write freeze: emulator proof.
 *
 * Follows the repository's EXISTING Firestore rules-test pattern
 * (@firebase/rules-unit-testing + node:test + initializeTestEnvironment),
 * the same one used by
 *   functions/src/domain/feed/__tests__/rules-emulator/commentLifecycleRules.test.ts
 * — only expressed as a standalone CommonJS file so it can live inside this
 * isolated ops artifact instead of the functions build tree.
 *
 * IMPORTANT: every expectation below encodes PRODUCTION BASELINE semantics
 * (commit 759f650da1bc9a03b93117ee0c04d3253b81fec3), NOT Wave 3 final
 * lifecycle semantics. Several assertions here would FAIL against the final
 * Wave 3 ruleset — that is deliberate, and is itself proof that this artifact
 * does not activate Wave 3 early.
 *
 * Run (from this directory) — see README.md for the exact command.
 */
const {before, after, beforeEach, test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync, existsSync} = require("node:fs");
const {resolve} = require("node:path");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} = require("firebase/firestore");

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST unset — run this file via `firebase emulators:exec`."
  );
}
const [host, portStr] = HOST.split(":");
const port = Number(portStr);

const FREEZE_RULES_PATH = resolve(__dirname, "firestore.rules");
/**
 * Path to a TEMP copy of the production baseline rules, produced by
 *   git show 759f650da1bc9a03b93117ee0c04d3253b81fec3:firestore.rules
 * The baseline copy deliberately lives OUTSIDE this artifact (temp only), so
 * the contrast checks are skipped — loudly — when the variable is not given.
 */
const BASELINE_RULES_PATH = process.env.FREEZE_BASELINE_RULES || "";
const hasBaseline = Boolean(BASELINE_RULES_PATH) && existsSync(BASELINE_RULES_PATH);

const POST_AUTHOR = "post-author-1";
const COMMENTER = "commenter-1";
const STRANGER = "stranger-1";

let freezeEnv;
let baselineEnv;

before(async () => {
  freezeEnv = await initializeTestEnvironment({
    projectId: "demo-mm-w3d-gate3b-freeze",
    firestore: {rules: readFileSync(FREEZE_RULES_PATH, "utf8"), host, port},
  });
  if (hasBaseline) {
    baselineEnv = await initializeTestEnvironment({
      projectId: "demo-mm-w3d-gate3b-baseline",
      firestore: {rules: readFileSync(BASELINE_RULES_PATH, "utf8"), host, port},
    });
  }
});

after(async () => {
  if (freezeEnv) await freezeEnv.cleanup();
  if (baselineEnv) await baselineEnv.cleanup();
});

beforeEach(async () => {
  await freezeEnv.clearFirestore();
  if (baselineEnv) await baselineEnv.clearFirestore();
});

async function seed(env, path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

/** Parent post owned by POST_AUTHOR. Baseline posts carry NO status field. */
function post(extra) {
  return Object.assign(
    {authorUid: POST_AUTHOR, visibility: "public", text: "induk"},
    extra || {}
  );
}

/**
 * A comment payload that is FULLY VALID under the production baseline create
 * rule: correct authorUid, truthful postId / parentVisibility denormalisation,
 * and text within 1..300.
 */
function validBaselineComment(extra) {
  return Object.assign(
    {
      authorUid: COMMENTER,
      postId: "p1",
      parentVisibility: "public",
      text: "komen ujian",
    },
    extra || {}
  );
}

const cdb = (env, uid) => env.authenticatedContext(uid).firestore();

// ---------------------------------------------------------------------------
// PROOF 1 + 2 — the freeze is UNCONDITIONAL.
// ---------------------------------------------------------------------------

test("PROOF 1 - signed-in user cannot CREATE a post comment WITHOUT status", async () => {
  await seed(freezeEnv, "feed_posts/p1", post());
  await assertFails(
    setDoc(
      doc(cdb(freezeEnv, COMMENTER), "feed_posts/p1/comments/c1"),
      validBaselineComment()
    )
  );
});

test("PROOF 2 - signed-in user cannot CREATE a post comment WITH status active", async () => {
  await seed(freezeEnv, "feed_posts/p1", post());
  await assertFails(
    setDoc(
      doc(cdb(freezeEnv, COMMENTER), "feed_posts/p1/comments/c1"),
      validBaselineComment({status: "active"})
    )
  );
});

test("PROOF 2b - even the POST AUTHOR on their own commentEnabled post cannot create", async () => {
  await seed(freezeEnv, "feed_posts/p1", post({commentEnabled: true}));
  await assertFails(
    setDoc(
      doc(cdb(freezeEnv, POST_AUTHOR), "feed_posts/p1/comments/c1"),
      validBaselineComment({authorUid: POST_AUTHOR})
    )
  );
});

test("PROOF 2c - BASELINE ALLOWS the very create the freeze denies (contrast)", async (t) => {
  if (!baselineEnv) {
    t.skip("FREEZE_BASELINE_RULES not supplied - see README.md run command");
    return;
  }
  await seed(baselineEnv, "feed_posts/p1", post());
  // Same payload, same actor, same path: succeeds on baseline, fails on freeze.
  await assertSucceeds(
    setDoc(
      doc(cdb(baselineEnv, COMMENTER), "feed_posts/p1/comments/c1"),
      validBaselineComment()
    )
  );
});

// ---------------------------------------------------------------------------
// PROOF 3..5 — READ behaviour is BASELINE, not Wave 3.
// ---------------------------------------------------------------------------

test("PROOF 3 - legacy comment with NO status stays readable by a stranger (BASELINE)", async () => {
  // Under the FINAL Wave 3 ruleset this read is DENIED (commentLifecycleActive
  // demands status == 'active'). Succeeding here proves the freeze preserves
  // production read behaviour and does not activate Wave 3.
  await seed(freezeEnv, "feed_posts/p1", post());
  await seed(freezeEnv, "feed_posts/p1/comments/c1", {
    authorUid: COMMENTER,
    text: "legasi",
  });
  await assertSucceeds(
    getDoc(doc(cdb(freezeEnv, STRANGER), "feed_posts/p1/comments/c1"))
  );
});

test("PROOF 3b - legacy POST with NO status stays readable (BASELINE, no postLifecycleActive)", async () => {
  await seed(freezeEnv, "feed_posts/p1", post());
  await assertSucceeds(getDoc(doc(cdb(freezeEnv, STRANGER), "feed_posts/p1")));
});

test("PROOF 4 - deleted comment is NOT readable by a non-author (BASELINE unchanged)", async () => {
  await seed(freezeEnv, "feed_posts/p1", post());
  await seed(freezeEnv, "feed_posts/p1/comments/c1", {
    authorUid: COMMENTER,
    text: "dipadam",
    status: "deleted",
  });
  await assertFails(
    getDoc(doc(cdb(freezeEnv, STRANGER), "feed_posts/p1/comments/c1"))
  );
});

test("PROOF 5 - comment AUTHOR read bypass unchanged (reads own deleted comment)", async () => {
  await seed(freezeEnv, "feed_posts/p1", post());
  await seed(freezeEnv, "feed_posts/p1/comments/c1", {
    authorUid: COMMENTER,
    text: "dipadam",
    status: "deleted",
  });
  await assertSucceeds(
    getDoc(doc(cdb(freezeEnv, COMMENTER), "feed_posts/p1/comments/c1"))
  );
});

// ---------------------------------------------------------------------------
// PROOF 6 — UPDATE / DELETE unchanged from production baseline.
// ---------------------------------------------------------------------------

test("PROOF 6a - comment UPDATE stays denied for the author (baseline allow update: if false)", async () => {
  await seed(freezeEnv, "feed_posts/p1", post());
  await seed(freezeEnv, "feed_posts/p1/comments/c1", {
    authorUid: COMMENTER,
    text: "asal",
  });
  await assertFails(
    updateDoc(doc(cdb(freezeEnv, COMMENTER), "feed_posts/p1/comments/c1"), {
      text: "diubah",
    })
  );
});

test("PROOF 6b - comment DELETE still ALLOWED for its author (baseline preserved)", async () => {
  await seed(freezeEnv, "feed_posts/p1", post());
  await seed(freezeEnv, "feed_posts/p1/comments/c1", {
    authorUid: COMMENTER,
    text: "asal",
  });
  await assertSucceeds(
    deleteDoc(doc(cdb(freezeEnv, COMMENTER), "feed_posts/p1/comments/c1"))
  );
});

test("PROOF 6c - comment DELETE still DENIED for a non-author (baseline preserved)", async () => {
  await seed(freezeEnv, "feed_posts/p1", post());
  await seed(freezeEnv, "feed_posts/p1/comments/c1", {
    authorUid: COMMENTER,
    text: "asal",
  });
  await assertFails(
    deleteDoc(doc(cdb(freezeEnv, STRANGER), "feed_posts/p1/comments/c1"))
  );
});

// ---------------------------------------------------------------------------
// PROOF 7 — a representative NON-comment operation is governed identically.
// ---------------------------------------------------------------------------

test("PROOF 7a - feed_posts create/update stay denied; author delete stays allowed", async () => {
  await assertFails(
    setDoc(doc(cdb(freezeEnv, POST_AUTHOR), "feed_posts/p9"), post())
  );
  await seed(freezeEnv, "feed_posts/p1", post());
  await assertFails(
    updateDoc(doc(cdb(freezeEnv, POST_AUTHOR), "feed_posts/p1"), {text: "diubah"})
  );
  await assertSucceeds(
    deleteDoc(doc(cdb(freezeEnv, POST_AUTHOR), "feed_posts/p1"))
  );
});

test("PROOF 7b - group_only post stays hidden from a non-member (baseline visibility rule)", async () => {
  await seed(
    freezeEnv,
    "feed_posts/p2",
    post({visibility: "group_only", groupId: "g1"})
  );
  await assertFails(getDoc(doc(cdb(freezeEnv, STRANGER), "feed_posts/p2")));
});

// ---------------------------------------------------------------------------
// PROOF 8 — menu_comments untouched (absent in BOTH baseline and freeze).
// ---------------------------------------------------------------------------

test("PROOF 8 - menu_comments has no rule in baseline or freeze; stays default-deny", async () => {
  const freezeSrc = readFileSync(FREEZE_RULES_PATH, "utf8");
  assert.equal(
    (freezeSrc.match(/menu_comments/g) || []).length,
    0,
    "freeze artifact must not introduce menu_comments rules"
  );
  if (hasBaseline) {
    const baseSrc = readFileSync(BASELINE_RULES_PATH, "utf8");
    assert.equal((baseSrc.match(/menu_comments/g) || []).length, 0);
  }
  await assertFails(
    setDoc(doc(cdb(freezeEnv, COMMENTER), "menu_comments/mc1"), {text: "x"})
  );
  await assertFails(
    getDoc(doc(cdb(freezeEnv, STRANGER), "menu_comments/mc1"))
  );
});

// ---------------------------------------------------------------------------
// NO FINAL-RULE ACTIVATION — source-level, compared against the baseline.
// ---------------------------------------------------------------------------

test("NO-ACTIVATION - freeze artifact carries no Wave 3 final lifecycle construct", () => {
  const src = readFileSync(FREEZE_RULES_PATH, "utf8");
  const constructs = [
    "commentLifecycleActive",
    "postLifecycleActive",
    "canReadCommentData",
    "restaurant_follows",
    "menu_comments",
  ];
  for (const construct of constructs) {
    const inFreeze = (src.match(new RegExp(construct, "g")) || []).length;
    if (hasBaseline) {
      // Not string-absence alone: the count must MATCH the baseline count, so
      // a construct that legitimately pre-existed in production is not
      // mistaken for a Wave 3 leak, and vice versa.
      const baseSrc = readFileSync(BASELINE_RULES_PATH, "utf8");
      const inBaseline = (baseSrc.match(new RegExp(construct, "g")) || []).length;
      assert.equal(
        inFreeze,
        inBaseline,
        `construct count diverged from baseline: ${construct}`
      );
    } else {
      assert.equal(inFreeze, 0, `Wave 3 construct in freeze artifact: ${construct}`);
    }
  }
  // The final Wave 3 comment-create requirement must NOT appear as a
  // replacement for the frozen rule.
  assert.equal(/request\.resource\.data\.status\s*==\s*'active'/.test(src), false);
  // And the freeze must be the unconditional deny, not a narrowed condition.
  assert.equal(/allow create: if false;/.test(src), true);
});
