import test from "node:test";
import assert from "node:assert/strict";

import {
  assertsAllergenSafety,
  validateImportBatch,
  validateNormalizedCandidate,
  validateSourceSnapshot,
} from "../index";
import {
  T,
  allergenUnknownCandidate,
  invalidHalalClaimCandidate,
  makeValidCandidate,
  missingNameCandidate,
  unknownHoursCandidate,
  unknownPriceCandidate,
  unknownRatingCandidate,
  validImportBatch,
  validProviderSnapshot,
} from "./fixtures";

const V = (c: Parameters<typeof validateNormalizedCandidate>[0]) =>
  validateNormalizedCandidate(c, { now: T, snapshotExists: true });

// 1. Valid import batch passes.
test("valid import batch passes", () => {
  assert.equal(validateImportBatch(validImportBatch).ok, true);
  assert.equal(validateSourceSnapshot(validProviderSnapshot).ok, true);
});

// 2. Empty source type fails.
test("empty source type fails", () => {
  const r = validateImportBatch({ ...validImportBatch, sourceType: "" as never });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "invalid_enum"));
});

// 5. Candidate confidence below 0 fails.
test("candidate confidence below 0 fails", () => {
  const r = V(makeValidCandidate({ candidateConfidence: -0.1 }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.code === "confidence_out_of_range"));
});

// 6. Candidate confidence above 1 fails.
test("candidate confidence above 1 fails", () => {
  const r = V(makeValidCandidate({ candidateConfidence: 1.5 }));
  assert.equal(r.valid, false);
});

// 7. Missing candidate name fails validation.
test("missing candidate name fails validation", () => {
  const r = V(missingNameCandidate);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.code === "name_empty"));
});

// 8. Unknown rating remains undefined (and still valid).
test("unknown rating remains undefined", () => {
  assert.equal(unknownRatingCandidate.proposedQuality.rating, undefined);
  assert.equal(unknownRatingCandidate.proposedQuality.reviewCount, undefined);
  assert.equal(V(unknownRatingCandidate).valid, true);
});

// 9. Unknown price remains explicit unknown (and valid).
test("unknown price remains explicit unknown", () => {
  assert.equal(unknownPriceCandidate.proposedCommercial.priceState, "unknown");
  assert.equal(V(unknownPriceCandidate).valid, true);
});

// 10. Unknown hours remain unknown (and valid).
test("unknown hours remain unknown", () => {
  assert.equal(unknownHoursCandidate.proposedHours.hoursState, "unknown");
  assert.equal(V(unknownHoursCandidate).valid, true);
});

// 11. Halal claim cannot exceed evidence level.
test("halal claim cannot exceed evidence level", () => {
  const r = V(invalidHalalClaimCandidate);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.code === "halal_claim_exceeds_evidence"));
});

// 12. Allergen-safe cannot be inferred from missing data.
test("allergen-safe cannot be inferred from missing data", () => {
  // Tiada medan "selamat" wujud; helper sentiasa false.
  assert.equal(assertsAllergenSafety(allergenUnknownCandidate), false);
  // Alahan kosong + evidence unknown adalah SAH (bukan dakwaan selamat).
  assert.equal(V(allergenUnknownCandidate).valid, true);
  assert.deepEqual(allergenUnknownCandidate.proposedSafetyEvidence.allergenReported, []);
});
