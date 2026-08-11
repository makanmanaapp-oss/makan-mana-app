/**
 * Phase 1.14A — pemalar kebolehcerapan (observability) pembetulan + dry-run.
 *
 * Nama peristiwa berstruktur untuk Cloud Logging. Dashboard produksi BELUM
 * diwayarkan (berpagar-pemilik). Senarai PII yang DIKECUALIKAN didokumen supaya
 * log tidak pernah mendedah data sensitif.
 */
export const CORRECTION_EVENTS = {
  attempt: "correction_attempt",
  success: "correction_success",
  validationFailure: "correction_validation_failure",
  rateLimited: "correction_rate_limited",
  duplicate: "correction_duplicate",
  internalFailure: "correction_internal_failure",
} as const;

export const DRY_RUN_EVENTS = {
  started: "dry_run_started",
  completed: "dry_run_completed",
  blocked: "dry_run_blocked",
} as const;

export const MIGRATION_METRICS = {
  safeCandidateCount: "safe_candidate_count",
  heldCandidateCount: "held_candidate_count",
  conflictCandidateCount: "conflict_candidate_count",
  referenceImpactCount: "reference_impact_count",
  rollbackCount: "rollback_count",
} as const;

/**
 * Medan yang TIDAK PERNAH boleh dilog. Digunakan sebagai senarai semak +
 * boleh dirujuk oleh ujian regresi untuk memastikan log kekal selamat.
 */
export const OBSERVABILITY_FORBIDDEN_FIELDS = [
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
] as const;

/** Tapis objek log supaya medan terlarang tidak pernah dihantar. TULEN. */
export function redactLogFields<T extends Record<string, unknown>>(fields: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(fields)) {
    if ((OBSERVABILITY_FORBIDDEN_FIELDS as readonly string[]).includes(k)) continue;
    out[k as keyof T] = v as T[keyof T];
  }
  return out;
}
