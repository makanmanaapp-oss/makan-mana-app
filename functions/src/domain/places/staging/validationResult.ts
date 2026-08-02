/** Phase 1.3 — hasil pengesahan + saluran pengesahan calon staging. */
import { EpochMillis } from "../common";
import {
  inUnitRange,
  isCanonicalId,
  isNonEmptyString,
  isValidLatLng,
} from "../common";
import {
  ValidationIssue as CommonIssue,
  ValidationResult as CommonResult,
  isMember,
  toResult,
} from "../common";
import {
  EVIDENCE_LEVEL,
  HALAL_EVIDENCE_STATE,
  HOURS_STATE,
  SOURCE_TYPE,
} from "../placeEnums";
import { PRICE_DISPLAY_STATES } from "../placeCommercial";
import { BATCH_PROCESSING_STATUS } from "./stagingEnums";
import { PlaceImportBatch } from "./importBatch";
import { PlaceSourceSnapshot } from "./sourceSnapshot";
import {
  FORBIDDEN_PUBLICATION_FIELDS,
  NormalizedPlaceCandidate,
} from "./normalizedCandidate";

export interface PlaceValidationIssue {
  code: string;
  fieldPath: string;
  severity: "error" | "warning";
  messageKey: string;
  metadata?: Record<string, unknown>;
}

export interface PlaceValidationResult {
  valid: boolean;
  errors: PlaceValidationIssue[];
  warnings: PlaceValidationIssue[];
  checkedRules: string[];
  validatorVersion: string;
  validatedAt: EpochMillis;
}

export const STAGING_VALIDATOR_VERSION = "staging-validator-v1";

const RULES = [
  "candidate_id_present",
  "source_snapshot_present",
  "proposed_name_present",
  "coordinates_valid_if_supplied",
  "source_metadata_present",
  "confidence_valid",
  "no_publication_fields",
  "rating_bounds",
  "review_count_non_negative",
  "price_state_valid",
  "hours_state_valid",
  "tag_ids_canonical",
  "safety_matches_evidence",
  "timestamps_valid",
];

function err(
  code: string,
  fieldPath: string,
  messageKey: string,
  metadata?: Record<string, unknown>,
): PlaceValidationIssue {
  return { code, fieldPath, severity: "error", messageKey, metadata };
}

/**
 * Adakah calon MENDAKWA keselamatan alahan? Secara reka bentuk TIDAK ADA
 * medan sedemikian — keselamatan alahan tidak boleh disimpulkan daripada
 * ketiadaan data. Sentiasa pulang false (digunakan oleh ujian 12).
 */
export function assertsAllergenSafety(_c: NormalizedPlaceCandidate): boolean {
  return false;
}

/** Sahkan bukti halal tidak melebihi tahap evidence. */
function halalClaimValid(state: string, level: string): boolean {
  if (state === "certified") return level === "verified";
  if (state === "merchant_claimed") return level === "reported" || level === "verified";
  if (state === "community_reported") return level !== "unknown";
  // "unknown" / "possible_non_halal" — sebarang tahap dibenarkan.
  return true;
}

export function validateNormalizedCandidate(
  candidate: NormalizedPlaceCandidate,
  opts: { now: EpochMillis; snapshotExists?: boolean },
): PlaceValidationResult {
  const errors: PlaceValidationIssue[] = [];
  const warnings: PlaceValidationIssue[] = [];

  if (!isNonEmptyString(candidate.candidateId)) {
    errors.push(err("candidate_id_missing", "candidateId", "err_candidate_id"));
  }
  if (!isNonEmptyString(candidate.sourceSnapshotId)) {
    errors.push(err("source_snapshot_missing", "sourceSnapshotId", "err_snapshot"));
  }
  if (opts.snapshotExists === false) {
    errors.push(err("source_snapshot_not_found", "sourceSnapshotId", "err_snapshot_missing"));
  }
  if (!isNonEmptyString(candidate.proposedIdentity?.canonicalName)) {
    errors.push(err("name_empty", "proposedIdentity.canonicalName", "err_name"));
  }

  const { lat, lng } = candidate.proposedLocation ?? {};
  if (lat !== undefined || lng !== undefined) {
    if (!isValidLatLng(lat, lng)) {
      errors.push(err("coordinates_invalid", "proposedLocation", "err_coords"));
    }
  }

  if (!candidate.sourceSnapshotId) {
    errors.push(err("source_metadata_missing", "sourceSnapshotId", "err_source_meta"));
  }

  if (!inUnitRange(candidate.candidateConfidence)) {
    errors.push(err("confidence_out_of_range", "candidateConfidence", "err_confidence"));
  }

  const asRecord = candidate as unknown as Record<string, unknown>;
  for (const f of FORBIDDEN_PUBLICATION_FIELDS) {
    if (asRecord[f] !== undefined) {
      errors.push(err("publication_field_present", f, "err_pub_field"));
    }
  }

  const rating = candidate.proposedQuality?.rating;
  if (rating !== undefined) {
    if (!(typeof rating === "number" && rating >= 0 && rating <= 5)) {
      errors.push(err("rating_out_of_bounds", "proposedQuality.rating", "err_rating"));
    }
  }
  const reviewCount = candidate.proposedQuality?.reviewCount;
  if (reviewCount !== undefined) {
    if (!(typeof reviewCount === "number" && reviewCount >= 0)) {
      errors.push(err("review_count_negative", "proposedQuality.reviewCount", "err_reviews"));
    }
  }

  if (!(PRICE_DISPLAY_STATES as readonly string[]).includes(candidate.proposedCommercial?.priceState)) {
    errors.push(err("price_state_invalid", "proposedCommercial.priceState", "err_price"));
  }
  if (!(HOURS_STATE as readonly string[]).includes(candidate.proposedHours?.hoursState)) {
    errors.push(err("hours_state_invalid", "proposedHours.hoursState", "err_hours"));
  }

  for (const [i, t] of (candidate.proposedTags?.tags ?? []).entries()) {
    if (!isCanonicalId(t.tagId)) {
      errors.push(err("tag_id_localized", `proposedTags.tags[${i}].tagId`, "err_tag_id"));
    }
  }

  const halal = candidate.proposedSafetyEvidence?.halal;
  if (halal) {
    if (!(HALAL_EVIDENCE_STATE as readonly string[]).includes(halal.state)) {
      errors.push(err("halal_state_invalid", "safetyEvidence.halal.state", "err_halal_state"));
    } else if (!(EVIDENCE_LEVEL as readonly string[]).includes(halal.evidenceLevel)) {
      errors.push(err("halal_evidence_invalid", "safetyEvidence.halal.evidenceLevel", "err_halal_ev"));
    } else if (!halalClaimValid(halal.state, halal.evidenceLevel)) {
      errors.push(
        err("halal_claim_exceeds_evidence", "safetyEvidence.halal", "err_halal_claim"),
      );
    }
  }

  for (const [field, value] of Object.entries({
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  })) {
    if (!(typeof value === "number" && Number.isFinite(value) && value >= 0)) {
      errors.push(err("timestamp_invalid", field, "err_timestamp"));
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checkedRules: RULES,
    validatorVersion: STAGING_VALIDATOR_VERSION,
    validatedAt: opts.now,
  };
}

function ci(path: string, code: string, message: string): CommonIssue {
  return { path, code, message };
}

/** Sahkan batch import (skema ringan). */
export function validateImportBatch(b: PlaceImportBatch): CommonResult {
  const issues: CommonIssue[] = [];
  if (!isNonEmptyString(b.importBatchId)) {
    issues.push(ci("importBatchId", "empty", "importBatchId kosong"));
  }
  if (!isMember(SOURCE_TYPE, b.sourceType)) {
    issues.push(ci("sourceType", "invalid_enum", "sourceType tidak sah"));
  }
  if (!isNonEmptyString(b.importedBy)) {
    issues.push(ci("importedBy", "empty", "importedBy kosong"));
  }
  if (!(typeof b.recordCount === "number" && b.recordCount >= 0)) {
    issues.push(ci("recordCount", "invalid", "recordCount tidak sah"));
  }
  if (!isMember(BATCH_PROCESSING_STATUS, b.processingStatus)) {
    issues.push(ci("processingStatus", "invalid_enum", "status tidak sah"));
  }
  return toResult(issues);
}

/** Sahkan snapshot sumber (skema ringan). Satu snapshot = satu sourceType. */
export function validateSourceSnapshot(s: PlaceSourceSnapshot): CommonResult {
  const issues: CommonIssue[] = [];
  if (!isNonEmptyString(s.snapshotId)) {
    issues.push(ci("snapshotId", "empty", "snapshotId kosong"));
  }
  if (!isMember(SOURCE_TYPE, s.sourceType)) {
    issues.push(ci("sourceType", "invalid_enum", "sourceType tidak sah"));
  }
  if (!isNonEmptyString(s.sourceRecordId)) {
    issues.push(ci("sourceRecordId", "empty", "sourceRecordId kosong"));
  }
  if (!isNonEmptyString(s.rawPayloadHash)) {
    issues.push(ci("rawPayloadHash", "empty", "rawPayloadHash kosong"));
  }
  return toResult(issues);
}
