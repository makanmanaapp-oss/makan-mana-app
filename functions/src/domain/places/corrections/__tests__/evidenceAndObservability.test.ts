/**
 * Phase 1.14A — ujian kontrak storan bukti + penapisan observability.
 */
import assert from "node:assert/strict";
import {test} from "node:test";

import {redactLogFields} from "../../../../callable/correctionObservability";
import {
  EVIDENCE_LIMITS,
  validateEvidenceCount,
  validateEvidenceMetadata,
} from "../evidenceStorageContract";

const okMeta = {
  ownerUid: "u1",
  submissionId: "sub_1",
  storagePath: "corrections/sub_1/ev_1.jpg",
  contentType: "image/jpeg" as const,
  byteSize: 200_000,
  checksumSha256: "a".repeat(64),
  uploadedAt: 1,
  moderationStatus: "pending_scan" as const,
};

test("valid evidence metadata passes", () => {
  assert.equal(validateEvidenceMetadata(okMeta).valid, true);
});

test("rejects unsupported MIME type", () => {
  const r = validateEvidenceMetadata({...okMeta, contentType: "application/pdf" as never});
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("unsupported_content_type"));
});

test("rejects oversize + undersize files", () => {
  assert.ok(validateEvidenceMetadata({...okMeta, byteSize: EVIDENCE_LIMITS.maxBytes + 1}).errors.includes("file_too_large"));
  assert.ok(validateEvidenceMetadata({...okMeta, byteSize: 1}).errors.includes("file_too_small"));
});

test("rejects path outside the submission folder", () => {
  const r = validateEvidenceMetadata({...okMeta, storagePath: "canonical/place/x.jpg"});
  assert.ok(r.errors.includes("invalid_storage_path"));
});

test("enforces max files per submission", () => {
  assert.equal(validateEvidenceCount(EVIDENCE_LIMITS.maxFilesPerSubmission).valid, true);
  assert.equal(validateEvidenceCount(EVIDENCE_LIMITS.maxFilesPerSubmission + 1).valid, false);
});

test("redactLogFields strips PII/sensitive fields", () => {
  const out = redactLogFields({
    placeId: "p1",
    category: "wrong_name",
    reporterUid: "u1",
    description: "secret",
    lat: 3.1,
    lng: 101.6,
    allergyNotes: "peanut",
    deduplicated: false,
  });
  assert.equal(out.placeId, "p1");
  assert.equal(out.category, "wrong_name");
  assert.equal(out.deduplicated, false);
  assert.equal("reporterUid" in out, false);
  assert.equal("description" in out, false);
  assert.equal("lat" in out, false);
  assert.equal("allergyNotes" in out, false);
});
