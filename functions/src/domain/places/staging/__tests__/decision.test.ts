import test from "node:test";
import assert from "node:assert/strict";

import { PlaceReviewDecision, validateReviewDecision } from "../index";
import { T } from "./fixtures";

function decision(over: Partial<PlaceReviewDecision>): PlaceReviewDecision {
  return {
    decisionId: "dec_1",
    stagingRecordId: "stg_valid",
    decision: "approve",
    decidedBy: "admin_1",
    decidedAt: T,
    reasonCode: "meets_quality",
    previousReviewStatus: "needs_review",
    nextReviewStatus: "approved",
    ...over,
  };
}

test("valid approve decision passes", () => {
  assert.equal(validateReviewDecision(decision({})).ok, true);
});

// 18. Merge decision without target fails.
test("merge decision without target fails", () => {
  const r = validateReviewDecision(
    decision({
      decision: "merge_into_existing",
      previousReviewStatus: "duplicate_candidate",
      nextReviewStatus: "merged",
      targetCanonicalPlaceId: undefined,
    }),
  );
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "merge_target_missing"));
});

test("merge decision with target passes", () => {
  const r = validateReviewDecision(
    decision({
      decision: "merge_into_existing",
      previousReviewStatus: "duplicate_candidate",
      nextReviewStatus: "merged",
      targetCanonicalPlaceId: "mm_place_1",
    }),
  );
  assert.equal(r.ok, true);
});

// 19. Reject decision without reason fails.
test("reject decision without reason fails", () => {
  const r = validateReviewDecision(
    decision({ decision: "reject", nextReviewStatus: "rejected", reasonCode: "" }),
  );
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "reason_required"));
});

// Ketakpadanan status keputusan ditolak.
test("decision/next-status mismatch fails", () => {
  const r = validateReviewDecision(
    decision({ decision: "approve", nextReviewStatus: "rejected" }),
  );
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "decision_status_mismatch"));
});
