import test from "node:test";
import assert from "node:assert/strict";

import {
  computeSignals,
  evaluateDuplicateDecision,
  DuplicateDecisionResult,
  NormalizedIdentity,
} from "../index";
import * as F from "./fixtures";

const decide = (a: NormalizedIdentity, b: NormalizedIdentity): DuplicateDecisionResult =>
  evaluateDuplicateDecision(computeSignals(a, b));

// 1 & Golden A. Exact same provider ID → auto-link.
test("exact provider id → auto_link_source", () => {
  assert.equal(decide(F.A_google1, F.A_google2).decision, "auto_link_source");
});

// 2. Exact merchant registration ID → auto-link.
test("exact merchant id → auto_link_source", () => {
  assert.equal(decide(F.M_a, F.M_b).decision, "auto_link_source");
});

// 3 & Golden B. Same phone + close coordinates → review (high confidence).
test("phone + close coords → review_required", () => {
  const r = decide(F.B_google, F.B_owner);
  assert.equal(r.decision, "review_required");
});

// 4. Same name only → not auto-merge (possible duplicate max).
test("same name only → possible_duplicate (never auto-merge)", () => {
  const r = decide(F.N_a, F.N_b);
  assert.equal(r.decision, "possible_duplicate");
});

// 5 & Golden C & 20. Same chain + different branch → likely separate branch.
test("same chain different branch → likely_separate_branch (blocks auto-merge)", () => {
  const r = decide(F.C_mall1, F.C_mall2);
  assert.equal(r.decision, "likely_separate_branch");
  assert.notEqual(r.decision, "auto_link_source");
});

// 6 & Golden D. Same name + far coordinates → separate (not merged).
test("same name + far coordinates → not merged", () => {
  const r = decide(F.D_kl, F.D_penang);
  assert.ok(["likely_separate_branch", "separate_place"].includes(r.decision));
  assert.notEqual(r.decision, "auto_link_source");
});

// 7. Similar name + same address + same phone → review.
test("name + address + phone → review_required", () => {
  assert.equal(decide(F.G7_a, F.G7_b).decision, "review_required");
});

// 8. Conflicting verified phones → no auto-merge.
test("conflicting phones → no auto-merge", () => {
  const r = decide(F.P_a, F.P_b);
  assert.ok(!["auto_link_source", "exact_duplicate"].includes(r.decision));
});

// Golden E. Renamed at same location + phone → review with rename warning.
test("renamed at same location+phone → review + possible_rename warning", () => {
  const r = decide(F.E_old, F.E_new);
  assert.equal(r.decision, "review_required");
  assert.ok(r.warnings.includes("possible_rename_or_moved"));
});

// Golden F. Moved restaurant → review (do not auto-merge).
test("moved restaurant (same name+phone, far coords) → review_required", () => {
  const r = decide(F.F_before, F.F_after);
  assert.equal(r.decision, "review_required");
});

// Golden H. Similar spelling + exact phone → review (high confidence).
test("similar spelling + exact phone → review_required", () => {
  assert.equal(decide(F.H_a, F.H_b).decision, "review_required");
});

// Separate businesses → separate_place.
test("clearly different businesses → separate_place", () => {
  assert.equal(decide(F.S_a, F.S_b).decision, "separate_place");
});
