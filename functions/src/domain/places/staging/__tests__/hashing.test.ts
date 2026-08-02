import test from "node:test";
import assert from "node:assert/strict";

import { GenericProviderNormalizer, hashRawPayload } from "../index";
import { T, rawProviderPayload, rawProviderPayloadReordered, validProviderSnapshot } from "./fixtures";

// 3 & 22. Source/raw payload hash is deterministic (same payload → same hash).
test("raw payload hash is deterministic", () => {
  const a = hashRawPayload(rawProviderPayload);
  const b = hashRawPayload(rawProviderPayload);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("different payloads produce different hashes", () => {
  const a = hashRawPayload({ x: 1 });
  const b = hashRawPayload({ x: 2 });
  assert.notEqual(a, b);
});

// 23. Equivalent normalized payload hashes match despite key order differences.
test("equivalent normalized payload hashes match", () => {
  const norm = new GenericProviderNormalizer();
  const one = norm.normalize({
    snapshot: validProviderSnapshot,
    raw: rawProviderPayload,
    now: T,
    candidateId: "cand_x",
  });
  const two = norm.normalize({
    snapshot: validProviderSnapshot,
    raw: rawProviderPayloadReordered,
    now: T + 5000, // masa berbeza — hash mengecualikan created/updated
    candidateId: "cand_x",
  });
  assert.equal(one.candidateHash, two.candidateHash);
  assert.equal(one.errors.length, 0);
});

// Normalisasi mengekalkan "unknown" & tidak mereka fakta.
test("normalizer keeps unknown values explicit and invents nothing", () => {
  const norm = new GenericProviderNormalizer();
  const out = norm.normalize({
    snapshot: validProviderSnapshot,
    raw: { name: "Kedai Kosong" }, // tiada harga/waktu/rating/koordinat
    now: T,
    candidateId: "cand_empty",
  });
  assert.equal(out.candidate.proposedCommercial.priceState, "unknown");
  assert.equal(out.candidate.proposedHours.hoursState, "unknown");
  assert.equal(out.candidate.proposedQuality.rating, undefined);
  assert.equal(out.candidate.proposedLocation.lat, undefined);
  assert.equal(out.candidate.proposedSafetyEvidence.halal.state, "unknown");
});
