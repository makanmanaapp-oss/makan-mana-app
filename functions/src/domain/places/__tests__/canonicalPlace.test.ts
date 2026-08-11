import test from "node:test";
import assert from "node:assert/strict";

import {
  validateCanonicalPlace,
  validateCanonicalTagEvidence,
  validatePlaceAlias,
  validatePlaceCompleteness,
} from "../index";
import {
  completeVerifiedPlace,
  makeBasePlace,
} from "./fixtures";

// 1. Fixture CanonicalPlace sah lulus.
test("valid CanonicalPlace passes", () => {
  const r = validateCanonicalPlace(completeVerifiedPlace);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
});

// 2. placeId hilang gagal.
test("missing placeId fails", () => {
  const p = makeBasePlace();
  p.placeId = "";
  const r = validateCanonicalPlace(p);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "empty_place_id"));
});

// 3. Nama canonical hilang gagal.
test("missing canonical name fails", () => {
  const p = makeBasePlace();
  p.identity.canonicalName = "";
  const r = validateCanonicalPlace(p);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "empty_canonical_name"));
});

// 4. Latitud tidak sah gagal.
test("invalid latitude fails", () => {
  const p = makeBasePlace();
  p.location.lat = 200;
  const r = validateCanonicalPlace(p);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "location_invalid"));
});

// 5. Longitud tidak sah gagal.
test("invalid longitude fails", () => {
  const p = makeBasePlace();
  p.location.lng = 500;
  const r = validateCanonicalPlace(p);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "location_invalid"));
});

// 6. Confidence < 0 gagal.
test("confidence below 0 fails", () => {
  const p = makeBasePlace();
  p.tagSet.tags[0].confidence = -0.1;
  const r = validateCanonicalPlace(p);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "confidence_out_of_range"));
});

// 7. Confidence > 1 gagal.
test("confidence above 1 fails", () => {
  const p = makeBasePlace();
  p.provenance.rating!.confidence = 1.5;
  const r = validateCanonicalPlace(p);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "confidence_out_of_range"));
});

// 8. Komponen completeness luar julat gagal.
test("completeness component out of range fails", () => {
  const p = makeBasePlace();
  p.completeness = { ...p.completeness, tagCompleteness: 1.5 };
  const r = validatePlaceCompleteness(p.completeness);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "completeness_out_of_range"));
});

// 21. Skema alias menyokong keserasian placeId Google semasa.
test("alias schema supports current Google placeId compatibility", () => {
  const alias = completeVerifiedPlace.aliases[0];
  assert.equal(alias.aliasType, "google_place_id");
  assert.equal(alias.canonicalPlaceId, completeVerifiedPlace.placeId);
  const r = validatePlaceAlias(alias);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
});

// 22. Tag canonical menolak confidence tidak sah.
test("canonical tags reject invalid confidence", () => {
  const r = validateCanonicalTagEvidence({
    tagId: "cafe",
    family: "place_type",
    evidenceLevel: "reported",
    confidence: 2,
    sourceType: "community",
  });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "confidence_out_of_range"));
});

// Tambahan: ID tag berbentuk label terjemah ditolak.
test("localized tag id is rejected", () => {
  const r = validateCanonicalTagEvidence({
    tagId: "Nasi Lemak",
    family: "dish",
    evidenceLevel: "reported",
    confidence: 0.5,
    sourceType: "community",
  });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "localized_or_invalid_tag_id"));
});
