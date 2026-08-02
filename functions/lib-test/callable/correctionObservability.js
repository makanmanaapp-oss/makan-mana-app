"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OBSERVABILITY_FORBIDDEN_FIELDS = exports.MIGRATION_METRICS = exports.DRY_RUN_EVENTS = exports.CORRECTION_EVENTS = void 0;
exports.redactLogFields = redactLogFields;
/**
 * Phase 1.14A — pemalar kebolehcerapan (observability) pembetulan + dry-run.
 *
 * Nama peristiwa berstruktur untuk Cloud Logging. Dashboard produksi BELUM
 * diwayarkan (berpagar-pemilik). Senarai PII yang DIKECUALIKAN didokumen supaya
 * log tidak pernah mendedah data sensitif.
 */
exports.CORRECTION_EVENTS = {
    attempt: "correction_attempt",
    success: "correction_success",
    validationFailure: "correction_validation_failure",
    rateLimited: "correction_rate_limited",
    duplicate: "correction_duplicate",
    internalFailure: "correction_internal_failure",
};
exports.DRY_RUN_EVENTS = {
    started: "dry_run_started",
    completed: "dry_run_completed",
    blocked: "dry_run_blocked",
};
exports.MIGRATION_METRICS = {
    safeCandidateCount: "safe_candidate_count",
    heldCandidateCount: "held_candidate_count",
    conflictCandidateCount: "conflict_candidate_count",
    referenceImpactCount: "reference_impact_count",
    rollbackCount: "rollback_count",
};
/**
 * Medan yang TIDAK PERNAH boleh dilog. Digunakan sebagai senarai semak +
 * boleh dirujuk oleh ujian regresi untuk memastikan log kekal selamat.
 */
exports.OBSERVABILITY_FORBIDDEN_FIELDS = [
    "description",
    "descriptionBody",
    "evidence",
    "evidenceContent",
    "proposedValues",
    "reporterUid",
    "uid",
    "email",
    "phone",
    "exactLocation",
    "lat",
    "lng",
    "healthNotes",
    "allergyNotes",
];
/** Tapis objek log supaya medan terlarang tidak pernah dihantar. TULEN. */
function redactLogFields(fields) {
    const out = {};
    for (const [k, v] of Object.entries(fields)) {
        if (exports.OBSERVABILITY_FORBIDDEN_FIELDS.includes(k))
            continue;
        out[k] = v;
    }
    return out;
}
