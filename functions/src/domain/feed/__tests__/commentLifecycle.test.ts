import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  COMMENT_STATUSES,
  NEW_COMMENT_STATUS,
  classifyStoredCommentStatus,
  hasOwnStatusField,
  isConsumerVisibleCommentStatus,
  newCommentLifecycleFields,
} from "../commentLifecycle";
import {
  BACKFILL_WRITABLE_FIELDS,
  DEFAULT_MAX_DOCUMENTS,
  DEFAULT_PAGE_SIZE,
  EXPECTED_PROJECT_ID,
  accumulateCommentBackfill,
  assertSafeCommentBackfillInvocation,
  commentBackfillBanner,
  commentBackfillExitCode,
  commentBackfillIsComplete,
  decideLegacyCommentStatusBackfill,
  emptyCommentBackfillCounters,
  isCommentBackfillDryRun,
  MAX_REPORTED_IDS,
  isPostCommentPath,
  parseCommentBackfillArgs,
  recordCommentBackfillError,
  renderCommentBackfillReport,
} from "../legacyCommentStatusBackfill";

/**
 * Wave 3D entry gate 1 — post-comment lifecycle.
 * The mechanism is proven here; the backfill is NOT executed.
 */

const read = (rel: string) =>
  readFileSync(resolve(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");

const rules = read("../firestore.rules");
const cli = read("scripts/feedPostCommentStatusBackfill.ts");
const pure = read("src/domain/feed/legacyCommentStatusBackfill.ts");
const sheet = read("../lib/features/social/comment_sheet.dart");
const providers = read("../lib/features/social/social_providers.dart");
const softDelete = read("src/callable/userContentControl.ts");
const trigger = read("src/triggers/onCommentChanged.ts");

const P = "feed_posts/post-1/comments/c-1";

/** Fold a simulated collection-group page through the decision + counters. */
function run(
  docs: ReadonlyArray<[string, Record<string, unknown>]>,
  {apply}: {apply: boolean},
) {
  const counters = emptyCommentBackfillCounters();
  for (const [path, data] of docs) {
    const decision = decideLegacyCommentStatusBackfill(path, data);
    accumulateCommentBackfill(counters, path, decision, apply && decision.action === "set_active");
  }
  return counters;
}

// ── Vocabulary ────────────────────────────────────────────────────────────

test("1. a new comment is born status 'active', defined once", () => {
  assert.equal(NEW_COMMENT_STATUS, "active");
  assert.deepEqual(newCommentLifecycleFields(), {status: "active"});
  assert.notEqual(newCommentLifecycleFields(), newCommentLifecycleFields());
  assert.deepEqual([...COMMENT_STATUSES], ["active", "deleted"]);
});

test("2. consumer visibility is EXACTLY 'active' (absent/unknown fail closed)", () => {
  assert.equal(isConsumerVisibleCommentStatus("active"), true);
  for (const bad of [undefined, null, "", "  ", "deleted", "hidden", "ACTIVE", " active ", 0, {}]) {
    assert.equal(isConsumerVisibleCommentStatus(bad), false, String(bad));
  }
});

test("3. TRUE-MISSING: only an ABSENT status field is 'missing'", () => {
  // (1) absent field -> missing (the ONLY normalizable class)
  assert.equal(classifyStoredCommentStatus({}), "missing");
  assert.equal(classifyStoredCommentStatus({text: "lama", authorUid: "u"}), "missing");
  assert.equal(hasOwnStatusField({}), false);

  // (2)(3) the two real lifecycle values
  assert.equal(classifyStoredCommentStatus({status: "active"}), "active");
  assert.equal(classifyStoredCommentStatus({status: "deleted"}), "deleted");

  // (4)-(9) EVERY present-but-invalid value is UNKNOWN, never missing.
  const presentButInvalid: unknown[] = [
    null, "", "   ", "	", " active ", "active ", " active", "ACTIVE", "Active",
    "hidden", "removed", "visible", 0, 1, false, true, {}, [], [1],
  ];
  for (const bad of presentButInvalid) {
    const stored = {status: bad} as Record<string, unknown>;
    assert.equal(hasOwnStatusField(stored), true, `present: ${JSON.stringify(bad)}`);
    assert.equal(
      classifyStoredCommentStatus(stored),
      "unknown",
      `must be unknown, not missing: ${JSON.stringify(bad)}`,
    );
  }

  // a missing DOCUMENT is unknown, not missing — nothing to normalize
  assert.equal(classifyStoredCommentStatus(null), "unknown");
  assert.equal(classifyStoredCommentStatus(undefined), "unknown");

  // hasOwnProperty is borrowed, so a field literally named hasOwnProperty
  // cannot break the check
  const hostile = {hasOwnProperty: "not a function", text: "x"} as unknown as Record<string, unknown>;
  assert.equal(classifyStoredCommentStatus(hostile), "missing");
});

test("3b. the backfill NEVER turns a present malformed status into active", () => {
  // (12) the decision layer, not just the classifier
  for (const bad of [null, "", "   ", " active ", "ACTIVE", "hidden", 0, false, {}, []]) {
    const d = decideLegacyCommentStatusBackfill(P, {status: bad});
    assert.equal(d.action, "skip", JSON.stringify(bad));
    assert.equal(d.reason, "unknown", JSON.stringify(bad));
    assert.equal(d.update, null, JSON.stringify(bad));
  }
  // and ONLY the absent field yields a write
  const ok = decideLegacyCommentStatusBackfill(P, {text: "lama"});
  assert.equal(ok.action, "set_active");
  assert.equal(ok.reason, "missing");
  assert.deepEqual(ok.update, {status: "active"});
  // a null DOCUMENT is never written either
  assert.equal(decideLegacyCommentStatusBackfill(P, null).action, "skip");
  assert.equal(decideLegacyCommentStatusBackfill(P, null).reason, "unknown");
});

test("3c. every present-but-invalid value lands in unknownStatus and is reported", () => {
  // (10)(11) counters + bounded id reporting
  const docs: Array<[string, Record<string, unknown>]> = [
    ["feed_posts/p/comments/absent", {text: "lama"}],
    ["feed_posts/p/comments/null", {status: null}],
    ["feed_posts/p/comments/empty", {status: ""}],
    ["feed_posts/p/comments/spaces", {status: "   "}],
    ["feed_posts/p/comments/padded", {status: " active "}],
    ["feed_posts/p/comments/hidden", {status: "hidden"}],
    ["feed_posts/p/comments/zero", {status: 0}],
  ];
  const c = run(docs, {apply: true});
  assert.equal(c.scanned, 7);
  assert.equal(c.missingStatus, 1, "only the absent-field document");
  assert.equal(c.updated, 1);
  assert.equal(c.unknownStatus, 6, "null/empty/spaces/padded/hidden/zero");
  assert.equal(c.alreadyActive, 0);
  assert.equal(c.deleted, 0);
  assert.equal(c.unknownStatusIds.length, 6);
  assert.ok(c.unknownStatusIds.includes("feed_posts/p/comments/null"));
  assert.ok(c.unknownStatusIds.includes("feed_posts/p/comments/padded"));
  assert.equal(commentBackfillExitCode(c, false), 2, "unknown blocks the gate");
  assert.equal(commentBackfillIsComplete(c, false, false), false);

  // ids are BOUNDED at MAX_REPORTED_IDS
  const many: Array<[string, Record<string, unknown>]> = Array.from(
    {length: MAX_REPORTED_IDS + 25},
    (_v, i) => [`feed_posts/p/comments/u${i}`, {status: "hidden"}],
  );
  const big = run(many, {apply: false});
  assert.equal(big.unknownStatus, MAX_REPORTED_IDS + 25);
  assert.equal(big.unknownStatusIds.length, MAX_REPORTED_IDS);
});

// ── WRITER leg ────────────────────────────────────────────────────────────

test("4. the ONLY comment creation path stamps status active", () => {
  // exactly one Flutter comment writer
  assert.equal((sheet.match(/\.collection\('comments'\)/g) ?? []).length, 2,
    "one create path + one hard-delete path");
  const add = sheet.split(".add({")[1]?.split("})")[0] ?? "";
  assert.ok(add.includes("'status': kCommentStatusActive,"));
  assert.ok(add.includes("'authorUid': uid"));
  // no backend path creates post comments
  for (const marker of ['collection("comments")\n      .add(', ".collection(\"comments\").add("]) {
    assert.equal(softDelete.includes(marker), false, marker);
  }
});

test("5. the soft-delete path is unchanged and still writes 'deleted'", () => {
  assert.ok(softDelete.includes('status: "deleted"'));
  assert.ok(softDelete.includes("deleteUserComment"));
  assert.equal(isConsumerVisibleCommentStatus("deleted"), false);
});

// ── QUERY leg ─────────────────────────────────────────────────────────────

test("6. the normal thread query requires active and keeps its ordering", () => {
  const q = providers.split("final commentsProvider")[1]?.split("\n});")[0] ?? "";
  assert.ok(q.includes("where('status', isEqualTo: kCommentStatusActive)"));
  assert.ok(q.includes("orderBy('createdAt', descending: false)"), "ordering preserved");
  assert.ok(q.includes(".limit(100)"), "page size preserved");
  // NOT the weaker denylist form
  assert.equal(q.includes("isNotEqualTo"), false);
  assert.ok(providers.includes("const kCommentStatusActive = 'active';"));
});

test("7. owner history providers are deliberately NOT constrained", () => {
  // myCommentsProvider lists ONLY the caller's own comments (rules allow list
  // requires authorUid == uid), and the author branch of the read rule permits
  // an author's own deleted comment. Constraining it would also hide legacy
  // comments from their own author, so it stays unconstrained.
  const mine = providers.split("final myCommentsProvider")[1]?.split("\n});")[0] ?? "";
  assert.ok(mine.includes("collectionGroup('comments')"));
  assert.ok(mine.includes("where('authorUid', isEqualTo: uid)"));
  assert.equal(mine.includes("kCommentStatusActive"), false);
  // the public-replies surface is per-item GET behind try/catch, rules-enforced
  const replies = providers.split("final userPublicRepliesProvider")[1]?.split("\n});")[0] ?? "";
  assert.ok(replies.includes("} catch (_) {"));
  assert.equal(replies.includes("kCommentStatusActive"), false);
});

// ── RULES leg ─────────────────────────────────────────────────────────────

test("8. rules enforce exact-active reads for non-authors on BOTH surfaces", () => {
  assert.ok(rules.includes("function commentLifecycleActive(c) {"));
  assert.ok(rules.includes("return c.get('status', '') == 'active';"));
  // no permissive default anywhere in the helper
  const helper = rules.split("function commentLifecycleActive(c) {")[1]?.split("}")[0] ?? "";
  assert.equal(/get\('status', 'active'\)/.test(helper), false);
  // nested read + collection-group get both use it, author branch first
  assert.equal((rules.match(/commentLifecycleActive\(resource\.data\)/g) ?? []).length, 2);
  const nested = rules.split("match /comments/{commentId} {")[1]?.split("allow create")[0] ?? "";
  assert.ok(nested.includes("resource.data.get('authorUid', '') == request.auth.uid"));
  assert.ok(nested.includes("commentLifecycleActive(resource.data)"));
  // the weaker denylist is gone from the comment surfaces
  assert.equal(rules.includes("resource.data.get('status', '') != 'deleted'"), false);
});

test("9. rules enforce born-active on client CREATE without weakening validation", () => {
  const create = rules.split("allow create: if signedIn()\n          && request.resource.data.authorUid == request.auth.uid")[1]
    ?.split("allow update")[0] ?? "";
  assert.ok(create.includes("request.resource.data.status == 'active'"));
  // every pre-existing guard survives
  for (const guard of [
    "request.resource.data.text is string",
    "request.resource.data.text.size() > 0",
    "request.resource.data.text.size() <= 300",
    "exists(/databases/$(database)/documents/feed_posts/$(postId))",
    "canReadPostData(",
    ".data.get('commentEnabled', true) != false",
    "'postId', 'parentVisibility'",
  ]) {
    assert.ok(create.includes(guard), guard);
  }
  assert.ok(rules.includes("allow update: if false;"));
});

test("10. the parent-post protections are untouched", () => {
  // hidden/deleted parent still closes comments, and canReadPostData still
  // carries the Wave 3C post lifecycle gate
  assert.ok(rules.includes(".data.get('status', 'active') != 'deleted'"));
  assert.ok(rules.includes(".data.get('status', 'active') != 'hidden'"));
  assert.ok(rules.includes("function canReadCurrentParent(parentPath) {"));
  assert.ok(rules.includes("function postLifecycleActive(p) {"));
  assert.ok(rules.includes("return p.get('status', '') == 'active';"));
  // menu_comments (Wave 3C) untouched by this closure
  assert.equal(rules.includes("commentLifecycleActive(menu"), false);
});

// ── LEGACY leg ────────────────────────────────────────────────────────────

const COLLECTION: ReadonlyArray<[string, Record<string, unknown>]> = [
  // TRUE-MISSING: the status field is absent -> the ONLY normalizable case
  ["feed_posts/p1/comments/legacy-1", {text: "lama"}],
  // PRESENT but empty -> UNKNOWN, never normalized
  ["feed_posts/p1/comments/empty-1", {text: "lama", status: ""}],
  ["feed_posts/p1/comments/active-1", {status: "active"}],
  ["feed_posts/p2/comments/deleted-1", {status: "deleted", deletedAt: 1}],
  ["feed_posts/p2/comments/weird-1", {status: "hidden"}],
  ["menu_comments/mc-1", {status: "visible"}],
  ["groups/g1/comments/foreign-1", {text: "bukan komen post"}],
];

test("11. ONLY a missing status on a real post-comment path is normalized", () => {
  const d = decideLegacyCommentStatusBackfill(P, {text: "lama"});
  assert.equal(d.action, "set_active");
  assert.equal(d.reason, "missing");
  assert.deepEqual(d.update, {status: "active"});
  assert.deepEqual(Object.keys(d.update!), [...BACKFILL_WRITABLE_FIELDS]);
});

test("12. active/deleted/unknown are NEVER touched (no resurrection)", () => {
  for (const [status, reason] of [
    ["active", "active"], ["deleted", "deleted"],
    ["hidden", "unknown"], ["removed", "unknown"], ["", "unknown"], ["   ", "unknown"],
  ]) {
    const d = decideLegacyCommentStatusBackfill(P, {status});
    assert.equal(d.action, "skip", JSON.stringify(status));
    assert.equal(d.reason, reason, JSON.stringify(status));
    assert.equal(d.update, null, JSON.stringify(status));
  }
});

test("13. foreign paths are skipped — menu_comments can never match", () => {
  assert.equal(isPostCommentPath("feed_posts/p1/comments/c1"), true);
  for (const bad of [
    "menu_comments/mc-1",
    "groups/g1/comments/c1",
    "feed_posts/p1/comments/c1/replies/r1",
    "feed_posts/p1",
    "comments/c1",
    42,
    null,
  ]) {
    assert.equal(isPostCommentPath(bad), false, String(bad));
    assert.equal(decideLegacyCommentStatusBackfill(bad, {}).action, "skip", String(bad));
    assert.equal(decideLegacyCommentStatusBackfill(bad, {}).reason, "not_a_post_comment", String(bad));
  }
});

test("14. DRY RUN reports wouldUpdate but never updated; APPLY matches", () => {
  const dry = run(COLLECTION, {apply: false});
  assert.equal(dry.scanned, 7);
  // ONLY the absent-field document counts as missing — the empty-string one
  // is present-but-invalid and is therefore unknown.
  assert.equal(dry.missingStatus, 1);
  assert.equal(dry.wouldUpdate, 1);
  assert.equal(dry.updated, 0);
  assert.equal(dry.alreadyActive, 1);
  assert.equal(dry.deleted, 1);
  assert.equal(dry.unknownStatus, 2);
  assert.equal(dry.skippedForeignPath, 2);
  assert.deepEqual(dry.unknownStatusIds.sort(), [
    "feed_posts/p1/comments/empty-1",
    "feed_posts/p2/comments/weird-1",
  ]);

  const applied = run(COLLECTION, {apply: true});
  assert.equal(applied.updated, 1);
  assert.equal(applied.updated, applied.missingStatus);
  assert.equal(commentBackfillExitCode(applied, false), 2, "unknown status still blocks");
});

test("15. IDEMPOTENT — a second pass finds nothing to do", () => {
  const after: Array<[string, Record<string, unknown>]> = COLLECTION.map(([path, d]) =>
    decideLegacyCommentStatusBackfill(path, d).action === "set_active" ?
      [path, {...d, status: "active"}] :
      [path, d],
  );
  const second = run(after, {apply: true});
  assert.equal(second.missingStatus, 0, "nothing left to normalize");
  assert.equal(second.wouldUpdate, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.alreadyActive, 2, "the one normalized doc joins the active bucket");
  assert.equal(second.deleted, 1);
  // the present-but-invalid documents are STILL unknown after a full apply —
  // the backfill never silently resolves them
  assert.equal(second.unknownStatus, 2);
});

test("16. gates: truncation, unknown status and errors all block completeness", () => {
  const clean = run(
    [["feed_posts/p/comments/a", {}], ["feed_posts/p/comments/b", {status: "active"}]],
    {apply: true},
  );
  assert.equal(commentBackfillExitCode(clean, false), 0);
  assert.equal(commentBackfillIsComplete(clean, false, false), true);
  // a DRY RUN is the Phase C6 gate and MUST be able to pass
  const verified = run([["feed_posts/p/comments/b", {status: "active"}]], {apply: false});
  assert.equal(commentBackfillIsComplete(verified, true, false), true);
  assert.equal(commentBackfillIsComplete(run([["feed_posts/p/comments/a", {}]], {apply: false}), true, false), false);
  // truncation
  assert.equal(commentBackfillIsComplete(clean, false, true), false);
  assert.equal(commentBackfillExitCode(clean, true), 2);
  // errors
  const err = run([["feed_posts/p/comments/a", {}]], {apply: true});
  recordCommentBackfillError(err, "feed_posts/p/comments/a");
  assert.equal(err.errors, 1);
  assert.equal(commentBackfillIsComplete(err, false, false), false);
});

test("17. DRY RUN is the default; APPLY needs bare --apply AND confirm-project", () => {
  assert.equal(parseCommentBackfillArgs([]).apply, false);
  assert.equal(isCommentBackfillDryRun(parseCommentBackfillArgs(["--mode=apply"])), true);
  assert.equal(isCommentBackfillDryRun(parseCommentBackfillArgs(["--apply"])), true);
  assert.equal(isCommentBackfillDryRun(parseCommentBackfillArgs(["--mode=apply", "--apply"])), false);
  assert.throws(() => assertSafeCommentBackfillInvocation(parseCommentBackfillArgs([])), /--mode=dry-run or --mode=apply/);
  assert.throws(() => assertSafeCommentBackfillInvocation(parseCommentBackfillArgs(["--mode=apply"])), /explicit --apply/);
  assert.throws(() => assertSafeCommentBackfillInvocation(parseCommentBackfillArgs(["--mode=apply", "--apply"])), /--confirm-project/);
  assert.throws(() => assertSafeCommentBackfillInvocation(parseCommentBackfillArgs(["--mode=dry-run", "--apply"])), /cannot be combined/);
  for (const bad of ["--apply=false", "--apply=true", "--apply="]) {
    assert.throws(
      () => assertSafeCommentBackfillInvocation(parseCommentBackfillArgs(["--mode=apply", bad, `--confirm-project=${EXPECTED_PROJECT_ID}`])),
      /--apply takes no value/,
      bad,
    );
  }
  assertSafeCommentBackfillInvocation(parseCommentBackfillArgs(["--mode=dry-run"]));
  assertSafeCommentBackfillInvocation(
    parseCommentBackfillArgs(["--mode=apply", "--apply", `--confirm-project=${EXPECTED_PROJECT_ID}`]),
  );
  const a = parseCommentBackfillArgs(["--mode=dry-run", "--page-size=50", "--max-documents=500", "--start-after=feed_posts/p/comments/c"]);
  assert.equal(a.startAfter, "feed_posts/p/comments/c");
  assert.throws(() => assertSafeCommentBackfillInvocation({...a, pageSize: DEFAULT_PAGE_SIZE + 1}), /--page-size/);
  assert.throws(() => assertSafeCommentBackfillInvocation({...a, maxDocuments: DEFAULT_MAX_DOCUMENTS + 1}), /--max-documents/);
});

test("18. the pure module cannot write; the CLI writes only status, preconditioned", () => {
  const code = pure.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal(/from\s+["'][^"']*(firebase|firestore)[^"']*["']/i.test(code), false);
  assert.equal(/\.set\(|\.update\(|\.commit\(|\.delete\(|batch\(/.test(code), false);

  assert.ok(cli.includes("assertSafeCommentBackfillInvocation(args);"));
  assert.ok(cli.includes('if (decision.action === "set_active" && decision.update && !dryRun)'));
  assert.ok(cli.includes("doc.ref.update(decision.update, {lastUpdateTime: doc.updateTime})"));
  assert.equal((cli.match(/\.set\(|\.update\(|\.delete\(/g) ?? []).length, 1);
  assert.equal(/batch\(/.test(cli), false);
  // it re-checks the real path even though it scans a collection group
  assert.ok(cli.includes("decideLegacyCommentStatusBackfill(doc.ref.path"));
  assert.ok(cli.includes("collectionGroup(COMMENTS_COLLECTION)"));
  assert.ok(cli.includes("truncated = !probeSnap.empty;"));
  // and it is not part of the deployed function surface
  assert.equal(read("src/index.ts").includes("feedPostCommentStatusBackfill"), false);
});

test("19. the report exposes every required counter", () => {
  const c = run(COLLECTION, {apply: false});
  const report = renderCommentBackfillReport(c, true, "feed_posts/p2/comments/weird-1", false);
  for (const key of [
    "scanned", "missingStatus", "wouldUpdate", "updated", "alreadyActive",
    "deleted", "unknownStatus", "errors", "resumeCursor", "truncated",
  ]) {
    assert.ok(report.includes(`| ${key} |`), key);
  }
  assert.ok(renderCommentBackfillReport(c, true, null, true).includes("TAIL NOT SEEN"));
  assert.ok(commentBackfillBanner(EXPECTED_PROJECT_ID, true).includes("NO DATA WILL BE MODIFIED"));
  assert.ok(commentBackfillBanner(EXPECTED_PROJECT_ID, false).includes("status='active'"));
});

// ── Trigger regression ────────────────────────────────────────────────────

test("20. the comment trigger still fires only on create/delete, never on update", () => {
  assert.ok(trigger.includes("const created = event.data?.after.exists && !event.data?.before.exists;"));
  assert.ok(trigger.includes("const deleted = !event.data?.after.exists && event.data?.before.exists;"));
  assert.ok(trigger.includes("if (!created && !deleted) return;"));
  // the notification block is inside `if (created)` so a soft-delete update can
  // never emit a new-comment notification, and no duplicate is possible
  const notifyIdx = trigger.indexOf("notifySafely({");
  const createdIdx = trigger.indexOf("if (created) {");
  assert.ok(createdIdx > 0 && notifyIdx > createdIdx);
  assert.equal((trigger.match(/notifySafely\(\{/g) ?? []).length, 1);
  // stamping status on create does not change the reply-activity gate
  assert.ok(trigger.includes('comment.status === "deleted"'));
});
