/**
 * Wave 3D entry gate 1 — REAL client-perspective rules tests for the post
 * COMMENT lifecycle boundary. Run: npm run test:rules.
 *
 * Contract proved here:
 *   NON-AUTHOR may read a comment only when its status is exactly "active"
 *   AND the parent post is readable. Deleted / unknown / ABSENT all fail closed.
 *   The comment AUTHOR keeps reading their own comment in every state.
 *   Client CREATE must carry status "active" — a client cannot mint a comment
 *   that is already deleted, unknown-status, or lifecycle-less.
 *
 * Scope is feed_posts/{postId}/comments only. menu_comments is a separate
 * Wave 3C domain and is not touched.
 */
import {before, after, beforeEach, test} from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST unset — run via `npm run test:rules`.");
}
const [host, portStr] = HOST.split(":");
const PROJECT_ID = "demo-mm-wave3d-comment-lifecycle-rules";

const POST_AUTHOR = "post-author-1";
const COMMENTER = "commenter-1";
const STRANGER = "stranger-1";

let env: RulesTestEnvironment;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), "..", "firestore.rules"), "utf8"),
      host,
      port: Number(portStr),
    },
  });
});
after(async () => {
  if (env) await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

/**
 * A parent post owned by POST_AUTHOR.
 * `status: null` OMITS the field entirely (a legacy document). Passing
 * `undefined` would silently take the default, so null is the omit sentinel.
 */
function post(visibility = "public", status: string | null = "active") {
  return {
    authorUid: POST_AUTHOR,
    visibility,
    text: "induk",
    ...(status === null ? {} : {status}),
  };
}

/** A comment authored by COMMENTER. `status: null` omits the field entirely. */
function comment(postId: string, status: string | null = "active") {
  return {
    authorUid: COMMENTER,
    text: "komen",
    postId,
    parentVisibility: "public",
    ...(status === null ? {} : {status}),
  };
}

const asStranger = () => env.authenticatedContext(STRANGER).firestore();
const asCommenter = () => env.authenticatedContext(COMMENTER).firestore();
const asPostAuthor = () => env.authenticatedContext(POST_AUTHOR).firestore();

// ── 1. Active comment under an active public post ─────────────────────────

test("1. active comment under an active public post — non-author CAN read", async () => {
  await seed("feed_posts/p1", post());
  await seed("feed_posts/p1/comments/c1", comment("p1"));
  await assertSucceeds(getDoc(doc(asStranger(), "feed_posts/p1/comments/c1")));
  await assertSucceeds(getDoc(doc(asPostAuthor(), "feed_posts/p1/comments/c1")));
});

// ── 2-4. Non-active lifecycles fail closed for a non-author ───────────────

test("2. DELETED comment — non-author CANNOT direct-read", async () => {
  await seed("feed_posts/p1", post());
  await seed("feed_posts/p1/comments/c-del", {...comment("p1", "deleted"), deletedAt: 1});
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p1/comments/c-del")));
  // not even the POST author may read someone else's deleted comment
  await assertFails(getDoc(doc(asPostAuthor(), "feed_posts/p1/comments/c-del")));
});

test("3. UNKNOWN comment status — non-author CANNOT direct-read", async () => {
  await seed("feed_posts/p1", post());
  for (const [id, status] of [["c-hidden", "hidden"], ["c-weird", "quarantined"], ["c-pad", " active "]]) {
    await seed(`feed_posts/p1/comments/${id}`, comment("p1", status));
    await assertFails(getDoc(doc(asStranger(), `feed_posts/p1/comments/${id}`)));
  }
});

test("4. MISSING comment status — non-author CANNOT direct-read under final rules", async () => {
  await seed("feed_posts/p1", post());
  await seed("feed_posts/p1/comments/c-legacy", comment("p1", null));
  await seed("feed_posts/p1/comments/c-empty", comment("p1", ""));
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p1/comments/c-legacy")));
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p1/comments/c-empty")));
});

// ── 5. Comment author keeps full access to their own history ──────────────

test("5. the comment AUTHOR can read their own deleted / legacy / unknown comment", async () => {
  await seed("feed_posts/p1", post());
  await seed("feed_posts/p1/comments/c-del", comment("p1", "deleted"));
  await seed("feed_posts/p1/comments/c-legacy", comment("p1", null));
  await seed("feed_posts/p1/comments/c-weird", comment("p1", "quarantined"));
  for (const id of ["c-del", "c-legacy", "c-weird"]) {
    await assertSucceeds(getDoc(doc(asCommenter(), `feed_posts/p1/comments/${id}`)));
  }
  // and their own-comments collection-group LIST still works
  const mine = query(
    collection(asCommenter(), "comments"),
    where("authorUid", "==", COMMENTER),
  );
  await assertSucceeds(getDocs(mine));
});

// ── 6-7. Parent lifecycle still closes comments ───────────────────────────

test("6. comment under a HIDDEN parent — non-author denied", async () => {
  await seed("feed_posts/p-hidden", post("public", "hidden"));
  await seed("feed_posts/p-hidden/comments/c1", comment("p-hidden"));
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-hidden/comments/c1")));
  // the comment's own author still reaches it (Komen Saya)
  await assertSucceeds(getDoc(doc(asCommenter(), "feed_posts/p-hidden/comments/c1")));
});

test("7. comment under a DELETED parent — non-author denied", async () => {
  await seed("feed_posts/p-del", post("public", "deleted"));
  await seed("feed_posts/p-del/comments/c1", comment("p-del"));
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-del/comments/c1")));
  // a legacy (status-absent) parent also closes for a stranger
  await seed("feed_posts/p-legacy", post("public", null));
  await seed("feed_posts/p-legacy/comments/c1", comment("p-legacy"));
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-legacy/comments/c1")));
});

// ── 8. Existing parent privacy semantics preserved ────────────────────────

test("8. active comment under a private parent — existing privacy preserved", async () => {
  await seed("feed_posts/p-priv", post("private"));
  await seed("feed_posts/p-priv/comments/c1", comment("p-priv"));
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-priv/comments/c1")));
  // the POST author may read comments on their own private post
  await assertSucceeds(getDoc(doc(asPostAuthor(), "feed_posts/p-priv/comments/c1")));
  // unlisted stays readable
  await seed("feed_posts/p-unl", post("unlisted"));
  await seed("feed_posts/p-unl/comments/c1", comment("p-unl"));
  await assertSucceeds(getDoc(doc(asStranger(), "feed_posts/p-unl/comments/c1")));
});

// ── 9-12. Client CREATE is lifecycle-enforced ─────────────────────────────

test("9. client CREATE with status active — ALLOWED when all constraints hold", async () => {
  await seed("feed_posts/p1", post());
  await assertSucceeds(setDoc(doc(asStranger(), "feed_posts/p1/comments/new-1"), {
    authorUid: STRANGER,
    text: "komen baharu",
    status: "active",
    postId: "p1",
    parentVisibility: "public",
  }));
  // the minimal legal form (no optional denormalized fields) also works
  await assertSucceeds(setDoc(doc(asStranger(), "feed_posts/p1/comments/new-2"), {
    authorUid: STRANGER,
    text: "ringkas",
    status: "active",
  }));
});

test("10. client CREATE with MISSING status — DENIED", async () => {
  await seed("feed_posts/p1", post());
  await assertFails(setDoc(doc(asStranger(), "feed_posts/p1/comments/new-3"), {
    authorUid: STRANGER,
    text: "tiada status",
    postId: "p1",
    parentVisibility: "public",
  }));
});

test("11. client CREATE with status deleted — DENIED", async () => {
  await seed("feed_posts/p1", post());
  await assertFails(setDoc(doc(asStranger(), "feed_posts/p1/comments/new-4"), {
    authorUid: STRANGER,
    text: "terus dipadam",
    status: "deleted",
    postId: "p1",
    parentVisibility: "public",
  }));
});

test("12. client CREATE with UNKNOWN status — DENIED", async () => {
  await seed("feed_posts/p1", post());
  for (const [id, status] of [["new-5", "hidden"], ["new-6", "quarantined"], ["new-7", ""]]) {
    await assertFails(setDoc(doc(asStranger(), `feed_posts/p1/comments/${id}`), {
      authorUid: STRANGER,
      text: "status pelik",
      status,
      postId: "p1",
      parentVisibility: "public",
    }));
  }
  // existing validation is NOT weakened: empty text is still refused
  await assertFails(setDoc(doc(asStranger(), "feed_posts/p1/comments/new-8"), {
    authorUid: STRANGER, text: "", status: "active",
  }));
  // and impersonation is still refused
  await assertFails(setDoc(doc(asStranger(), "feed_posts/p1/comments/new-9"), {
    authorUid: COMMENTER, text: "menyamar", status: "active",
  }));
  // client UPDATE remains fully closed, so a lifecycle cannot be moved later
  await seed("feed_posts/p1/comments/c1", comment("p1"));
  await assertFails(setDoc(doc(asStranger(), "feed_posts/p1/comments/c1"), {
    ...comment("p1"), text: "diubah",
  }));
});

// ── 13-15. Thread query shape ─────────────────────────────────────────────

test("13. the status-aware thread query is ALLOWED", async () => {
  await seed("feed_posts/p1", post());
  await seed("feed_posts/p1/comments/c1", comment("p1"));
  await seed("feed_posts/p1/comments/c2", comment("p1"));
  const q = query(
    collection(asStranger(), "feed_posts/p1/comments"),
    where("status", "==", "active"),
  );
  await assertSucceeds(getDocs(q));
});

test("14. the status-aware query returns ONLY active comments", async () => {
  await seed("feed_posts/p1", post());
  await seed("feed_posts/p1/comments/c-ok", comment("p1"));
  await seed("feed_posts/p1/comments/c-del", comment("p1", "deleted"));
  await seed("feed_posts/p1/comments/c-legacy", comment("p1", null));
  const snap = await getDocs(query(
    collection(asStranger(), "feed_posts/p1/comments"),
    where("status", "==", "active"),
  ));
  const ids = snap.docs.map((d) => d.id).sort();
  if (ids.length !== 1 || ids[0] !== "c-ok") {
    throw new Error(`expected only [c-ok], got [${ids.join(", ")}]`);
  }
});

test("15. an UNCONSTRAINED thread query is DENIED once a non-active comment exists", async () => {
  // This is exactly the blocker: one soft-deleted comment used to make the
  // whole thread permission-denied for every non-author.
  await seed("feed_posts/p1", post());
  await seed("feed_posts/p1/comments/c-ok", comment("p1"));
  await seed("feed_posts/p1/comments/c-del", comment("p1", "deleted"));
  await assertFails(getDocs(collection(asStranger(), "feed_posts/p1/comments")));
  // the same query WITH the lifecycle constraint succeeds
  await assertSucceeds(getDocs(query(
    collection(asStranger(), "feed_posts/p1/comments"),
    where("status", "==", "active"),
  )));
});
