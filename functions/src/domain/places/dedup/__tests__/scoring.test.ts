import test from "node:test";
import assert from "node:assert/strict";

import { computeSignals, computeDuplicateScore, scoreBand } from "../index";
import { A_google1, A_google2, AC_a, AC_b } from "./fixtures";

// 15. Duplicate score clamped 0..1.
test("duplicate score is clamped to 0..1", () => {
  const high = computeDuplicateScore(computeSignals(A_google1, A_google2));
  assert.ok(high.adjustedScore >= 0 && high.adjustedScore <= 1);
  const conflicted = computeDuplicateScore(computeSignals(AC_a, AC_b));
  assert.ok(conflicted.adjustedScore >= 0 && conflicted.adjustedScore <= 1);
});

// 9. Conflicting addresses apply a penalty.
test("conflicting addresses apply penalty", () => {
  const res = computeDuplicateScore(computeSignals(AC_a, AC_b));
  assert.ok(res.penalties.addressConflict > 0, "address conflict penalty");
  assert.ok(res.penalties.coordinateConflict > 0, "coordinate conflict penalty");
  assert.ok(res.penalties.total > 0);
});

// 16-19. Decision bands map scores correctly.
test("score bands map correctly", () => {
  assert.equal(scoreBand(0.96), "exact"); // 16: >= 0.95 auto/exact band
  assert.equal(scoreBand(0.85), "review"); // 17: 0.80-0.949
  assert.equal(scoreBand(0.6), "possible"); // 18: 0.55-0.799
  assert.equal(scoreBand(0.4), "separate"); // 19: < 0.55
  // Sempadan tepat.
  assert.equal(scoreBand(0.95), "exact");
  assert.equal(scoreBand(0.8), "review");
  assert.equal(scoreBand(0.55), "possible");
  assert.equal(scoreBand(0.549), "separate");
});
