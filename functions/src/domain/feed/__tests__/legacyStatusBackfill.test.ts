import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  BACKFILL_WRITABLE_FIELDS,
  DEFAULT_MAX_DOCUMENTS,
  DEFAULT_PAGE_SIZE,
  EXPECTED_PROJECT_ID,
  accumulateBackfill,
  assertSafeBackfillInvocation,
  backfillBanner,
  backfillExitCode,
  backfillIsComplete,
  decideLegacyStatusBackfill,
  emptyBackfillCounters,
  isDryRun,
  parseBackfillArgs,
  recordBackfillError,
  renderBackfillReport,
} from "../legacyStatusBackfill";

/**
 * Wave 3C read-boundary closure — section C (legacy compatibility).
 * The mechanism is proven here; it is NOT executed anywhere in this closure.
 */

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const cli = read("scripts/feedPostStatusBackfill.ts");
const pure = read("src/domain/feed/legacyStatusBackfill.ts");

/** Run a whole simulated collection through the decision + counters. */
function run(
  docs: ReadonlyArray<[string, Record<string, unknown>]>,
  {apply}: {apply: boolean},
) {
  const counters = emptyBackfillCounters();
  for (const [id, data] of docs) {
    const decision = decideLegacyStatusBackfill(data);
    const applied = apply && decision.action === "set_active";
    accumulateBackfill(counters, id, decision, applied);
  }
  return counters;
}

const COLLECTION: ReadonlyArray<[string, Record<string, unknown>]> = [
  ["legacy-1", {text: "lama"}], // missing
  ["legacy-2", {text: "lama", status: ""}], // missing (empty)
  ["active-1", {status: "active"}],
  ["hidden-1", {status: "hidden", moderationReason: "policy"}],
  ["deleted-1", {status: "deleted", deletedAt: 1}],
  ["deleted-2", {status: "deleted", moderationRemovedAt: 1}],
  ["weird-1", {status: "quarantined"}],
];

// ── Decision correctness ──────────────────────────────────────────────────

test("1. ONLY a missing status is normalized, and only to 'active'", () => {
  const d = decideLegacyStatusBackfill({text: "lama"});
  assert.equal(d.action, "set_active");
  assert.equal(d.reason, "missing");
  assert.deepEqual(d.update, {status: "active"});
  // the payload touches exactly one field
  assert.deepEqual(Object.keys(d.update!), [...BACKFILL_WRITABLE_FIELDS]);
});

test("2. active/hidden/deleted are NEVER touched (no resurrection, no unhide)", () => {
  for (const status of ["active", "hidden", "deleted"]) {
    const d = decideLegacyStatusBackfill({status});
    assert.equal(d.action, "skip", status);
    assert.equal(d.update, null, status);
  }
});

test("3. an UNKNOWN non-empty status is never converted to active", () => {
  for (const status of ["quarantined", "shadow", "ACTIVE", "Deleted", 42, {}]) {
    const d = decideLegacyStatusBackfill({status});
    assert.equal(d.action, "skip", String(status));
    assert.equal(d.reason, "unknown", String(status));
    assert.equal(d.update, null, String(status));
  }
});

test("4. a missing document is treated as missing-status, not as an error", () => {
  assert.equal(decideLegacyStatusBackfill(null).action, "set_active");
  assert.equal(decideLegacyStatusBackfill(undefined).reason, "missing");
});

// ── Counters ──────────────────────────────────────────────────────────────

test("5. DRY RUN reports wouldUpdate but never updated", () => {
  const c = run(COLLECTION, {apply: false});
  assert.equal(c.scanned, 7);
  assert.equal(c.missingStatus, 2);
  assert.equal(c.wouldUpdate, 2);
  assert.equal(c.updated, 0);
  assert.equal(c.alreadyActive, 1);
  assert.equal(c.hidden, 1);
  assert.equal(c.deleted, 2);
  assert.equal(c.unknownStatus, 1);
  assert.equal(c.errors, 0);
  assert.deepEqual(c.unknownStatusIds, ["weird-1"]);
});

test("6. APPLY reports updated == missingStatus", () => {
  const c = run(COLLECTION, {apply: true});
  assert.equal(c.wouldUpdate, 2);
  assert.equal(c.updated, 2);
  assert.equal(c.missingStatus, 2);
  assert.equal(backfillExitCode(c, false), 2, "unknown status must still block");
});

test("7. IDEMPOTENT — re-running over the applied collection changes nothing", () => {
  const applied: Array<[string, Record<string, unknown>]> = COLLECTION.map(([id, d]) =>
    decideLegacyStatusBackfill(d).action === "set_active" ?
      [id, {...d, status: "active"}] :
      [id, d],
  );
  const second = run(applied, {apply: true});
  assert.equal(second.missingStatus, 0);
  assert.equal(second.wouldUpdate, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.alreadyActive, 3, "the two normalized docs join the active bucket");
  assert.equal(second.hidden, 1);
  assert.equal(second.deleted, 2);
});

test("8. exit code + Phase 5 completeness gate", () => {
  const clean = run(
    [["a", {}], ["b", {status: "active"}], ["c", {status: "hidden"}]],
    {apply: true},
  );
  assert.equal(clean.unknownStatus, 0);
  assert.equal(backfillExitCode(clean, false), 0);
  assert.equal(backfillIsComplete(clean, false, false), true);
  // a DRY RUN is the runbook's Phase 5 gate, so it MUST be able to pass:
  // nothing left to normalize == complete.
  const verified = run([["b", {status: "active"}], ["c", {status: "hidden"}]], {apply: false});
  assert.equal(verified.missingStatus, 0);
  assert.equal(backfillIsComplete(verified, true, false), true);
  // ...but a dry run that still finds work to do is NOT complete
  assert.equal(backfillIsComplete(run([["a", {}]], {apply: false}), true, false), false);
  // an unknown status blocks completeness
  const dirty = run([["a", {}], ["w", {status: "weird"}]], {apply: true});
  assert.equal(backfillIsComplete(dirty, false, false), false);
  assert.equal(backfillExitCode(dirty, false), 2);
});

test("9. write errors are counted and block completeness", () => {
  const c = run([["a", {}]], {apply: true});
  recordBackfillError(c, "a");
  assert.equal(c.errors, 1);
  assert.deepEqual(c.errorIds, ["a"]);
  assert.equal(backfillExitCode(c, false), 2);
  assert.equal(backfillIsComplete(c, false, false), false);
});

test("9b. TRUNCATION blocks completeness even when every counter is clean", () => {
  // The cap refuses --max-documents > 20000, so a larger collection MUST be
  // chunked. A truncated run has not seen the tail; clean counters describe
  // only the head and prove nothing about the rest.
  const head = run([["a", {status: "active"}], ["b", {status: "active"}]], {apply: true});
  assert.equal(head.missingStatus, 0);
  assert.equal(head.unknownStatus, 0);
  assert.equal(head.errors, 0);
  // untruncated -> complete
  assert.equal(backfillIsComplete(head, false, false), true);
  assert.equal(backfillExitCode(head, false), 0);
  // truncated -> NOT complete, and the exit code says so
  assert.equal(backfillIsComplete(head, false, true), false);
  assert.equal(backfillExitCode(head, true), 2);
  // and the same for the dry-run verification pass
  assert.equal(backfillIsComplete(head, true, true), false);
  // the report shouts about it
  const report = renderBackfillReport(head, false, "post-9", true);
  assert.ok(report.includes("YES — TAIL NOT SEEN"));
  assert.ok(report.includes("DO NOT deploy the Phase 7 rules yet"));
  assert.ok(report.includes("| Phase 5 complete | NO |"));
  assert.equal(renderBackfillReport(head, false, null, false).includes("TAIL NOT SEEN"), false);
});

// ── Safety gates ──────────────────────────────────────────────────────────

test("10. DRY RUN IS THE DEFAULT", () => {
  assert.equal(parseBackfillArgs([]).apply, false);
  assert.equal(isDryRun(parseBackfillArgs(["--mode=dry-run"])), true);
  assert.equal(isDryRun(parseBackfillArgs(["--mode=apply"])), true, "--mode alone never writes");
  assert.equal(isDryRun(parseBackfillArgs(["--apply"])), true, "--apply alone never writes");
  assert.equal(isDryRun(parseBackfillArgs(["--mode=apply", "--apply"])), false);
});

test("10b. --apply is EXACT-TOKEN only; a valued form is refused, never believed", () => {
  // `--apply=false` must not read as "apply". Matches the exact-token
  // convention in functions/scripts/placeProductionMigration.ts.
  for (const bad of ["--apply=false", "--apply=0", "--apply=true", "--apply="]) {
    const a = parseBackfillArgs(["--mode=apply", bad, `--confirm-project=${EXPECTED_PROJECT_ID}`]);
    assert.equal(a.apply, false, bad);
    assert.equal(a.malformedApply, true, bad);
    assert.throws(() => assertSafeBackfillInvocation(a), /--apply takes no value/, bad);
  }
  // the bare flag still works
  const ok = parseBackfillArgs(["--mode=apply", "--apply", `--confirm-project=${EXPECTED_PROJECT_ID}`]);
  assert.equal(ok.apply, true);
  assert.equal(ok.malformedApply, false);
  assertSafeBackfillInvocation(ok);
});

test("11. APPLY requires BOTH --apply and the exact --confirm-project", () => {
  assert.throws(() => assertSafeBackfillInvocation(parseBackfillArgs([])), /--mode=dry-run or --mode=apply/);
  assert.throws(
    () => assertSafeBackfillInvocation(parseBackfillArgs(["--mode=apply"])),
    /also requires the explicit --apply/,
  );
  assert.throws(
    () => assertSafeBackfillInvocation(parseBackfillArgs(["--mode=apply", "--apply"])),
    /--confirm-project=makanmana-c59f3 is required/,
  );
  assert.throws(
    () => assertSafeBackfillInvocation(parseBackfillArgs(["--mode=apply", "--apply", "--confirm-project=wrong"])),
    /--confirm-project/,
  );
  // the safe forms
  assertSafeBackfillInvocation(parseBackfillArgs(["--mode=dry-run"]));
  assertSafeBackfillInvocation(
    parseBackfillArgs(["--mode=apply", "--apply", `--confirm-project=${EXPECTED_PROJECT_ID}`]),
  );
});

test("12. contradictory flags are refused rather than silently resolved", () => {
  assert.throws(
    () => assertSafeBackfillInvocation(parseBackfillArgs(["--mode=dry-run", "--apply"])),
    /cannot be combined/,
  );
});

test("13. paging + resume + caps are bounded", () => {
  const a = parseBackfillArgs(["--mode=dry-run", "--page-size=100", "--max-documents=500", "--start-after=post-9"]);
  assert.equal(a.pageSize, 100);
  assert.equal(a.maxDocuments, 500);
  assert.equal(a.startAfter, "post-9");
  assertSafeBackfillInvocation(a);
  assert.throws(() => assertSafeBackfillInvocation({...a, pageSize: DEFAULT_PAGE_SIZE + 1}), /--page-size/);
  assert.throws(() => assertSafeBackfillInvocation({...a, maxDocuments: DEFAULT_MAX_DOCUMENTS + 1}), /--max-documents/);
  assert.throws(() => assertSafeBackfillInvocation({...a, pageSize: 0}), /--page-size/);
});

test("14. the pure module is MECHANICALLY unable to write Firestore", () => {
  // No SDK is reachable from it: no import/require of admin, functions or any
  // Firestore client. (Prose in the docblock may name them; code may not.)
  const code = pure
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.equal(/from\s+["'][^"']*(firebase|firestore)[^"']*["']/i.test(code), false);
  assert.equal(/require\s*\(/.test(code), false);
  // and it contains no write-call syntax at all
  assert.equal(/\.set\(|\.update\(|\.commit\(|\.delete\(|\.add\(|batch\(/.test(code), false);
});

test("15. the CLI writes ONLY status, preconditioned, and only when applying", () => {
  assert.ok(cli.includes("assertSafeBackfillInvocation(args);"));
  assert.ok(cli.includes("const dryRun = isDryRun(args);"));
  // the single write site is guarded by the decision AND by !dryRun
  assert.ok(cli.includes('if (decision.action === "set_active" && decision.update && !dryRun)'));
  // PRECONDITIONED on the exact version read, so a moderation landing between
  // read and write can never be clobbered back to "active"
  assert.ok(cli.includes("doc.ref.update(decision.update, {lastUpdateTime: doc.updateTime})"));
  // exactly one write call in the whole CLI, and it is not an unconditional batch
  assert.equal((cli.match(/\.set\(|\.update\(|\.delete\(/g) ?? []).length, 1);
  assert.equal(/batch\(/.test(cli), false, "no unconditional batch write");
  // truncation is PROVEN by a probe, never inferred from the cursor
  assert.ok(cli.includes("truncated = !probe.empty;"));
  assert.ok(cli.includes("backfillExitCode(counters, truncated)"));
  // it never deletes, never touches other collections, and pages by document id
  assert.equal(/\.delete\(/.test(cli), false);
  // two reads of the collection: the paged scan and the read-only truncation
  // probe. Both are .get(); neither is a write.
  assert.equal((cli.match(/collection\(C_POSTS\)/g) ?? []).length, 2);
  assert.ok(cli.includes("orderBy(admin.firestore.FieldPath.documentId())"));
  assert.ok(cli.includes("startAfter(cursor)"));
  // it is not wired into the deployed function surface
  assert.equal(read("src/index.ts").includes("feedPostStatusBackfill"), false);
});

test("16. the report exposes every required counter", () => {
  const c = run(COLLECTION, {apply: false});
  const report = renderBackfillReport(c, true, "post-9", false);
  for (const key of [
    "scanned", "missingStatus", "wouldUpdate", "updated", "alreadyActive",
    "hidden", "deleted", "unknownStatus", "errors",
  ]) {
    assert.ok(report.includes(`| ${key} |`), key);
  }
  assert.ok(report.includes("ZERO-WRITE DRY RUN"));
  assert.ok(report.includes("post-9"), "resume cursor is reported");
  assert.ok(backfillBanner(EXPECTED_PROJECT_ID, true).includes("NO DATA WILL BE MODIFIED"));
  assert.ok(backfillBanner(EXPECTED_PROJECT_ID, false).includes("status ONLY"));
});
