/**
 * Wave 3C final security closure — PURE legacy repost `originalSnapshot` scrub.
 *
 * Reposts created before this closure embedded a COPY of the original post
 * (text, first image, place/menu/spend/rating, author presentation) inside the
 * repost document. The repost is itself `status: "active"` and public, and
 * firestore.rules only evaluates a document OWN lifecycle — it never
 * dereferences `repostOfPostId` / `quotedPostId`. So a moderator-hidden,
 * moderator-removed or self-deleted original still leaked through every repost
 * of it. The writer no longer creates such copies; this module decides what to
 * do with the ones already in production.
 *
 * SAFETY MODEL — like legacyStatusBackfill.ts this module deliberately imports
 * no firebase-admin and no Firestore repository, so it is MECHANICALLY
 * INCAPABLE of writing. `functions/scripts/repostSnapshotSanitizer.ts` performs
 * the IO and asks this module what to do with each document.
 *
 * IT NEVER TOUCHES: authorUid, the reposter own `text`, `status`, `visibility`,
 * `createdAt`, `repostOfPostId`, `quotedPostId`, or any counter. The ONLY field
 * it can ever remove is `originalSnapshot`.
 *
 * NOT EXECUTED in this closure.
 */

/** Project the scrub is allowed to target (no silent project fallback). */
export const EXPECTED_PROJECT_ID = "makanmana-c59f3";

/** Page size for the id-ordered scan. Matches the status backfill. */
export const DEFAULT_PAGE_SIZE = 300;

/** Hard cap on documents inspected in one run (resume with --start-after). */
export const DEFAULT_MAX_DOCUMENTS = 20000;

/** The ONLY field this scrub may ever remove. Nothing is ever added or edited. */
export const SCRUB_REMOVABLE_FIELDS = ["originalSnapshot"] as const;

/** Post types that carry a legacy original snapshot. */
export const REPOST_POST_TYPES = ["repost", "quote_repost"] as const;
export type RepostPostType = (typeof REPOST_POST_TYPES)[number];

/**
 * Content the legacy snapshot copied from the ORIGINAL author. Any of these
 * present means the document reproduces content that a later hide/delete of the
 * original is supposed to suppress.
 */
export const SENSITIVE_SNAPSHOT_KEYS = [
  "text",
  "imageUrl",
  "imageUrls",
  "mediaCount",
  "placeName",
  "menuName",
  "totalSpend",
  "userRating",
  "emoji",
] as const;

/**
 * Original-author identity/presentation the legacy snapshot also copied. Not
 * content the author wrote, but still redundant: the embed card now resolves
 * the live original, so keeping these only preserves the fact that a hidden
 * post existed and who wrote it. They are removed together with the rest.
 */
export const IDENTITY_SNAPSHOT_KEYS = [
  "authorUid",
  "displayName",
  "username",
  "photoUrl",
  "avatarPreset",
  "postType",
  "type",
] as const;

/** Every key the known legacy builder could emit. */
export const KNOWN_SNAPSHOT_KEYS: readonly string[] = [
  ...SENSITIVE_SNAPSHOT_KEYS,
  ...IDENTITY_SNAPSHOT_KEYS,
];

export function isRepostPostType(value: unknown): value is RepostPostType {
  return typeof value === "string" && (REPOST_POST_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Per-document decision
// ---------------------------------------------------------------------------

export type ScrubAction = "remove_snapshot" | "skip";

export type ScrubReason =
  | "not_a_repost"
  | "already_safe"
  | "unsafe_snapshot"
  | "unknown_shape";

export interface ScrubDecision {
  action: ScrubAction;
  reason: ScrubReason;
  /** Which fields the caller may delete. Empty whenever action is "skip". */
  removeFields: readonly string[];
  /** Snapshot keys that were not produced by the known legacy builder. */
  unexpectedKeys: readonly string[];
}

function skip(reason: ScrubReason, unexpectedKeys: readonly string[] = []): ScrubDecision {
  return {action: "skip", reason, removeFields: [], unexpectedKeys};
}

/**
 * Decide what to do with ONE stored feed post.
 *
 * Fail-closed by construction: every branch except a RECOGNISED unsafe snapshot
 * returns a skip with an empty `removeFields`, so a caller that ignores
 * `action` and blindly deletes `decision.removeFields` still cannot damage a
 * document. An unrecognised snapshot shape is reported, never guessed at.
 */
export function decideRepostSnapshotScrub(
  stored: Record<string, unknown> | null | undefined,
): ScrubDecision {
  if (!stored) return skip("not_a_repost");
  if (!isRepostPostType(stored.postType)) return skip("not_a_repost");

  const snapshot = stored.originalSnapshot;
  if (snapshot === undefined || snapshot === null) return skip("already_safe");

  // A non-plain-object snapshot is a shape we did not write. Report it.
  if (typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return skip("unknown_shape");
  }

  const keys = Object.keys(snapshot as Record<string, unknown>);
  if (keys.length === 0) return skip("already_safe");

  const unexpected = keys.filter((k) => !KNOWN_SNAPSHOT_KEYS.includes(k));
  if (unexpected.length > 0) return skip("unknown_shape", unexpected);

  // Recognised legacy shape: remove the whole map. Every remaining key is
  // either copied original content or original-author presentation that the
  // embed card now reads live, so removing the field is a strict superset of
  // "remove the sensitive fields" and leaves nothing behind to leak.
  return {
    action: "remove_snapshot",
    reason: "unsafe_snapshot",
    removeFields: [...SCRUB_REMOVABLE_FIELDS],
    unexpectedKeys: [],
  };
}

/** Does this stored snapshot reproduce original-author CONTENT? */
export function snapshotHasSensitiveContent(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  const record = snapshot as Record<string, unknown>;
  return (SENSITIVE_SNAPSHOT_KEYS as readonly string[]).some((key) => {
    const value = record[key];
    return value !== undefined && value !== null && value !== "";
  });
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

export interface ScrubCounters {
  scanned: number;
  reposts: number;
  quotes: number;
  alreadySafe: number;
  wouldSanitize: number;
  sanitized: number;
  unknownShape: number;
  errors: number;
  /** Ids whose snapshot shape was not recognised — reported, never guessed. */
  unknownShapeIds: string[];
  /** Ids whose write failed (including a concurrency precondition failure). */
  errorIds: string[];
}

export const MAX_REPORTED_IDS = 50;

export function emptyScrubCounters(): ScrubCounters {
  return {
    scanned: 0,
    reposts: 0,
    quotes: 0,
    alreadySafe: 0,
    wouldSanitize: 0,
    sanitized: 0,
    unknownShape: 0,
    errors: 0,
    unknownShapeIds: [],
    errorIds: [],
  };
}

/**
 * Fold one decided document into the counters.
 *
 * `applied` is true only when the caller actually committed the removal, so
 * `wouldSanitize` (intent) and `sanitized` (real writes) never conflate.
 */
export function accumulateScrub(
  counters: ScrubCounters,
  docId: string,
  postType: unknown,
  decision: ScrubDecision,
  applied: boolean,
): ScrubCounters {
  counters.scanned += 1;
  if (postType === "repost") counters.reposts += 1;
  else if (postType === "quote_repost") counters.quotes += 1;

  switch (decision.reason) {
    case "already_safe":
      counters.alreadySafe += 1;
      break;
    case "unsafe_snapshot":
      counters.wouldSanitize += 1;
      if (applied) counters.sanitized += 1;
      break;
    case "unknown_shape":
      counters.unknownShape += 1;
      if (counters.unknownShapeIds.length < MAX_REPORTED_IDS) {
        counters.unknownShapeIds.push(docId);
      }
      break;
    case "not_a_repost":
      break;
  }
  return counters;
}

export function recordScrubError(counters: ScrubCounters, docId: string): ScrubCounters {
  counters.errors += 1;
  if (counters.errorIds.length < MAX_REPORTED_IDS) counters.errorIds.push(docId);
  return counters;
}

/**
 * 0 = clean. 2 = a human must look: an unrecognised snapshot may still hold
 * copied content, a write error means the scrub is incomplete, and a truncated
 * scan has not seen the tail of the collection at all.
 */
export function scrubExitCode(counters: ScrubCounters, truncated: boolean): number {
  if (truncated) return 2;
  return counters.unknownShape > 0 || counters.errors > 0 ? 2 : 0;
}

/**
 * Gate for "no sensitive original content remains in repost snapshots".
 *   dry run — nothing left to do:        wouldSanitize == 0
 *   apply   — everything found was done: sanitized == wouldSanitize
 * Both additionally require a complete scan and no unrecognised shapes.
 */
export function scrubIsComplete(
  counters: ScrubCounters,
  dryRun: boolean,
  truncated: boolean,
): boolean {
  if (truncated) return false;
  if (counters.errors !== 0 || counters.unknownShape !== 0) return false;
  return dryRun ?
    counters.wouldSanitize === 0 :
    counters.sanitized === counters.wouldSanitize;
}

// ---------------------------------------------------------------------------
// CLI argument parsing + safety guard (pure; no IO)
// ---------------------------------------------------------------------------

export interface ScrubArgs {
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

export function parseScrubArgs(argv: readonly string[]): ScrubArgs {
  const args: ScrubArgs = {
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
export function isScrubDryRun(args: ScrubArgs): boolean {
  return !args.apply || args.mode !== "apply";
}

export function assertSafeScrubInvocation(
  args: ScrubArgs,
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

export function scrubBanner(projectId: string, dryRun: boolean): string {
  return [
    "============================================================",
    dryRun ?
      "  REPOST SNAPSHOT SCRUB — DRY RUN (ZERO-WRITE)" :
      "  REPOST SNAPSHOT SCRUB — APPLY (REMOVES originalSnapshot ONLY)",
    `  PROJECT: ${projectId}`,
    dryRun ?
      "  NO DATA WILL BE MODIFIED" :
      "  Only the legacy originalSnapshot field is deleted; nothing else changes",
    "============================================================",
  ].join("\n");
}

export function renderScrubReport(
  counters: ScrubCounters,
  dryRun: boolean,
  resumeCursor: string | null,
  truncated: boolean,
): string {
  const rows: [string, string | number][] = [
    ["Mode", dryRun ? "DRY RUN (zero-write)" : "APPLY"],
    ["Scan truncated by --max-documents", truncated ? "YES — TAIL NOT SEEN" : "no"],
    ["scanned", counters.scanned],
    ["reposts", counters.reposts],
    ["quotes", counters.quotes],
    ["alreadySafe", counters.alreadySafe],
    ["wouldSanitize", counters.wouldSanitize],
    ["sanitized", counters.sanitized],
    ["unknownShape", counters.unknownShape],
    ["errors", counters.errors],
    ["resumeCursor", resumeCursor ?? "(collection fully scanned)"],
    ["Unknown-shape ids", counters.unknownShapeIds.length ? counters.unknownShapeIds.join(", ") : "none"],
    ["Error ids", counters.errorIds.length ? counters.errorIds.join(", ") : "none"],
    ["Scrub complete", scrubIsComplete(counters, dryRun, truncated) ? "YES" : "NO"],
    ["Exit code", scrubExitCode(counters, truncated)],
  ];
  return [
    "# MakanMana — legacy repost originalSnapshot scrub",
    "",
    dryRun ?
      "> ZERO-WRITE DRY RUN. No document was modified." :
      "> APPLY RUN. Only the legacy `originalSnapshot` field was deleted.",
    truncated ?
      "\n> **INCOMPLETE — the scan stopped at --max-documents and the tail of the\n" +
      "> collection was never inspected. Re-run with --start-after=<resumeCursor>\n" +
      "> until this line disappears.**" :
      "",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
  ].join("\n");
}
