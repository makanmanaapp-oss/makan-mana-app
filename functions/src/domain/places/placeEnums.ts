/**
 * Phase 1.2 — enum canonical (union string immutable) untuk domain place.
 *
 * NILAI DISIMPAN = ID kanonikal bebas bahasa. JANGAN guna label terjemah
 * sebagai nilai enum. Setiap kumpulan mengeksport array runtime (`as const`)
 * untuk pengesahan + jenis union yang diterbitkan darinya.
 */

export const PLACE_STATUS = [
  "active",
  "temporarily_closed",
  "permanently_closed",
  "moved",
  "pending_validation",
  "hidden_by_admin",
  "stale_critical",
  "community_unverified",
] as const;
export type PlaceStatus = (typeof PLACE_STATUS)[number];

export const VERIFICATION_STATUS = [
  "unverified",
  "source_verified",
  "merchant_verified",
  "community_reported",
  "admin_verified",
  "rejected",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUS)[number];

export const PUBLICATION_STATUS = [
  "draft",
  "needs_review",
  "approved",
  "published",
  "stale",
  "hidden",
  "rejected",
  "superseded",
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUS)[number];

export const SOURCE_TYPE = [
  "provider",
  "owner_upload",
  "merchant",
  "community",
  "makanmana",
  "licensed_dataset",
] as const;
export type SourceType = (typeof SOURCE_TYPE)[number];

export const EVIDENCE_LEVEL = [
  "verified",
  "reported",
  "inferred",
  "unknown",
] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVEL)[number];

export const FRESHNESS_STATE = [
  "fresh",
  "aging",
  "stale",
  "expired",
  "unknown",
] as const;
export type FreshnessState = (typeof FRESHNESS_STATE)[number];

export const HOURS_STATE = [
  "known",
  "unknown",
  "expired",
  "temporarily_closed",
  "permanently_closed",
] as const;
export type HoursState = (typeof HOURS_STATE)[number];

export const MEDIA_STATUS = [
  "pending",
  "approved",
  "rejected",
  "unavailable",
  "fallback",
] as const;
export type MediaStatus = (typeof MEDIA_STATUS)[number];

export const MERGE_STATUS = [
  "none",
  "possible_duplicate",
  "review_required",
  "merged",
  "superseded",
  "split_required",
] as const;
export type MergeStatus = (typeof MERGE_STATUS)[number];

export const CARD_SOURCE_MODE = [
  "live",
  "approved_cache",
  "community",
  "sample",
] as const;
export type CardSourceMode = (typeof CARD_SOURCE_MODE)[number];

export const HALAL_EVIDENCE_STATE = [
  "certified",
  "merchant_claimed",
  "community_reported",
  "unknown",
  "possible_non_halal",
] as const;
export type HalalEvidenceState = (typeof HALAL_EVIDENCE_STATE)[number];
