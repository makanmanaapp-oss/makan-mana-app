/**
 * Phase 1.12 — kontrak kongsi untuk asas migrasi data kedai legasi.
 *
 * ADDITIVE SAHAJA. Tiada import firebase. TIDAK dieksport oleh
 * `functions/src/index.ts`. Tiada migrasi produksi berlaku dalam fasa ini —
 * mod sasaran satu-satunya ialah `emulator_only`.
 *
 * Prinsip yang dikuatkuasakan oleh jenis di sini:
 * - data legasi TIDAK PERNAH dipadam;
 * - setiap identiti yang bermigrasi MENGEKALKAN ID legasinya sebagai alias;
 * - padanan nama-sahaja DILARANG;
 * - apa-apa yang samar-samar menjadi HOLD, bukan tekaan.
 */
import { EpochMillis } from "../common";

// ---------------------------------------------------------------------------
// Inventori legasi
// ---------------------------------------------------------------------------

/** Koleksi legasi yang diperiksa (emulator/ujian sahaja — tiada tulisan). */
export const LEGACY_COLLECTIONS = [
  "places_cache",
  "place_details",
  "favorites",
  "meals",
  "suggestions",
  "suggestion_sessions",
  "history",
  "deep_links",
] as const;
export type LegacyCollection = (typeof LEGACY_COLLECTIONS)[number];

export const INVENTORY_STATUSES = [
  "discovered",
  "eligible",
  "incomplete",
  "duplicate_candidate",
  "ambiguous",
  "blocked",
  "planned",
  "migrated_in_emulator",
  "skipped",
] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

/** Sumber rekod legasi (dari mana baris itu datang). */
export const LEGACY_SOURCES = [
  "google_places",
  "places_cache",
  "place_details",
  "user_reference",
  "unknown",
] as const;
export type LegacySource = (typeof LEGACY_SOURCES)[number];

// ---------------------------------------------------------------------------
// Kesan rujukan
// ---------------------------------------------------------------------------

export const MIGRATION_RISKS = ["none", "low", "medium", "high", "critical"] as const;
export type MigrationRisk = (typeof MIGRATION_RISKS)[number];

export const REFERENCE_KINDS = [
  "favorite",
  "meal",
  "history",
  "suggestion",
  "session",
  "deep_link",
  "correction",
  "other",
] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

/**
 * Rujukan KRITIKAL: memecahkannya bermakna pengguna kehilangan data peribadi
 * atau pautan yang dikongsi berhenti berfungsi. Tiada pelan boleh mengabaikannya.
 */
export const CRITICAL_REFERENCE_KINDS: readonly ReferenceKind[] = [
  "favorite",
  "meal",
  "deep_link",
];

// ---------------------------------------------------------------------------
// Calon migrasi
// ---------------------------------------------------------------------------

export const MIGRATION_DECISIONS = [
  "ready",
  "review_required",
  "ambiguous",
  "branch_conflict",
  "insufficient_identity",
  "blocked",
  "skip",
  "already_mapped",
] as const;
export type MigrationDecision = (typeof MIGRATION_DECISIONS)[number];

/** Keputusan yang TIDAK PERNAH boleh dilaksanakan. */
export const NON_EXECUTABLE_DECISIONS: readonly MigrationDecision[] = [
  "review_required",
  "ambiguous",
  "branch_conflict",
  "insufficient_identity",
  "blocked",
  "skip",
];

export const HOLD_REASONS = [
  "missing_stable_identity",
  "name_only_match",
  "ambiguous_duplicate",
  "branch_conflict",
  "coordinate_conflict",
  "phone_conflict",
  "alias_collision",
  "circular_alias",
  "missing_location",
  "invalid_location",
  "critical_reference_unresolved",
  "canonical_validation_failed",
  "publication_not_eligible",
  "source_provenance_missing",
  "unsupported_legacy_shape",
  "malformed_legacy_data",
  "unknown_reference_path",
  "manual_review_required",
] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

// ---------------------------------------------------------------------------
// Alias
// ---------------------------------------------------------------------------

export const ALIAS_TYPES = [
  "legacy_document_id",
  "google_place_id",
  "internal_place_id",
  "deep_link_place_id",
  "provider_place_id",
  "merchant_id",
] as const;
export type AliasType = (typeof ALIAS_TYPES)[number];

export const ALIAS_STATUSES = [
  "proposed",
  "active",
  "superseded",
  "rolled_back",
  "blocked",
] as const;
export type AliasStatus = (typeof ALIAS_STATUSES)[number];

// ---------------------------------------------------------------------------
// Pelan migrasi
// ---------------------------------------------------------------------------

export const MIGRATION_PLAN_STATUSES = [
  "draft",
  "dry_run_ready",
  "dry_run_completed",
  "review_required",
  "approved_for_emulator",
  "executed_in_emulator",
  "paused",
  "cancelled",
  "rolled_back",
  "blocked",
] as const;
export type MigrationPlanStatus = (typeof MIGRATION_PLAN_STATUSES)[number];

/**
 * Mod koleksi sasaran. Fasa ini menyokong SATU nilai sahaja. Menambah mod
 * produksi memerlukan fasa terkawal yang berasingan dan diluluskan.
 */
export const TARGET_COLLECTION_MODES = ["emulator_only"] as const;
export type TargetCollectionMode = (typeof TARGET_COLLECTION_MODES)[number];

// ---------------------------------------------------------------------------
// Penulisan semula rujukan
// ---------------------------------------------------------------------------

export const REWRITE_TYPES = [
  "favorite_reference",
  "meal_reference",
  "history_reference",
  "suggestion_reference",
  "session_reference",
  "deep_link_reference",
  "correction_reference",
  "other_reference",
] as const;
export type RewriteType = (typeof REWRITE_TYPES)[number];

export const REWRITE_STATUSES = [
  "preview",
  "applied_in_emulator",
  "held",
  "failed",
  "rolled_back",
] as const;
export type RewriteStatus = (typeof REWRITE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------

export const CHECKPOINT_STATUSES = [
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "corrupt",
  "rolled_back",
] as const;
export type CheckpointStatus = (typeof CHECKPOINT_STATUSES)[number];

export const CHECKPOINT_STRATEGIES = ["per_candidate", "per_batch"] as const;
export type CheckpointStrategy = (typeof CHECKPOINT_STRATEGIES)[number];

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

export const ROLLBACK_STATUSES = [
  "prepared",
  "executed",
  "failed",
  "not_required",
] as const;
export type RollbackStatus = (typeof ROLLBACK_STATUSES)[number];

// ---------------------------------------------------------------------------
// Penanda penyiapan
// ---------------------------------------------------------------------------

export const COMPLETION_MARKER_STATUSES = [
  "emulator_complete",
  "qa_complete",
  "production_ready",
  "production_complete",
  "rolled_back",
] as const;
export type CompletionMarkerStatus =
  (typeof COMPLETION_MARKER_STATUSES)[number];

/**
 * Status yang DILARANG dicipta dalam Phase 1.12. Menciptanya bermakna
 * mendakwa produksi sudah bermigrasi — perkara yang fasa ini tidak lakukan.
 */
export const FORBIDDEN_MARKER_STATUSES: readonly CompletionMarkerStatus[] = [
  "production_ready",
  "production_complete",
];

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export const MIGRATION_AUDIT_ACTIONS = [
  "inventory_scanned",
  "references_scanned",
  "candidate_built",
  "candidate_held",
  "alias_proposed",
  "alias_collision_detected",
  "plan_built",
  "plan_dry_run_completed",
  "plan_approved_for_emulator",
  "plan_blocked",
  "emulator_execution_started",
  "emulator_canonical_created",
  "emulator_alias_created",
  "emulator_reference_rewritten",
  "checkpoint_written",
  "checkpoint_paused",
  "checkpoint_resumed",
  "checkpoint_corrupt",
  "emulator_execution_completed",
  "rollback_prepared",
  "rollback_executed",
  "completion_marker_created",
  "shadow_comparison_recorded",
] as const;
export type MigrationAuditAction = (typeof MIGRATION_AUDIT_ACTIONS)[number];

export interface MigrationAuditEntry {
  auditId: string;
  action: MigrationAuditAction;
  migrationPlanId?: string;
  batchId?: string;
  candidateId?: string;
  legacyPlaceId?: string;
  canonicalPlaceId?: string;
  actorType: "system" | "trusted_reviewer";
  trustedActorId?: string;
  reasonCode: string;
  at: EpochMillis;
}

// ---------------------------------------------------------------------------
// Versi algoritma & konfigurasi (dimasukkan ke dalam setiap hash)
// ---------------------------------------------------------------------------

export const MIGRATION_ALGORITHM_VERSION = "1.12.0";
export const MIGRATION_CONFIG_VERSION = "1.12.0-emulator-only";
export const COMPARISON_VERSION = "1.12.0";
