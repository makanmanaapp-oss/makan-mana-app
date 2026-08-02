import test from "node:test";
import assert from "node:assert/strict";

import { buildDuplicateCandidate, duplicateCandidateId, DEFAULT_DEDUP_CONFIG } from "../index";
import { B_google, B_owner, T } from "./fixtures";

// 29. Repeated same comparison is idempotent (same candidate identity).
test("repeated comparison is idempotent", () => {
  const one = buildDuplicateCandidate({
    stagingRecordId: "stg_a",
    comparedStagingRecordId: "stg_b",
    a: B_google,
    b: B_owner,
    now: T,
  });
  const two = buildDuplicateCandidate({
    stagingRecordId: "stg_a",
    comparedStagingRecordId: "stg_b",
    a: B_google,
    b: B_owner,
    now: T + 10_000,
  });
  assert.equal(one.duplicateCandidateId, two.duplicateCandidateId);
});

// 30. Reversed record order creates same pair identity.
test("reversed record order → same pair identity", () => {
  const forward = buildDuplicateCandidate({
    stagingRecordId: "stg_a",
    comparedStagingRecordId: "stg_b",
    a: B_google,
    b: B_owner,
    now: T,
  });
  const reversed = buildDuplicateCandidate({
    stagingRecordId: "stg_b",
    comparedStagingRecordId: "stg_a",
    a: B_owner,
    b: B_google,
    now: T,
  });
  assert.equal(forward.duplicateCandidateId, reversed.duplicateCandidateId);
});

// Part N: config version berbeza → ID berbeza.
test("different config version → different candidate id", () => {
  const base = duplicateCandidateId("stg_a", "stg_b", DEFAULT_DEDUP_CONFIG.algorithmVersion, "dedup_config_v1");
  const other = duplicateCandidateId("stg_a", "stg_b", DEFAULT_DEDUP_CONFIG.algorithmVersion, "dedup_config_v2");
  assert.notEqual(base, other);
});

// Part N: ID bergantung pada pasangan+algo+config sahaja (bukan metadata) →
// kemas kini metadata sumber tidak mengubah identiti calon.
test("candidate id stable across source metadata changes", () => {
  const id1 = duplicateCandidateId("stg_a", "stg_b", "dedup_v1", "dedup_config_v1");
  const id2 = duplicateCandidateId("stg_a", "stg_b", "dedup_v1", "dedup_config_v1");
  assert.equal(id1, id2);
});
