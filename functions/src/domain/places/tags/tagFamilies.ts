/**
 * Phase 1.5 — definisi keluarga tag canonical (metadata + polisi konflik).
 * Guna semula TAG_FAMILIES/TagFamily (Phase 1.2). ADDITIVE; tidak dipakai
 * produksi. Nilai enum = ID kanonikal bebas bahasa.
 */
import { EvidenceLevel } from "../placeEnums";
import { TagFamily } from "../placeTags";

export const TAG_FAMILY_STATUS = ["active", "deprecated", "hidden", "experimental"] as const;
export type TagFamilyStatus = (typeof TAG_FAMILY_STATUS)[number];

export const CONFLICT_POLICY = ["single_value", "multi_value", "exclusive_states"] as const;
export type ConflictPolicy = (typeof CONFLICT_POLICY)[number];

export interface TagFamilyDefinition {
  familyId: TagFamily;
  labelKey: string;
  descriptionKey: string;
  safetySensitive: boolean;
  allowsMultiple: boolean;
  hierarchical: boolean;
  requiredForPublication: boolean;
  allowedEvidenceLevels: EvidenceLevel[];
  minimumConfidenceForStorage: number;
  minimumConfidenceForPublication: number;
  conflictPolicy: ConflictPolicy;
  version: string;
  status: TagFamilyStatus;
}

const V = "tag_family_v1";

function fam(
  familyId: TagFamily,
  o: Partial<TagFamilyDefinition>,
): TagFamilyDefinition {
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

export const TAG_FAMILY_DEFINITIONS: Record<TagFamily, TagFamilyDefinition> = {
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

export function getTagFamily(familyId: string): TagFamilyDefinition | undefined {
  return (TAG_FAMILY_DEFINITIONS as Record<string, TagFamilyDefinition>)[familyId];
}
