/**
 * Phase 1.11 Part I — PENGESAHAN TULEN.
 *
 * Menolak penghantaran yang cuba menetapkan keadaan dipercayai, cadangan
 * kosong, medan tidak disokong, atau data yang melanggar peraturan kategori.
 */
import { isValidLatLng } from "../common";
import { getCategoryRule } from "./correctionCategories";
import {
  CLIENT_FORBIDDEN_SUBMISSION_FIELDS,
  CLIENT_SETTABLE_STATUSES,
  CORRECTABLE_FIELDS,
  CorrectableField,
  EVIDENCE_TYPES,
  PlaceCorrectionProposal,
  PlaceCorrectionSubmission,
  PlaceReportEvidence,
  PlaceReportOriginalSnapshot,
  REPORT_CATEGORIES,
  ReportCategory,
  SUBMISSION_TYPES,
} from "./correctionTypes";
import { CorrectionLimits, DEFAULT_CORRECTION_LIMITS } from "./correctionDedup";

export interface CorrectionValidationResult {
  valid: boolean;
  errors: readonly string[];
  warnings: readonly string[];
}

const ok = (warnings: string[] = []): CorrectionValidationResult => ({
  valid: true,
  errors: [],
  warnings,
});
const fail = (errors: string[], warnings: string[] = []): CorrectionValidationResult => ({
  valid: false,
  errors: [...new Set(errors)],
  warnings,
});

/** Nombor telefon Malaysia/antarabangsa asas — longgar tetapi bukan sampah. */
const PHONE_RE = /^\+?[0-9][0-9\s-]{6,19}$/;

/** Pengesahan URL sintaksis sahaja (tiada capaian rangkaian). */
export function isSyntacticallyValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Cadangan dianggap kosong bila tiada medan bermakna diisi. */
export function isEmptyProposal(proposal: PlaceCorrectionProposal): boolean {
  return Object.entries(proposal).every(([, value]) => {
    if (value === undefined || value === null) return true;
    if (typeof value === "string") return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  });
}

/** Sahkan bahawa hanya medan yang disokong hadir. */
export function validateCorrectionProposal(
  proposal: PlaceCorrectionProposal,
): CorrectionValidationResult {
  const errors: string[] = [];
  const supported = new Set<string>(CORRECTABLE_FIELDS);

  for (const key of Object.keys(proposal)) {
    if (!supported.has(key)) errors.push(`unsupported_field:${key}`);
  }
  if (isEmptyProposal(proposal)) errors.push("empty_correction");

  if (proposal.coordinates && !isValidLatLng(proposal.coordinates.lat, proposal.coordinates.lng)) {
    errors.push("invalid_coordinates");
  }
  if (
    proposal.movedToCoordinates &&
    !isValidLatLng(proposal.movedToCoordinates.lat, proposal.movedToCoordinates.lng)
  ) {
    errors.push("invalid_moved_coordinates");
  }
  if (proposal.phone !== undefined && !PHONE_RE.test(proposal.phone.trim())) {
    errors.push("invalid_phone_format");
  }
  if (proposal.website !== undefined && !isSyntacticallyValidUrl(proposal.website.trim())) {
    errors.push("invalid_website_url");
  }
  if (proposal.displayName !== undefined && proposal.displayName.trim().length === 0) {
    errors.push("empty_display_name");
  }
  if (proposal.duplicateTargetPlaceId !== undefined && !proposal.duplicateTargetPlaceId.trim()) {
    errors.push("empty_duplicate_target");
  }

  return errors.length ? fail(errors) : ok();
}

export function validatePlaceReportEvidence(
  evidence: PlaceReportEvidence,
): CorrectionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!evidence.evidenceId?.trim()) errors.push("evidence_id_required");
  if (!(EVIDENCE_TYPES as readonly string[]).includes(evidence.evidenceType)) {
    errors.push("unsupported_evidence_type");
  }
  if (!(evidence.confidence >= 0 && evidence.confidence <= 1)) {
    errors.push("confidence_out_of_range");
  }
  if (evidence.location && !isValidLatLng(evidence.location.lat, evidence.location.lng)) {
    errors.push("invalid_evidence_location");
  }
  if (evidence.evidenceType === "website_link") {
    const link = evidence.sourceReference ?? "";
    if (!isSyntacticallyValidUrl(link)) errors.push("invalid_evidence_url");
  }
  if (evidence.fileMetadata) {
    if (!evidence.fileMetadata.fileName.trim()) errors.push("evidence_file_name_required");
    if (evidence.fileMetadata.byteSize <= 0) errors.push("evidence_file_size_invalid");
    // Metadata EXIF mentah tidak boleh keluar ke UI awam.
    if (!evidence.fileMetadata.exifStripped) errors.push("evidence_exif_must_be_stripped");
  }
  if (evidence.observedAt !== undefined && !Number.isFinite(evidence.observedAt)) {
    errors.push("invalid_observed_at");
  }
  if (evidence.capturedAt !== undefined && !Number.isFinite(evidence.capturedAt)) {
    errors.push("invalid_captured_at");
  }
  // Foto sijil TIDAK membuktikan kesahihan dengan sendirinya.
  if (evidence.evidenceType === "certificate_photo" && evidence.status === "accepted") {
    warnings.push("certificate_photo_requires_manual_verification");
  }
  // Pemerhatian pengguna kekal sebagai bukti DILAPORKAN.
  if (evidence.evidenceType === "user_observation") {
    warnings.push("user_observation_remains_reported_evidence");
  }

  return errors.length ? fail(errors, warnings) : ok(warnings);
}

export function validateOriginalSnapshot(
  snapshot: PlaceReportOriginalSnapshot | undefined,
): CorrectionValidationResult {
  if (!snapshot) return fail(["original_snapshot_required"]);
  const errors: string[] = [];
  if (!snapshot.placeId?.trim()) errors.push("snapshot_place_id_required");
  if (!snapshot.title?.trim()) errors.push("snapshot_title_required");
  if (!snapshot.contentHash?.trim()) errors.push("snapshot_content_hash_required");
  if (!Number.isFinite(snapshot.capturedAt)) errors.push("snapshot_captured_at_invalid");
  if (snapshot.coordinates && !isValidLatLng(snapshot.coordinates.lat, snapshot.coordinates.lng)) {
    errors.push("snapshot_coordinates_invalid");
  }
  return errors.length ? fail(errors) : ok();
}

/** Sahkan keperluan khusus kategori (Part B). */
export function validateReportCategoryRequirements(
  category: ReportCategory,
  input: {
    proposal: PlaceCorrectionProposal;
    evidence: readonly PlaceReportEvidence[];
    affectedFields: readonly CorrectableField[];
  },
): CorrectionValidationResult {
  if (!(REPORT_CATEGORIES as readonly string[]).includes(category)) {
    return fail([`unsupported_category:${category}`]);
  }
  const rule = getCategoryRule(category);
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const field of rule.requiredFields) {
    const value = (input.proposal as Record<string, unknown>)[field];
    const missing =
      value === undefined ||
      (typeof value === "string" && !value.trim()) ||
      (Array.isArray(value) && value.length === 0);
    if (missing) errors.push(`required_field_missing:${field}`);
  }

  if (input.evidence.length < rule.minimumEvidence) {
    errors.push(`minimum_evidence_required:${rule.minimumEvidence}`);
  }

  if (rule.requiresObservationDate) {
    const hasObservation = input.evidence.some((e) => e.observedAt !== undefined);
    if (!hasObservation) errors.push("observation_date_required");
  }

  if (rule.requiresDuplicateTarget && !input.proposal.duplicateTargetPlaceId?.trim()) {
    errors.push("duplicate_target_place_required");
  }

  // Kategori laporan-sahaja tidak menerima nilai cadangan tepat.
  if (!rule.allowsExactProposedValue) {
    const proposedNonNote = Object.keys(input.proposal).filter(
      (k) => k !== "notes" && !rule.requiredFields.includes(k as CorrectableField),
    );
    if (proposedNonNote.length > 0) {
      warnings.push("exact_proposed_value_not_used_for_this_category");
    }
  }

  if (rule.safetySensitive) {
    warnings.push("safety_sensitive_requires_trusted_review");
  }
  if (rule.automaticActionForbidden) {
    warnings.push("automatic_action_forbidden_for_this_category");
  }

  return errors.length ? fail(errors, warnings) : ok(warnings);
}

/** Input klien — sengaja mengecualikan setiap medan yang dipercayai. */
export interface ClientSubmissionInput {
  placeId: string;
  submissionType: string;
  category: string;
  affectedFields: readonly string[];
  originalSnapshot?: PlaceReportOriginalSnapshot;
  proposedValues: PlaceCorrectionProposal;
  evidence: readonly PlaceReportEvidence[];
  description: string;
  severity?: string;
  status?: string;
  /** Sebarang medan tambahan dianggap percubaan menetapkan keadaan dipercayai. */
  [extra: string]: unknown;
}

/**
 * Pengesahan penuh bagi penghantaran yang datang daripada klien.
 *
 * Menolak: placeId tiada, snapshot tiada, cadangan kosong, kategori tidak
 * disokong, koordinat/URL/telefon tidak sah, penerangan terlalu panjang/pendek,
 * bukti melebihi had, dan SEBARANG cubaan menetapkan medan dipercayai.
 */
export function validatePlaceCorrectionSubmission(
  input: ClientSubmissionInput,
  limits: CorrectionLimits = DEFAULT_CORRECTION_LIMITS,
): CorrectionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.placeId?.trim()) errors.push("place_id_required");

  if (!(SUBMISSION_TYPES as readonly string[]).includes(input.submissionType)) {
    errors.push("unsupported_submission_type");
  }
  if (!(REPORT_CATEGORIES as readonly string[]).includes(input.category)) {
    errors.push("unsupported_category");
  }

  // Medan dipercayai TIDAK PERNAH boleh datang daripada klien.
  for (const forbidden of CLIENT_FORBIDDEN_SUBMISSION_FIELDS) {
    if (input[forbidden] !== undefined) errors.push(`client_cannot_set:${forbidden}`);
  }
  if (input.reviewedBy !== undefined || input.assignedReviewer !== undefined) {
    errors.push("client_cannot_set_reviewer_identity");
  }
  if (input.publicationStatus !== undefined || input.verificationStatus !== undefined) {
    errors.push("client_cannot_set_publication_or_verification_state");
  }
  if (input.approvalState !== undefined) errors.push("client_cannot_set_approved_state");
  if (input.status !== undefined && !CLIENT_SETTABLE_STATUSES.includes(input.status as never)) {
    errors.push(`client_cannot_set_status:${input.status}`);
  }

  const snapshotResult = validateOriginalSnapshot(input.originalSnapshot);
  errors.push(...snapshotResult.errors);

  const description = input.description ?? "";
  if (description.trim().length < limits.minDescriptionLength) {
    errors.push("description_too_short");
  }
  if (description.length > limits.maxDescriptionLength) {
    errors.push("description_too_long");
  }

  if (input.evidence.length > limits.maxEvidenceItems) {
    errors.push("too_many_evidence_items");
  }
  for (const evidence of input.evidence) {
    const result = validatePlaceReportEvidence(evidence);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  const unsupportedFields = input.affectedFields.filter(
    (f) => !(CORRECTABLE_FIELDS as readonly string[]).includes(f),
  );
  for (const field of unsupportedFields) errors.push(`unsupported_affected_field:${field}`);

  const proposalResult = validateCorrectionProposal(input.proposedValues);
  errors.push(...proposalResult.errors);

  if ((REPORT_CATEGORIES as readonly string[]).includes(input.category)) {
    const categoryResult = validateReportCategoryRequirements(input.category as ReportCategory, {
      proposal: input.proposedValues,
      evidence: input.evidence,
      affectedFields: input.affectedFields as readonly CorrectableField[],
    });
    errors.push(...categoryResult.errors);
    warnings.push(...categoryResult.warnings);
  }

  return errors.length ? fail(errors, warnings) : ok(warnings);
}

/**
 * Bukti bahawa penghantaran tersimpan tidak pernah mendakwa keadaan disahkan.
 * Digunakan oleh ujian sebagai pengawal regresi.
 */
export function submissionClaimsVerifiedState(
  submission: PlaceCorrectionSubmission,
): boolean {
  return (
    submission.status === "accepted_for_staging" &&
    submission.stagingProposalId === undefined &&
    submission.reviewedBy === undefined
  );
}
