"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TAG_FAMILY_DEFINITIONS = exports.CONFLICT_POLICY = exports.TAG_FAMILY_STATUS = void 0;
exports.getTagFamily = getTagFamily;
exports.TAG_FAMILY_STATUS = ["active", "deprecated", "hidden", "experimental"];
exports.CONFLICT_POLICY = ["single_value", "multi_value", "exclusive_states"];
const V = "tag_family_v1";
function fam(familyId, o) {
    return {
        familyId,
        labelKey: `tagFamily.${familyId}`,
        descriptionKey: `tagFamily.${familyId}.desc`,
        safetySensitive: false,
        allowsMultiple: true,
        hierarchical: false,
        requiredForPublication: false,
        allowedEvidenceLevels: ["verified", "reported", "inferred"],
        minimumConfidenceForStorage: 0.3,
        minimumConfidenceForPublication: 0.5,
        conflictPolicy: "multi_value",
        version: V,
        status: "active",
        ...o,
    };
}
exports.TAG_FAMILY_DEFINITIONS = {
    place_type: fam("place_type", { requiredForPublication: true }),
    cuisine: fam("cuisine", { hierarchical: true }),
    dish: fam("dish", { hierarchical: true }),
    meal_slot: fam("meal_slot", {}),
    mood_support: fam("mood_support", {
        allowedEvidenceLevels: ["reported", "inferred"],
    }),
    service: fam("service", { allowedEvidenceLevels: ["verified", "reported"] }),
    ambience: fam("ambience", { allowedEvidenceLevels: ["reported", "inferred"] }),
    health: fam("health", {}),
    dietary: fam("dietary", {
        safetySensitive: true,
        // Ketiadaan daging TIDAK boleh menyimpul vegetarian → tiada "inferred".
        allowedEvidenceLevels: ["verified", "reported"],
        minimumConfidenceForStorage: 0.5,
        minimumConfidenceForPublication: 0.7,
    }),
    allergen: fam("allergen", {
        safetySensitive: true,
        // Kehadiran allergen boleh dilapor/disah; "unknown" kekal eksplisit.
        allowedEvidenceLevels: ["verified", "reported", "unknown"],
        minimumConfidenceForStorage: 0.5,
        minimumConfidenceForPublication: 0.7,
    }),
    halal_evidence: fam("halal_evidence", {
        safetySensitive: true,
        allowsMultiple: false,
        allowedEvidenceLevels: ["verified", "reported", "unknown"],
        minimumConfidenceForStorage: 0.5,
        minimumConfidenceForPublication: 0.7,
        conflictPolicy: "single_value",
    }),
    spice: fam("spice", { allowsMultiple: false, conflictPolicy: "single_value" }),
    portion: fam("portion", {
        allowsMultiple: false,
        allowedEvidenceLevels: ["reported", "inferred"],
        conflictPolicy: "single_value",
    }),
    speed: fam("speed", {
        allowsMultiple: false,
        allowedEvidenceLevels: ["reported", "inferred"],
        conflictPolicy: "single_value",
    }),
    price: fam("price", { allowsMultiple: false, conflictPolicy: "single_value" }),
};
function getTagFamily(familyId) {
    return exports.TAG_FAMILY_DEFINITIONS[familyId];
}
