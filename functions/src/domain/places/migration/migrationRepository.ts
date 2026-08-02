/**
 * Phase 1.12 — sempadan penyimpanan migrasi.
 *
 * Antara muka ini SENGAJA tidak mempunyai operasi padam untuk data legasi dan
 * tiada operasi tulis produksi. Apa yang tidak boleh dinyatakan tidak boleh
 * berlaku secara tidak sengaja.
 */
import { EpochMillis } from "../common";
import { EmulatorCanonicalRecord } from "./emulatorExecution";
import {
  MigrationCompletionMarker,
} from "./completionMarker";
import { LegacyPlaceInventoryRecord } from "./legacyInventory";
import { LegacyAliasMapping } from "./migrationAlias";
import { LegacyPlaceMigrationCandidate } from "./migrationCandidate";
import { MigrationCheckpoint } from "./migrationCheckpoint";
import { PlaceMigrationPlan } from "./migrationPlan";
import { MigrationAuditEntry } from "./migrationTypes";
import { PlaceReadComparison } from "./shadowRead";
import { MigrationRollbackPlan } from "./rollbackPlan";

export interface MigrationInventoryStore {
  saveInventory(records: readonly LegacyPlaceInventoryRecord[]): Promise<void>;
  listInventory(): Promise<readonly LegacyPlaceInventoryRecord[]>;
  getInventoryRecord(
    legacyRecordId: string,
  ): Promise<LegacyPlaceInventoryRecord | null>;
}

export interface MigrationCandidateStore {
  saveCandidates(
    candidates: readonly LegacyPlaceMigrationCandidate[],
  ): Promise<void>;
  listCandidates(): Promise<readonly LegacyPlaceMigrationCandidate[]>;
  getCandidate(candidateId: string): Promise<LegacyPlaceMigrationCandidate | null>;
}

export interface MigrationPlanStore {
  savePlan(plan: PlaceMigrationPlan): Promise<void>;
  getPlan(migrationPlanId: string): Promise<PlaceMigrationPlan | null>;
  listPlans(): Promise<readonly PlaceMigrationPlan[]>;
  approveForEmulator(
    migrationPlanId: string,
    approvedBy: string,
    at: EpochMillis,
  ): Promise<PlaceMigrationPlan | null>;
}

export interface MigrationAliasStore {
  saveAliases(aliases: readonly LegacyAliasMapping[]): Promise<void>;
  listAliases(): Promise<readonly LegacyAliasMapping[]>;
  /** Tandakan sebagai dibatalkan. TIADA kaedah padam wujud dengan sengaja. */
  markRolledBack(aliasIds: readonly string[], at: EpochMillis): Promise<void>;
}

export interface MigrationCheckpointStore {
  saveCheckpoint(checkpoint: MigrationCheckpoint): Promise<void>;
  getCheckpoint(checkpointId: string): Promise<MigrationCheckpoint | null>;
}

export interface MigrationEmulatorStore {
  saveCanonicalRecords(
    records: readonly EmulatorCanonicalRecord[],
  ): Promise<void>;
  listCanonicalRecords(): Promise<readonly EmulatorCanonicalRecord[]>;
  deactivateCanonicalRecords(canonicalPlaceIds: readonly string[]): Promise<void>;
  saveRollbackPlan(plan: MigrationRollbackPlan): Promise<void>;
  getRollbackPlan(rollbackPlanId: string): Promise<MigrationRollbackPlan | null>;
}

export interface MigrationAuditStore {
  /** Hanya-tambah. Tiada kemas kini, tiada padam. */
  appendAudit(entries: readonly MigrationAuditEntry[]): Promise<void>;
  listAudit(migrationPlanId: string): Promise<readonly MigrationAuditEntry[]>;
}

export interface ShadowComparisonStore {
  saveComparisons(comparisons: readonly PlaceReadComparison[]): Promise<void>;
  listComparisons(): Promise<readonly PlaceReadComparison[]>;
}

export interface CompletionMarkerStore {
  saveMarker(marker: MigrationCompletionMarker): Promise<void>;
  listMarkers(): Promise<readonly MigrationCompletionMarker[]>;
}

export interface MigrationRepository
  extends MigrationInventoryStore,
    MigrationCandidateStore,
    MigrationPlanStore,
    MigrationAliasStore,
    MigrationCheckpointStore,
    MigrationEmulatorStore,
    MigrationAuditStore,
    ShadowComparisonStore,
    CompletionMarkerStore {
  /** Sentiasa benar dalam fasa ini. */
  readonly emulatorOnly: true;
}
