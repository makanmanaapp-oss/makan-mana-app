"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_CATEGORY_RULES = void 0;
exports.getCategoryRule = getCategoryRule;
exports.safetySensitiveCategories = safetySensitiveCategories;
exports.autoActionForbiddenCategories = autoActionForbiddenCategories;
function rule(category, submissionType, requiredFields, minimumEvidence, defaultSeverity, safetySensitive, allowsExactProposedValue, automaticActionForbidden, extras = {}) {
    return {
        category,
        submissionType,
        requiredFields,
        optionalFields: extras.optionalFields ?? ["notes"],
        minimumEvidence,
        defaultSeverity,
        safetySensitive,
        allowsExactProposedValue,
        adminReviewMandatory: true,
        automaticActionForbidden,
        requiresObservationDate: extras.requiresObservationDate ?? false,
        requiresDuplicateTarget: extras.requiresDuplicateTarget ?? false,
    };
}
exports.REPORT_CATEGORY_RULES = {
    wrong_name: rule("wrong_name", "correction", ["displayName"], 0, "low", false, true, false),
    wrong_address: rule("wrong_address", "correction", ["address"], 0, "medium", false, true, false),
    wrong_coordinates: rule("wrong_coordinates", "location_report", ["coordinates"], 1, "medium", false, true, false),
    wrong_phone: rule("wrong_phone", "contact_report", ["phone"], 0, "low", false, true, false),
    wrong_website: rule("wrong_website", "contact_report", ["website"], 0, "low", false, true, false),
    wrong_hours: rule("wrong_hours", "hours_report", ["openingHours"], 0, "medium", false, true, false),
    wrong_price: rule("wrong_price", "menu_price_report", ["price"], 1, "low", false, true, false),
    wrong_rating_source: rule("wrong_rating_source", "general_report", [], 0, "low", false, false, false),
    // Penutupan & perpindahan — memerlukan pemerhatian/bukti, tiada auto-tindakan.
    permanently_closed: rule("permanently_closed", "closure_report", ["businessStatus"], 1, "high", true, false, true, { requiresObservationDate: true }),
    temporarily_closed: rule("temporarily_closed", "closure_report", ["businessStatus"], 1, "medium", true, false, true, { requiresObservationDate: true }),
    moved_location: rule("moved_location", "moved_report", ["movedToCoordinates"], 1, "high", true, true, true, { requiresObservationDate: true }),
    duplicate_place: rule("duplicate_place", "duplicate_place_report", ["duplicateTargetPlaceId"], 0, "medium", false, true, true, { requiresDuplicateTarget: true }),
    wrong_cuisine: rule("wrong_cuisine", "correction", ["cuisineTagIds"], 0, "low", false, true, false),
    wrong_place_type: rule("wrong_place_type", "correction", ["placeTypeTagIds"], 0, "low", false, true, false),
    // KESELAMATAN — laporan pengguna TIDAK PERNAH mensijilkan atau menanda selamat.
    wrong_halal_status: rule("wrong_halal_status", "halal_evidence_report", ["halalEvidence"], 1, "high", true, false, true),
    unsafe_halal_claim: rule("unsafe_halal_claim", "safety_report", [], 1, "critical", true, false, true),
    wrong_allergen_information: rule("wrong_allergen_information", "allergen_information_report", ["allergenEvidence"], 1, "high", true, false, true),
    unsafe_allergen_claim: rule("unsafe_allergen_claim", "safety_report", [], 1, "critical", true, false, true),
    wrong_dietary_information: rule("wrong_dietary_information", "correction", ["dietaryEvidence"], 1, "medium", true, false, true),
    wrong_image: rule("wrong_image", "image_report", ["imageRemovalRequest"], 0, "low", false, false, false),
    inappropriate_image: rule("inappropriate_image", "inappropriate_content", ["imageRemovalRequest"], 0, "high", false, false, true),
    spam_or_fake_place: rule("spam_or_fake_place", "inappropriate_content", [], 1, "high", false, false, true),
    other: rule("other", "general_report", [], 0, "low", false, false, false),
};
function getCategoryRule(category) {
    return exports.REPORT_CATEGORY_RULES[category];
}
/** Kategori yang menyentuh keselamatan (untuk penapis & laluan penyemak). */
function safetySensitiveCategories() {
    return Object.keys(exports.REPORT_CATEGORY_RULES).filter((c) => exports.REPORT_CATEGORY_RULES[c].safetySensitive);
}
/**
 * Kategori di mana tiada sistem automatik boleh bertindak. Digunakan oleh
 * lapisan keputusan untuk membuktikan bahawa penerimaan hanya menghasilkan
 * cadangan staging.
 */
function autoActionForbiddenCategories() {
    return Object.keys(exports.REPORT_CATEGORY_RULES).filter((c) => exports.REPORT_CATEGORY_RULES[c].automaticActionForbidden);
}
