"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CorrectionCallableError = exports.CALLABLE_ERROR_CODES = exports.SUPPORTED_LOCALES = exports.CATEGORY_MAP = exports.CANONICAL_CORRECTION_TYPES = void 0;
exports.mapCorrectionRequest = mapCorrectionRequest;
exports.toSafeErrorCode = toSafeErrorCode;
exports.makeTrackingId = makeTrackingId;
exports.buildTrustedSubmission = buildTrustedSubmission;
exports.orchestrateTrustedSubmission = orchestrateTrustedSubmission;
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
const crypto_1 = require("crypto");
const corrections_1 = require("../domain/places/corrections");
// ---------------------------------------------------------------------------
// Jenis permintaan/respons callable (kontrak klien)
// ---------------------------------------------------------------------------
exports.CANONICAL_CORRECTION_TYPES = [
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
];
/** Peta jenis kanonikal (kontrak klien) -> kategori domain Phase 1.11. */
exports.CATEGORY_MAP = {
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
exports.SUPPORTED_LOCALES = ["ms", "en", "zh", "ta"];
exports.CALLABLE_ERROR_CODES = [
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
];
/** Ralat berkod selamat (tiada jejak tindanan / laluan dokumen dipercayai). */
class CorrectionCallableError extends Error {
    code;
    constructor(code, message) {
        super(message ?? code);
        this.code = code;
        this.name = "CorrectionCallableError";
    }
}
exports.CorrectionCallableError = CorrectionCallableError;
// ---------------------------------------------------------------------------
// Sanitisasi + pemetaan permintaan -> input domain
// ---------------------------------------------------------------------------
const MAX_RAW_TEXT = 4000; // topi keras sebelum validasi domain (elak abuse)
function asTrimmedString(v, max = MAX_RAW_TEXT) {
    if (typeof v !== "string")
        return "";
    // Buang aksara kawalan (0x00-0x1F, 0x7F) tanpa literal kawalan dalam sumber.
    let out = "";
    for (const ch of v) {
        const c = ch.codePointAt(0) ?? 0;
        if (c < 0x20 || c === 0x7f)
            continue;
        out += ch;
    }
    return out.slice(0, max).trim();
}
/** Bina snapshot MINIMAL daripada nilai semasa yang diisytihar klien.
 *  NOTA: server BELUM menderi semula daripada rekod canonical (adapter baca
 *  Phase 1.14 berpagar-pemilik). Snapshot ini kekal "diisytihar klien". */
function minimalSnapshot(placeId, currentValue, now) {
    const title = currentValue || placeId;
    const contentHash = (0, crypto_1.createHash)("sha256").update(`${placeId}|${currentValue}`).digest("hex").slice(0, 32);
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
function buildProposal(field, proposedValue, currentValue, description) {
    switch (field) {
        case "displayName":
            return { displayName: proposedValue };
        case "address":
            return { address: proposedValue };
        case "phone":
            return { phone: proposedValue };
        case "website":
            return { website: proposedValue };
        case "openingHours":
            return { openingHours: proposedValue };
        case "price":
            return { price: proposedValue };
        case "businessStatus":
            return { businessStatus: proposedValue };
        case "halalEvidence":
            return { halalEvidence: proposedValue };
        case "dietaryEvidence":
            return { dietaryEvidence: [proposedValue] };
        case "allergenEvidence":
            return { allergenEvidence: [proposedValue] };
        case "cuisineTagIds":
            return { cuisineTagIds: [proposedValue] };
        case "placeTypeTagIds":
            return { placeTypeTagIds: [proposedValue] };
        case "duplicateTargetPlaceId":
            return { duplicateTargetPlaceId: proposedValue };
        case "imageRemovalRequest":
            return { imageRemovalRequest: { imageReference: currentValue || proposedValue, reason: description || "reported" } };
        case "notes":
            return { notes: proposedValue };
        case "coordinates":
        case "movedToCoordinates": {
            const parts = proposedValue.split(",").map((p) => Number(p.trim()));
            if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
                const coord = { lat: parts[0], lng: parts[1] };
                return field === "coordinates" ? { coordinates: coord } : { movedToCoordinates: coord };
            }
            return { notes: proposedValue };
        }
        default:
            return { notes: proposedValue };
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
function mapCorrectionRequest(req, now) {
    const placeId = asTrimmedString(req.placeId, 200);
    if (!placeId)
        throw new CorrectionCallableError("invalid_place", "place_id_required");
    // Terima jenis KANONIKAL (kontrak klien) ATAU kategori domain (enum klien Dart).
    const rawType = asTrimmedString(req.correctionType, 64);
    let category;
    if (exports.CANONICAL_CORRECTION_TYPES.includes(rawType)) {
        category = exports.CATEGORY_MAP[rawType];
    }
    else if (corrections_1.REPORT_CATEGORIES.includes(rawType)) {
        category = rawType;
    }
    else {
        throw new CorrectionCallableError("unsupported_type", `unsupported_type:${rawType}`);
    }
    const rule = (0, corrections_1.getCategoryRule)(category);
    const submissionType = rule.submissionType;
    const proposedValue = asTrimmedString(req.proposedValue, 1000);
    const currentValue = asTrimmedString(req.currentValue, 1000);
    const description = asTrimmedString(req.description, 2000);
    const primaryField = rule.requiredFields[0] ?? "notes";
    const affectedFields = rule.requiredFields.length ? [...rule.requiredFields] : ["notes"];
    const proposedValues = rule.allowsExactProposedValue || primaryField === "notes"
        ? buildProposal(primaryField, proposedValue || description, currentValue, description)
        : { notes: description || proposedValue };
    const locale = exports.SUPPORTED_LOCALES.includes(asTrimmedString(req.locale, 8))
        ? asTrimmedString(req.locale, 8)
        : "ms";
    const input = {
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
    };
    return input;
}
// ---------------------------------------------------------------------------
// Pemetaan ralat validasi domain -> kod selamat
// ---------------------------------------------------------------------------
function toSafeErrorCode(errors) {
    const has = (p) => errors.some((e) => e === p || e.startsWith(`${p}:`) || e.startsWith(p));
    if (has("place_id_required") || has("place_id") || has("invalid_place"))
        return "invalid_place";
    if (has("unsupported_category") || has("unsupported_submission_type") || has("unsupported_affected_field")) {
        return "unsupported_type";
    }
    if (has("description_too_short"))
        return "description_too_short";
    if (has("description_too_long"))
        return "description_too_long";
    if (has("too_many_evidence_items") || has("evidence"))
        return "invalid_evidence";
    return "invalid_argument";
}
// ---------------------------------------------------------------------------
// ID penjejakan tidak boleh diteka
// ---------------------------------------------------------------------------
function makeTrackingId(submissionId, salt) {
    const h = (0, crypto_1.createHash)("sha256").update(`${submissionId}|${salt}`).digest("base64url").slice(0, 12).toUpperCase();
    return `MM-RPT-${h}`;
}
// ---------------------------------------------------------------------------
// Pembina penghantaran (TULEN) — cermin domain, id/masa disuntik
// ---------------------------------------------------------------------------
function buildTrustedSubmission(params) {
    const { input, reporterUid, now, submissionId, status } = params;
    const category = input.category;
    const rule = (0, corrections_1.getCategoryRule)(category);
    const affectedFields = input.affectedFields;
    const dedupKey = (0, corrections_1.dedupKeyFor)({
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
        sourceMode: input.originalSnapshot.sourceMode,
        submittedBy: reporterUid,
        submittedAt: now,
        submissionType: input.submissionType,
        category,
        affectedFields: [...affectedFields],
        originalSnapshot: input.originalSnapshot,
        proposedValues: input.proposedValues,
        evidence: [...input.evidence],
        description: input.description,
        severity: input.severity ?? rule.defaultSeverity,
        status,
        auditTrail: [],
        clientMetadata: input.clientMetadata,
        algorithmVersion: corrections_1.CORRECTION_ALGORITHM_VERSION,
        schemaVersion: corrections_1.CORRECTION_SCHEMA_VERSION,
        dedupKey,
    };
}
/**
 * Jalankan penghantaran dipercayai penuh: validasi -> had kadar -> dedup ->
 * cipta -> audit. Melempar CorrectionCallableError berkod bagi kegagalan.
 * TIDAK PERNAH menulis ke rekod canonical — hanya staging pembetulan.
 */
async function orchestrateTrustedSubmission(input, reporterUid, now, deps) {
    const limits = deps.limits ?? corrections_1.DEFAULT_CORRECTION_LIMITS;
    const validation = (0, corrections_1.validatePlaceCorrectionSubmission)(input, limits);
    if (!validation.valid) {
        throw new CorrectionCallableError(toSafeErrorCode(validation.errors), "validation_failed");
    }
    const userSubs = await deps.listUserSubmissions(reporterUid);
    const rate = (0, corrections_1.evaluateRateLimit)({ submittedBy: reporterUid, placeId: input.placeId, now, userSubmissions: userSubs }, limits);
    if (!rate.allowed) {
        throw new CorrectionCallableError("rate_limited", rate.reasons.join(","));
    }
    const dedupKey = (0, corrections_1.dedupKeyFor)({
        placeId: input.placeId,
        category: input.category,
        affectedFields: input.affectedFields,
        submittedBy: reporterUid,
        proposal: input.proposedValues,
    });
    const dup = (0, corrections_1.findOpenDuplicate)(userSubs, dedupKey);
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
    const submission = buildTrustedSubmission({ input, reporterUid, now, submissionId, status: "submitted" });
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
    });
    return {
        success: true,
        status: "submitted",
        trackingId: makeTrackingId(submissionId, deps.trackingSalt),
        submittedAt: now,
        messageCode: "correction_submitted",
        deduplicated: false,
    };
}
