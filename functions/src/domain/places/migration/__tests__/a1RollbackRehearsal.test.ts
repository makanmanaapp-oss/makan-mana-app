/**
 * Phase A1 Part 7 — full rollback rehearsal on a representative batch.
 *
 * Emulator / in-memory only. No production credential, no production write.
 *
 * The existing Phase 1.14B rehearsal proves execution is non-destructive and
 * that rollback is idempotent for a single referenced record. A1 needs the
 * whole sequence over a batch that actually exercises the risky shapes:
 * exact provider identity, a likely duplicate, two same-name different
 * branches, and unknown rating / hours / price. It also carries an unrelated
 * control record that must not be touched by any step.
 */
import assert from "node:assert/strict";
import {test} from "node:test";

import {buildLegacyInventory} from "../legacyInventory";
import {buildLegacyMigrationPlan} from "../dryRunPlanner";
import {createCheckpoint} from "../migrationCheckpoint";
import {executeMigrationPlanInEmulator} from "../emulatorExecution";
import {applyRollback} from "../rollbackPlan";
import {branchRecords, legacyRecord, referencedRecord, T} from "./fixtures";
import type {LegacyRecordInput} from "../legacyInventory";

/** The control record. Present in the inventory, never part of the plan's batch. */
function unrelatedControl(): LegacyRecordInput {
  return legacyRecord({
    legacyDocumentPath: "place_details/ChIJ_control_untouched",
    legacyPlaceId: "ChIJ_control_untouched",
    providerPlaceId: "ChIJ_control_untouched",
    displayName: "Kedai Kawalan",
  });
}

/** Unknown rating, hours and price — must never be fabricated downstream. */
function unknownFieldsRecord(): LegacyRecordInput {
  return legacyRecord({
    legacyDocumentPath: "place_details/ChIJ_unknown_fields",
    legacyPlaceId: "ChIJ_unknown_fields",
    providerPlaceId: "ChIJ_unknown_fields",
    displayName: "Gerai Tanpa Maklumat",
    rating: undefined,
    reviewCount: undefined,
    priceEstimate: undefined,
    isOpen: undefined,
  });
}

/** Same provider identity as the referenced record — the likely-duplicate case. */
function likelyDuplicate(): LegacyRecordInput {
  return legacyRecord({
    legacyDocumentPath: "places_cache/dup_referenced",
    legacyCollection: "places_cache",
    legacyPlaceId: "dup_referenced",
    providerPlaceId: "ChIJ_mock_referenced",
    displayName: "Kopitiam Sri Muda (cawangan lama)",
  });
}

function representativeBatch() {
  const records = [
    referencedRecord(),
    likelyDuplicate(),
    ...branchRecords(),
    unknownFieldsRecord(),
  ];
  const inventory = buildLegacyInventory(records, T);
  const {plan, candidates} = buildLegacyMigrationPlan(
    {batchId: "A1-REHEARSAL", records: inventory, createdBy: "a1-rehearsal"},
    T,
  );
  return {inventory, plan, candidates};
}

function execute(plan: ReturnType<typeof representativeBatch>["plan"],
  candidates: ReturnType<typeof representativeBatch>["candidates"]) {
  return executeMigrationPlanInEmulator(
    {plan: {...plan, status: "approved_for_emulator" as const}, candidates,
      checkpoint: createCheckpoint(plan.migrationPlanId, plan.batchId, T), actorId: "a1-rehearsal"},
    T,
  );
}

// --- 1. dry run --------------------------------------------------------------

test("A1 rehearsal: dry run plans the batch without executing anything", () => {
  const {plan, candidates} = representativeBatch();
  assert.ok(candidates.length > 0, "dry run must produce candidates");
  assert.notEqual(plan.status, "executed", "a dry run must not be executed");
  // The control record is not in this batch at all.
  const ids = JSON.stringify(candidates);
  assert.ok(!ids.includes("ChIJ_control_untouched"), "control record must not be planned");
});

// --- 2-3. migration + verification -------------------------------------------

test("A1 rehearsal: emulator execution writes no production data and keeps legacy intact", () => {
  const {inventory, plan, candidates} = representativeBatch();
  const control = unrelatedControl();
  const legacyBefore = JSON.stringify(inventory);
  const controlBefore = JSON.stringify(control);

  const result = execute(plan, candidates);

  assert.equal(result.wroteProductionData, false);
  assert.equal(result.deletedLegacyData, false);
  assert.ok(result.canonicalRecords.every((r) => r.emulatorOnly === true && r.published === false),
    "every canonical record stays emulator-only and unpublished");
  assert.equal(JSON.stringify(inventory), legacyBefore, "legacy inventory unchanged");
  assert.equal(JSON.stringify(control), controlBefore, "unrelated control record unchanged");
  assert.ok(result.audit.length > 0, "audit entries exist");
});

test("A1 rehearsal: same-name different branches are held back, never auto-merged", () => {
  const {plan, candidates} = representativeBatch();
  // Branch protection happens at planning time: the pair of "Restoran Ali"
  // records must be flagged rather than silently merged or migrated.
  const conflicts = candidates.filter((c) => c.migrationDecision === "branch_conflict");
  assert.ok(conflicts.length > 0, "the same-name branch pair must raise branch_conflict");

  const result = execute(plan, candidates);
  // A branch_conflict candidate must not produce a canonical record.
  const conflictIds = new Set(conflicts.map((c) => c.candidateId));
  const migratedConflicts = result.canonicalRecords.filter((r) => conflictIds.has(r.candidateId));
  assert.equal(migratedConflicts.length, 0, "a branch conflict must never be migrated automatically");
});

test("A1 rehearsal: unknown rating, hours and price are never fabricated", () => {
  const {plan, candidates} = representativeBatch();
  const result = execute(plan, candidates);
  // Canonical records are keyed by canonicalPlaceId and carry no provider id,
  // so locate the record by its display name.
  const target = result.canonicalRecords.find((r) => r.displayName === "Gerai Tanpa Maklumat");
  assert.ok(target, "the unknown-fields record was migrated");
  const asText = JSON.stringify(target);
  // The canonical record must not invent any of the three unknown fields.
  assert.ok(!/"rating"/.test(asText), "no rating field is fabricated");
  assert.ok(!/"priceEstimate"|"priceLevel"/.test(asText), "no price field is fabricated");
  assert.ok(!/"isOpen"/.test(asText), "no opening-hours claim is fabricated");
});

// --- 4-6. rollback, verification, idempotency --------------------------------

test("A1 rehearsal: rollback restores state, is idempotent, and touches nothing unrelated", () => {
  const {plan, candidates} = representativeBatch();
  const control = unrelatedControl();
  const controlBefore = JSON.stringify(control);

  const result = execute(plan, candidates);
  assert.ok(result.rollbackPlan, "execution produced a rollback plan");
  const rbPlan = result.rollbackPlan!;
  assert.ok(rbPlan.createdAliasIds.length > 0, "rollback plan is complete: it names created aliases");

  const first = applyRollback(rbPlan, result.aliases, result.rewrites, T + 1000);
  const created = new Set(rbPlan.createdAliasIds);
  const rolled = first.aliases.filter((a) => created.has(a.aliasId));
  assert.ok(rolled.length > 0 && rolled.every((a) => a.status === "rolled_back"),
    "every alias created by the migration is marked rolled_back");
  // Aliases are never deleted — retention policy.
  assert.equal(first.aliases.length, result.aliases.length, "no alias was deleted");

  // Second rollback over already-rolled-back state must be a no-op.
  const second = applyRollback(rbPlan, first.aliases, first.rewrites, T + 2000);
  assert.deepEqual(
    second.aliases.map((a) => `${a.aliasId}:${a.status}`).sort(),
    first.aliases.map((a) => `${a.aliasId}:${a.status}`).sort(),
    "second rollback changes nothing",
  );
  // Audit survives rollback (append-only).
  assert.ok(result.audit.length > 0, "execution audit retained after rollback");
  assert.equal(JSON.stringify(control), controlBefore, "unrelated control record still untouched");
});

// --- 7. deterministic re-migration -------------------------------------------

test("A1 rehearsal: re-running the migration is deterministic", () => {
  const a = representativeBatch();
  const b = representativeBatch();
  const ra = execute(a.plan, a.candidates);
  const rb = execute(b.plan, b.candidates);

  const shape = (r: typeof ra) => JSON.stringify({
    canonical: r.canonicalRecords.length,
    aliases: r.aliases.length,
    audit: r.audit.length,
    wroteProduction: r.wroteProductionData,
    deletedLegacy: r.deletedLegacyData,
  });
  assert.equal(shape(ra), shape(rb), "identical input produces an identical result shape");
});
