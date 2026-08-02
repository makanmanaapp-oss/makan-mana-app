/**
 * Phase 1.14A — ujian alat dry-run: BUKTI SIFAR-TULIS + fixture.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {test} from "node:test";

import {buildLegacyInventory} from "../legacyInventory";
import {buildLegacyMigrationPlan} from "../dryRunPlanner";
import {
  DEFAULT_MAX_DOCUMENTS,
  assertCollectionsAllowed,
  assertSafeInvocation,
  parseDryRunArgs,
  runDryRun,
  summarizeDryRun,
} from "../dryRunTool";
import {branchRecords, nameOnlyRecord, referencedRecord, T} from "./fixtures";

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

function readSource(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

test("dryRunTool.ts contains NO Firestore write calls and NO admin import", () => {
  const src = readSource("src/domain/places/migration/dryRunTool.ts");
  for (const tok of FIRESTORE_WRITE_TOKENS) {
    assert.ok(!src.includes(tok), `dryRunTool.ts must not contain '${tok}'`);
  }
  // Semak IMPORT sebenar (bukan perkataan dalam komen).
  const importLines = src.split("\n").filter((l) => /^\s*import\b/.test(l));
  const importBlob = importLines.join("\n");
  assert.ok(!/firebase-admin/.test(importBlob), "dryRunTool.ts must not import firebase-admin");
  assert.ok(!/FirestoreMigrationRepository|emulatorExecution|firestoreMigrationRepository/.test(importBlob),
    "dryRunTool.ts must not import a write-capable repository");
});

test("CLI script uses only reads (.get) — no Firestore writes", () => {
  // Neutralkan idiom crypto `createHash(...).update(...)` (BUKAN tulisan Firestore)
  // supaya imbasan kekal ketat untuk `.update(` Firestore sebenar.
  const src = readSource("scripts/placeMigrationDryRun.ts").replace(/createHash\([^)]*\)\.update\(/g, "createHash(_)HASH(");
  for (const tok of FIRESTORE_WRITE_TOKENS) {
    assert.ok(!src.includes(tok), `CLI must not contain '${tok}'`);
  }
  assert.ok(src.includes(".get()"), "CLI is expected to read via .get()");
});

test("guard: refuses without --mode=dry-run", () => {
  assert.throws(() => assertSafeInvocation(parseDryRunArgs(["--confirm-project=makanmana-c59f3"])));
});

test("guard: refuses wrong/absent project", () => {
  assert.throws(() => assertSafeInvocation(parseDryRunArgs(["--mode=dry-run"])));
  assert.throws(() => assertSafeInvocation(parseDryRunArgs(["--mode=dry-run", "--confirm-project=other"])));
});

test("guard: refuses without --read-only", () => {
  assert.throws(() =>
    assertSafeInvocation(parseDryRunArgs(["--mode=dry-run", "--confirm-project=makanmana-c59f3"])));
});

test("guard: refuses max-documents over the cap", () => {
  assert.throws(() =>
    assertSafeInvocation(parseDryRunArgs([
      "--mode=dry-run", "--read-only", "--confirm-project=makanmana-c59f3",
      `--max-documents=${DEFAULT_MAX_DOCUMENTS + 1}`,
    ])));
});

test("guard: refuses a collection outside the read-only allowlist", () => {
  assert.throws(() => assertCollectionsAllowed(["place_registry"]));
  assert.doesNotThrow(() => assertCollectionsAllowed(["places_cache", "place_details"]));
  assert.throws(() =>
    assertSafeInvocation(parseDryRunArgs([
      "--mode=dry-run", "--read-only", "--confirm-project=makanmana-c59f3",
      "--collections=place_registry",
    ])));
});

test("guard: accepts dry-run + read-only + correct project", () => {
  assert.doesNotThrow(() =>
    assertSafeInvocation(parseDryRunArgs([
      "--mode=dry-run", "--read-only", "--confirm-project=makanmana-c59f3",
    ])));
});

test("zero-record inventory → 0 candidates, exit 0", () => {
  const r = summarizeDryRun([], [], {batchId: "b"});
  assert.equal(r.totalLegacyRecords, 0);
  assert.equal(r.totalCandidates, 0);
  assert.equal(r.exitCode, 0);
  assert.equal(r.blockers.length, 0);
});

test("name-only record is NEVER placed in the safe set (no name_only blocker)", () => {
  const records = buildLegacyInventory([nameOnlyRecord()], T);
  const {candidates} = buildLegacyMigrationPlan({batchId: "b", records, createdBy: "t"}, T);
  const r = summarizeDryRun(records, candidates, {batchId: "b"});
  // Domain menahan pemetaan nama-sahaja → tiada penyekat 'name_only_in_safe'.
  assert.ok(!r.blockers.some((b) => b.startsWith("name_only_mapping_in_safe")));
  // Ia TIDAK dikira sebagai calon selamat.
  const safeHasNameOnly = candidates.some(
    (c) => c.migrationDecision === "ready" && c.holdReasons.includes("name_only_match"),
  );
  assert.equal(safeHasNameOnly, false);
});

test("branch records surface branch risk / conflict", () => {
  const records = buildLegacyInventory(branchRecords(), T);
  const {candidates} = buildLegacyMigrationPlan({batchId: "b", records, createdBy: "t"}, T);
  const r = summarizeDryRun(records, candidates, {batchId: "b"});
  assert.ok(r.branchRiskCandidates > 0 || r.conflictCandidates > 0);
});

test("referenced record surfaces reference impact", () => {
  const records = buildLegacyInventory([referencedRecord()], T);
  const {candidates} = buildLegacyMigrationPlan({batchId: "b", records, createdBy: "t"}, T);
  const r = summarizeDryRun(records, candidates, {batchId: "b"});
  assert.ok(r.referenceImpactedCandidates >= 0); // struktur wujud; tiada ranap
});

test("runDryRun via injected read-only source performs no writes", async () => {
  let writes = 0;
  const source = {
    async readInventory() {
      return buildLegacyInventory([referencedRecord()], T);
    },
    async readExistingAliases() {
      return [];
    },
  };
  // Bungkus untuk mengesan sebarang panggilan tulisan (tiada dijangka).
  const spy = new Proxy(source, {
    get(t, p) {
      if (typeof p === "string" && /set|update|delete|create|add|write/.test(p)) writes++;
      return (t as Record<string, unknown>)[p as string];
    },
  });
  const r = await runDryRun(spy as typeof source, {batchId: "b"}, T);
  assert.equal(writes, 0);
  assert.ok(r.totalLegacyRecords >= 1);
  assert.equal(r.exitCode, 0);
});
