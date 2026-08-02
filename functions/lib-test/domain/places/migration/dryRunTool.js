"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MAX_DOCUMENTS = exports.DEFAULT_COLLECTION_ALLOWLIST = exports.EXPECTED_PROJECT_ID = void 0;
exports.assertCollectionsAllowed = assertCollectionsAllowed;
exports.summarizeDryRun = summarizeDryRun;
exports.runDryRun = runDryRun;
exports.parseDryRunArgs = parseDryRunArgs;
exports.assertSafeInvocation = assertSafeInvocation;
exports.banner = banner;
exports.renderMarkdown = renderMarkdown;
const dryRunPlanner_1 = require("./dryRunPlanner");
exports.EXPECTED_PROJECT_ID = "makanmana-c59f3";
/** Koleksi yang SAH untuk dibaca oleh dry-run. Bacaan lain ditolak. */
exports.DEFAULT_COLLECTION_ALLOWLIST = [
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
exports.DEFAULT_MAX_DOCUMENTS = 5000;
/** Sahkan koleksi yang diminta terhadap senarai putih. Melempar jika luar. */
function assertCollectionsAllowed(requested, allowlist = exports.DEFAULT_COLLECTION_ALLOWLIST) {
    const bad = requested.filter((c) => !allowlist.includes(c));
    if (bad.length)
        throw new Error(`refused: collection(s) not on read-only allowlist: ${bad.join(",")}`);
}
const HELD_DECISIONS = [
    "review_required",
    "ambiguous",
    "insufficient_identity",
    "skip",
];
function impactOf(c) {
    return c.referenceImpact ?? {};
}
/**
 * Jalankan dry-run TULEN atas rekod yang telah dibaca. TIDAK menulis apa-apa.
 * Mengira ringkasan + penyekat keselamatan. Deterministik (masa disuntik).
 */
function summarizeDryRun(records, candidates, options) {
    const byDecision = (d) => candidates.filter((c) => c.migrationDecision === d);
    const safe = byDecision("ready");
    const held = candidates.filter((c) => HELD_DECISIONS.includes(c.migrationDecision));
    const conflict = candidates.filter((c) => c.migrationDecision === "branch_conflict" || c.conflicts.length > 0);
    const blocked = byDecision("blocked");
    const alreadyMapped = byDecision("already_mapped");
    const branchRisk = candidates.filter((c) => c.branchAssessment != null || c.holdReasons.includes("branch_conflict"));
    const sum = (key) => candidates.reduce((n, c) => n + (impactOf(c)[key] ?? 0), 0);
    const refImpacted = candidates.filter((c) => (impactOf(c).totalReferences ?? 0) > 0).length;
    // --- Penyekat keselamatan (STOP) -----------------------------------------
    const blockers = [];
    // 1. Pemetaan nama-sahaja TIDAK PERNAH boleh berada dalam set SELAMAT.
    const nameOnlyInSafe = safe.filter((c) => c.holdReasons.includes("name_only_match"));
    if (nameOnlyInSafe.length > 0) {
        blockers.push(`name_only_mapping_in_safe:${nameOnlyInSafe.length}`);
    }
    // 2. Ketaksaan cawangan dalam set selamat.
    const branchInSafe = safe.filter((c) => c.migrationDecision === "branch_conflict" || c.holdReasons.includes("branch_conflict"));
    if (branchInSafe.length > 0)
        blockers.push(`branch_ambiguity_in_safe:${branchInSafe.length}`);
    // 3. Rujukan kritikal tidak boleh diselesaikan.
    const unresolved = candidates.filter((c) => c.holdReasons.includes("critical_reference_unresolved"));
    if (unresolved.length > 0)
        blockers.push(`critical_reference_unresolved:${unresolved.length}`);
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
        aliasMappings: candidates.reduce((n, c) => n +
            c.proposedAliases.legacyDocumentIds.length +
            c.proposedAliases.googlePlaceIds.length +
            c.proposedAliases.providerPlaceIds.length, 0),
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
async function runDryRun(source, options, now) {
    const records = await source.readInventory(options.limit);
    const existingAliases = await source.readExistingAliases();
    const { candidates } = (0, dryRunPlanner_1.buildLegacyMigrationPlan)({ batchId: options.batchId, records, existingAliases, createdBy: "dry_run_tool" }, now);
    return summarizeDryRun(records, candidates, options);
}
function parseDryRunArgs(argv) {
    const args = {
        readOnly: false,
        maxDocuments: exports.DEFAULT_MAX_DOCUMENTS,
        includeReferenceScan: false,
        redactUserIdentifiers: true,
    };
    for (const a of argv) {
        const [k, v] = a.includes("=") ? a.split("=", 2) : [a, ""];
        switch (k) {
            case "--mode":
                args.mode = v;
                break;
            case "--confirm-project":
                args.confirmProject = v;
                break;
            case "--read-only":
                args.readOnly = true;
                break;
            case "--limit":
                args.limit = Number(v) || undefined;
                break;
            case "--max-documents":
                args.maxDocuments = Number(v) || exports.DEFAULT_MAX_DOCUMENTS;
                break;
            case "--collections":
                args.collections = v.split(",").map((s) => s.trim()).filter(Boolean);
                break;
            case "--area":
                args.area = v;
                break;
            case "--output":
                args.output = v;
                break;
            case "--include-reference-scan":
                args.includeReferenceScan = true;
                break;
            case "--redact-user-identifiers":
                args.redactUserIdentifiers = true;
                break;
            case "--no-redact-user-identifiers":
                args.redactUserIdentifiers = false;
                break;
        }
    }
    return args;
}
/**
 * Melempar jika pemanggilan tidak selamat. Menguatkuasa mod + read-only + projek
 * (TIADA fallback projek senyap) + senarai putih koleksi + topi dokumen.
 */
function assertSafeInvocation(args, expectedProject = exports.EXPECTED_PROJECT_ID) {
    if (args.mode !== "dry-run") {
        throw new Error("refused: --mode=dry-run is required (this tool is read-only)");
    }
    if (!args.readOnly) {
        throw new Error("refused: --read-only is required (this tool never writes)");
    }
    if (args.confirmProject !== expectedProject) {
        throw new Error(`refused: --confirm-project=${expectedProject} is required; got '${args.confirmProject ?? ""}'`);
    }
    if (args.maxDocuments > exports.DEFAULT_MAX_DOCUMENTS) {
        throw new Error(`refused: --max-documents exceeds cap ${exports.DEFAULT_MAX_DOCUMENTS}`);
    }
    if (args.collections)
        assertCollectionsAllowed(args.collections);
}
function banner(projectId) {
    return [
        "============================================================",
        "  ZERO-WRITE DRY RUN",
        `  PROJECT: ${projectId}`,
        "  NO DATA WILL BE MODIFIED",
        "============================================================",
    ].join("\n");
}
function renderMarkdown(r) {
    const rows = [
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
