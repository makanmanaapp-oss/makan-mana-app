/**
 * Phase 1.6 Part G — KONFIGURASI KELAYAKAN (semua ambang BERNAMA).
 * Tiada nombor ajaib di dalam enjin kelayakan.
 */
import { PlaceStatus, VerificationStatus } from "../placeEnums";

export const PUBLICATION_ALGORITHM_VERSION = "publication_v1";
export const PUBLICATION_CONFIG_VERSION = "publication_config_v1";
export const ELIGIBILITY_ENGINE_VERSION = "eligibility_v1";

/** Kod sebab MENYEKAT (kanonikal, bebas bahasa). */
export const BLOCKING_REASONS = [
  "not_approved",
  "invalid_business_status",
  "permanently_closed",
  "merged_or_superseded_alias",
  "missing_stable_identity",
  "invalid_location",
  "below_minimum_completeness",
  "unresolved_duplicate",
  "unresolved_safety_conflict",
  "expired_critical_freshness",
  "missing_required_provenance",
  "invalid_or_unapproved_tags",
  "invalid_media_fallback_state",
  "verification_rejected",
  "verification_not_allowed",
] as const;
export type BlockingReason = (typeof BLOCKING_REASONS)[number];

/** Kod AMARAN (layak terbit, tetapi kad mesti melabelnya jujur). */
export const WARNING_REASONS = [
  "unknown_price",
  "estimated_price",
  "unknown_hours",
  "stale_rating",
  "low_review_evidence",
  "community_reported_status",
  "incomplete_allergen_data",
  "inferred_tags",
  "completeness_needs_labels",
  "stale_non_critical_field",
  "halal_evidence_recheck",
] as const;
export type WarningReason = (typeof WARNING_REASONS)[number];

/** Tindakan yang diperlukan untuk membuka sekatan. */
export const REQUIRED_ACTIONS = [
  "approve_record",
  "resolve_duplicate",
  "resolve_safety_conflict",
  "refresh_critical_fields",
  "improve_completeness",
  "attach_provenance",
  "fix_location",
  "fix_identity",
  "review_tags",
  "review_media",
  "revalidate_verification",
] as const;
export type RequiredAction = (typeof REQUIRED_ACTIONS)[number];

export interface EligibilityThresholds {
  /** < ambang ini = SEKAT penerbitan (PDF §10.2). */
  minCompleteness: number;
  /** < ambang ini (tetapi >= min) = terbit DENGAN label unknown. */
  standardCompleteness: number;
  /** Bilangan ulasan minimum sebelum rating dianggap bukti kukuh. */
  minReviewCountForStrongEvidence: number;
  /** Keyakinan minimum tag sebelum ia dianggap bukan "inferred". */
  minTagConfidenceForApproved: number;
  /** Adakah waktu tidak diketahui MENYEKAT (false = amaran sahaja)? */
  unknownHoursBlocksPublication: boolean;
  /** Adakah harga tidak diketahui MENYEKAT (false = amaran sahaja)? */
  unknownPriceBlocksPublication: boolean;
  /** Medan provenance yang WAJIB hadir sebelum terbit. */
  requiredProvenanceFields: string[];
}

export const DEFAULT_ELIGIBILITY_THRESHOLDS: EligibilityThresholds = {
  minCompleteness: 0.6,
  standardCompleteness: 0.8,
  minReviewCountForStrongEvidence: 10,
  minTagConfidenceForApproved: 0.5,
  // Dasar lalai: waktu tidak diketahui ialah AMARAN jujur, bukan sekatan —
  // kad memaparkan "waktu tidak diketahui" dan tidak mengira open_now.
  unknownHoursBlocksPublication: false,
  unknownPriceBlocksPublication: false,
  requiredProvenanceFields: ["displayName", "coordinates"],
};

/** Status perniagaan yang TIDAK boleh diterbitkan. */
export const NON_PUBLISHABLE_PLACE_STATUSES: PlaceStatus[] = [
  "permanently_closed",
  "hidden_by_admin",
  "pending_validation",
  "stale_critical",
  "moved",
];

/** Verification yang dibenarkan untuk penerbitan. */
export const PUBLISHABLE_VERIFICATION_STATUSES: VerificationStatus[] = [
  "source_verified",
  "merchant_verified",
  "admin_verified",
  "community_reported",
];

export interface EligibilityConfig {
  thresholds: EligibilityThresholds;
  nonPublishableStatuses: PlaceStatus[];
  publishableVerifications: VerificationStatus[];
  algorithmVersion: string;
  configVersion: string;
  engineVersion: string;
}

export const DEFAULT_ELIGIBILITY_CONFIG: EligibilityConfig = {
  thresholds: DEFAULT_ELIGIBILITY_THRESHOLDS,
  nonPublishableStatuses: NON_PUBLISHABLE_PLACE_STATUSES,
  publishableVerifications: PUBLISHABLE_VERIFICATION_STATUSES,
  algorithmVersion: PUBLICATION_ALGORITHM_VERSION,
  configVersion: PUBLICATION_CONFIG_VERSION,
  engineVersion: ELIGIBILITY_ENGINE_VERSION,
};

/** Bina konfigurasi ubahsuai tanpa mengubah lalai. */
export function withEligibilityOverrides(
  overrides: Partial<EligibilityThresholds>,
  base: EligibilityConfig = DEFAULT_ELIGIBILITY_CONFIG,
): EligibilityConfig {
  return { ...base, thresholds: { ...base.thresholds, ...overrides } };
}
