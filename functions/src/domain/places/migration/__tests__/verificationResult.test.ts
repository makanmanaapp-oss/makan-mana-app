/**
 * Phase A2 Part 1 — ujian kontrak verificationResult.
 *
 * Meliputi 10 kes yang diperlukan oleh spesifikasi.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_VERIFICATION_RESULT,
  VERIFICATION_RESULTS,
  VerificationResultError,
  canTransitionVerification,
  checkVerificationTransition,
  isVerificationResult,
  parseVerificationResult,
  readVerificationResult,
  serializeVerificationResult,
  tryParseVerificationResult,
  verificationTransitionPatch,
} from "../verificationResult";

const T = 1767571200000; // 2026-01-05T00:00:00Z

// 1. Ketiga-tiga nilai sah diterima.
test("1. all three valid values are accepted", () => {
  assert.deepEqual([...VERIFICATION_RESULTS], [
    "pending_post_write",
    "verified",
    "verification_failed",
  ]);
  for (const value of VERIFICATION_RESULTS) {
    assert.equal(isVerificationResult(value), true, value);
    assert.equal(parseVerificationResult(value), value);
  }
});

// 2. Rentetan tidak sah ditolak.
test("2. invalid string is rejected", () => {
  for (const bad of ["verified_ok", "pending", "PENDING_POST_WRITE", "", "done"]) {
    assert.equal(isVerificationResult(bad), false, bad);
    assert.throws(() => parseVerificationResult(bad), VerificationResultError);
    assert.equal(tryParseVerificationResult(bad), null);
  }
  // Bukan-rentetan juga ditolak.
  for (const bad of [undefined, null, 1, {}, ["verified"], true]) {
    assert.equal(isVerificationResult(bad), false);
    assert.throws(() => parseVerificationResult(bad), VerificationResultError);
  }
});

// 3. pending_post_write -> verified dibenarkan.
test("3. pending_post_write -> verified is allowed", () => {
  assert.equal(canTransitionVerification("pending_post_write", "verified"), true);
  assert.equal(
    checkVerificationTransition("pending_post_write", "verified").rejection,
    null,
  );
});

// 4. pending_post_write -> verification_failed dibenarkan.
test("4. pending_post_write -> verification_failed is allowed", () => {
  assert.equal(
    canTransitionVerification("pending_post_write", "verification_failed"),
    true,
  );
});

// 5. verified -> pending_post_write ditolak (buka semula).
test("5. verified -> pending_post_write is rejected", () => {
  const check = checkVerificationTransition("verified", "pending_post_write");
  assert.equal(check.allowed, false);
  assert.equal(check.rejection, "reopen_forbidden");
});

// 6. verified -> verification_failed ditolak melalui penutupan normal.
test("6. verified -> verification_failed rejected through normal closure", () => {
  const check = checkVerificationTransition("verified", "verification_failed");
  assert.equal(check.allowed, false);
  assert.equal(check.rejection, "verified_to_failed_forbidden_normal");
});

// 7. verification_failed -> verified ditolak melalui penutupan normal.
test("7. verification_failed -> verified rejected through normal closure", () => {
  const check = checkVerificationTransition("verification_failed", "verified");
  assert.equal(check.allowed, false);
  assert.equal(check.rejection, "recovery_requires_explicit_workflow");
});

// 8. Kebebasan globalCompletion.
test("8. globalCompletion independence — any intended change is rejected", () => {
  const check = checkVerificationTransition("pending_post_write", "verified", {
    intendedGlobalCompletionChange: true,
  });
  assert.equal(check.allowed, false);
  assert.equal(check.rejection, "global_completion_mutation_forbidden");
  // Patch tidak pernah memancarkan globalCompletion.
  const patch = verificationTransitionPatch("pending_post_write", "verified", T);
  assert.equal("globalCompletion" in patch, false);
});

// 9. Kebebasan rollbackStatus.
test("9. rollbackStatus independence — any intended change is rejected", () => {
  const check = checkVerificationTransition("pending_post_write", "verified", {
    intendedRollbackStatusChange: true,
  });
  assert.equal(check.allowed, false);
  assert.equal(check.rejection, "rollback_status_mutation_forbidden");
  const patch = verificationTransitionPatch("pending_post_write", "verified", T);
  assert.equal("rollbackStatus" in patch, false);
});

// 10. Keserasian serialisasi (dokumen pilot sedia ada).
test("10. serialization compatibility with the existing pilot document", () => {
  // Dokumen pilot produksi sebenar memegang literal ini.
  const pilotDoc: Record<string, unknown> = {
    batchId: "PMB-925c3b83df84ce7016e99f1f",
    verificationResult: "pending_post_write",
    globalCompletion: false,
    rollbackStatus: "available",
    migrationVersion: "1.14E.1",
  };
  const value = readVerificationResult(pilotDoc);
  assert.equal(value, "pending_post_write");
  assert.equal(value, INITIAL_VERIFICATION_RESULT);
  // Round-trip.
  assert.equal(serializeVerificationResult(value), "pending_post_write");
  assert.equal(parseVerificationResult(serializeVerificationResult(value)), value);
  // Dokumen dengan nilai rosak melempar dan bukan menganggap.
  assert.throws(
    () => readVerificationResult({ ...pilotDoc, verificationResult: "weird" }),
    VerificationResultError,
  );
});

// Tambahan: patch verified membawa verifiedAt; failed tidak.
test("11. transition patch shape", () => {
  const verified = verificationTransitionPatch("pending_post_write", "verified", T);
  assert.equal(verified.verificationResult, "verified");
  assert.equal(verified.verifiedAt, T);
  const failed = verificationTransitionPatch(
    "pending_post_write",
    "verification_failed",
    T,
  );
  assert.equal(failed.verificationResult, "verification_failed");
  assert.equal("verifiedAt" in failed, false);
  // Peralihan tidak sah melempar daripada penjana patch.
  assert.throws(
    () => verificationTransitionPatch("verified", "pending_post_write", T),
    VerificationResultError,
  );
});
