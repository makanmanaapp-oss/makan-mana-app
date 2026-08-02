import test from "node:test";
import assert from "node:assert/strict";

import { calculatePlaceCompleteness } from "../index";

// 20. Formula completeness memulangkan skor deterministik dijangka.
test("completeness formula returns expected deterministic score", () => {
  // Semua komponen 1.0 -> overall = jumlah pemberat = 1.0
  // (safetyEvidence DIKECUALIKAN dari formula).
  const full = calculatePlaceCompleteness({
    identityCompleteness: 1,
    locationCompleteness: 1,
    displayCompleteness: 1,
    commercialCompleteness: 1,
    hoursCompleteness: 1,
    qualityCompleteness: 1,
    tagCompleteness: 1,
    provenanceCompleteness: 1,
    safetyEvidenceCompleteness: 0, // sengaja 0 — tidak menjejaskan overall
  });
  assert.equal(full.overallScore, 1);

  // Nilai bercampur — dikira tangan mengikut pemberat rasmi.
  // 0.2*1 + 0.2*0.5 + 0.15*0 + 0.1*1 + 0.1*0 + 0.1*1 + 0.1*0 + 0.05*1
  // = 0.2 + 0.1 + 0 + 0.1 + 0 + 0.1 + 0 + 0.05 = 0.55
  const mixed = calculatePlaceCompleteness({
    identityCompleteness: 1,
    locationCompleteness: 0.5,
    displayCompleteness: 0,
    commercialCompleteness: 1,
    hoursCompleteness: 0,
    qualityCompleteness: 1,
    tagCompleteness: 0,
    provenanceCompleteness: 1,
    safetyEvidenceCompleteness: 1,
  });
  assert.equal(mixed.overallScore, 0.55);
});

// Tambahan: komponen luar julat melempar RangeError (helper defensif).
test("completeness helper throws on out-of-range component", () => {
  assert.throws(
    () =>
      calculatePlaceCompleteness({
        identityCompleteness: 1.5,
        locationCompleteness: 1,
        displayCompleteness: 1,
        commercialCompleteness: 1,
        hoursCompleteness: 1,
        qualityCompleteness: 1,
        tagCompleteness: 1,
        provenanceCompleteness: 1,
        safetyEvidenceCompleteness: 1,
      }),
    RangeError,
  );
});
