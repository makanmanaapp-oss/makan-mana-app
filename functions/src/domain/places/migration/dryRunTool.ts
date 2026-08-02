/**
 * Phase 1.14A — TERAS alat dry-run migrasi (SIFAR-TULIS, TULEN).
 *
 * Modul ini SENGAJA tidak mengimport:
 *  - firebase-admin / firestore
 *  - mana-mana repositori penulisan (FirestoreMigrationRepository, emulator exec,
 *    penerbitan, pembetulan, penanda)
 * supaya ia MUSTAHIL menulis. Sumber data disuntik (read-only) oleh pemanggil.
 * Menggunakan SEMULA `buildLegacyMigrationPlan` (saluran paip dry-run teruji).
 *
 * Guard runtime + banner + hurai argumen disediakan untuk CLI pemilik. Larian
 * produksi sebenar BERPAGAR-PEMILIK (rujuk docs/MAKANMANA_PART1_CONTROLLED_DEPLOY.md).
 */
import {EpochMillis} from "../common";
import {
  LegacyPlaceInventoryRecord,
} from "./legacyInventory";
import {buildLegacyMigrationPlan} from "./dryRunPlanner";
import {LegacyAliasMapping} from "./migrationAlias";
import {MigrationDecision} from "./migrationTypes";
import {LegacyPlaceMigrationCandidate} from "./migrationCandidate";

export const EXPECTED_PROJECT_ID = "makanmana-c59f3";

/** Koleksi yang SAH untuk dibaca oleh dry-run. Bacaan lain ditolak. */
export const DEFAULT_COLLECTION_ALLOWLIST: readonly string[] = [
  "places_cache",
  "place_details",
  "place_publications",
  "place_publication_heads",
  "place_migration_aliases",
  "place_coverage_memberships",
  "food_coverage_cells",
  "favorites",
  "meals",
  "suggestions",
  "suggestion_sessions",
];

/** Topi keras bilangan dokumen untuk satu larian dry-run. */
export const DEFAULT_MAX_DOCUMENTS = 5000;

/** Sahkan koleksi yang diminta terhadap senarai putih. Melempar jika luar. */
export function assertCollectionsAllowed(
  requested: readonly string[],
  allowlist: readonly string[] = DEFAULT_COLLECTION_ALLOWLIST,
): void {
  const bad = requested.filter((c) => !allowlist.includes(c));
  if (bad.length) throw new Error(`refused: collection(s) not on read-only allowlist: ${bad.join(",")}`);
}

/** Sumber data BACA-SAHAJA. Pelaksana (CLI) hanya boleh guna `.get()`. */
export interface ReadOnlyMigrationSource {
  readInventory(limit?: number): Promise<readonly LegacyPlaceInventoryRecord[]>;
  readExistingAliases(): Promise<readonly LegacyAliasMapping[]>;
}

export interface DryRunOptions {
  batchId: string;
  area?: string;
  limit?: number;
  includeReferenceScan?: boolean;
  redactUserIdentifiers?: boolean;
}

export interface DryRunReport {
  batchId: string;
  area?: string;
  totalLegacyRecords: number;
  totalCandidates: number;
  safeCandidates: number;
  heldCandidates: number;
  conflictCandidates: number;
  blockedCandidates: number;
  alreadyMapped: number;
  branchRiskCandidates: number;
  aliasMappings: number;
  referenceImpactedCandidates: number;
  favoritesImpacted: number;
  mealsImpacted: number;
  historyImpacted: number;
  suggestionsImpacted: number;
  deepLinksImpacted: number;
  estimatedBatches: number;
  /** Sebab larian ini TIDAK selamat untuk diteruskan (kosong = OK). */
  blockers: string[];
  /** 0 = OK; !=0 = ada penyekat / ketidakpastian. */
  exitCode: number;
  note: string;
}

const HELD_DECISIONS: readonly MigrationDecision[] = [
  "review_required",
  "ambiguous",
  "insufficient_identity",
  "skip",
];

type ImpactShape = {
  favorites?: number;
  meals?: number;
  history?: number;
  suggestions?: number;
  deepLinks?: number;
  totalReferences?: number;
};

function impactOf(c: LegacyPlaceMigrationCandidate): ImpactShape {
  return (c.referenceImpact as unknown as ImpactShape) ?? {};
}

/**
 * Jalankan dry-run TULEN atas rekod yang telah dibaca. TIDAK menulis apa-apa.
 * Mengira ringkasan + penyekat keselamatan. Deterministik (masa disuntik).
 */
export function summarizeDryRun(
  records: readonly LegacyPlaceInventoryRecord[],
  candidates: readonly LegacyPlaceMigrationCandidate[],
  options: DryRunOptions,
): DryRunReport {
  const byDecision = (d: MigrationDecision) =>
    candidates.filter((c) => c.migrationDecision === d);

  const safe = byDecision("ready");
  const held = candidates.filter((c) => HELD_DECISIONS.includes(c.migrationDecision));
  const conflict = candidates.filter(
    (c) => c.migrationDecision === "branch_conflict" || c.conflicts.length > 0,
  );
  const blocked = byDecision("blocked");
  const alreadyMapped = byDecision("already_mapped");
  const branchRisk = candidates.filter(
    (c) => c.branchAssessment != null || c.holdReasons.includes("branch_conflict"),
  );

  const sum = (key: keyof ImpactShape) =>
    candidates.reduce((n, c) => n + (impactOf(c)[key] ?? 0), 0);
  const refImpacted = candidates.filter((c) => (impactOf(c).totalReferences ?? 0) > 0).length;

  // --- Penyekat keselamatan (STOP) -----------------------------------------
  const blockers: string[] = [];
  // 1. Pemetaan nama-sahaja TIDAK PERNAH boleh berada dalam set SELAMAT.
  const nameOnlyInSafe = safe.filter((c) => c.holdReasons.includes("name_only_match"));
  if (nameOnlyInSafe.length > 0) {
    blockers.push(`name_only_mapping_in_safe:${nameOnlyInSafe.length}`);
  }
  // 2. Ketaksaan cawangan dalam set selamat.
  const branchInSafe = safe.filter(
    (c) => c.migrationDecision === "branch_conflict" || c.holdReasons.includes("branch_conflict"),
  );
  if (branchInSafe.length > 0) blockers.push(`branch_ambiguity_in_safe:${branchInSafe.length}`);
  // 3. Rujukan kritikal tidak boleh diselesaikan.
  const unresolved = candidates.filter((c) =>
    c.holdReasons.includes("critical_reference_unresolved"),
  );
  if (unresolved.length > 0) blockers.push(`critical_reference_unresolved:${unresolved.length}`);

  const estimatedBatches = Math.max(1, Math.ceil(safe.length / 25));

  return {
    batchId: options.batchId,
    area: options.area,
    totalLegacyRecords: records.length,
    totalCandidates: candidates.length,
    safeCandidates: safe.length,
    heldCandidates: held.length,
    conflictCandidates: conflict.length,
    blockedCandidates: blocked.length,
    alreadyMapped: alreadyMapped.length,
    branchRiskCandidates: branchRisk.length,
    aliasMappings: candidates.reduce(
      (n, c) =>
        n +
        c.proposedAliases.legacyDocumentIds.length +
        c.proposedAliases.googlePlaceIds.length +
        c.proposedAliases.providerPlaceIds.length,
      0,
    ),
    referenceImpactedCandidates: refImpacted,
    favoritesImpacted: sum("favorites"),
    mealsImpacted: sum("meals"),
    historyImpacted: sum("history"),
    suggestionsImpacted: sum("suggestions"),
    deepLinksImpacted: sum("deepLinks"),
    estimatedBatches,
    blockers,
    exitCode: blockers.length ? 2 : 0,
    note: "ZERO-WRITE DRY RUN — no data modified. Values are estimates from read-only inventory.",
  };
}

/** Baca (read-only) + rancang + ringkas. TIDAK menulis. */
export async function runDryRun(
  source: ReadOnlyMigrationSource,
  options: DryRunOptions,
  now: EpochMillis,
): Promise<DryRunReport> {
  const records = await source.readInventory(options.limit);
  const existingAliases = await source.readExistingAliases();
  const {candidates} = buildLegacyMigrationPlan(
    {batchId: options.batchId, records, existingAliases, createdBy: "dry_run_tool"},
    now,
  );
  return summarizeDryRun(records, candidates, options);
}

// ---------------------------------------------------------------------------
// CLI helpers (guard + banner + argumen) — TIADA I/O di sini
// ---------------------------------------------------------------------------

export interface DryRunArgs {
  mode?: string;
  confirmProject?: string;
  readOnly: boolean;
  limit?: number;
  maxDocuments: number;
  collections?: string[];
  area?: string;
  output?: string;
  includeReferenceScan: boolean;
  redactUserIdentifiers: boolean;
}

export function parseDryRunArgs(argv: readonly string[]): DryRunArgs {
  const args: DryRunArgs = {
    readOnly: false,
    maxDocuments: DEFAULT_MAX_DOCUMENTS,
    includeReferenceScan: false,
    redactUserIdentifiers: true,
  };
  for (const a of argv) {
    const [k, v] = a.includes("=") ? a.split("=", 2) : [a, ""];
    switch (k) {
      case "--mode": args.mode = v; break;
      case "--confirm-project": args.confirmProject = v; break;
      case "--read-only": args.readOnly = true; break;
      case "--limit": args.limit = Number(v) || undefined; break;
      case "--max-documents": args.maxDocuments = Number(v) || DEFAULT_MAX_DOCUMENTS; break;
      case "--collections": args.collections = v.split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--area": args.area = v; break;
      case "--output": args.output = v; break;
      case "--include-reference-scan": args.includeReferenceScan = true; break;
      case "--redact-user-identifiers": args.redactUserIdentifiers = true; break;
      case "--no-redact-user-identifiers": args.redactUserIdentifiers = false; break;
    }
  }
  return args;
}

/**
 * Melempar jika pemanggilan tidak selamat. Menguatkuasa mod + read-only + projek
 * (TIADA fallback projek senyap) + senarai putih koleksi + topi dokumen.
 */
export function assertSafeInvocation(args: DryRunArgs, expectedProject = EXPECTED_PROJECT_ID): void {
  if (args.mode !== "dry-run") {
    throw new Error("refused: --mode=dry-run is required (this tool is read-only)");
  }
  if (!args.readOnly) {
    throw new Error("refused: --read-only is required (this tool never writes)");
  }
  if (args.confirmProject !== expectedProject) {
    throw new Error(
      `refused: --confirm-project=${expectedProject} is required; got '${args.confirmProject ?? ""}'`,
    );
  }
  if (args.maxDocuments > DEFAULT_MAX_DOCUMENTS) {
    throw new Error(`refused: --max-documents exceeds cap ${DEFAULT_MAX_DOCUMENTS}`);
  }
  if (args.collections) assertCollectionsAllowed(args.collections);
}

export function banner(projectId: string): string {
  return [
    "============================================================",
    "  ZERO-WRITE DRY RUN",
    `  PROJECT: ${projectId}`,
    "  NO DATA WILL BE MODIFIED",
    "============================================================",
  ].join("\n");
}

export function renderMarkdown(r: DryRunReport): string {
  const rows: [string, string | number][] = [
    ["Batch", r.batchId],
    ["Area", r.area ?? "(all)"],
    ["Total legacy records", r.totalLegacyRecords],
    ["Total candidates", r.totalCandidates],
    ["Safe candidates", r.safeCandidates],
    ["Held candidates", r.heldCandidates],
    ["Conflict candidates", r.conflictCandidates],
    ["Blocked candidates", r.blockedCandidates],
    ["Already mapped", r.alreadyMapped],
    ["Branch-risk candidates", r.branchRiskCandidates],
    ["Alias mappings", r.aliasMappings],
    ["Reference-impacted", r.referenceImpactedCandidates],
    ["Favorites impacted", r.favoritesImpacted],
    ["Meals impacted", r.mealsImpacted],
    ["History impacted", r.historyImpacted],
    ["Suggestions impacted", r.suggestionsImpacted],
    ["Deep links impacted", r.deepLinksImpacted],
    ["Estimated batches", r.estimatedBatches],
    ["Blockers", r.blockers.length ? r.blockers.join(", ") : "none"],
    ["Exit code", r.exitCode],
  ];
  return [
    "# MakanMana — Migration Dry-Run (ZERO-WRITE)",
    "",
    "> NO DATA MODIFIED. Estimates from read-only inventory.",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
  ].join("\n");
}
