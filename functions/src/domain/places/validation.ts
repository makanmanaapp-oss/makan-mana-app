/**
 * Phase 1.2 — pengesahan skema hand-rolled (tiada pergantungan baharu).
 * Setiap validator memulangkan ValidationResult; JANGAN lempar untuk input
 * tidak sah — kumpul isu supaya boleh diaudit.
 */
import {
  ValidationIssue,
  ValidationResult,
  inUnitRange,
  isCanonicalId,
  isMember,
  isNonEmptyString,
  isValidLatLng,
  isValidOptionalTimestamp,
  toResult,
} from "./common";
import {
  EVIDENCE_LEVEL,
  MERGE_STATUS,
  PLACE_STATUS,
  PUBLICATION_STATUS,
  SOURCE_TYPE,
  VERIFICATION_STATUS,
} from "./placeEnums";
import { SourceReference } from "./placeSource";
import { FieldEvidence } from "./placeProvenance";
import { CanonicalTagEvidence, TAG_FAMILIES } from "./placeTags";
import { FRESHNESS_STATE, HOURS_STATE } from "./placeEnums";
import { PRICE_DISPLAY_STATES } from "./placeCommercial";
import { FieldFreshness, PlaceFreshness } from "./placeFreshness";
import { PlaceCompleteness } from "./placeCompleteness";
import { PlaceCardData } from "./placeCardContract";
import { ALIAS_TYPES, MergeState, PlaceAlias } from "./placeMerge";
import { CanonicalPlace } from "./canonicalPlace";

function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

export function validateSourceReference(v: SourceReference): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isMember(SOURCE_TYPE, v.sourceType)) {
    issues.push(issue("sourceType", "invalid_enum", "sourceType tidak sah"));
  }
  if (!isNonEmptyString(v.sourceRecordId)) {
    issues.push(issue("sourceRecordId", "empty", "sourceRecordId kosong"));
  }
  for (const t of ["fetchedAt", "verifiedAt", "expiresAt"] as const) {
    if (!isValidOptionalTimestamp(v[t])) {
      issues.push(issue(t, "invalid_timestamp", `${t} tidak sah`));
    }
  }
  return toResult(issues);
}

export function validateFieldEvidence(
  v: FieldEvidence<unknown>,
  path = "fieldEvidence",
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isMember(SOURCE_TYPE, v.sourceType)) {
    issues.push(issue(`${path}.sourceType`, "invalid_enum", "sourceType"));
  }
  if (!isMember(EVIDENCE_LEVEL, v.evidenceLevel)) {
    issues.push(issue(`${path}.evidenceLevel`, "invalid_enum", "evidenceLevel"));
  }
  if (!inUnitRange(v.confidence)) {
    issues.push(
      issue(`${path}.confidence`, "confidence_out_of_range", "0..1 sahaja"),
    );
  }
  for (const t of ["fetchedAt", "verifiedAt", "expiresAt"] as const) {
    if (!isValidOptionalTimestamp(v[t])) {
      issues.push(issue(`${path}.${t}`, "invalid_timestamp", `${t}`));
    }
  }
  return toResult(issues);
}

export function validateCanonicalTagEvidence(
  v: CanonicalTagEvidence,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isCanonicalId(v.tagId)) {
    // Kesan label terjemah/teks setempat dipakai sebagai kunci DB.
    issues.push(issue("tagId", "localized_or_invalid_tag_id", v.tagId));
  }
  if (!isMember(TAG_FAMILIES, v.family)) {
    issues.push(issue("family", "invalid_enum", "family tag tidak sah"));
  }
  if (!isMember(EVIDENCE_LEVEL, v.evidenceLevel)) {
    issues.push(issue("evidenceLevel", "invalid_enum", "evidenceLevel"));
  }
  if (!isMember(SOURCE_TYPE, v.sourceType)) {
    issues.push(issue("sourceType", "invalid_enum", "sourceType"));
  }
  if (!inUnitRange(v.confidence)) {
    issues.push(issue("confidence", "confidence_out_of_range", "0..1 sahaja"));
  }
  return toResult(issues);
}

function validateFieldFreshness(
  v: FieldFreshness,
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isMember(FRESHNESS_STATE, v.state)) {
    issues.push(issue(`${path}.state`, "invalid_enum", "freshness state"));
  }
  for (const t of ["fetchedAt", "verifiedAt", "staleAfter", "expiresAt"] as const) {
    if (!isValidOptionalTimestamp(v[t])) {
      issues.push(issue(`${path}.${t}`, "invalid_timestamp", `${t}`));
    }
  }
  return issues;
}

export function validatePlaceFreshness(v: PlaceFreshness): ValidationResult {
  const issues: ValidationIssue[] = [];
  for (const [key, entry] of Object.entries(v)) {
    if (entry) issues.push(...validateFieldFreshness(entry, key));
  }
  return toResult(issues);
}

export function validatePlaceCompleteness(
  v: PlaceCompleteness,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const keys: (keyof PlaceCompleteness)[] = [
    "identityCompleteness",
    "locationCompleteness",
    "displayCompleteness",
    "commercialCompleteness",
    "hoursCompleteness",
    "qualityCompleteness",
    "tagCompleteness",
    "provenanceCompleteness",
    "safetyEvidenceCompleteness",
    "overallScore",
  ];
  for (const k of keys) {
    if (!inUnitRange(v[k])) {
      issues.push(issue(k, "completeness_out_of_range", `${k} mesti 0..1`));
    }
  }
  return toResult(issues);
}

export function validatePlaceCardData(v: PlaceCardData): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(v.placeId)) {
    issues.push(issue("placeId", "empty_place_id", "placeId kosong"));
  }
  if (!isNonEmptyString(v.title)) {
    issues.push(issue("title", "empty", "title kosong"));
  }
  if (!isMember(PRICE_DISPLAY_STATES, v.priceState)) {
    issues.push(issue("priceState", "invalid_enum", "priceState"));
  }
  if (!isMember(HOURS_STATE, v.hoursState)) {
    issues.push(issue("hoursState", "invalid_enum", "hoursState"));
  }
  // Rating/ulasan MESTI tiada (undefined) atau nombor terhingga — tiada 0 palsu
  // dibenarkan sebagai proksi "tiada" (itu tanggungjawab pemeta, tapi kami
  // pastikan jenis konsisten di sini).
  if (v.rating !== undefined && !(typeof v.rating === "number" && Number.isFinite(v.rating))) {
    issues.push(issue("rating", "invalid_rating", "rating mesti nombor/undefined"));
  }
  if (
    v.reviewCount !== undefined &&
    !(typeof v.reviewCount === "number" && Number.isFinite(v.reviewCount))
  ) {
    issues.push(issue("reviewCount", "invalid_review_count", "nombor/undefined"));
  }
  if (v.matchScore !== undefined && !(typeof v.matchScore === "number")) {
    issues.push(issue("matchScore", "invalid_match_score", "nombor/undefined"));
  }
  return toResult(issues);
}

export function validatePlaceAlias(v: PlaceAlias): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(v.aliasId)) {
    issues.push(issue("aliasId", "empty", "aliasId kosong"));
  }
  if (!isNonEmptyString(v.canonicalPlaceId)) {
    issues.push(issue("canonicalPlaceId", "empty", "canonicalPlaceId kosong"));
  }
  if (!isMember(ALIAS_TYPES, v.aliasType)) {
    issues.push(issue("aliasType", "invalid_enum", "aliasType"));
  }
  if (!isValidOptionalTimestamp(v.createdAt)) {
    issues.push(issue("createdAt", "invalid_timestamp", "createdAt"));
  }
  return toResult(issues);
}

export function validateMergeState(v: MergeState): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isMember(MERGE_STATUS, v.mergeStatus)) {
    issues.push(issue("mergeStatus", "invalid_enum", "mergeStatus"));
  }
  // Merged/superseded MESTI ada sasaran canonical.
  if (
    (v.mergeStatus === "merged" || v.mergeStatus === "superseded") &&
    !isNonEmptyString(v.duplicateOf)
  ) {
    issues.push(
      issue("duplicateOf", "merge_target_missing", "sasaran canonical hilang"),
    );
  }
  if (v.mergeConfidence !== undefined && !inUnitRange(v.mergeConfidence)) {
    issues.push(
      issue("mergeConfidence", "confidence_out_of_range", "0..1 sahaja"),
    );
  }
  return toResult(issues);
}

export function validateCanonicalPlace(v: CanonicalPlace): ValidationResult {
  const issues: ValidationIssue[] = [];
  const add = (r: ValidationResult, prefix: string) => {
    for (const i of r.issues) {
      issues.push(issue(`${prefix}.${i.path}`, i.code, i.message));
    }
  };

  if (!isNonEmptyString(v.placeId)) {
    issues.push(issue("placeId", "empty_place_id", "placeId kosong"));
  }
  if (!isMember(PLACE_STATUS, v.status)) {
    issues.push(issue("status", "invalid_enum", "status"));
  }
  if (!isMember(VERIFICATION_STATUS, v.verificationStatus)) {
    issues.push(issue("verificationStatus", "invalid_enum", "verificationStatus"));
  }
  if (!isMember(PUBLICATION_STATUS, v.publicationStatus)) {
    issues.push(issue("publicationStatus", "invalid_enum", "publicationStatus"));
  }

  if (!isNonEmptyString(v.identity?.canonicalName)) {
    issues.push(issue("identity.canonicalName", "empty_canonical_name", "kosong"));
  }
  if (!isNonEmptyString(v.identity?.normalizedName)) {
    issues.push(issue("identity.normalizedName", "empty", "kosong"));
  }
  if (!isValidLatLng(v.location?.lat, v.location?.lng)) {
    issues.push(issue("location", "location_invalid", "koordinat tidak sah"));
  }

  (v.providerRefs ?? []).forEach((ref, i) =>
    add(validateSourceReference(ref), `providerRefs[${i}]`),
  );
  (v.tagSet?.tags ?? []).forEach((t, i) =>
    add(validateCanonicalTagEvidence(t), `tagSet.tags[${i}]`),
  );
  for (const [field, ev] of Object.entries(v.provenance ?? {})) {
    if (ev) add(validateFieldEvidence(ev, ""), `provenance.${field}`);
  }
  if (v.completeness) add(validatePlaceCompleteness(v.completeness), "completeness");
  if (v.freshness) add(validatePlaceFreshness(v.freshness), "freshness");
  if (v.mergeState) add(validateMergeState(v.mergeState), "mergeState");
  (v.aliases ?? []).forEach((a, i) => add(validatePlaceAlias(a), `aliases[${i}]`));

  for (const t of ["createdAt", "updatedAt"] as const) {
    if (!(typeof v[t] === "number" && Number.isFinite(v[t]) && v[t] >= 0)) {
      issues.push(issue(t, "invalid_timestamp", `${t} tidak sah`));
    }
  }
  if (!isValidOptionalTimestamp(v.publishedAt)) {
    issues.push(issue("publishedAt", "invalid_timestamp", "publishedAt"));
  }

  return toResult(issues);
}
