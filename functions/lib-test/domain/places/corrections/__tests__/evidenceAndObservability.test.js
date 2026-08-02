"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.14A — ujian kontrak storan bukti + penapisan observability.
 */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const correctionObservability_1 = require("../../../../callable/correctionObservability");
const evidenceStorageContract_1 = require("../evidenceStorageContract");
const okMeta = {
    ownerUid: "u1",
    submissionId: "sub_1",
    storagePath: "corrections/sub_1/ev_1.jpg",
    contentType: "image/jpeg",
    byteSize: 200_000,
    checksumSha256: "a".repeat(64),
    uploadedAt: 1,
    moderationStatus: "pending_scan",
};
(0, node_test_1.test)("valid evidence metadata passes", () => {
    strict_1.default.equal((0, evidenceStorageContract_1.validateEvidenceMetadata)(okMeta).valid, true);
});
(0, node_test_1.test)("rejects unsupported MIME type", () => {
    const r = (0, evidenceStorageContract_1.validateEvidenceMetadata)({ ...okMeta, contentType: "application/pdf" });
    strict_1.default.equal(r.valid, false);
    strict_1.default.ok(r.errors.includes("unsupported_content_type"));
});
(0, node_test_1.test)("rejects oversize + undersize files", () => {
    strict_1.default.ok((0, evidenceStorageContract_1.validateEvidenceMetadata)({ ...okMeta, byteSize: evidenceStorageContract_1.EVIDENCE_LIMITS.maxBytes + 1 }).errors.includes("file_too_large"));
    strict_1.default.ok((0, evidenceStorageContract_1.validateEvidenceMetadata)({ ...okMeta, byteSize: 1 }).errors.includes("file_too_small"));
});
(0, node_test_1.test)("rejects path outside the submission folder", () => {
    const r = (0, evidenceStorageContract_1.validateEvidenceMetadata)({ ...okMeta, storagePath: "canonical/place/x.jpg" });
    strict_1.default.ok(r.errors.includes("invalid_storage_path"));
});
(0, node_test_1.test)("enforces max files per submission", () => {
    strict_1.default.equal((0, evidenceStorageContract_1.validateEvidenceCount)(evidenceStorageContract_1.EVIDENCE_LIMITS.maxFilesPerSubmission).valid, true);
    strict_1.default.equal((0, evidenceStorageContract_1.validateEvidenceCount)(evidenceStorageContract_1.EVIDENCE_LIMITS.maxFilesPerSubmission + 1).valid, false);
});
(0, node_test_1.test)("redactLogFields strips PII/sensitive fields", () => {
    const out = (0, correctionObservability_1.redactLogFields)({
        placeId: "p1",
        category: "wrong_name",
        reporterUid: "u1",
        description: "secret",
        lat: 3.1,
        lng: 101.6,
        allergyNotes: "peanut",
        deduplicated: false,
    });
    strict_1.default.equal(out.placeId, "p1");
    strict_1.default.equal(out.category, "wrong_name");
    strict_1.default.equal(out.deduplicated, false);
    strict_1.default.equal("reporterUid" in out, false);
    strict_1.default.equal("description" in out, false);
    strict_1.default.equal("lat" in out, false);
    strict_1.default.equal("allergyNotes" in out, false);
});
