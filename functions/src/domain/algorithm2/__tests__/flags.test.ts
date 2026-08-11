/**
 * Algorithm 2 / Phase 2.2 — ujian bendera (env-driven, lalai OFF, cohort-gated).
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { algorithm2FlagActive, emergencyLegacyActive } from "../../../config/algorithm2Flags";

afterEach(() => {
  delete process.env.ALGO2_FLAGS;
  delete process.env.ALGO2_EMERGENCY_LEGACY;
});

test("default: all flags OFF for everyone (public legacy)", () => {
  assert.equal(algorithm2FlagActive("sessionSuppression", true), false);
  assert.equal(algorithm2FlagActive("sessionSuppression", false), false);
});

test("enabled flag active ONLY for cohort", () => {
  process.env.ALGO2_FLAGS = "sessionSuppression,rejectMemory";
  assert.equal(algorithm2FlagActive("sessionSuppression", true), true);
  assert.equal(algorithm2FlagActive("rejectMemory", true), true);
  assert.equal(algorithm2FlagActive("sessionRotation", true), false); // not enabled
  assert.equal(algorithm2FlagActive("sessionSuppression", false), false); // non-cohort → legacy
});

test("ALGO2_FLAGS=all enables all for cohort", () => {
  process.env.ALGO2_FLAGS = "all";
  assert.equal(algorithm2FlagActive("expandedPool", true), true);
  assert.equal(algorithm2FlagActive("explorePagination", true), true);
});

test("emergency legacy wins over all flags", () => {
  process.env.ALGO2_FLAGS = "all";
  process.env.ALGO2_EMERGENCY_LEGACY = "true";
  assert.equal(emergencyLegacyActive(), true);
  assert.equal(algorithm2FlagActive("sessionSuppression", true), false);
});
