"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPARISON_VERSION = exports.MIGRATION_CONFIG_VERSION = exports.MIGRATION_ALGORITHM_VERSION = exports.MIGRATION_AUDIT_ACTIONS = exports.FORBIDDEN_MARKER_STATUSES = exports.COMPLETION_MARKER_STATUSES = exports.ROLLBACK_STATUSES = exports.CHECKPOINT_STRATEGIES = exports.CHECKPOINT_STATUSES = exports.REWRITE_STATUSES = exports.REWRITE_TYPES = exports.TARGET_COLLECTION_MODES = exports.MIGRATION_PLAN_STATUSES = exports.ALIAS_STATUSES = exports.ALIAS_TYPES = exports.HOLD_REASONS = exports.NON_EXECUTABLE_DECISIONS = exports.MIGRATION_DECISIONS = exports.CRITICAL_REFERENCE_KINDS = exports.REFERENCE_KINDS = exports.MIGRATION_RISKS = exports.LEGACY_SOURCES = exports.INVENTORY_STATUSES = exports.LEGACY_COLLECTIONS = void 0;
// ---------------------------------------------------------------------------
// Inventori legasi
// ---------------------------------------------------------------------------
/** Koleksi legasi yang diperiksa (emulator/ujian sahaja — tiada tulisan). */
exports.LEGACY_COLLECTIONS = [
    "places_cache",
    "place_details",
    "favorites",
    "meals",
    "suggestions",
    "suggestion_sessions",
    "history",
    "deep_links",
];
exports.INVENTORY_STATUSES = [
    "discovered",
    "eligible",
    "incomplete",
    "duplicate_candidate",
    "ambiguous",
    "blocked",
    "planned",
    "migrated_in_emulator",
    "skipped",
];
/** Sumber rekod legasi (dari mana baris itu datang). */
exports.LEGACY_SOURCES = [
    "google_places",
    "places_cache",
    "place_details",
    "user_reference",
    "unknown",
];
// ---------------------------------------------------------------------------
// Kesan rujukan
// ---------------------------------------------------------------------------
exports.MIGRATION_RISKS = ["none", "low", "medium", "high", "critical"];
exports.REFERENCE_KINDS = [
    "favorite",
    "meal",
    "history",
    "suggestion",
    "session",
    "deep_link",
    "correction",
    "other",
];
/**
 * Rujukan KRITIKAL: memecahkannya bermakna pengguna kehilangan data peribadi
 * atau pautan yang dikongsi berhenti berfungsi. Tiada pelan boleh mengabaikannya.
 */
exports.CRITICAL_REFERENCE_KINDS = [
    "favorite",
    "meal",
    "deep_link",
];
// ---------------------------------------------------------------------------
// Calon migrasi
// ---------------------------------------------------------------------------
exports.MIGRATION_DECISIONS = [
    "ready",
    "review_required",
    "ambiguous",
    "branch_conflict",
    "insufficient_identity",
    "blocked",
    "skip",
    "already_mapped",
];
/** Keputusan yang TIDAK PERNAH boleh dilaksanakan. */
exports.NON_EXECUTABLE_DECISIONS = [
    "review_required",
    "ambiguous",
    "branch_conflict",
    "insufficient_identity",
    "blocked",
    "skip",
];
exports.HOLD_REASONS = [
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
];
// ---------------------------------------------------------------------------
// Alias
// ---------------------------------------------------------------------------
exports.ALIAS_TYPES = [
    "legacy_document_id",
    "google_place_id",
    "internal_place_id",
    "deep_link_place_id",
    "provider_place_id",
    "merchant_id",
];
exports.ALIAS_STATUSES = [
    "proposed",
    "active",
    "superseded",
    "rolled_back",
    "blocked",
];
// ---------------------------------------------------------------------------
// Pelan migrasi
// ---------------------------------------------------------------------------
exports.MIGRATION_PLAN_STATUSES = [
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
];
/**
 * Mod koleksi sasaran. Fasa ini menyokong SATU nilai sahaja. Menambah mod
 * produksi memerlukan fasa terkawal yang berasingan dan diluluskan.
 */
exports.TARGET_COLLECTION_MODES = ["emulator_only"];
// ---------------------------------------------------------------------------
// Penulisan semula rujukan
// ---------------------------------------------------------------------------
exports.REWRITE_TYPES = [
    "favorite_reference",
    "meal_reference",
    "history_reference",
    "suggestion_reference",
    "session_reference",
    "deep_link_reference",
    "correction_reference",
    "other_reference",
];
exports.REWRITE_STATUSES = [
    "preview",
    "applied_in_emulator",
    "held",
    "failed",
    "rolled_back",
];
// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------
exports.CHECKPOINT_STATUSES = [
    "pending",
    "running",
    "paused",
    "completed",
    "failed",
    "corrupt",
    "rolled_back",
];
exports.CHECKPOINT_STRATEGIES = ["per_candidate", "per_batch"];
// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------
exports.ROLLBACK_STATUSES = [
    "prepared",
    "executed",
    "failed",
    "not_required",
];
// ---------------------------------------------------------------------------
// Penanda penyiapan
// ---------------------------------------------------------------------------
exports.COMPLETION_MARKER_STATUSES = [
    "emulator_complete",
    "qa_complete",
    "production_ready",
    "production_complete",
    "rolled_back",
];
/**
 * Status yang DILARANG dicipta dalam Phase 1.12. Menciptanya bermakna
 * mendakwa produksi sudah bermigrasi — perkara yang fasa ini tidak lakukan.
 */
exports.FORBIDDEN_MARKER_STATUSES = [
    "production_ready",
    "production_complete",
];
// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
exports.MIGRATION_AUDIT_ACTIONS = [
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
];
// ---------------------------------------------------------------------------
// Versi algoritma & konfigurasi (dimasukkan ke dalam setiap hash)
// ---------------------------------------------------------------------------
exports.MIGRATION_ALGORITHM_VERSION = "1.12.0";
exports.MIGRATION_CONFIG_VERSION = "1.12.0-emulator-only";
exports.COMPARISON_VERSION = "1.12.0";
