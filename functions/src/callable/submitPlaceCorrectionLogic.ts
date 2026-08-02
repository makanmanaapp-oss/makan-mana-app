/**
 * Phase 1.14A — logik TULEN untuk callable submitPlaceCorrection.
 *
 * Dipisahkan daripada wrapper onCall supaya boleh diuji unit tanpa Firebase.
 * TIDAK menulis apa-apa: penyimpanan disuntik melalui `deps`. Menggunakan
 * SEMULA domain pembetulan Phase 1.11 (validasi, dedup, had kadar, kategori).
 *
 * KESELAMATAN: nilai dipercayai (uid, masa, status, id) TIDAK PERNAH datang
 * daripada klien — ia diperoleh di sini/pada wrapper. Medan dipercayai yang
 * dibekalkan klien ditolak oleh validasi domain.
 */
import {createHash} from "crypto";

import {EpochMillis} from "../domain/places/common";
import {
  CORRECTION_ALGORITHM_VERSION,
  CORRECTION_SCHEMA_VERSION,
  ClientSubmissionInput,
  CorrectableField,
  CorrectionLimits,
  DEFAULT_CORRECTION_LIMITS,
  PlaceCorrectionAuditEntry,
  PlaceCorrectionProposal,
  PlaceCorrectionSubmission,
  PlaceReportOriginalSnapshot,
  REPORT_CATEGORIES,
  ReportCategory,
  ReportSeverity,
  SubmissionType,
  dedupKeyFor,
  evaluateRateLimit,
  findOpenDuplicate,
  getCategoryRule,
  validatePlaceCorrectionSubmission,
} from "../domain/places/corrections";

// ---------------------------------------------------------------------------
// Jenis permintaan/respons callable (kontrak klien)
// ---------------------------------------------------------------------------

export const CANONICAL_CORRECTION_TYPES = [
  "incorrect_name",
  "incorrect_address",
  "incorrect_hours",
  "temporarily_closed",
  "permanently_closed",
  "duplicate_place",
  "wrong_branch",
  "moved_place",
  "incorrect_halal_information",
  "incorrect_price",
  "incorrect_image",
  "incorrect_category",
  "other",
] as const;
export type CanonicalCorrectionType = (typeof CANONICAL_CORRECTION_TYPES)[number];

/** Peta jenis kanonikal (kontrak klien) -> kategori domain Phase 1.11. */
export const CATEGORY_MAP: Readonly<Record<CanonicalCorrectionType, ReportCategory>> = {
  incorrect_name: "wrong_name",
  incorrect_address: "wrong_address",
  incorrect_hours: "wrong_hours",
  temporarily_closed: "temporarily_closed",
  permanently_closed: "permanently_closed",
  duplicate_place: "duplicate_place",
  wrong_branch: "duplicate_place",
  moved_place: "moved_location",
  incorrect_halal_information: "wrong_halal_status",
  incorrect_price: "wrong_price",
  incorrect_image: "wrong_image",
  incorrect_category: "wrong_cuisine",
  other: "other",
};

export const SUPPORTED_LOCALES = ["ms", "en", "zh", "ta"] as const;

export interface CorrectionCallableRequest {
  placeId?: unknown;
  correctionType?: unknown;
  currentValue?: unknown;
  proposedValue?: unknown;
  description?: unknown;
  evidenceRefs?: unknown;
  locale?: unknown;
  clientRequestId?: unknown;
}

export const CALLABLE_ERROR_CODES = [
  "unauthenticated",
  "app_check_required",
  "invalid_argument",
  "unsupported_type",
  "invalid_place",
  "description_too_short",
  "description_too_long",
  "invalid_evidence",
  "rate_limited",
  "duplicate_submission",
  "unavailable",
  "internal",
] as const;
export type CallableErrorCode = (typeof CALLABLE_ERROR_CODES)[number];

export interface CorrectionCallableResponse {
  success: boolean;
  trackingId: string;
  status: string;
  submittedAt: EpochMillis;
  messageCode: string;
  deduplicated: boolean;
}

/** Ralat berkod selamat (tiada jejak tindanan / laluan dokumen dipercayai). */
export class CorrectionCallableError extends Error {
  constructor(public readonly code: CallableErrorCode, message?: string) {
    super(message ?? code);
    this.name = "CorrectionCallableError";
  }
}

// ---------------------------------------------------------------------------
// Sanitisasi + pemetaan permintaan -> input domain
// ---------------------------------------------------------------------------

const MAX_RAW_TEXT = 4000; // topi keras sebelum validasi domain (elak abuse)

function asTrimmedString(v: unknown, max = MAX_RAW_TEXT): string {
  if (typeof v !== "string") return "";
  // Buang aksara kawalan (0x00-0x1F, 0x7F) tanpa literal kawalan dalam sumber.
  let out = "";
  for (const ch of v) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x20 || c === 0x7f) continue;
    out += ch;
  }
  return out.slice(0, max).trim();
}

/** Bina snapshot MINIMAL daripada nilai semasa yang diisytihar klien.
 *  NOTA: server BELUM menderi semula daripada rekod canonical (adapter baca
 *  Phase 1.14 berpagar-pemilik). Snapshot ini kekal "diisytihar klien". */
function minimalSnapshot(placeId: string, currentValue: string, now: EpochMillis): PlaceReportOriginalSnapshot {
  const title = currentValue || placeId;
  const contentHash = createHash("sha256").update(`${placeId}|${currentValue}`).digest("hex").slice(0, 32);
  return {
    placeId,
    title,
    hoursState: "hours_unknown",
    priceState: "price_unknown",
    ratingState: "rating_hidden",
    businessState: "status_unknown",
    halalState: "halal_unknown",
    dietaryState: "dietary_unknown",
    allergenState: "allergen_unknown",
    imageReferences: [],
    tagIds: [],
    warnings: [],
    sourceMode: "live",
    capturedAt: now,
    contentHash,
  };
}

function buildProposal(
  field: CorrectableField,
  proposedValue: string,
  currentValue: string,
  description: string,
): PlaceCorrectionProposal {
  switch (field) {
    case "displayName":
      return {displayName: proposedValue};
    case "address":
      return {address: proposedValue};
    case "phone":
      return {phone: proposedValue};
    case "website":
      return {website: proposedValue};
    case "openingHours":
      return {openingHours: proposedValue};
    case "price":
      return {price: proposedValue};
    case "businessStatus":
      return {businessStatus: proposedValue};
    case "halalEvidence":
      return {halalEvidence: proposedValue};
    case "dietaryEvidence":
      return {dietaryEvidence: [proposedValue]};
    case "allergenEvidence":
      return {allergenEvidence: [proposedValue]};
    case "cuisineTagIds":
      return {cuisineTagIds: [proposedValue]};
    case "placeTypeTagIds":
      return {placeTypeTagIds: [proposedValue]};
    case "duplicateTargetPlaceId":
      return {duplicateTargetPlaceId: proposedValue};
    case "imageRemovalRequest":
      return {imageRemovalRequest: {imageReference: currentValue || proposedValue, reason: description || "reported"}};
    case "notes":
      return {notes: proposedValue};
    case "coordinates":
    case "movedToCoordinates": {
      const parts = proposedValue.split(",").map((p) => Number(p.trim()));
      if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
        const coord = {lat: parts[0], lng: parts[1]};
        return field === "coordinates" ? {coordinates: coord} : {movedToCoordinates: coord};
      }
      return {notes: proposedValue};
    }
    default:
      return {notes: proposedValue};
  }
}

/**
 * Peta permintaan callable -> ClientSubmissionInput domain. Membuang medan
 * tidak dikenali; TIDAK menerima medan dipercayai. Melempar CorrectionCallableError
 * berkod untuk input yang jelas rosak sebelum validasi domain penuh.
 *
 * Bukti (evidenceRefs) DITANGGUH ke kontrak Storan Part D — fasa ini menghantar
 * array bukti kosong. Kategori yang memerlukan bukti akan gagal validasi dengan
 * kod `invalid_evidence` (jujur), sehingga muat naik bukti dilaksanakan.
 */
export function mapCorrectionRequest(
  req: CorrectionCallableRequest,
  now: EpochMillis,
): ClientSubmissionInput {
  const placeId = asTrimmedString(req.placeId, 200);
  if (!placeId) throw new CorrectionCallableError("invalid_place", "place_id_required");

  // Terima jenis KANONIKAL (kontrak klien) ATAU kategori domain (enum klien Dart).
  const rawType = asTrimmedString(req.correctionType, 64);
  let category: ReportCategory;
  if ((CANONICAL_CORRECTION_TYPES as readonly string[]).includes(rawType)) {
    category = CATEGORY_MAP[rawType as CanonicalCorrectionType];
  } else if ((REPORT_CATEGORIES as readonly string[]).includes(rawType)) {
    category = rawType as ReportCategory;
  } else {
    throw new CorrectionCallableError("unsupported_type", `unsupported_type:${rawType}`);
  }
  const rule = getCategoryRule(category);
  const submissionType: SubmissionType = rule.submissionType;

  const proposedValue = asTrimmedString(req.proposedValue, 1000);
  const currentValue = asTrimmedString(req.currentValue, 1000);
  const description = asTrimmedString(req.description, 2000);

  const primaryField: CorrectableField = (rule.requiredFields[0] as CorrectableField) ?? "notes";
  const affectedFields: CorrectableField[] = rule.requiredFields.length ? [...rule.requiredFields] : ["notes"];
  const proposedValues = rule.allowsExactProposedValue || primaryField === "notes"
    ? buildProposal(primaryField, proposedValue || description, currentValue, description)
    : {notes: description || proposedValue};

  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(asTrimmedString(req.locale, 8))
    ? asTrimmedString(req.locale, 8)
    : "ms";

  const input: ClientSubmissionInput = {
    placeId,
    submissionType,
    category,
    affectedFields,
    originalSnapshot: minimalSnapshot(placeId, currentValue, now),
    proposedValues,
    evidence: [],
    description,
    clientMetadata: {
      appVersion: "callable",
      platform: "callable",
      locale,
      surface: "canonical_detail",
    },
  } as ClientSubmissionInput;
  return input;
}

// ---------------------------------------------------------------------------
// Pemetaan ralat validasi domain -> kod selamat
// ---------------------------------------------------------------------------

export function toSafeErrorCode(errors: readonly string[]): CallableErrorCode {
  const has = (p: string) => errors.some((e) => e === p || e.startsWith(`${p}:`) || e.startsWith(p));
  if (has("place_id_required") || has("place_id") || has("invalid_place")) return "invalid_place";
  if (has("unsupported_category") || has("unsupported_submission_type") || has("unsupported_affected_field")) {
    return "unsupported_type";
  }
  if (has("description_too_short")) return "description_too_short";
  if (has("description_too_long")) return "description_too_long";
  if (has("too_many_evidence_items") || has("evidence")) return "invalid_evidence";
  return "invalid_argument";
}

// ---------------------------------------------------------------------------
// ID penjejakan tidak boleh diteka
// ---------------------------------------------------------------------------

export function makeTrackingId(submissionId: string, salt: string): string {
  const h = createHash("sha256").update(`${submissionId}|${salt}`).digest("base64url").slice(0, 12).toUpperCase();
  return `MM-RPT-${h}`;
}

// ---------------------------------------------------------------------------
// Pembina penghantaran (TULEN) — cermin domain, id/masa disuntik
// ---------------------------------------------------------------------------

export function buildTrustedSubmission(params: {
  input: ClientSubmissionInput;
  reporterUid: string;
  now: EpochMillis;
  submissionId: string;
  status: "submitted" | "validation_failed";
}): PlaceCorrectionSubmission {
  const {input, reporterUid, now, submissionId, status} = params;
  const category = input.category as ReportCategory;
  const rule = getCategoryRule(category);
  const affectedFields = input.affectedFields as readonly CorrectableField[];
  const dedupKey = dedupKeyFor({
    placeId: input.placeId,
    category,
    affectedFields,
    submittedBy: reporterUid,
    proposal: input.proposedValues,
  });
  return {
    submissionId,
    placeId: input.placeId,
    publicationId: input.originalSnapshot?.publicationId,
    publicationVersion: input.originalSnapshot?.publicationVersion,
    sourceMode: input.originalSnapshot!.sourceMode,
    submittedBy: reporterUid,
    submittedAt: now,
    submissionType: input.submissionType as SubmissionType,
    category,
    affectedFields: [...affectedFields],
    originalSnapshot: input.originalSnapshot!,
    proposedValues: input.proposedValues,
    evidence: [...input.evidence],
    description: input.description,
    severity: (input.severity as ReportSeverity) ?? rule.defaultSeverity,
    status,
    auditTrail: [],
    clientMetadata: input.clientMetadata as PlaceCorrectionSubmission["clientMetadata"],
    algorithmVersion: CORRECTION_ALGORITHM_VERSION,
    schemaVersion: CORRECTION_SCHEMA_VERSION,
    dedupKey,
  };
}

// ---------------------------------------------------------------------------
// Orkestra penghantaran dipercayai (TULEN, penyimpanan disuntik)
// ---------------------------------------------------------------------------

export interface TrustedSubmitDeps {
  listUserSubmissions(reporterUid: string): Promise<readonly PlaceCorrectionSubmission[]>;
  createSubmission(submission: PlaceCorrectionSubmission): Promise<void>;
  appendAudit(entry: PlaceCorrectionAuditEntry): Promise<void>;
  idGen(): string;
  trackingSalt: string;
  limits?: CorrectionLimits;
}

export interface TrustedSubmitResult {
  success: boolean;
  status: string;
  trackingId: string;
  submittedAt: EpochMillis;
  messageCode: string;
  deduplicated: boolean;
}

/**
 * Jalankan penghantaran dipercayai penuh: validasi -> had kadar -> dedup ->
 * cipta -> audit. Melempar CorrectionCallableError berkod bagi kegagalan.
 * TIDAK PERNAH menulis ke rekod canonical — hanya staging pembetulan.
 */
export async function orchestrateTrustedSubmission(
  input: ClientSubmissionInput,
  reporterUid: string,
  now: EpochMillis,
  deps: TrustedSubmitDeps,
): Promise<TrustedSubmitResult> {
  const limits = deps.limits ?? DEFAULT_CORRECTION_LIMITS;

  const validation = validatePlaceCorrectionSubmission(input, limits);
  if (!validation.valid) {
    throw new CorrectionCallableError(toSafeErrorCode(validation.errors), "validation_failed");
  }

  const userSubs = await deps.listUserSubmissions(reporterUid);

  const rate = evaluateRateLimit({submittedBy: reporterUid, placeId: input.placeId, now, userSubmissions: userSubs}, limits);
  if (!rate.allowed) {
    throw new CorrectionCallableError("rate_limited", rate.reasons.join(","));
  }

  const dedupKey = dedupKeyFor({
    placeId: input.placeId,
    category: input.category as ReportCategory,
    affectedFields: input.affectedFields as readonly CorrectableField[],
    submittedBy: reporterUid,
    proposal: input.proposedValues,
  });
  const dup = findOpenDuplicate(userSubs, dedupKey);
  if (dup.isDuplicate && dup.existing) {
    return {
      success: true,
      status: dup.existing.status,
      trackingId: makeTrackingId(dup.existing.submissionId, deps.trackingSalt),
      submittedAt: dup.existing.submittedAt,
      messageCode: "correction_deduplicated",
      deduplicated: true,
    };
  }

  const submissionId = deps.idGen();
  const submission = buildTrustedSubmission({input, reporterUid, now, submissionId, status: "submitted"});
  await deps.createSubmission(submission);
  await deps.appendAudit({
    auditId: `${submissionId}_submitted`,
    submissionId,
    action: "submitted",
    actorType: "reporter",
    reporterUid,
    nextStatus: "submitted",
    changedFields: [...submission.affectedFields],
    reasonCode: "submitted",
    createdAt: now,
  } as PlaceCorrectionAuditEntry);

  return {
    success: true,
    status: "submitted",
    trackingId: makeTrackingId(submissionId, deps.trackingSalt),
    submittedAt: now,
    messageCode: "correction_submitted",
    deduplicated: false,
  };
}
