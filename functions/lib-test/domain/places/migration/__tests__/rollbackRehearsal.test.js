"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.14B — LATIHAN rollback (emulator/dalam-ingatan sahaja).
 * Membuktikan: pelaksanaan tidak menulis produksi / memadam legasi; rollback
 * memulihkan + idempoten + mengekalkan audit. TIADA sambungan produksi.
 */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const legacyInventory_1 = require("../legacyInventory");
const dryRunPlanner_1 = require("../dryRunPlanner");
const migrationCheckpoint_1 = require("../migrationCheckpoint");
const emulatorExecution_1 = require("../emulatorExecution");
const rollbackPlan_1 = require("../rollbackPlan");
const fixtures_1 = require("./fixtures");
function approvedPlan() {
    const records = (0, legacyInventory_1.buildLegacyInventory)([(0, fixtures_1.referencedRecord)()], fixtures_1.T);
    const { plan, candidates } = (0, dryRunPlanner_1.buildLegacyMigrationPlan)({ batchId: "RB-BATCH", records, createdBy: "rehearsal" }, fixtures_1.T);
    return { records, plan: { ...plan, status: "approved_for_emulator" }, candidates };
}
function execute(plan, candidates) {
    return (0, emulatorExecution_1.executeMigrationPlanInEmulator)({ plan, candidates, checkpoint: (0, migrationCheckpoint_1.createCheckpoint)(plan.migrationPlanId, plan.batchId, fixtures_1.T), actorId: "rehearsal" }, fixtures_1.T);
}
(0, node_test_1.test)("rehearsal: execution never writes production nor deletes legacy", () => {
    const { records, plan, candidates } = approvedPlan();
    const legacyBefore = JSON.stringify(records);
    const result = execute(plan, candidates);
    strict_1.default.equal(result.wroteProductionData, false);
    strict_1.default.equal(result.deletedLegacyData, false);
    strict_1.default.ok(result.canonicalRecords.every((r) => r.emulatorOnly === true && r.published === false));
    // Rekod legasi input TIDAK diubah.
    strict_1.default.equal(JSON.stringify(records), legacyBefore);
    // Audit wujud (append-only).
    strict_1.default.ok(result.audit.length > 0);
});
(0, node_test_1.test)("rehearsal: rollback restores, preserves aliases as rolled_back, is idempotent", () => {
    const { plan, candidates } = approvedPlan();
    const result = execute(plan, candidates);
    strict_1.default.ok(result.canonicalRecords.length > 0, "expected at least one canonical record");
    strict_1.default.ok(result.rollbackPlan, "expected a rollback plan from execution");
    const rbPlan = result.rollbackPlan;
    const app1 = (0, rollbackPlan_1.applyRollback)(rbPlan, result.aliases, result.rewrites, fixtures_1.T + 1000);
    // Setiap alias yang dicipta oleh migrasi kini rolled_back.
    const createdAliasIds = new Set(rbPlan.createdAliasIds);
    const rolledBack = app1.aliases.filter((a) => createdAliasIds.has(a.aliasId));
    strict_1.default.ok(rolledBack.length > 0);
    strict_1.default.ok(rolledBack.every((a) => a.status === "rolled_back"));
    strict_1.default.equal(app1.plan.status, "executed");
    // Idempoten: jalankan semula ke atas keadaan yang sudah dibatalkan.
    const app2 = (0, rollbackPlan_1.applyRollback)(rbPlan, app1.aliases, app1.rewrites, fixtures_1.T + 2000);
    strict_1.default.deepEqual(app2.aliases.map((a) => `${a.aliasId}:${a.status}`).sort(), app1.aliases.map((a) => `${a.aliasId}:${a.status}`).sort());
    // Audit pelaksanaan asal kekal (tidak dipadam oleh rollback).
    strict_1.default.ok(result.audit.length > 0);
});
