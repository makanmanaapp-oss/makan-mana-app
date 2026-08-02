"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSourceReference = validateSourceReference;
exports.validateFieldEvidence = validateFieldEvidence;
exports.validateCanonicalTagEvidence = validateCanonicalTagEvidence;
exports.validatePlaceFreshness = validatePlaceFreshness;
exports.validatePlaceCompleteness = validatePlaceCompleteness;
exports.validatePlaceCardData = validatePlaceCardData;
exports.validatePlaceAlias = validatePlaceAlias;
exports.validateMergeState = validateMergeState;
exports.validateCanonicalPlace = validateCanonicalPlace;
/**
 * Phase 1.2 — pengesahan skema hand-rolled (tiada pergantungan baharu).
 * Setiap validator memulangkan ValidationResult; JANGAN lempar untuk input
 * tidak sah — kumpul isu supaya boleh diaudit.
 */
const common_1 = require("./common");
const placeEnums_1 = require("./placeEnums");
const placeTags_1 = require("./placeTags");
const placeEnums_2 = require("./placeEnums");
const placeCommercial_1 = require("./placeCommercial");
const placeMerge_1 = require("./placeMerge");
function issue(path, code, message) {
    return { path, code, message };
}
function validateSourceReference(v) {
    const issues = [];
    if (!(0, common_1.isMember)(placeEnums_1.SOURCE_TYPE, v.sourceType)) {
        issues.push(issue("sourceType", "invalid_enum", "sourceType tidak sah"));
    }
    if (!(0, common_1.isNonEmptyString)(v.sourceRecordId)) {
        issues.push(issue("sourceRecordId", "empty", "sourceRecordId kosong"));
    }
    for (const t of ["fetchedAt", "verifiedAt", "expiresAt"]) {
        if (!(0, common_1.isValidOptionalTimestamp)(v[t])) {
            issues.push(issue(t, "invalid_timestamp", `${t} tidak sah`));
        }
    }
    return (0, common_1.toResult)(issues);
}
function validateFieldEvidence(v, path = "fieldEvidence") {
    const issues = [];
    if (!(0, common_1.isMember)(placeEnums_1.SOURCE_TYPE, v.sourceType)) {
        issues.push(issue(`${path}.sourceType`, "invalid_enum", "sourceType"));
    }
    if (!(0, common_1.isMember)(placeEnums_1.EVIDENCE_LEVEL, v.evidenceLevel)) {
        issues.push(issue(`${path}.evidenceLevel`, "invalid_enum", "evidenceLevel"));
    }
    if (!(0, common_1.inUnitRange)(v.confidence)) {
        issues.push(issue(`${path}.confidence`, "confidence_out_of_range", "0..1 sahaja"));
    }
    for (const t of ["fetchedAt", "verifiedAt", "expiresAt"]) {
        if (!(0, common_1.isValidOptionalTimestamp)(v[t])) {
            issues.push(issue(`${path}.${t}`, "invalid_timestamp", `${t}`));
        }
    }
    return (0, common_1.toResult)(issues);
}
function validateCanonicalTagEvidence(v) {
    const issues = [];
    if (!(0, common_1.isCanonicalId)(v.tagId)) {
        // Kesan label terjemah/teks setempat dipakai sebagai kunci DB.
        issues.push(issue("tagId", "localized_or_invalid_tag_id", v.tagId));
    }
    if (!(0, common_1.isMember)(placeTags_1.TAG_FAMILIES, v.family)) {
        issues.push(issue("family", "invalid_enum", "family tag tidak sah"));
    }
    if (!(0, common_1.isMember)(placeEnums_1.EVIDENCE_LEVEL, v.evidenceLevel)) {
        issues.push(issue("evidenceLevel", "invalid_enum", "evidenceLevel"));
    }
    if (!(0, common_1.isMember)(placeEnums_1.SOURCE_TYPE, v.sourceType)) {
        issues.push(issue("sourceType", "invalid_enum", "sourceType"));
    }
    if (!(0, common_1.inUnitRange)(v.confidence)) {
        issues.push(issue("confidence", "confidence_out_of_range", "0..1 sahaja"));
    }
    return (0, common_1.toResult)(issues);
}
function validateFieldFreshness(v, path) {
    const issues = [];
    if (!(0, common_1.isMember)(placeEnums_2.FRESHNESS_STATE, v.state)) {
        issues.push(issue(`${path}.state`, "invalid_enum", "freshness state"));
    }
    for (const t of ["fetchedAt", "verifiedAt", "staleAfter", "expiresAt"]) {
        if (!(0, common_1.isValidOptionalTimestamp)(v[t])) {
            issues.push(issue(`${path}.${t}`, "invalid_timestamp", `${t}`));
        }
    }
    return issues;
}
function validatePlaceFreshness(v) {
    const issues = [];
    for (const [key, entry] of Object.entries(v)) {
        if (entry)
            issues.push(...validateFieldFreshness(entry, key));
    }
    return (0, common_1.toResult)(issues);
}
function validatePlaceCompleteness(v) {
    const issues = [];
    const keys = [
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
        if (!(0, common_1.inUnitRange)(v[k])) {
            issues.push(issue(k, "completeness_out_of_range", `${k} mesti 0..1`));
        }
    }
    return (0, common_1.toResult)(issues);
}
function validatePlaceCardData(v) {
    const issues = [];
    if (!(0, common_1.isNonEmptyString)(v.placeId)) {
        issues.push(issue("placeId", "empty_place_id", "placeId kosong"));
    }
    if (!(0, common_1.isNonEmptyString)(v.title)) {
        issues.push(issue("title", "empty", "title kosong"));
    }
    if (!(0, common_1.isMember)(placeCommercial_1.PRICE_DISPLAY_STATES, v.priceState)) {
        issues.push(issue("priceState", "invalid_enum", "priceState"));
    }
    if (!(0, common_1.isMember)(placeEnums_2.HOURS_STATE, v.hoursState)) {
        issues.push(issue("hoursState", "invalid_enum", "hoursState"));
    }
    // Rating/ulasan MESTI tiada (undefined) atau nombor terhingga — tiada 0 palsu
    // dibenarkan sebagai proksi "tiada" (itu tanggungjawab pemeta, tapi kami
    // pastikan jenis konsisten di sini).
    if (v.rating !== undefined && !(typeof v.rating === "number" && Number.isFinite(v.rating))) {
        issues.push(issue("rating", "invalid_rating", "rating mesti nombor/undefined"));
    }
    if (v.reviewCount !== undefined &&
        !(typeof v.reviewCount === "number" && Number.isFinite(v.reviewCount))) {
        issues.push(issue("reviewCount", "invalid_review_count", "nombor/undefined"));
    }
    if (v.matchScore !== undefined && !(typeof v.matchScore === "number")) {
        issues.push(issue("matchScore", "invalid_match_score", "nombor/undefined"));
    }
    return (0, common_1.toResult)(issues);
}
function validatePlaceAlias(v) {
    const issues = [];
    if (!(0, common_1.isNonEmptyString)(v.aliasId)) {
        issues.push(issue("aliasId", "empty", "aliasId kosong"));
    }
    if (!(0, common_1.isNonEmptyString)(v.canonicalPlaceId)) {
        issues.push(issue("canonicalPlaceId", "empty", "canonicalPlaceId kosong"));
    }
    if (!(0, common_1.isMember)(placeMerge_1.ALIAS_TYPES, v.aliasType)) {
        issues.push(issue("aliasType", "invalid_enum", "aliasType"));
    }
    if (!(0, common_1.isValidOptionalTimestamp)(v.createdAt)) {
        issues.push(issue("createdAt", "invalid_timestamp", "createdAt"));
    }
    return (0, common_1.toResult)(issues);
}
function validateMergeState(v) {
    const issues = [];
    if (!(0, common_1.isMember)(placeEnums_1.MERGE_STATUS, v.mergeStatus)) {
        issues.push(issue("mergeStatus", "invalid_enum", "mergeStatus"));
    }
    // Merged/superseded MESTI ada sasaran canonical.
    if ((v.mergeStatus === "merged" || v.mergeStatus === "superseded") &&
        !(0, common_1.isNonEmptyString)(v.duplicateOf)) {
        issues.push(issue("duplicateOf", "merge_target_missing", "sasaran canonical hilang"));
    }
    if (v.mergeConfidence !== undefined && !(0, common_1.inUnitRange)(v.mergeConfidence)) {
        issues.push(issue("mergeConfidence", "confidence_out_of_range", "0..1 sahaja"));
    }
    return (0, common_1.toResult)(issues);
}
function validateCanonicalPlace(v) {
    const issues = [];
    const add = (r, prefix) => {
        for (const i of r.issues) {
            issues.push(issue(`${prefix}.${i.path}`, i.code, i.message));
        }
    };
    if (!(0, common_1.isNonEmptyString)(v.placeId)) {
        issues.push(issue("placeId", "empty_place_id", "placeId kosong"));
    }
    if (!(0, common_1.isMember)(placeEnums_1.PLACE_STATUS, v.status)) {
        issues.push(issue("status", "invalid_enum", "status"));
    }
    if (!(0, common_1.isMember)(placeEnums_1.VERIFICATION_STATUS, v.verificationStatus)) {
        issues.push(issue("verificationStatus", "invalid_enum", "verificationStatus"));
    }
    if (!(0, common_1.isMember)(placeEnums_1.PUBLICATION_STATUS, v.publicationStatus)) {
        issues.push(issue("publicationStatus", "invalid_enum", "publicationStatus"));
    }
    if (!(0, common_1.isNonEmptyString)(v.identity?.canonicalName)) {
        issues.push(issue("identity.canonicalName", "empty_canonical_name", "kosong"));
    }
    if (!(0, common_1.isNonEmptyString)(v.identity?.normalizedName)) {
        issues.push(issue("identity.normalizedName", "empty", "kosong"));
    }
    if (!(0, common_1.isValidLatLng)(v.location?.lat, v.location?.lng)) {
        issues.push(issue("location", "location_invalid", "koordinat tidak sah"));
    }
    (v.providerRefs ?? []).forEach((ref, i) => add(validateSourceReference(ref), `providerRefs[${i}]`));
    (v.tagSet?.tags ?? []).forEach((t, i) => add(validateCanonicalTagEvidence(t), `tagSet.tags[${i}]`));
    for (const [field, ev] of Object.entries(v.provenance ?? {})) {
        if (ev)
            add(validateFieldEvidence(ev, ""), `provenance.${field}`);
    }
    if (v.completeness)
        add(validatePlaceCompleteness(v.completeness), "completeness");
    if (v.freshness)
        add(validatePlaceFreshness(v.freshness), "freshness");
    if (v.mergeState)
        add(validateMergeState(v.mergeState), "mergeState");
    (v.aliases ?? []).forEach((a, i) => add(validatePlaceAlias(a), `aliases[${i}]`));
    for (const t of ["createdAt", "updatedAt"]) {
        if (!(typeof v[t] === "number" && Number.isFinite(v[t]) && v[t] >= 0)) {
            issues.push(issue(t, "invalid_timestamp", `${t} tidak sah`));
        }
    }
    if (!(0, common_1.isValidOptionalTimestamp)(v.publishedAt)) {
        issues.push(issue("publishedAt", "invalid_timestamp", "publishedAt"));
    }
    return (0, common_1.toResult)(issues);
}
