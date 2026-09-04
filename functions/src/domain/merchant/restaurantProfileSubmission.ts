export const RESTAURANT_PROFILE_SUBMISSION_TYPES = [
  "profile_update",
  "hours_update",
  "contact_update",
  "menu_update",
] as const;

export type RestaurantProfileSubmissionType =
  typeof RESTAURANT_PROFILE_SUBMISSION_TYPES[number];

type JsonObject = Record<string, unknown>;

const PROFILE_FIELDS = new Set([
  "official_name", "display_name", "branch_name",
  "address_line1", "address_line2", "state", "district", "city", "locality", "postcode", "country",
  "latitude", "longitude",
  "phone", "whatsapp", "website", "instagram", "facebook", "tiktok",
  "primary_category", "cuisine_tags", "food_tags", "signature_dishes", "price_range",
  "service_modes", "amenities", "short_description", "business_status",
  "opening_hours", "special_hours", "temporary_closed_from", "temporary_closed_until",
]);

const HOURS_FIELDS = new Set([
  "business_status", "opening_hours", "special_hours",
  "temporary_closed_from", "temporary_closed_until",
]);

const CONTACT_FIELDS = new Set([
  "phone", "whatsapp", "website", "instagram", "facebook", "tiktok",
]);

const MENU_FIELDS = new Set([
  "cuisine_tags", "food_tags", "signature_dishes", "price_range",
]);

const SYSTEM_OR_SAFETY_FIELDS = new Set([
  "halal_status", "halal_source", "halal_verified_at",
  "allergen_verified", "allergen_status", "allergens", "allergy_verified",
  "dietary_verified", "dietary_verification", "dietary_certification",
  "registry_status", "firebase_id", "canonical_place_id",
  "source_snapshot", "source_updated_at", "source_update_available",
  "data_quality_score", "data_quality_flags", "published_at",
  "created_by", "updated_by", "created_at", "updated_at", "curated_at",
  "apply_status", "applied_registry_version", "applied_at", "applied_by",
  "applied_request_id", "apply_reason", "apply_conflict_code",
  "reviewed_by", "reviewed_registry_version", "reviewed_registry_updated_at",
  "publication_status", "publish_status", "publish_requested", "publication_requested",
]);

const MAX_SERIALIZED_BYTES = 32 * 1024;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function fieldsFor(type: RestaurantProfileSubmissionType): ReadonlySet<string> {
  if (type === "profile_update") return PROFILE_FIELDS;
  if (type === "hours_update") return HOURS_FIELDS;
  if (type === "contact_update") return CONTACT_FIELDS;
  return MENU_FIELDS;
}

export function parseRestaurantProfileSubmissionType(value: unknown): RestaurantProfileSubmissionType {
  if (typeof value !== "string" || !RESTAURANT_PROFILE_SUBMISSION_TYPES.includes(value as RestaurantProfileSubmissionType)) {
    throw new Error("restaurant_profile_submission_type_invalid");
  }
  return value as RestaurantProfileSubmissionType;
}

export function validateRestaurantProfileProposal(
  submissionTypeValue: unknown,
  dataValue: unknown,
): { submissionType: RestaurantProfileSubmissionType; data: JsonObject } {
  const submissionType = parseRestaurantProfileSubmissionType(submissionTypeValue);
  const data = asObject(dataValue);
  if (!data) throw new Error("restaurant_profile_data_invalid");

  const keys = Object.keys(data);
  if (keys.length === 0) throw new Error("restaurant_profile_data_empty");

  const allowed = fieldsFor(submissionType);
  for (const key of keys) {
    if (SYSTEM_OR_SAFETY_FIELDS.has(key)) {
      throw new Error(`restaurant_profile_field_forbidden:${key}`);
    }
    if (!allowed.has(key)) {
      throw new Error(`restaurant_profile_field_not_allowed:${key}`);
    }
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(data);
  } catch {
    throw new Error("restaurant_profile_data_not_serializable");
  }
  if (!serialized || Buffer.byteLength(serialized, "utf8") > MAX_SERIALIZED_BYTES) {
    throw new Error("restaurant_profile_data_too_large");
  }

  return { submissionType, data };
}
