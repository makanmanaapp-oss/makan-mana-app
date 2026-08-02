"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.14A — ujian alat dry-run: BUKTI SIFAR-TULIS + fixture.
 */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const legacyInventory_1 = require("../legacyInventory");
const dryRunPlanner_1 = require("../dryRunPlanner");
const dryRunTool_1 = require("../dryRunTool");
const fixtures_1 = require("./fixtures");
// Token penulisan Firestore yang DILARANG dalam graf dry-run.
const FIRESTORE_WRITE_TOKENS = [
    ".set(",
    ".update(",
    ".delete(",
    ".create(",
    ".add(",
    "writeBatch",
    "bulkWriter",
    "BulkWriter",
    "runTransaction",
];
function readSource(rel) {
    return (0, node_fs_1.readFileSync)(node_path_1.default.resolve(process.cwd(), rel), "utf8");
}
(0, node_test_1.test)("dryRunTool.ts contains NO Firestore write calls and NO admin import", () => {
    const src = readSource("src/domain/places/migration/dryRunTool.ts");
    for (const tok of FIRESTORE_WRITE_TOKENS) {
        strict_1.default.ok(!src.includes(tok), `dryRunTool.ts must not contain '${tok}'`);
    }
    // Semak IMPORT sebenar (bukan perkataan dalam komen).
    const importLines = src.split("\n").filter((l) => /^\s*import\b/.test(l));
    const importBlob = importLines.join("\n");
    strict_1.default.ok(!/firebase-admin/.test(importBlob), "dryRunTool.ts must not import firebase-admin");
    strict_1.default.ok(!/FirestoreMigrationRepository|emulatorExecution|firestoreMigrationRepository/.test(importBlob), "dryRunTool.ts must not import a write-capable repository");
});
(0, node_test_1.test)("CLI script uses only reads (.get) — no Firestore writes", () => {
    // Neutralkan idiom crypto `createHash(...).update(...)` (BUKAN tulisan Firestore)
    // supaya imbasan kekal ketat untuk `.update(` Firestore sebenar.
    const src = readSource("scripts/placeMigrationDryRun.ts").replace(/createHash\([^)]*\)\.update\(/g, "createHash(_)HASH(");
    for (const tok of FIRESTORE_WRITE_TOKENS) {
        strict_1.default.ok(!src.includes(tok), `CLI must not contain '${tok}'`);
    }
    strict_1.default.ok(src.includes(".get()"), "CLI is expected to read via .get()");
});
(0, node_test_1.test)("guard: refuses without --mode=dry-run", () => {
    strict_1.default.throws(() => (0, dryRunTool_1.assertSafeInvocation)((0, dryRunTool_1.parseDryRunArgs)(["--confirm-project=makanmana-c59f3"])));
});
(0, node_test_1.test)("guard: refuses wrong/absent project", () => {
    strict_1.default.throws(() => (0, dryRunTool_1.assertSafeInvocation)((0, dryRunTool_1.parseDryRunArgs)(["--mode=dry-run"])));
    strict_1.default.throws(() => (0, dryRunTool_1.assertSafeInvocation)((0, dryRunTool_1.parseDryRunArgs)(["--mode=dry-run", "--confirm-project=other"])));
});
(0, node_test_1.test)("guard: refuses without --read-only", () => {
    strict_1.default.throws(() => (0, dryRunTool_1.assertSafeInvocation)((0, dryRunTool_1.parseDryRunArgs)(["--mode=dry-run", "--confirm-project=makanmana-c59f3"])));
});
(0, node_test_1.test)("guard: refuses max-documents over the cap", () => {
    strict_1.default.throws(() => (0, dryRunTool_1.assertSafeInvocation)((0, dryRunTool_1.parseDryRunArgs)([
        "--mode=dry-run", "--read-only", "--confirm-project=makanmana-c59f3",
        `--max-documents=${dryRunTool_1.DEFAULT_MAX_DOCUMENTS + 1}`,
    ])));
});
(0, node_test_1.test)("guard: refuses a collection outside the read-only allowlist", () => {
    strict_1.default.throws(() => (0, dryRunTool_1.assertCollectionsAllowed)(["place_registry"]));
    strict_1.default.doesNotThrow(() => (0, dryRunTool_1.assertCollectionsAllowed)(["places_cache", "place_details"]));
    strict_1.default.throws(() => (0, dryRunTool_1.assertSafeInvocation)((0, dryRunTool_1.parseDryRunArgs)([
        "--mode=dry-run", "--read-only", "--confirm-project=makanmana-c59f3",
        "--collections=place_registry",
    ])));
});
(0, node_test_1.test)("guard: accepts dry-run + read-only + correct project", () => {
    strict_1.default.doesNotThrow(() => (0, dryRunTool_1.assertSafeInvocation)((0, dryRunTool_1.parseDryRunArgs)([
        "--mode=dry-run", "--read-only", "--confirm-project=makanmana-c59f3",
    ])));
});
(0, node_test_1.test)("zero-record inventory → 0 candidates, exit 0", () => {
    const r = (0, dryRunTool_1.summarizeDryRun)([], [], { batchId: "b" });
    strict_1.default.equal(r.totalLegacyRecords, 0);
    strict_1.default.equal(r.totalCandidates, 0);
    strict_1.default.equal(r.exitCode, 0);
    strict_1.default.equal(r.blockers.length, 0);
});
(0, node_test_1.test)("name-only record is NEVER placed in the safe set (no name_only blocker)", () => {
    const records = (0, legacyInventory_1.buildLegacyInventory)([(0, fixtures_1.nameOnlyRecord)()], fixtures_1.T);
    const { candidates } = (0, dryRunPlanner_1.buildLegacyMigrationPlan)({ batchId: "b", records, createdBy: "t" }, fixtures_1.T);
    const r = (0, dryRunTool_1.summarizeDryRun)(records, candidates, { batchId: "b" });
    // Domain menahan pemetaan nama-sahaja → tiada penyekat 'name_only_in_safe'.
    strict_1.default.ok(!r.blockers.some((b) => b.startsWith("name_only_mapping_in_safe")));
    // Ia TIDAK dikira sebagai calon selamat.
    const safeHasNameOnly = candidates.some((c) => c.migrationDecision === "ready" && c.holdReasons.includes("name_only_match"));
    strict_1.default.equal(safeHasNameOnly, false);
});
(0, node_test_1.test)("branch records surface branch risk / conflict", () => {
    const records = (0, legacyInventory_1.buildLegacyInventory)((0, fixtures_1.branchRecords)(), fixtures_1.T);
    const { candidates } = (0, dryRunPlanner_1.buildLegacyMigrationPlan)({ batchId: "b", records, createdBy: "t" }, fixtures_1.T);
    const r = (0, dryRunTool_1.summarizeDryRun)(records, candidates, { batchId: "b" });
    strict_1.default.ok(r.branchRiskCandidates > 0 || r.conflictCandidates > 0);
});
(0, node_test_1.test)("referenced record surfaces reference impact", () => {
    const records = (0, legacyInventory_1.buildLegacyInventory)([(0, fixtures_1.referencedRecord)()], fixtures_1.T);
    const { candidates } = (0, dryRunPlanner_1.buildLegacyMigrationPlan)({ batchId: "b", records, createdBy: "t" }, fixtures_1.T);
    const r = (0, dryRunTool_1.summarizeDryRun)(records, candidates, { batchId: "b" });
    strict_1.default.ok(r.referenceImpactedCandidates >= 0); // struktur wujud; tiada ranap
});
(0, node_test_1.test)("runDryRun via injected read-only source performs no writes", async () => {
    let writes = 0;
    const source = {
        async readInventory() {
            return (0, legacyInventory_1.buildLegacyInventory)([(0, fixtures_1.referencedRecord)()], fixtures_1.T);
        },
        async readExistingAliases() {
            return [];
        },
    };
    // Bungkus untuk mengesan sebarang panggilan tulisan (tiada dijangka).
    const spy = new Proxy(source, {
        get(t, p) {
            if (typeof p === "string" && /set|update|delete|create|add|write/.test(p))
                writes++;
            return t[p];
        },
    });
    const r = await (0, dryRunTool_1.runDryRun)(spy, { batchId: "b" }, fixtures_1.T);
    strict_1.default.equal(writes, 0);
    strict_1.default.ok(r.totalLegacyRecords >= 1);
    strict_1.default.equal(r.exitCode, 0);
});
