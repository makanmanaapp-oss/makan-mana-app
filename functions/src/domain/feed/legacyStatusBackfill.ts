/**
 * Wave 3C read-boundary closure — PURE legacy `feed_posts.status` normalization.
 *
 * Legacy documents were created before the lifecycle contract existed and omit
 * `status` entirely. Once consumer queries filter on `status == "active"` and
 * firestore.rules require it for non-author reads, those documents would vanish
 * (fail-closed, but a total content blackout). This module is the decision half
 * of the one-time normalization that prevents it.
 *
 * SAFETY MODEL — this module deliberately does NOT import firebase-admin or any
 * Firestore repository, exactly like `places/migration/dryRunTool.ts`. It is
 * MECHANICALLY INCAPABLE of writing. The thin CLI in
 * `functions/scripts/feedPostStatusBackfill.ts` performs the IO and asks this
 * module what to do with each document.
 *
 * RULES:
 *   - ONLY a document whose status is MISSING is ever changed, and only to
 *     "active".
 *   - `active` / `hidden` / `deleted` are left completely untouched. The
 *     backfill can therefore never restore removed content or unhide a
 *     moderated post.
 *   - An UNKNOWN non-empty status is NEVER converted. It is counted and listed
 *     separately so a human decides.
 *   - Nothing else is written: no visibility, no author identity, no createdAt.
 *   - DRY RUN IS THE DEFAULT. Writing requires an explicit `--apply` plus the
 *     project confirmation, matching the existing owner-gated CLI convention.
 *
 * NOT EXECUTED in this closure.
 */
import {
  LegacyStatusClass,
  NEW_POST_STATUS,
  classifyLegacyPostStatus,
} from "./postLifecycle";

/** Project the backfill is allowed to target (no silent project fallback). */
export const EXPECTED_PROJECT_ID = "makanmana-c59f3";

/** Page size for the id-ordered scan. Matches hideLegacyAutoPosts. */
export const DEFAULT_PAGE_SIZE = 300;

/** Hard cap on documents inspected in one run (resume with --start-after). */
export const DEFAULT_MAX_DOCUMENTS = 20000;

/** The ONLY field this backfill may ever write. */
export const BACKFILL_WRITABLE_FIELDS = ["status"] as const;

// ---------------------------------------------------------------------------
// Per-document decision
// ---------------------------------------------------------------------------

export type BackfillAction = "set_active" | "skip";

export interface BackfillDecision {
  action: BackfillAction;
  /** Why — also the counter bucket this document lands in. */
  reason: LegacyStatusClass;
  /** The exact merge payload to write. `null` whenever action is "skip". */
  update: {status: string} | null;
}

/**
 * Decide what to do with ONE stored document.
 *
 * Fail-closed by construction: every branch except "missing" returns a skip
 * with a null payload, so a caller that ignores `action` and blindly writes
 * `decision.update` still cannot damage a moderated document.
 */
export function decideLegacyStatusBackfill(
  stored: Record<string, unknown> | null | undefined,
): BackfillDecision {
  const reason = classifyLegacyPostStatus(stored?.status);
  if (reason === "missing") {
    return {action: "set_active", reason, update: {status: NEW_POST_STATUS}};
  }
  return {action: "skip", reason, update: null};
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

export interface BackfillCounters {
  scanned: number;
  missingStatus: number;
  wouldUpdate: number;
  updated: number;
  alreadyActive: number;
  hidden: number;
  deleted: number;
  unknownStatus: number;
  errors: number;
  /** Ids carrying an unknown status — reported, never converted. */
  unknownStatusIds: string[];
  /** Ids that failed to write, for a targeted re-run. */
  errorIds: string[];
}

/** Unknown-status ids listed in the report before truncation. */
export const MAX_REPORTED_UNKNOWN_IDS = 50;

export function emptyBackfillCounters(): BackfillCounters {
  return {
    scanned: 0,
    missingStatus: 0,
    wouldUpdate: 0,
    updated: 0,
    alreadyActive: 0,
    hidden: 0,
    deleted: 0,
    unknownStatus: 0,
    errors: 0,
    unknownStatusIds: [],
    errorIds: [],
  };
}

/**
 * Fold one decided document into the counters.
 *
 * `applied` is true only when the caller actually committed the write, so
 * `wouldUpdate` (dry run intent) and `updated` (real writes) never conflate.
 */
export function accumulateBackfill(
  counters: BackfillCounters,
  docId: string,
  decision: BackfillDecision,
  applied: boolean,
): BackfillCounters {
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
    case "hidden":
      counters.hidden += 1;
      break;
    case "deleted":
      counters.deleted += 1;
      break;
    case "unknown":
      counters.unknownStatus += 1;
      if (counters.unknownStatusIds.length < MAX_REPORTED_UNKNOWN_IDS) {
        counters.unknownStatusIds.push(docId);
      }
      break;
  }
  return counters;
}

/** Record a failed write. The document is still counted as scanned. */
export function recordBackfillError(
  counters: BackfillCounters,
  docId: string,
): BackfillCounters {
  counters.errors += 1;
  if (counters.errorIds.length < MAX_REPORTED_UNKNOWN_IDS) {
    counters.errorIds.push(docId);
  }
  return counters;
}

/**
 * 0 = clean. 2 = a human must look before the rules deploy (Phase 7) proceeds.
 *
 * `truncated` is REQUIRED: a run that stopped at --max-documents has not seen
 * the tail of the collection, so clean counters prove nothing about it. Without
 * this input the gate is truncation-blind — a collection larger than the cap
 * would report success while every document past the cap stays unnormalized and
 * becomes unreadable to non-authors after the Phase 7 rules deploy.
 */
export function backfillExitCode(counters: BackfillCounters, truncated: boolean): number {
  if (truncated) return 2;
  return counters.unknownStatus > 0 || counters.errors > 0 ? 2 : 0;
}

/**
 * The runbook Phase 5 gate: has normalization actually finished?
 *
 * Phase 5 is prescribed as a DRY RUN, so this must be answerable from a dry run.
 * The criteria differ by mode because the two runs prove different things:
 *   dry run — nothing is left to do:      missingStatus == 0
 *   apply   — everything found was done:  updated == missingStatus
 * Both additionally require a complete scan and no ambiguity.
 */
export function backfillIsComplete(
  counters: BackfillCounters,
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

export interface BackfillArgs {
  mode?: string;
  confirmProject?: string;
  /** DRY RUN IS THE DEFAULT — writing requires an explicit bare --apply. */
  apply: boolean;
  /** A valued form such as `--apply=false` was passed; always refused. */
  malformedApply: boolean;
  pageSize: number;
  maxDocuments: number;
  /** Resume cursor: the last document id of the previous run. */
  startAfter?: string;
  output?: string;
}

export function parseBackfillArgs(argv: readonly string[]): BackfillArgs {
  const args: BackfillArgs = {
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
      // EXACT-TOKEN ONLY, matching functions/scripts/placeProductionMigration.ts.
      // `--apply=false` must never be read as "apply": a valued form is a typo,
      // and a typo next to a write flag is refused rather than interpreted.
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
export function isDryRun(args: BackfillArgs): boolean {
  return !args.apply || args.mode !== "apply";
}

/**
 * Throw unless the invocation is safe.
 *
 * A dry run needs only `--mode=dry-run`. An APPLY run additionally needs the
 * explicit `--apply` flag AND `--confirm-project=<project>` — the same
 * double-gate the place-migration CLIs use, so a mistyped command can never
 * write production.
 */
export function assertSafeBackfillInvocation(
  args: BackfillArgs,
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

export function backfillBanner(projectId: string, dryRun: boolean): string {
  return [
    "============================================================",
    dryRun ? "  FEED POST STATUS BACKFILL — DRY RUN (ZERO-WRITE)" : "  FEED POST STATUS BACKFILL — APPLY (WRITES status ONLY)",
    `  PROJECT: ${projectId}`,
    dryRun ?
      "  NO DATA WILL BE MODIFIED" :
      "  ONLY documents with a MISSING status become status='active'",
    "============================================================",
  ].join("\n");
}

export function renderBackfillReport(
  counters: BackfillCounters,
  dryRun: boolean,
  resumeCursor: string | null,
  truncated: boolean,
): string {
  const rows: [string, string | number][] = [
    ["Mode", dryRun ? "DRY RUN (zero-write)" : "APPLY"],
    ["Scan truncated by --max-documents", truncated ? "YES — TAIL NOT SEEN" : "no"],
    ["scanned", counters.scanned],
    ["missingStatus", counters.missingStatus],
    ["wouldUpdate", counters.wouldUpdate],
    ["updated", counters.updated],
    ["alreadyActive", counters.alreadyActive],
    ["hidden", counters.hidden],
    ["deleted", counters.deleted],
    ["unknownStatus", counters.unknownStatus],
    ["errors", counters.errors],
    ["Unknown ids", counters.unknownStatusIds.length ? counters.unknownStatusIds.join(", ") : "none"],
    ["Error ids", counters.errorIds.length ? counters.errorIds.join(", ") : "none"],
    ["Resume cursor", resumeCursor ?? "(collection fully scanned)"],
    ["Phase 5 complete", backfillIsComplete(counters, dryRun, truncated) ? "YES" : "NO"],
    ["Exit code", backfillExitCode(counters, truncated)],
  ];
  return [
    "# MakanMana — feed_posts legacy status normalization",
    "",
    dryRun ?
      "> ZERO-WRITE DRY RUN. No document was modified." :
      "> APPLY RUN. Only `status` was written, and only where it was missing.",
    truncated ?
      "\n> **INCOMPLETE — the scan stopped at --max-documents and the tail of the\n" +
      "> collection was never inspected. Re-run with --start-after=<resume cursor>\n" +
      "> until this line disappears. DO NOT deploy the Phase 7 rules yet.**" :
      "",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
  ].join("\n");
}
