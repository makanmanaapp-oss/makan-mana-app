import test from "node:test";
import assert from "node:assert/strict";

import { validateTagEvidence } from "../index";
import { REG, T, ev } from "./fixtures";

const V = (e: Parameters<typeof validateTagEvidence>[0]) => validateTagEvidence(e, REG);
const has = (e: ReturnType<typeof validateTagEvidence>, code: string) =>
  e.issues.some((i) => i.code === code);

// 6 & 7. Confidence bounds.
test("confidence below 0 fails", () => {
  assert.equal(V(ev("cuisine", "malay", { confidence: -0.1 })).ok, false);
});
test("confidence above 1 fails", () => {
  assert.equal(V(ev("cuisine", "malay", { confidence: 1.5 })).ok, false);
});

// 8. Disallowed evidence level fails (dietary has no "inferred").
test("disallowed evidence level fails", () => {
  const r = V(ev("dietary", "vegan_options", { evidenceLevel: "inferred" }));
  assert.equal(r.ok, false);
  assert.ok(has(r, "evidence_level_not_allowed_for_family"));
});

// 9. Certified halal without verified evidence fails.
test("certified halal without verified evidence fails", () => {
  const r = V(ev("halal_evidence", "certified", { evidenceLevel: "reported" }));
  assert.equal(r.ok, false);
  assert.ok(has(r, "halal_certified_requires_verified"));
});

// 10 & Golden B. Merchant halal claim cannot become certified.
test("merchant claim cannot become certified", () => {
  const r = V(ev("halal_evidence", "certified", {
    sourceType: "merchant",
    evidenceLevel: "verified",
    verifiedAt: T,
  }));
  assert.equal(r.ok, false);
  assert.ok(has(r, "halal_certified_requires_official_verification"));
  // merchant_claimed dari merchant adalah SAH.
  assert.equal(V(ev("halal_evidence", "merchant_claimed", { sourceType: "merchant" })).ok, true);
});

// 11 & Golden C. Community halal report remains community_reported.
test("community halal report stays community_reported", () => {
  assert.equal(V(ev("halal_evidence", "community_reported", { sourceType: "community" })).ok, true);
  // Komuniti cuba isytihar certified → gagal.
  assert.equal(V(ev("halal_evidence", "certified", { sourceType: "community", evidenceLevel: "verified" })).ok, false);
});

// Golden D. Official certificate → certified valid.
test("official certificate → certified valid", () => {
  const admin = V(ev("halal_evidence", "certified", { evidenceLevel: "verified", approvedBy: "admin_1", verifiedAt: T }));
  assert.equal(admin.ok, true, JSON.stringify(admin.issues));
  const licensed = V(ev("halal_evidence", "certified", { evidenceLevel: "verified", sourceType: "licensed_dataset", verifiedAt: T }));
  assert.equal(licensed.ok, true);
});

// 12 & Golden E. Missing allergen data remains unknown (valid).
test("missing allergen data remains unknown", () => {
  assert.equal(V(ev("allergen", "peanuts", { evidenceLevel: "unknown" })).ok, true);
});

// 13. Allergen-safe cannot be inferred (no inferred level for allergen).
test("allergen safety cannot be inferred", () => {
  const r = V(ev("allergen", "peanuts", { evidenceLevel: "inferred" }));
  assert.equal(r.ok, false);
  assert.ok(has(r, "evidence_level_not_allowed_for_family"));
});

// Golden F. Menu lists peanuts → allergen presence with evidence.
test("menu lists peanuts → allergen presence valid", () => {
  assert.equal(V(ev("allergen", "peanuts", { evidenceLevel: "verified", sourceRecordId: "menu_1" })).ok, true);
});

// 14. High-protein restaurant inference remains low confidence.
test("inferred high_protein at high confidence fails", () => {
  const high = V(ev("health", "high_protein", { evidenceLevel: "inferred", confidence: 0.8 }));
  assert.equal(high.ok, false);
  assert.ok(has(high, "health_inferred_confidence_too_high"));
  const low = V(ev("health", "high_protein", { evidenceLevel: "inferred", confidence: 0.3 }));
  assert.equal(low.ok, true);
});

// Golden G. Reviews mention "healthy" → inferred only; verified-from-review fails.
test("review-derived health cannot be verified without menu evidence", () => {
  const verifiedNoMenu = V(ev("health", "vegetable_rich", { evidenceLevel: "verified" }));
  assert.equal(verifiedNoMenu.ok, false);
  assert.ok(has(verifiedNoMenu, "health_verified_requires_menu_evidence"));
});

// 15. Vegan option without supporting evidence fails.
test("vegan option without supporting evidence fails", () => {
  assert.equal(V(ev("dietary", "vegan_options", { evidenceLevel: "inferred" })).ok, false);
});

// Golden H. Verified menu → grilled/high_protein with stronger evidence.
test("verified menu grilled/high_protein valid", () => {
  assert.equal(V(ev("health", "grilled", { evidenceLevel: "verified", sourceRecordId: "menu_2" })).ok, true);
  assert.equal(V(ev("health", "high_protein", { evidenceLevel: "verified", sourceRecordId: "menu_2" })).ok, true);
});
