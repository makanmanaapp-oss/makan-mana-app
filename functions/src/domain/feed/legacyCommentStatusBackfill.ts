/**
 * Wave 3D entry gate 1 — PURE legacy post-comment `status` normalization.
 *
 * Legacy comments were created before the lifecycle contract existed and carry
 * no `status` field. Once `commentsProvider` filters on `status == "active"`
 * and the rules require it for non-author reads, those comments would vanish
 * (fail-closed, but a total thread blackout). This module is the decision half
 * of the one-time normalization that prevents it.
 *
 * SAFETY MODEL — like legacyStatusBackfill.ts and repostSnapshotSanitizer.ts,
 * this module deliberately imports no firebase-admin and no Firestore
 * repository. It is MECHANICALLY INCAPABLE of writing. The thin CLI in
 * `functions/scripts/feedPostCommentStatusBackfill.ts` performs the IO and asks
 * this module what to do with each document.
 *
 * RULES:
 *   - ONLY a comment whose `status` FIELD IS ABSENT is ever changed, and only
 *     to "active". This is TRUE-MISSING: a field that is PRESENT and holds
 *     null, "", "   ", " active ", "ACTIVE", "hidden", 0, false, {} or [] is
 *     NOT missing — it is UNKNOWN and is never written. A present malformed
 *     value may represent corruption, an abandoned lifecycle, or an unexpected
 *     writer, and the migration must never guess that it means active.
 *   - `active` and `deleted` are left completely untouched, so the backfill can
 *     never resurrect a comment its author deleted.
 *   - Every UNKNOWN is counted and listed so a human decides.
 *   - Nothing else is written: not authorUid, text, parentCommentId, postId,
 *     parentVisibility, createdAt, updatedAt, nor any identity snapshot field.
 *   - DRY RUN IS THE DEFAULT.
 *
 * NOT EXECUTED in this closure.
 */
import {
  LegacyCommentStatusClass,
  NEW_COMMENT_STATUS,
  classifyStoredCommentStatus,
} from "./commentLifecycle";

/** Project the backfill is allowed to target (no silent project fallback). */
export const EXPECTED_PROJECT_ID = "makanmana-c59f3";

/** Page size for the id-ordered scan. Matches the post backfill. */
export const DEFAULT_PAGE_SIZE = 300;

/** Hard cap on documents inspected in one run (resume with --start-after). */
export const DEFAULT_MAX_DOCUMENTS = 20000;

/** The ONLY field this backfill may ever write. */
export const BACKFILL_WRITABLE_FIELDS = ["status"] as const;

/**
 * The only collection-group path this backfill may touch. A
 * `collectionGroup("comments")` scan is used for reach, so every candidate is
 * re-checked against this shape before anything is written — a subcollection
 * named `comments` under any OTHER parent is skipped, and the top-level
 * `menu_comments` collection can never match.
 */
export const REQUIRED_PARENT_COLLECTION = "feed_posts";
export const COMMENTS_COLLECTION = "comments";

/**
 * Is this Firestore document path a post comment?
 * Expected shape: feed_posts/{postId}/comments/{commentId}
 */
export function isPostCommentPath(path: unknown): boolean {
  if (typeof path !== "string") return false;
  const parts = path.split("/").filter((p) => p.length > 0);
  if (parts.length !== 4) return false;
  return parts[0] === REQUIRED_PARENT_COLLECTION && parts[2] === COMMENTS_COLLECTION;
}

// ---------------------------------------------------------------------------
// Per-document decision
// ---------------------------------------------------------------------------

export type CommentBackfillAction = "set_active" | "skip";

export type CommentBackfillReason = LegacyCommentStatusClass | "not_a_post_comment";

export interface CommentBackfillDecision {
  action: CommentBackfillAction;
  reason: CommentBackfillReason;
  /** The exact merge payload to write. `null` whenever action is "skip". */
  update: {status: string} | null;
}

/**
 * Decide what to do with ONE stored comment.
 *
 * Fail-closed by construction: every branch except a MISSING status on a real
 * post-comment path returns a skip with a null payload, so a caller that
 * ignores `action` and blindly writes `decision.update` still cannot damage a
 * deleted or unrecognised comment.
 */
export function decideLegacyCommentStatusBackfill(
  path: unknown,
  stored: Record<string, unknown> | null | undefined,
): CommentBackfillDecision {
  if (!isPostCommentPath(path)) {
    return {action: "skip", reason: "not_a_post_comment", update: null};
  }
  // TRUE-MISSING ONLY: the classifier inspects the DOCUMENT, so an absent
  // `status` field is distinguishable from a field that is present and holds
  // null / "" / "   " / a padded or unrecognised value. Only the absent case
  // is ever normalized.
  const reason = classifyStoredCommentStatus(stored);
  if (reason === "missing") {
    return {action: "set_active", reason, update: {status: NEW_COMMENT_STATUS}};
  }
  return {action: "skip", reason, update: null};
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

export interface CommentBackfillCounters {
  scanned: number;
  missingStatus: number;
  wouldUpdate: number;
  updated: number;
  alreadyActive: number;
  deleted: number;
  unknownStatus: number;
  errors: number;
  /** Paths carrying an unknown status — reported, never converted. */
  unknownStatusIds: string[];
  /** Paths whose write failed, for a targeted re-run. */
  errorIds: string[];
  /** Documents skipped because they were not on a post-comment path. */
  skippedForeignPath: number;
}

/** Ids listed in the report before truncation. */
export const MAX_REPORTED_IDS = 50;

export function emptyCommentBackfillCounters(): CommentBackfillCounters {
  return {
    scanned: 0,
    missingStatus: 0,
    wouldUpdate: 0,
    updated: 0,
    alreadyActive: 0,
    deleted: 0,
    unknownStatus: 0,
    errors: 0,
    unknownStatusIds: [],
    errorIds: [],
    skippedForeignPath: 0,
  };
}

/**
 * Fold one decided document into the counters.
 *
 * `applied` is true only when the caller actually committed the write, so
 * `wouldUpdate` (intent) and `updated` (real writes) never conflate.
 */
export function accumulateCommentBackfill(
  counters: CommentBackfillCounters,
  docPath: string,
  decision: CommentBackfillDecision,
  applied: boolean,
): CommentBackfillCounters {
  counters.scanned += 1;
  switch (decision.reason) {
    case "missing":
      counters.missingStatus += 1;
      counters.wouldUpdate += 1;
      if (applied) counters.updated += 1;
      break;
    case "active":
      counters.alreadyActive += 1;
      break;
    case "deleted":
      counters.deleted += 1;
      break;
    case "unknown":
      counters.unknownStatus += 1;
      if (counters.unknownStatusIds.length < MAX_REPORTED_IDS) {
        counters.unknownStatusIds.push(docPath);
      }
      break;
    case "not_a_post_comment":
      counters.skippedForeignPath += 1;
      break;
  }
  return counters;
}

export function recordCommentBackfillError(
  counters: CommentBackfillCounters,
  docPath: string,
): CommentBackfillCounters {
  counters.errors += 1;
  if (counters.errorIds.length < MAX_REPORTED_IDS) counters.errorIds.push(docPath);
  return counters;
}

/**
 * 0 = clean. 2 = a human must look before the rules deploy (Phase C8):
 * an unknown status would be permanently unreadable, a write error means the
 * normalization is incomplete, and a truncated scan never saw the tail.
 */
export function commentBackfillExitCode(
  counters: CommentBackfillCounters,
  truncated: boolean,
): number {
  if (truncated) return 2;
  return counters.unknownStatus > 0 || counters.errors > 0 ? 2 : 0;
}

/**
 * Phase C4/C6 gate: has normalization finished?
 *   dry run — nothing left to do:        missingStatus == 0
 *   apply   — everything found was done: updated == missingStatus
 * Both additionally require a complete scan and no ambiguity.
 */
export function commentBackfillIsComplete(
  counters: CommentBackfillCounters,
  dryRun: boolean,
  truncated: boolean,
): boolean {
  if (truncated) return false;
  if (counters.errors !== 0 || counters.unknownStatus !== 0) return false;
  return dryRun ?
    counters.missingStatus === 0 :
    counters.updated === counters.missingStatus;
}

// ---------------------------------------------------------------------------
// CLI argument parsing + safety guard (pure; no IO)
// ---------------------------------------------------------------------------

export interface CommentBackfillArgs {
  mode?: string;
  confirmProject?: string;
  /** DRY RUN IS THE DEFAULT — writing requires an explicit bare --apply. */
  apply: boolean;
  /** A valued form such as `--apply=false` was passed; always refused. */
  malformedApply: boolean;
  pageSize: number;
  maxDocuments: number;
  startAfter?: string;
  output?: string;
}

export function parseCommentBackfillArgs(argv: readonly string[]): CommentBackfillArgs {
  const args: CommentBackfillArgs = {
    apply: false,
    malformedApply: false,
    pageSize: DEFAULT_PAGE_SIZE,
    maxDocuments: DEFAULT_MAX_DOCUMENTS,
  };
  for (const a of argv) {
    const [k, v] = a.includes("=") ? a.split("=", 2) : [a, ""];
    switch (k) {
      case "--mode": args.mode = v; break;
      case "--confirm-project": args.confirmProject = v; break;
      // EXACT-TOKEN ONLY: `--apply=false` is a typo next to a write flag and is
      // refused rather than interpreted.
      case "--apply":
        if (a === "--apply") args.apply = true;
        else args.malformedApply = true;
        break;
      case "--page-size": args.pageSize = Number(v) || DEFAULT_PAGE_SIZE; break;
      case "--max-documents": args.maxDocuments = Number(v) || DEFAULT_MAX_DOCUMENTS; break;
      case "--start-after": args.startAfter = v || undefined; break;
      case "--output": args.output = v || undefined; break;
    }
  }
  return args;
}

/** True when this invocation must not write anything. */
export function isCommentBackfillDryRun(args: CommentBackfillArgs): boolean {
  return !args.apply || args.mode !== "apply";
}

export function assertSafeCommentBackfillInvocation(
  args: CommentBackfillArgs,
  expectedProject: string = EXPECTED_PROJECT_ID,
): void {
  if (args.malformedApply) {
    throw new Error("refused: --apply takes no value (pass the bare flag --apply)");
  }
  if (args.mode !== "dry-run" && args.mode !== "apply") {
    throw new Error("refused: --mode=dry-run or --mode=apply is required");
  }
  if (args.mode === "dry-run" && args.apply) {
    throw new Error("refused: --apply cannot be combined with --mode=dry-run");
  }
  if (args.mode === "apply") {
    if (!args.apply) {
      throw new Error("refused: --mode=apply also requires the explicit --apply flag");
    }
    if (args.confirmProject !== expectedProject) {
      throw new Error(
        `refused: --confirm-project=${expectedProject} is required; got '${args.confirmProject ?? ""}'`,
      );
    }
  }
  if (args.pageSize < 1 || args.pageSize > DEFAULT_PAGE_SIZE) {
    throw new Error(`refused: --page-size must be between 1 and ${DEFAULT_PAGE_SIZE}`);
  }
  if (args.maxDocuments < 1 || args.maxDocuments > DEFAULT_MAX_DOCUMENTS) {
    throw new Error(`refused: --max-documents must be between 1 and ${DEFAULT_MAX_DOCUMENTS}`);
  }
}

export function commentBackfillBanner(projectId: string, dryRun: boolean): string {
  return [
    "============================================================",
    dryRun ?
      "  COMMENT STATUS BACKFILL — DRY RUN (ZERO-WRITE)" :
      "  COMMENT STATUS BACKFILL — APPLY (WRITES status ONLY)",
    `  PROJECT: ${projectId}`,
    dryRun ?
      "  NO DATA WILL BE MODIFIED" :
      "  ONLY comments with a MISSING status become status='active'",
    "============================================================",
  ].join("\n");
}

export function renderCommentBackfillReport(
  counters: CommentBackfillCounters,
  dryRun: boolean,
  resumeCursor: string | null,
  truncated: boolean,
): string {
  const rows: [string, string | number][] = [
    ["Mode", dryRun ? "DRY RUN (zero-write)" : "APPLY"],
    ["truncated", truncated ? "YES — TAIL NOT SEEN" : "no"],
    ["scanned", counters.scanned],
    ["missingStatus", counters.missingStatus],
    ["wouldUpdate", counters.wouldUpdate],
    ["updated", counters.updated],
    ["alreadyActive", counters.alreadyActive],
    ["deleted", counters.deleted],
    ["unknownStatus", counters.unknownStatus],
    ["errors", counters.errors],
    ["skippedForeignPath", counters.skippedForeignPath],
    ["resumeCursor", resumeCursor ?? "(collection group fully scanned)"],
    ["Unknown ids", counters.unknownStatusIds.length ? counters.unknownStatusIds.join(", ") : "none"],
    ["Error ids", counters.errorIds.length ? counters.errorIds.join(", ") : "none"],
    ["Phase C6 complete", commentBackfillIsComplete(counters, dryRun, truncated) ? "YES" : "NO"],
    ["Exit code", commentBackfillExitCode(counters, truncated)],
  ];
  return [
    "# MakanMana — feed post comment legacy status normalization",
    "",
    dryRun ?
      "> ZERO-WRITE DRY RUN. No document was modified." :
      "> APPLY RUN. Only `status` was written, and only where it was missing.",
    truncated ?
      "\n> **INCOMPLETE — the scan stopped at --max-documents and the tail was\n" +
      "> never inspected. Re-run with --start-after=<resumeCursor> until this\n" +
      "> line disappears. DO NOT deploy the Phase C8 rules yet.**" :
      "",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
  ].join("\n");
}
