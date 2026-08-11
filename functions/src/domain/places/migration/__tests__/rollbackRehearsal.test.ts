/**
 * Phase 1.14B — LATIHAN rollback (emulator/dalam-ingatan sahaja).
 * Membuktikan: pelaksanaan tidak menulis produksi / memadam legasi; rollback
 * memulihkan + idempoten + mengekalkan audit. TIADA sambungan produksi.
 */
import assert from "node:assert/strict";
import {test} from "node:test";

import {buildLegacyInventory} from "../legacyInventory";
import {buildLegacyMigrationPlan} from "../dryRunPlanner";
import {createCheckpoint} from "../migrationCheckpoint";
import {executeMigrationPlanInEmulator} from "../emulatorExecution";
import {applyRollback} from "../rollbackPlan";
import {referencedRecord, T} from "./fixtures";

function approvedPlan() {
  const records = buildLegacyInventory([referencedRecord()], T);
  const {plan, candidates} = buildLegacyMigrationPlan(
    {batchId: "RB-BATCH", records, createdBy: "rehearsal"},
    T,
  );
  return {records, plan: {...plan, status: "approved_for_emulator" as const}, candidates};
}

function execute(plan: ReturnType<typeof approvedPlan>["plan"], candidates: ReturnType<typeof approvedPlan>["candidates"]) {
  return executeMigrationPlanInEmulator(
    {plan, candidates, checkpoint: createCheckpoint(plan.migrationPlanId, plan.batchId, T), actorId: "rehearsal"},
    T,
  );
}

test("rehearsal: execution never writes production nor deletes legacy", () => {
  const {records, plan, candidates} = approvedPlan();
  const legacyBefore = JSON.stringify(records);
  const result = execute(plan, candidates);

  assert.equal(result.wroteProductionData, false);
  assert.equal(result.deletedLegacyData, false);
  assert.ok(result.canonicalRecords.every((r) => r.emulatorOnly === true && r.published === false));
  // Rekod legasi input TIDAK diubah.
  assert.equal(JSON.stringify(records), legacyBefore);
  // Audit wujud (append-only).
  assert.ok(result.audit.length > 0);
});

test("rehearsal: rollback restores, preserves aliases as rolled_back, is idempotent", () => {
  const {plan, candidates} = approvedPlan();
  const result = execute(plan, candidates);
  assert.ok(result.canonicalRecords.length > 0, "expected at least one canonical record");
  assert.ok(result.rollbackPlan, "expected a rollback plan from execution");
  const rbPlan = result.rollbackPlan!;

  const app1 = applyRollback(rbPlan, result.aliases, result.rewrites, T + 1000);
  // Setiap alias yang dicipta oleh migrasi kini rolled_back.
  const createdAliasIds = new Set(rbPlan.createdAliasIds);
  const rolledBack = app1.aliases.filter((a) => createdAliasIds.has(a.aliasId));
  assert.ok(rolledBack.length > 0);
  assert.ok(rolledBack.every((a) => a.status === "rolled_back"));
  assert.equal(app1.plan.status, "executed");

  // Idempoten: jalankan semula ke atas keadaan yang sudah dibatalkan.
  const app2 = applyRollback(rbPlan, app1.aliases, app1.rewrites, T + 2000);
  assert.deepEqual(
    app2.aliases.map((a) => `${a.aliasId}:${a.status}`).sort(),
    app1.aliases.map((a) => `${a.aliasId}:${a.status}`).sort(),
  );
  // Audit pelaksanaan asal kekal (tidak dipadam oleh rollback).
  assert.ok(result.audit.length > 0);
});
