import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  DEFAULT_MAX_DOCUMENTS,
  DEFAULT_PAGE_SIZE,
  EXPECTED_PROJECT_ID,
  KNOWN_SNAPSHOT_KEYS,
  SCRUB_REMOVABLE_FIELDS,
  SENSITIVE_SNAPSHOT_KEYS,
  ScrubCounters,
  accumulateScrub,
  assertSafeScrubInvocation,
  decideRepostSnapshotScrub,
  emptyScrubCounters,
  isScrubDryRun,
  parseScrubArgs,
  recordScrubError,
  renderScrubReport,
  scrubExitCode,
  scrubIsComplete,
  snapshotHasSensitiveContent,
} from "../repostSnapshotSanitizer";
import {newPostLifecycleFields} from "../postLifecycle";

/**
 * Wave 3C final security closure — repost copy safety.
 *
 * The writer no longer embeds original content; the sanitizer decides what to
 * do with documents that already do. Neither is executed in this closure.
 */

const read = (rel: string) =>
  readFileSync(resolve(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");

const writer = read("src/callable/repostFeedPost.ts");
const cli = read("scripts/repostSnapshotSanitizer.ts");
const pure = read("src/domain/feed/repostSnapshotSanitizer.ts");
const embedCard = read("../lib/features/social/repost.dart");
const postCard = read("../lib/features/social/post_card.dart");
const composeSheet = read("../lib/features/social/compose_sheet.dart");

/** The document literal the repost callable actually writes. */
const created = writer.split('collection("feed_posts").add({')[1]?.split("});")[0] ?? "";

/** A realistic legacy snapshot, exactly as the removed builder produced it. */
const LEGACY_SNAPSHOT = {
  authorUid: "victim-uid",
  displayName: "Victim",
  username: "victim",
  photoUrl: "https://example/p.jpg",
  emoji: "😋",
  text: "RAHSIA yang kemudian disorok moderator",
  imageUrl: "https://firebasestorage.googleapis.com/secret.jpg",
  mediaCount: 1,
  placeName: "Warung Rahsia",
  postType: "food_post",
  type: "status",
  menuName: "Nasi Lemak",
  totalSpend: 12.5,
  userRating: 5,
};

// ── 1-2. Lifecycle stamp survives this closure ────────────────────────────

test("1. a new repost is born status active", () => {
  assert.ok(created.includes("...newPostLifecycleFields(),"));
  assert.deepEqual(newPostLifecycleFields(), {status: "active"});
  assert.ok(writer.includes('const postType = isQuote ? "quote_repost" : "repost";'));
});

test("2. a new QUOTE repost is born status active (same single write site)", () => {
  // Both modes go through ONE add() — so the stamp cannot diverge by mode.
  assert.equal((writer.match(/collection\("feed_posts"\)\.add\(/g) ?? []).length, 1);
  assert.ok(created.includes("type: postType"));
  assert.ok(created.includes("...newPostLifecycleFields(),"));
});

// ── 3-5. No original content is duplicated any more ───────────────────────

test("3. the new repost document contains NO original text", () => {
  assert.equal(writer.includes("originalSnapshot:"), false, "no snapshot field is written");
  assert.equal(writer.includes("buildOriginalSnapshot"), false, "the copier is gone");
  // the only `text` written is the reposter own quote caption
  assert.ok(created.includes("\n    text,\n"), "reposter own text stays");
  assert.equal(/text: .*orig|orig\.text/.test(created), false, "never the original text");
});

test("4. the new repost document contains NO original image/media", () => {
  assert.ok(created.includes("imageUrl: null"), "a repost carries no media of its own");
  assert.equal(/imageUrls|mediaCount|firstImage/.test(created), false);
  assert.equal(writer.includes("data.imageUrls"), false);
});

test("5. NO menu/review/spend/rating/place content is copied", () => {
  for (const key of ["menuName", "totalSpend", "userRating", "placeName", "reviewRating"]) {
    assert.equal(created.includes(key), false, `${key} must not be written`);
    assert.equal(writer.includes(`data.${key}`), false, `${key} must not be read from the original`);
  }
  // identity/presentation of the ORIGINAL author is gone too
  for (const key of ["displayName: data", "username: data", "photoUrl: data"]) {
    assert.equal(writer.includes(key), false, key);
  }
});

// ── 6. The reposter own content is preserved ──────────────────────────────

test("6. the quote author OWN text and identity remain", () => {
  assert.ok(created.includes("authorUid: uid"), "the reposter is the author");
  assert.ok(created.includes("\n    text,\n"));
  assert.ok(created.includes("displayName,") && created.includes("username,") && created.includes("photoUrl,"));
  // stable linkage is retained so the client can resolve the original live
  assert.ok(created.includes("repostOfPostId: isQuote ? null : originalPostId,"));
  assert.ok(created.includes("quotedPostId: isQuote ? originalPostId : null,"));
  // safe metadata that reproduces nothing the original author wrote
  assert.ok(created.includes("originalAuthorId: origAuthor || null,"));
  assert.ok(created.includes("originalVisibilitySnapshot: origVisibility,"));
});

// ── 7-9. Rendering reads the live original, never a stale copy ────────────

test("7. live original readable -> the renderer displays the LIVE document", () => {
  assert.ok(embedCard.includes("final liveAsync = ref.watch(postByIdProvider(originalPostId));"));
  assert.ok(embedCard.includes("data = live.data;"));
  // every displayed field comes from `d`, which is only ever the live document
  for (const field of ["d['text']", "d['placeName']", "d['authorUid']"]) {
    assert.ok(embedCard.includes(field), field);
  }
});

test("8. hidden/deleted/unreadable original -> the renderer shows NO stale content", () => {
  assert.ok(embedCard.includes("if (liveAsync.hasError) {\n      unavailable = true;"));
  assert.ok(embedCard.includes("if (live == null) {\n        unavailable = true;"));
  assert.ok(embedCard.includes("l.t('postUnavailable')"));
  // and there is no snapshot to fall back to, by construction
  assert.equal(/final Map<String, dynamic>\? snapshot;/.test(embedCard), false,
    "the widget must not hold a snapshot field at all");
});

test("9. NO stale-content flash is possible through the data layer", () => {
  // loading renders a skeleton, explicitly not content
  assert.ok(embedCard.includes("data = null; // skeleton sahaja"));
  assert.ok(embedCard.includes("CircularProgressIndicator"));
  // no call site can inject content: the parameter no longer exists
  assert.equal(/snapshot:/.test(embedCard), false);
  for (const [name, src] of [["post_card", postCard], ["compose_sheet", composeSheet]] as const) {
    const calls = src.split("EmbeddedOriginalCard(").slice(1);
    assert.ok(calls.length > 0, name);
    for (const call of calls) {
      const args = call.split(")")[0];
      assert.equal(args.includes("snapshot:"), false, `${name} must not pass a snapshot`);
    }
  }
  // the Flutter layer no longer reads the legacy field anywhere
  assert.equal(postCard.includes("originalSnapshot"), false);
});

// ── 10. The sanitizer recognises an unsafe snapshot ───────────────────────

test("10. the sanitizer identifies an unsafe legacy snapshot", () => {
  for (const postType of ["repost", "quote_repost"]) {
    const d = decideRepostSnapshotScrub({postType, originalSnapshot: LEGACY_SNAPSHOT});
    assert.equal(d.action, "remove_snapshot", postType);
    assert.equal(d.reason, "unsafe_snapshot", postType);
    assert.deepEqual(d.removeFields, [...SCRUB_REMOVABLE_FIELDS]);
  }
  assert.equal(snapshotHasSensitiveContent(LEGACY_SNAPSHOT), true);
  // every key the legacy builder emitted is recognised
  for (const key of Object.keys(LEGACY_SNAPSHOT)) {
    assert.ok(KNOWN_SNAPSHOT_KEYS.includes(key), key);
  }
  // a non-repost is never touched, even if it somehow has the field
  assert.equal(decideRepostSnapshotScrub({postType: "food_post", originalSnapshot: LEGACY_SNAPSHOT}).action, "skip");
  assert.equal(decideRepostSnapshotScrub(null).reason, "not_a_repost");
});

// ── 11. Dry run performs no writes ────────────────────────────────────────

test("11. DRY RUN is the default and performs no writes", () => {
  assert.equal(parseScrubArgs([]).apply, false);
  assert.equal(isScrubDryRun(parseScrubArgs(["--mode=dry-run"])), true);
  assert.equal(isScrubDryRun(parseScrubArgs(["--mode=apply"])), true, "--mode alone never writes");
  assert.equal(isScrubDryRun(parseScrubArgs(["--apply"])), true, "--apply alone never writes");
  assert.equal(isScrubDryRun(parseScrubArgs(["--mode=apply", "--apply"])), false);
  // the CLI write site is guarded by the decision AND by !dryRun
  assert.ok(cli.includes('if (decision.action === "remove_snapshot" && decision.removeFields.length > 0 && !dryRun)'));
  // and the pure module cannot write at all
  const code = pure.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal(/from\s+["'][^"']*(firebase|firestore)[^"']*["']/i.test(code), false);
  assert.equal(/\.set\(|\.update\(|\.delete\(|\.commit\(|batch\(/.test(code), false);
});

// ── 12-14. The scrub never touches anything else ──────────────────────────

test("12. the sanitizer preserves the repost author OWN text", () => {
  // the only field it may ever remove is the snapshot
  assert.deepEqual([...SCRUB_REMOVABLE_FIELDS], ["originalSnapshot"]);
  const d = decideRepostSnapshotScrub({
    postType: "quote_repost",
    text: "kapsyen saya sendiri",
    originalSnapshot: LEGACY_SNAPSHOT,
  });
  assert.deepEqual(d.removeFields, ["originalSnapshot"]);
  assert.equal(d.removeFields.includes("text"), false);
  // the CLI builds its delete map ONLY from decision.removeFields
  assert.ok(cli.includes("for (const field of decision.removeFields) {"));
  assert.ok(cli.includes("update[field] = admin.firestore.FieldValue.delete();"));
});

test("13. the sanitizer preserves linkage ids", () => {
  for (const field of ["repostOfPostId", "quotedPostId", "originalAuthorId"]) {
    assert.equal((SCRUB_REMOVABLE_FIELDS as readonly string[]).includes(field), false, field);
    assert.equal(cli.includes(`"${field}"`), false, `${field} must never be named as a write target`);
  }
});

test("14. the sanitizer preserves status/visibility/createdAt/counters", () => {
  for (const field of ["status", "visibility", "createdAt", "likeCount", "commentCount", "repostCount", "quoteCount", "authorUid"]) {
    assert.equal((SCRUB_REMOVABLE_FIELDS as readonly string[]).includes(field), false, field);
  }
  // exactly one write call in the whole CLI, and it is an update, not a set
  assert.equal((cli.match(/\.set\(|\.update\(|\.delete\(\)/g) ?? []).length, 2,
    "one ref.update(...) plus one FieldValue.delete() token");
  assert.ok(cli.includes("doc.ref.update(update, {lastUpdateTime: doc.updateTime})"));
  assert.equal(/batch\(/.test(cli), false);
});

// ── 15-16. Idempotent + concurrency-safe ──────────────────────────────────

test("15. the sanitizer is idempotent", () => {
  const scrubbed = {postType: "repost", text: "x"};
  const d = decideRepostSnapshotScrub(scrubbed);
  assert.equal(d.action, "skip");
  assert.equal(d.reason, "already_safe");
  // an empty map is already safe too
  assert.equal(decideRepostSnapshotScrub({postType: "repost", originalSnapshot: {}}).reason, "already_safe");
  assert.equal(decideRepostSnapshotScrub({postType: "repost", originalSnapshot: null}).reason, "already_safe");

  // a full pass over an already-scrubbed collection reports nothing to do
  const counters = emptyScrubCounters();
  for (const [id, doc] of [
    ["r1", {postType: "repost"}],
    ["q1", {postType: "quote_repost", text: "kapsyen"}],
    ["p1", {postType: "food_post", text: "biasa"}],
  ] as Array<[string, Record<string, unknown>]>) {
    accumulateScrub(counters, id, doc.postType, decideRepostSnapshotScrub(doc), false);
  }
  assert.equal(counters.wouldSanitize, 0);
  assert.equal(counters.sanitized, 0);
  assert.equal(counters.alreadySafe, 2);
  assert.equal(counters.reposts, 1);
  assert.equal(counters.quotes, 1);
  assert.equal(scrubIsComplete(counters, true, false), true);
});

test("16. a concurrency precondition prevents clobbering a changed document", () => {
  assert.ok(cli.includes("{lastUpdateTime: doc.updateTime}"),
    "the removal is preconditioned on the exact version that was read");
  assert.ok(cli.includes("recordScrubError(counters, id);"));
  // a failed precondition is an error, never a silent success
  const c = emptyScrubCounters();
  accumulateScrub(c, "r1", "repost", decideRepostSnapshotScrub({postType: "repost", originalSnapshot: LEGACY_SNAPSHOT}), false);
  recordScrubError(c, "r1");
  assert.equal(c.wouldSanitize, 1);
  assert.equal(c.sanitized, 0);
  assert.equal(c.errors, 1);
  assert.deepEqual(c.errorIds, ["r1"]);
  assert.equal(scrubExitCode(c, false), 2);
  assert.equal(scrubIsComplete(c, false, false), false);
});

// ── 17. Unknown shapes are reported, never guessed ────────────────────────

test("17. an unknown snapshot shape is reported and left untouched", () => {
  const weird = decideRepostSnapshotScrub({
    postType: "repost",
    originalSnapshot: {...LEGACY_SNAPSHOT, somethingNew: "?"},
  });
  assert.equal(weird.action, "skip");
  assert.equal(weird.reason, "unknown_shape");
  assert.deepEqual(weird.removeFields, []);
  assert.deepEqual(weird.unexpectedKeys, ["somethingNew"]);
  // non-object shapes too
  for (const bad of ["a string", 42, ["a"], true]) {
    const d = decideRepostSnapshotScrub({postType: "repost", originalSnapshot: bad});
    assert.equal(d.reason, "unknown_shape", String(bad));
    assert.deepEqual(d.removeFields, []);
  }
  // and it blocks completeness / trips the exit code
  const c = emptyScrubCounters();
  accumulateScrub(c, "r9", "repost", weird, false);
  assert.equal(c.unknownShape, 1);
  assert.deepEqual(c.unknownShapeIds, ["r9"]);
  assert.equal(scrubExitCode(c, false), 2);
  assert.equal(scrubIsComplete(c, false, false), false);
});

// ── Safety gates + reporting ──────────────────────────────────────────────

test("18. APPLY requires BOTH the bare --apply and the exact --confirm-project", () => {
  assert.throws(() => assertSafeScrubInvocation(parseScrubArgs([])), /--mode=dry-run or --mode=apply/);
  assert.throws(() => assertSafeScrubInvocation(parseScrubArgs(["--mode=apply"])), /also requires the explicit --apply/);
  assert.throws(() => assertSafeScrubInvocation(parseScrubArgs(["--mode=apply", "--apply"])), /--confirm-project/);
  assert.throws(() => assertSafeScrubInvocation(parseScrubArgs(["--mode=dry-run", "--apply"])), /cannot be combined/);
  for (const bad of ["--apply=false", "--apply=true", "--apply="]) {
    assert.throws(
      () => assertSafeScrubInvocation(parseScrubArgs(["--mode=apply", bad, `--confirm-project=${EXPECTED_PROJECT_ID}`])),
      /--apply takes no value/,
      bad,
    );
  }
  assertSafeScrubInvocation(parseScrubArgs(["--mode=dry-run"]));
  assertSafeScrubInvocation(parseScrubArgs(["--mode=apply", "--apply", `--confirm-project=${EXPECTED_PROJECT_ID}`]));
});

test("19. paging, resume and caps are bounded, and truncation blocks completeness", () => {
  const a = parseScrubArgs(["--mode=dry-run", "--page-size=50", "--max-documents=500", "--start-after=post-9"]);
  assert.equal(a.pageSize, 50);
  assert.equal(a.startAfter, "post-9");
  assertSafeScrubInvocation(a);
  assert.throws(() => assertSafeScrubInvocation({...a, pageSize: DEFAULT_PAGE_SIZE + 1}), /--page-size/);
  assert.throws(() => assertSafeScrubInvocation({...a, maxDocuments: DEFAULT_MAX_DOCUMENTS + 1}), /--max-documents/);
  const clean: ScrubCounters = emptyScrubCounters();
  assert.equal(scrubIsComplete(clean, true, false), true);
  assert.equal(scrubIsComplete(clean, true, true), false, "a truncated scan is never complete");
  assert.equal(scrubExitCode(clean, true), 2);
  assert.ok(cli.includes("truncated = !probe.empty;"));
  assert.ok(cli.includes("startAfter(cursor)"));
});

test("20. the report exposes every required count", () => {
  const c = emptyScrubCounters();
  accumulateScrub(c, "r1", "repost", decideRepostSnapshotScrub({postType: "repost", originalSnapshot: LEGACY_SNAPSHOT}), true);
  accumulateScrub(c, "q1", "quote_repost", decideRepostSnapshotScrub({postType: "quote_repost"}), false);
  const report = renderScrubReport(c, false, "post-9", false);
  for (const key of [
    "scanned", "reposts", "quotes", "alreadySafe", "wouldSanitize",
    "sanitized", "unknownShape", "errors", "resumeCursor",
  ]) {
    assert.ok(report.includes(`| ${key} |`), key);
  }
  assert.equal(c.sanitized, 1);
  assert.equal(c.reposts, 1);
  assert.equal(c.quotes, 1);
  assert.ok(renderScrubReport(c, true, null, true).includes("TAIL NOT SEEN"));
  // the sanitizer is not part of the deployed function surface
  assert.equal(read("src/index.ts").includes("repostSnapshotSanitizer"), false);
});

test("21. the sensitive-key vocabulary matches what the old builder copied", () => {
  for (const key of ["text", "imageUrl", "menuName", "totalSpend", "userRating", "placeName"]) {
    assert.ok((SENSITIVE_SNAPSHOT_KEYS as readonly string[]).includes(key), key);
  }
  assert.equal(snapshotHasSensitiveContent({authorUid: "u"}), false, "identity alone is not content");
  assert.equal(snapshotHasSensitiveContent({text: ""}), false, "an empty string is not content");
  assert.equal(snapshotHasSensitiveContent({text: "x"}), true);
  assert.equal(snapshotHasSensitiveContent(null), false);
});
