import test from "node:test";
import assert from "node:assert/strict";

import {
  assertValidStagingTransition,
  canTransitionStagingStatus,
} from "../index";

// 13. imported → normalizing passes.
test("valid imported to normalizing", () => {
  assert.equal(canTransitionStagingStatus("imported", "normalizing"), true);
});

// 14. normalizing → needs_review passes.
test("valid normalizing to needs_review", () => {
  assert.equal(canTransitionStagingStatus("normalizing", "needs_review"), true);
});

// 15. needs_review → approved passes.
test("valid needs_review to approved", () => {
  assert.equal(canTransitionStagingStatus("needs_review", "approved"), true);
});

// 16. imported → published fails (published bukan status staging).
test("invalid imported to published fails", () => {
  assert.equal(
    canTransitionStagingStatus("imported", "published" as never),
    false,
  );
  assert.throws(() =>
    assertValidStagingTransition("imported", "published" as never),
  );
});

// 17. rejected → published fails.
test("invalid rejected to published fails", () => {
  assert.equal(
    canTransitionStagingStatus("rejected", "published" as never),
    false,
  );
});

// Tambahan: validation_failed → approved DILARANG (mesti revalidate).
test("validation_failed to approved is forbidden", () => {
  assert.equal(canTransitionStagingStatus("validation_failed", "approved"), false);
  assert.equal(canTransitionStagingStatus("validation_failed", "normalizing"), true);
});

// Tambahan: merged → approved DILARANG (mesti reopen dahulu).
test("merged to approved is forbidden without reopen", () => {
  assert.equal(canTransitionStagingStatus("merged", "approved"), false);
  assert.equal(canTransitionStagingStatus("merged", "needs_review"), true);
});
