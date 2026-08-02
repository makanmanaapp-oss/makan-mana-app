/**
 * Phase 1.5 — pendaftaran tag canonical + benih taksonomi.
 * tagId = snake_case huruf kecil (bebas bahasa, stabil selepas terbit).
 * Benih ini WAKIL & boleh diperluas (lihat dokumen); bukan setiap hidangan.
 */
import { EpochMillis } from "../common";
import { EvidenceLevel } from "../placeEnums";
import { TagFamily } from "../placeTags";
import { TAG_FAMILY_DEFINITIONS } from "./tagFamilies";

export const TAG_STATUS = ["active", "deprecated", "hidden", "experimental"] as const;
export type TagStatus = (typeof TAG_STATUS)[number];

export interface CanonicalTagDefinition {
  tagId: string;
  familyId: TagFamily;
  labelKey: string;
  descriptionKey: string;
  aliases: string[];
  parentTagId?: string;
  childTagIds?: string[];
  synonyms: string[];
  exclusionTagIds: string[];
  relatedTagIds: string[];
  safetySensitive: boolean;
  allowedEvidenceLevels: EvidenceLevel[];
  minimumConfidenceForPublication: number;
  /** Untuk tag deprecated — ID gantian canonical. */
  replacedByTagId?: string;
  version: string;
  status: TagStatus;
  createdAt: EpochMillis;
  updatedAt: EpochMillis;
}

const SEED_TS = 1_700_000_000_000;
const REG_V = "tag_registry_v1";

interface DefOpts {
  aliases?: string[];
  synonyms?: string[];
  exclusionTagIds?: string[];
  relatedTagIds?: string[];
  parentTagId?: string;
  childTagIds?: string[];
  status?: TagStatus;
  replacedByTagId?: string;
}

function def(familyId: TagFamily, tagId: string, o: DefOpts = {}): CanonicalTagDefinition {
  const fam = TAG_FAMILY_DEFINITIONS[familyId];
  return {
    tagId,
    familyId,
    labelKey: `tag.${familyId}.${tagId}`,
    descriptionKey: `tag.${familyId}.${tagId}.desc`,
    aliases: o.aliases ?? [],
    parentTagId: o.parentTagId,
    childTagIds: o.childTagIds,
    synonyms: o.synonyms ?? [],
    exclusionTagIds: o.exclusionTagIds ?? [],
    relatedTagIds: o.relatedTagIds ?? [],
    safetySensitive: fam.safetySensitive,
    allowedEvidenceLevels: fam.allowedEvidenceLevels,
    minimumConfidenceForPublication: fam.minimumConfidenceForPublication,
    replacedByTagId: o.replacedByTagId,
    version: REG_V,
    status: o.status ?? "active",
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  };
}

function group(familyId: TagFamily, ids: string[]): CanonicalTagDefinition[] {
  return ids.map((id) => def(familyId, id));
}

export const SEED_TAG_DEFINITIONS: CanonicalTagDefinition[] = [
  ...group("place_type", [
    "restaurant", "cafe", "bakery", "hawker", "stall", "kiosk",
    "food_court", "takeaway", "delivery_only",
  ]),
  ...group("meal_slot", [
    "breakfast", "brunch", "lunch", "tea", "dinner", "supper",
    "late_night", "sahur", "iftar",
  ]),
  ...group("service", [
    // "takeaway_service" (bukan "takeaway") supaya unik merentas keluarga
    // dengan place_type "takeaway".
    "dine_in", "takeaway_service", "delivery", "reservation", "drive_through", "quick_service",
  ]),
  ...group("ambience", [
    // "upscale" (bukan "premium") supaya unik dgn price "premium".
    "quiet", "family", "group", "work_friendly", "date", "casual", "upscale", "outdoor",
  ]),
  ...group("health", [
    "grilled", "high_protein", "vegetable_rich", "low_oil", "heavy", "fried", "sugary_drink",
  ]),
  ...group("dietary", [
    "vegetarian_options", "vegan_options", "pescatarian_options",
    "gluten_free_reported", "dairy_free_reported", "nut_free_reported", "egg_free_reported",
  ]),
  ...group("allergen", [
    "peanuts", "tree_nuts", "dairy", "eggs", "fish", "shellfish", "gluten", "soy", "sesame",
  ]),
  // halal_evidence — states saling eksklusif.
  def("halal_evidence", "certified", { exclusionTagIds: ["possible_non_halal"] }),
  def("halal_evidence", "merchant_claimed", {}),
  def("halal_evidence", "community_reported", {}),
  def("halal_evidence", "unknown", {}),
  def("halal_evidence", "possible_non_halal", { exclusionTagIds: ["certified"] }),
  ...group("portion", ["small", "normal", "large", "sharing"]),
  // "speed_*" supaya unik dgn portion "normal" & lain-lain.
  ...group("speed", ["speed_slow", "speed_normal", "speed_fast"]),
  ...group("price", ["budget", "affordable", "moderate", "premium", "luxury"]),
  ...group("spice", ["non_spicy", "mild", "medium", "hot", "very_hot", "extreme"]),
  ...group("mood_support", [
    // "supper_mood" (bukan "supper") supaya unik dgn meal_slot "supper".
    "nearby", "jimat", "healthy", "cafe_chill", "pedas", "lapar", "supper_mood", "rainy", "surprise",
  ]),
  // cuisine — dengan alias + hierarki + satu tag deprecated.
  def("cuisine", "malay", { aliases: ["malaysian"] }),
  def("cuisine", "mamak", { relatedTagIds: ["indian_muslim"] }),
  def("cuisine", "indian_muslim", {}),
  def("cuisine", "chinese", {}),
  def("cuisine", "indian", {}),
  def("cuisine", "nyonya", {}),
  def("cuisine", "thai", {}),
  def("cuisine", "indonesian", {}),
  def("cuisine", "arab", { parentTagId: "middle_eastern" }),
  def("cuisine", "middle_eastern", { childTagIds: ["arab"] }),
  def("cuisine", "mediterranean", {}),
  def("cuisine", "japanese", {}),
  def("cuisine", "korean", {}),
  def("cuisine", "western", {}),
  def("cuisine", "western_food", { status: "deprecated", replacedByTagId: "western" }),
  def("cuisine", "pastry", {}),
  def("cuisine", "vietnamese", {}),
  def("cuisine", "filipino", {}),
  def("cuisine", "seafood", {}),
  def("cuisine", "fusion", {}),
  // dish — "ayam_geprek" (dengan alias "ayam_gepuk") & "tea_drink" (bukan
  // "tea") supaya unik merentas keluarga dengan meal_slot "tea".
  def("dish", "ayam_geprek", { aliases: ["ayam_gepuk"] }),
  def("dish", "tea_drink", {}),
  ...group("dish", [
    "nasi_lemak", "nasi_kandar", "roti_canai", "burger", "pasta",
    "sushi", "salad", "grilled_chicken", "fried_chicken", "rice_bowl", "soup",
    "noodles", "dessert", "coffee", "juice",
  ]),
];

export interface TagRegistry {
  byId: Map<string, CanonicalTagDefinition>;
  /** alias/deprecated → canonical id */
  aliasMap: Map<string, string>;
  byFamily: Map<TagFamily, CanonicalTagDefinition[]>;
}

export function buildTagRegistry(defs: CanonicalTagDefinition[]): TagRegistry {
  const byId = new Map<string, CanonicalTagDefinition>();
  const aliasMap = new Map<string, string>();
  const byFamily = new Map<TagFamily, CanonicalTagDefinition[]>();
  for (const d of defs) {
    byId.set(d.tagId, d);
    const list = byFamily.get(d.familyId) ?? [];
    list.push(d);
    byFamily.set(d.familyId, list);
    for (const a of d.aliases) aliasMap.set(a, d.tagId);
    if (d.status === "deprecated" && d.replacedByTagId) {
      aliasMap.set(d.tagId, d.replacedByTagId);
    }
  }
  return { byId, aliasMap, byFamily };
}

export const CANONICAL_TAG_REGISTRY: TagRegistry = buildTagRegistry(SEED_TAG_DEFINITIONS);

export function getTagDefinition(
  registry: TagRegistry,
  tagId: string,
): CanonicalTagDefinition | undefined {
  return registry.byId.get(tagId);
}

/** Selesaikan tagId → ID canonical aktif (ikut alias + gantian deprecated). */
export function resolveTagId(
  registry: TagRegistry,
  tagId: string,
  maxHops = 8,
): string | undefined {
  let current = tagId;
  const visited = new Set<string>();
  let hops = 0;
  while (hops <= maxHops) {
    if (visited.has(current)) return undefined; // gelung
    visited.add(current);
    const direct = registry.byId.get(current);
    if (direct && direct.status !== "deprecated") return current;
    const next = registry.aliasMap.get(current);
    if (!next) return undefined; // tidak diketahui / deprecated tanpa gantian
    current = next;
    hops++;
  }
  return undefined;
}

export function listTagsByFamily(
  registry: TagRegistry,
  familyId: TagFamily,
): CanonicalTagDefinition[] {
  return registry.byFamily.get(familyId) ?? [];
}
