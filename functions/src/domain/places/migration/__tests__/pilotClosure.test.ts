/**
 * Phase A2 Part 3 — ujian TULEN alat penutupan pilot (subset boleh-diuji-lokal).
 *
 * Kes laluan-tulis (execute, idempotensi, tiada koleksi lain berubah) diuji
 * terhadap emulator dalam pilotClosure.emulator.test.ts. Fail ini meliputi
 * penilaian bukti tulen: kelayakan, dan setiap penolakan.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ClosureEvidence,
  ClosureRequest,
  EXPECTED_PROJECT_ID,
  PILOT_BATCH_ID,
  PILOT_EXPECTED,
  buildClosureAuditEvent,
  closureAuditId,
  evaluateClosure,
  parseClosureArgs,
  assertSafeClosureInvocation,
} from "../pilotClosure";

const T = 1767571200000;

function validRequest(over: Partial<ClosureRequest> = {}): ClosureRequest {
  return {
    projectId: EXPECTED_PROJECT_ID,
    batchId: PILOT_BATCH_ID,
    confirmBatchId: PILOT_BATCH_ID,
    execute: false,
    sourceCommit: "abc1234",
    actorId: "owner:makanmana.app",
    evidenceReference: "docs/PLACE_DATA_A1_CONTROLLED_PILOT_CLOSURE_PLAN.md",
    ...over,
  };
}

function validEvidence(over: Partial<ClosureEvidence> = {}): ClosureEvidence {
  return {
    projectId: EXPECTED_PROJECT_ID,
    batchExists: true,
    batch: {
      batchId: PILOT_BATCH_ID,
      verificationResult: "pending_post_write",
      globalCompletion: false,
      rollbackStatus: "available",
    },
    manifestChecksumPresent: true,
    candidateChecksumPresent: true,
    backupReferencePresent: true,
    manifestChecksumMatches: true,
    candidateChecksumMatches: true,
    observed: {
      sourceCount: 25, migratedCount: 25, writeTotal: 126, registryCount: 25,
      publicationCount: 25, publicationHeadCount: 25, aliasCount: 25,
      migrationAuditCount: 25, orphanCount: 0, duplicateCount: 0,
      branchConflictCount: 0,
    },
    legacySourceUnchanged: true,
    ...over,
  };
}

// 1. Valid pending batch dry run succeeds (eligible, mutation planned).
test("1. valid pending batch is eligible and plans exactly the verified patch", () => {
  const decision = evaluateClosure(validRequest(), validEvidence(), T);
  assert.equal(decision.eligible, true);
  assert.equal(decision.alreadyVerified, false);
  assert.equal(decision.mutationRequired, true);
  assert.deepEqual(decision.blockers, []);
  assert.deepEqual(decision.plannedBatchPatch, { verificationResult: "verified", verifiedAt: T });
  // Patch never carries globalCompletion or rollbackStatus.
  assert.equal("globalCompletion" in (decision.plannedBatchPatch ?? {}), false);
  assert.equal("rollbackStatus" in (decision.plannedBatchPatch ?? {}), false);
  // Planned audit is compatible and semantic.
  const a = decision.plannedAudit!;
  assert.equal(a.action, "pilot_verification_completed");
  assert.equal(a.batchId, PILOT_BATCH_ID);
  assert.equal(a.verificationResult, "verified");
  assert.equal(a.globalCompletion, false);
  assert.equal(a.migrationWritePerformed, false);
  assert.equal(a.sourceCommit, "abc1234");
});

// Already-verified → idempotent decision (no mutation).
test("1b. already-verified batch returns alreadyVerified with no mutation", () => {
  const decision = evaluateClosure(
    validRequest(),
    validEvidence({
      batch: { batchId: PILOT_BATCH_ID, verificationResult: "verified", globalCompletion: false, rollbackStatus: "available" },
    }),
    T,
  );
  assert.equal(decision.alreadyVerified, true);
  assert.equal(decision.mutationRequired, false);
  assert.equal(decision.plannedBatchPatch, null);
  assert.equal(decision.plannedAudit, null);
});

// 7. Wrong project rejected.
test("7. wrong project is rejected", () => {
  const d = evaluateClosure(validRequest({ projectId: "some-other-project" }), validEvidence(), T);
  assert.equal(d.eligible, false);
  assert.ok(d.blockers.includes("wrong_project"));
});

// 8. Wrong batch rejected.
test("8. wrong batch is rejected", () => {
  const d = evaluateClosure(
    validRequest({ batchId: "PMB-not-the-pilot", confirmBatchId: "PMB-not-the-pilot" }),
    validEvidence(),
    T,
  );
  assert.equal(d.eligible, false);
  assert.ok(d.blockers.includes("wrong_batch"));
});

test("8b. batch confirmation mismatch is rejected", () => {
  const d = evaluateClosure(validRequest({ confirmBatchId: "PMB-typo" }), validEvidence(), T);
  assert.ok(d.blockers.includes("batch_confirmation_mismatch"));
});

// 9. Missing batch rejected.
test("9. missing batch is rejected", () => {
  const d = evaluateClosure(validRequest(), validEvidence({ batchExists: false, batch: null }), T);
  assert.equal(d.eligible, false);
  assert.ok(d.blockers.includes("batch_missing"));
});

// 10. Incorrect source count rejected.
test("10. incorrect source count is rejected", () => {
  const d = evaluateClosure(
    validRequest(),
    validEvidence({ observed: { ...validEvidence().observed, sourceCount: 24 } }),
    T,
  );
  assert.ok(d.blockers.includes("source_count_mismatch"));
});

// 11. Incorrect migrated count rejected.
test("11. incorrect migrated count is rejected", () => {
  const d = evaluateClosure(
    validRequest(),
    validEvidence({ observed: { ...validEvidence().observed, migratedCount: 26 } }),
    T,
  );
  assert.ok(d.blockers.includes("migrated_count_mismatch"));
});

// 12. Incorrect collection distribution rejected.
test("12. incorrect collection distribution is rejected", () => {
  const base = validEvidence().observed;
  const checks: [Partial<typeof base>, string][] = [
    [{ writeTotal: 125 }, "write_total_mismatch"],
    [{ registryCount: 24 }, "registry_count_mismatch"],
    [{ publicationCount: 24 }, "publication_count_mismatch"],
    [{ publicationHeadCount: 24 }, "publication_head_count_mismatch"],
    [{ aliasCount: 24 }, "alias_count_mismatch"],
    [{ migrationAuditCount: 24 }, "migration_audit_count_mismatch"],
  ];
  for (const [patch, code] of checks) {
    const d = evaluateClosure(validRequest(), validEvidence({ observed: { ...base, ...patch } }), T);
    assert.ok(d.blockers.includes(code as never), code);
    assert.equal(d.eligible, false);
  }
});

// 13. Checksum mismatch rejected.
test("13. checksum mismatch is rejected", () => {
  const manifest = evaluateClosure(validRequest(), validEvidence({ manifestChecksumMatches: false }), T);
  assert.ok(manifest.blockers.includes("manifest_checksum_mismatch"));
  const candidate = evaluateClosure(validRequest(), validEvidence({ candidateChecksumMatches: false }), T);
  assert.ok(candidate.blockers.includes("candidate_checksum_mismatch"));
});

test("13b. missing checksum is rejected", () => {
  const d = evaluateClosure(validRequest(), validEvidence({ manifestChecksumPresent: false, manifestChecksumMatches: false }), T);
  assert.ok(d.blockers.includes("manifest_checksum_missing"));
});

// 14. Missing backup reference rejected.
test("14. missing backup reference is rejected", () => {
  const d = evaluateClosure(validRequest(), validEvidence({ backupReferencePresent: false }), T);
  assert.ok(d.blockers.includes("backup_reference_missing"));
});

// 15. Orphan detected and rejected.
test("15. orphan detected is rejected", () => {
  const d = evaluateClosure(validRequest(), validEvidence({ observed: { ...validEvidence().observed, orphanCount: 1 } }), T);
  assert.ok(d.blockers.includes("orphan_detected"));
});

// 16. Duplicate detected and rejected.
test("16. duplicate detected is rejected", () => {
  const d = evaluateClosure(validRequest(), validEvidence({ observed: { ...validEvidence().observed, duplicateCount: 1 } }), T);
  assert.ok(d.blockers.includes("duplicate_detected"));
});

// 17. Branch conflict detected and rejected.
test("17. branch conflict detected is rejected", () => {
  const d = evaluateClosure(validRequest(), validEvidence({ observed: { ...validEvidence().observed, branchConflictCount: 1 } }), T);
  assert.ok(d.blockers.includes("branch_conflict_detected"));
});

// 18. Unknown verificationResult rejected.
test("18. unknown verificationResult is rejected", () => {
  const d = evaluateClosure(
    validRequest(),
    validEvidence({
      batch: { batchId: PILOT_BATCH_ID, verificationResult: "weird" as never, globalCompletion: false, rollbackStatus: "available" },
    }),
    T,
  );
  assert.equal(d.eligible, false);
  assert.ok(d.blockers.includes("unknown_verification_result"));
});

// 19. Already-failed batch rejected by normal verified closure.
test("19. already-failed batch is rejected by normal closure", () => {
  const d = evaluateClosure(
    validRequest(),
    validEvidence({
      batch: { batchId: PILOT_BATCH_ID, verificationResult: "verification_failed", globalCompletion: false, rollbackStatus: "available" },
    }),
    T,
  );
  assert.equal(d.eligible, false);
  assert.ok(d.blockers.includes("already_failed"));
});

// Independence guards on the batch document itself.
test("global/rollback drift on the batch is rejected", () => {
  const gc = evaluateClosure(
    validRequest(),
    validEvidence({ batch: { batchId: PILOT_BATCH_ID, verificationResult: "pending_post_write", globalCompletion: true, rollbackStatus: "available" } }),
    T,
  );
  assert.ok(gc.blockers.includes("global_completion_not_false"));
  const rb = evaluateClosure(
    validRequest(),
    validEvidence({ batch: { batchId: PILOT_BATCH_ID, verificationResult: "pending_post_write", globalCompletion: false, rollbackStatus: "unavailable" } }),
    T,
  );
  assert.ok(rb.blockers.includes("rollback_status_not_available"));
});

// Deterministic audit id (idempotency guarantee).
test("closure audit id is deterministic and single-per-batch", () => {
  assert.equal(closureAuditId(PILOT_BATCH_ID), closureAuditId(PILOT_BATCH_ID));
  const a = buildClosureAuditEvent(validRequest(), T);
  const b = buildClosureAuditEvent(validRequest({ sourceCommit: "different" }), T + 999);
  // Same batch → same audit id regardless of commit/time (append-once).
  assert.equal(a.auditId, b.auditId);
});

// CLI guard.
test("CLI guard requires exact project, batch and matching confirmation", () => {
  assert.throws(() => assertSafeClosureInvocation(parseClosureArgs([])));
  assert.throws(() => assertSafeClosureInvocation(parseClosureArgs([
    `--confirm-project=${EXPECTED_PROJECT_ID}`, "--batch=PMB-x", "--confirm-batch=PMB-x",
  ])));
  assert.throws(() => assertSafeClosureInvocation(parseClosureArgs([
    `--confirm-project=${EXPECTED_PROJECT_ID}`, `--batch=${PILOT_BATCH_ID}`, "--confirm-batch=PMB-typo",
  ])));
  // Wildcard / multiple batch refused.
  assert.throws(() => assertSafeClosureInvocation(parseClosureArgs([
    `--confirm-project=${EXPECTED_PROJECT_ID}`, "--batch=*", "--confirm-batch=*",
  ])));
  // Valid dry-run invocation passes.
  assert.doesNotThrow(() => assertSafeClosureInvocation(parseClosureArgs([
    `--confirm-project=${EXPECTED_PROJECT_ID}`, `--batch=${PILOT_BATCH_ID}`, `--confirm-batch=${PILOT_BATCH_ID}`,
  ])));
  // Execute without source commit refused.
  assert.throws(() => assertSafeClosureInvocation(parseClosureArgs([
    `--confirm-project=${EXPECTED_PROJECT_ID}`, `--batch=${PILOT_BATCH_ID}`, `--confirm-batch=${PILOT_BATCH_ID}`, "--execute",
  ])));
});

test("PILOT_EXPECTED matches the A1 pilot totals", () => {
  assert.equal(PILOT_EXPECTED.sourceCount, 25);
  assert.equal(PILOT_EXPECTED.writeTotal, 126);
  assert.equal(PILOT_EXPECTED.migrationAuditCount, 25);
});
