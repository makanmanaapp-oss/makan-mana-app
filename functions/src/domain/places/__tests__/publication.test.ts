import test from "node:test";
import assert from "node:assert/strict";

import { evaluatePublicationEligibility } from "../index";
import {
  completeVerifiedPlace,
  draftPlace,
  makeBasePlace,
  mergedAliasPlace,
  partiallyCompletePlace,
  permanentlyClosedPlace,
} from "./fixtures";

// 9. Kedai published + aktif + sah = layak.
test("published valid active place is eligible", () => {
  const r = evaluatePublicationEligibility(completeVerifiedPlace);
  assert.equal(r.eligible, true, JSON.stringify(r.reasons));
});

// 10. Kedai draft tidak layak.
test("draft place is not eligible", () => {
  const r = evaluatePublicationEligibility(draftPlace);
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.includes("not_published"));
});

// 11. Kedai tutup kekal tidak layak.
test("permanently closed place is not eligible", () => {
  const r = evaluatePublicationEligibility(permanentlyClosedPlace);
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.includes("status_blocked"));
});

// 12. Kedai hidden_by_admin tidak layak.
test("hidden place is not eligible", () => {
  const p = makeBasePlace();
  p.status = "hidden_by_admin";
  const r = evaluatePublicationEligibility(p);
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.includes("status_blocked"));
});

// 13. Alias digabung tidak layak.
test("merged alias is not eligible", () => {
  const r = evaluatePublicationEligibility(mergedAliasPlace);
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.includes("merged_into_other"));
});

// 14. Completeness rendah tidak layak.
test("low-completeness place is not eligible", () => {
  const r = evaluatePublicationEligibility(partiallyCompletePlace);
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.includes("completeness_below_threshold"));
});

// Tambahan: warning dikeluarkan tetapi kekal layak untuk kes borderline.
test("borderline completeness stays eligible with warning label", () => {
  const p = makeBasePlace();
  p.completeness = { ...p.completeness, overallScore: 0.7 };
  const r = evaluatePublicationEligibility(p);
  assert.equal(r.eligible, true, JSON.stringify(r.reasons));
  assert.ok(r.warnings.includes("completeness_needs_labels"));
});
