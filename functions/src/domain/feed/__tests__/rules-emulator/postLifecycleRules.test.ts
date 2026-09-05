/**
 * Wave 3C read-boundary closure — REAL client-perspective rules tests for the
 * feed_posts lifecycle boundary. Run: npm run test:rules.
 *
 * Proves the exact contract the owner locked:
 *   NON-OWNER may read a post only when status == "active" AND the existing
 *   visibility contract already permitted it. Unknown and ABSENT statuses fail
 *   closed. The AUTHOR keeps reading their own post in every state.
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
const PROJECT_ID = "demo-mm-wave3-post-lifecycle-rules";

const AUTHOR = "author-1";
const STRANGER = "stranger-1";
const MEMBER = "member-1";

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

/** A feed post owned by AUTHOR. `status` omitted entirely when undefined. */
function post(
  visibility: string,
  status?: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    authorUid: AUTHOR,
    visibility,
    text: "kandungan",
    ...(status === undefined ? {} : {status}),
    ...extra,
  };
}

const asStranger = () => env.authenticatedContext(STRANGER).firestore();
const asAuthor = () => env.authenticatedContext(AUTHOR).firestore();

// ── 1-2. Active content stays readable ────────────────────────────────────

test("1. active + public — a signed-in non-owner CAN read", async () => {
  await seed("feed_posts/p-active", post("public", "active"));
  await assertSucceeds(getDoc(doc(asStranger(), "feed_posts/p-active")));
});

test("2. active + unlisted — existing semantics preserved (non-owner CAN read)", async () => {
  await seed("feed_posts/p-unlisted", post("unlisted", "active"));
  await assertSucceeds(getDoc(doc(asStranger(), "feed_posts/p-unlisted")));
});

// ── 3-6. The blocker: moderated content is no longer directly readable ────

test("3. hidden + public — non-owner CANNOT read the document directly", async () => {
  await seed("feed_posts/p-hidden", post("public", "hidden", {moderationReason: "policy"}));
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-hidden")));
});

test("4. deleted + public — non-owner CANNOT read the document directly", async () => {
  await seed("feed_posts/p-deleted", post("public", "deleted", {moderationRemovedAt: 1}));
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-deleted")));
});

test("5. hidden + unlisted — non-owner denied", async () => {
  await seed("feed_posts/p-hid-unl", post("unlisted", "hidden"));
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-hid-unl")));
});

test("6. deleted + unlisted — non-owner denied", async () => {
  await seed("feed_posts/p-del-unl", post("unlisted", "deleted"));
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-del-unl")));
});

// ── 7. Unknown + absent fail closed ───────────────────────────────────────

test("7. unknown status + public — non-owner denied (fail closed)", async () => {
  await seed("feed_posts/p-weird", post("public", "quarantined"));
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-weird")));
  await seed("feed_posts/p-empty", post("public", ""));
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-empty")));
  // ABSENT status (legacy document) is denied too — the backfill normalizes
  // production BEFORE these rules deploy (runbook phases 4-5 precede 7).
  await seed("feed_posts/p-legacy", post("public"));
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-legacy")));
});

// ── 8-9. Author keeps full access to their own history ────────────────────

test("8. the AUTHOR can read their own HIDDEN post", async () => {
  await seed("feed_posts/p-hidden", post("public", "hidden"));
  await assertSucceeds(getDoc(doc(asAuthor(), "feed_posts/p-hidden")));
});

test("9. the AUTHOR can read their own DELETED post (and their legacy post)", async () => {
  await seed("feed_posts/p-deleted", post("public", "deleted", {deletedAt: 1}));
  await assertSucceeds(getDoc(doc(asAuthor(), "feed_posts/p-deleted")));
  await seed("feed_posts/p-legacy", post("public"));
  await assertSucceeds(getDoc(doc(asAuthor(), "feed_posts/p-legacy")));
  await seed("feed_posts/p-weird", post("private", "quarantined"));
  await assertSucceeds(getDoc(doc(asAuthor(), "feed_posts/p-weird")));
});

// ── 10. Existing privacy semantics unchanged ──────────────────────────────

test("10. private / group_only / followers_only privacy is unchanged", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "groups/g1/members/" + MEMBER), {uid: MEMBER});
  });
  await seed("feed_posts/p-private", post("private", "active"));
  await seed("feed_posts/p-followers", post("followers_only", "active"));
  await seed("feed_posts/p-group", post("group_only", "active", {groupId: "g1"}));

  // private + followers_only remain owner-only even when active
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-private")));
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-followers")));
  await assertSucceeds(getDoc(doc(asAuthor(), "feed_posts/p-private")));
  await assertSucceeds(getDoc(doc(asAuthor(), "feed_posts/p-followers")));

  // group_only: member yes, stranger no
  const member = env.authenticatedContext(MEMBER).firestore();
  await assertSucceeds(getDoc(doc(member, "feed_posts/p-group")));
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-group")));

  // and a HIDDEN group post is closed even to a member
  await seed("feed_posts/p-group-hidden", post("group_only", "hidden", {groupId: "g1"}));
  await assertFails(getDoc(doc(member, "feed_posts/p-group-hidden")));

  // unauthenticated reads nothing
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "feed_posts/p-active")));
});

// ── 11-12. Comments close when the parent is hidden/deleted ───────────────

test("11. comments under a HIDDEN parent stay inaccessible to a non-author", async () => {
  await seed("feed_posts/p-hidden", post("public", "hidden"));
  await seed("feed_posts/p-hidden/comments/c1", {
    authorUid: AUTHOR, text: "komen", postId: "p-hidden", parentVisibility: "public",
  });
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-hidden/comments/c1")));
  // the comment's own author still reaches it (Komen Saya)
  await assertSucceeds(getDoc(doc(asAuthor(), "feed_posts/p-hidden/comments/c1")));
  // and nobody may add a new comment to a hidden post
  await assertFails(setDoc(doc(asStranger(), "feed_posts/p-hidden/comments/c-new"), {
    authorUid: STRANGER, text: "cuba", postId: "p-hidden", parentVisibility: "public",
  }));
});

test("12. comments under a DELETED parent stay inaccessible to a non-author", async () => {
  await seed("feed_posts/p-deleted", post("public", "deleted"));
  await seed("feed_posts/p-deleted/comments/c1", {
    authorUid: AUTHOR, text: "komen", postId: "p-deleted", parentVisibility: "public",
  });
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-deleted/comments/c1")));
  // a legacy (status-absent) parent also closes for a stranger
  await seed("feed_posts/p-legacy", post("public"));
  await seed("feed_posts/p-legacy/comments/c1", {
    authorUid: AUTHOR, text: "komen", postId: "p-legacy", parentVisibility: "public",
  });
  await assertFails(getDoc(doc(asStranger(), "feed_posts/p-legacy/comments/c1")));
});

// ── 13-15. Query-shape contract (the client half of the invariant) ────────

test("13. the status-aware public feed query is ALLOWED", async () => {
  await seed("feed_posts/p1", post("public", "active"));
  await seed("feed_posts/p2", post("public", "active"));
  const q = query(
    collection(asStranger(), "feed_posts"),
    where("visibility", "==", "public"),
    where("status", "==", "active"),
  );
  await assertSucceeds(getDocs(q));
});

test("14. the status-aware query does NOT return hidden or deleted posts", async () => {
  await seed("feed_posts/p-ok", post("public", "active"));
  await seed("feed_posts/p-hidden", post("public", "hidden"));
  await seed("feed_posts/p-deleted", post("public", "deleted"));
  const q = query(
    collection(asStranger(), "feed_posts"),
    where("visibility", "==", "public"),
    where("status", "==", "active"),
  );
  const snap = await getDocs(q);
  const ids = snap.docs.map((d) => d.id).sort();
  if (ids.length !== 1 || ids[0] !== "p-ok") {
    throw new Error(`expected only [p-ok], got [${ids.join(", ")}]`);
  }
});

test("15. a public-feed query WITHOUT the lifecycle constraint is DENIED", async () => {
  // This is the production deadlock the runbook sequences around: once the
  // rules require "active", an unconstrained list query can return a document
  // the rules reject, so Firestore rejects the whole query.
  await seed("feed_posts/p-ok", post("public", "active"));
  await seed("feed_posts/p-hidden", post("public", "hidden"));
  const unconstrained = query(
    collection(asStranger(), "feed_posts"),
    where("visibility", "==", "public"),
  );
  await assertFails(getDocs(unconstrained));

  // The owner's own-history query stays allowed without any status constraint.
  const mine = query(
    collection(asAuthor(), "feed_posts"),
    where("authorUid", "==", AUTHOR),
  );
  await assertSucceeds(getDocs(mine));
});
