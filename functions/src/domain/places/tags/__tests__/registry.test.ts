import test from "node:test";
import assert from "node:assert/strict";

import {
  SEED_TAG_DEFINITIONS,
  isLikelyLocalizedTagId,
  resolveTagId,
  validateTagDefinition,
  validateTagDefinitions,
  validateTagEvidence,
} from "../index";
import { REG, ev } from "./fixtures";

// Seed registry itself is valid (no dup tagId, no cycle).
test("seed registry is structurally valid", () => {
  const r = validateTagDefinitions(SEED_TAG_DEFINITIONS);
  assert.equal(r.ok, true, JSON.stringify(r.issues.slice(0, 5)));
});

// 1. Valid tag definition passes.
test("valid tag definition passes", () => {
  assert.equal(validateTagDefinition(REG.byId.get("restaurant")!).ok, true);
});

// 2. Invalid family fails.
test("invalid family fails", () => {
  const bad = { ...REG.byId.get("restaurant")!, familyId: "nope" as never };
  assert.equal(validateTagDefinition(bad).ok, false);
});

// 3. Invalid tag ID format fails.
test("invalid tag id format fails", () => {
  const bad = { ...REG.byId.get("restaurant")!, tagId: "Nasi Lemak" };
  const r = validateTagDefinition(bad);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "invalid_tag_id_format"));
});

// 4. Duplicate tag ID fails.
test("duplicate tag id fails", () => {
  const d = REG.byId.get("restaurant")!;
  const r = validateTagDefinitions([d, { ...d }]);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "duplicate_tag_id"));
});

// 5. Tag with wrong family fails.
test("tag with wrong family fails", () => {
  // "restaurant" milik place_type — guna dalam dish → mismatch.
  const r = validateTagEvidence(ev("dish", "restaurant"), REG);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "tag_family_mismatch"));
});

// 16. Alias resolves to canonical tag.
test("alias resolves to canonical tag", () => {
  assert.equal(resolveTagId(REG, "malaysian"), "malay");
  assert.equal(resolveTagId(REG, "ayam_gepuk"), "ayam_geprek");
});

// 17. Deprecated tag resolves to replacement.
test("deprecated tag resolves to replacement", () => {
  assert.equal(resolveTagId(REG, "western_food"), "western");
});

test("unknown tag resolves to undefined", () => {
  assert.equal(resolveTagId(REG, "zzz_unknown"), undefined);
});

// 18. Parent-child cycle fails.
test("hierarchy cycle fails", () => {
  const base = REG.byId.get("arab")!;
  const a = { ...base, tagId: "cyc_a", parentTagId: "cyc_b", childTagIds: undefined };
  const b = { ...base, tagId: "cyc_b", parentTagId: "cyc_a", childTagIds: undefined };
  const r = validateTagDefinitions([a, b]);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "hierarchy_cycle"));
});

// 30. Localized label as tag ID is rejected.
test("localized label as tag id is rejected", () => {
  assert.equal(isLikelyLocalizedTagId("Nasi Lemak").localized, true);
  assert.equal(isLikelyLocalizedTagId("泰国").localized, true);
  const r = validateTagEvidence(ev("cuisine", "Nasi Lemak"), REG);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "localized_or_invalid_tag_id"));
});

// 31. Canonical snake_case ID is accepted.
test("canonical snake_case id is accepted", () => {
  assert.equal(isLikelyLocalizedTagId("nasi_lemak").localized, false);
  assert.equal(isLikelyLocalizedTagId("ayam_geprek").localized, false);
  assert.equal(validateTagEvidence(ev("dish", "nasi_lemak"), REG).ok, true);
});
