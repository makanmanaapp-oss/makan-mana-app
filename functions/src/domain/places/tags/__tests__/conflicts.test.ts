import test from "node:test";
import assert from "node:assert/strict";

import { detectTagConflicts } from "../index";
import { REG, ev } from "./fixtures";

// 19 & 20. Certified + possible_non_halal → exclusion conflict, blocks publication.
test("halal certified + possible_non_halal conflict blocks publication", () => {
  const r = detectTagConflicts(
    [ev("halal_evidence", "certified"), ev("halal_evidence", "possible_non_halal")],
    REG,
  );
  assert.ok(r.conflicts.length > 0);
  assert.equal(r.resolutionRequired, true);
  assert.equal(r.safeForPublication, false);
  assert.ok(r.conflicts.some((c) => c.code === "exclusion_conflict" || c.code === "single_value_family_conflict"));
});

// 21. Budget + luxury conflict.
test("price budget + luxury conflict", () => {
  const r = detectTagConflicts([ev("price", "budget"), ev("price", "luxury")], REG);
  assert.ok(r.conflicts.some((c) => c.code === "single_value_family_conflict"));
  assert.equal(r.safeForPublication, false);
});

test("spice non_spicy + extreme conflict", () => {
  const r = detectTagConflicts([ev("spice", "non_spicy"), ev("spice", "extreme")], REG);
  assert.ok(r.conflicts.length > 0);
});

// 22. Multiple cuisine tags are allowed.
test("multiple cuisine tags are allowed", () => {
  const r = detectTagConflicts([ev("cuisine", "malay"), ev("cuisine", "chinese")], REG);
  assert.equal(r.conflicts.length, 0);
  assert.equal(r.safeForPublication, true);
});

// 23. Multiple meal-slot tags are allowed.
test("multiple meal-slot tags are allowed", () => {
  const r = detectTagConflicts([ev("meal_slot", "breakfast"), ev("meal_slot", "lunch")], REG);
  assert.equal(r.conflicts.length, 0);
});

// Deprecated + replacement present → warning (not silent).
test("deprecated + replacement present warns", () => {
  const r = detectTagConflicts([ev("cuisine", "western_food"), ev("cuisine", "western")], REG);
  assert.ok(r.warnings.some((w) => w.code === "deprecated_and_replacement_present"));
});
