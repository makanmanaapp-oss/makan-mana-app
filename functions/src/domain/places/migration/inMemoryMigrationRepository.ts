/**
 * Phase 1.12 — stor migrasi dalam-ingatan untuk ujian.
 *
 * Mengklon pada sempadan supaya pemanggil tidak boleh mengubah keadaan yang
 * disimpan. Audit adalah hanya-tambah. Tiada kaedah memadam data legasi wujud.
 */
import { EpochMillis } from "../common";
import { MigrationCompletionMarker } from "./completionMarker";
import { EmulatorCanonicalRecord } from "./emulatorExecution";
import { LegacyPlaceInventoryRecord } from "./legacyInventory";
import { LegacyAliasMapping } from "./migrationAlias";
import { LegacyPlaceMigrationCandidate } from "./migrationCandidate";
import { MigrationCheckpoint } from "./migrationCheckpoint";
import { PlaceMigrationPlan, canTransitionPlan } from "./migrationPlan";
import { MigrationRepository } from "./migrationRepository";
import { MigrationAuditEntry } from "./migrationTypes";
import { MigrationRollbackPlan } from "./rollbackPlan";
import { PlaceReadComparison } from "./shadowRead";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class InMemoryMigrationStore implements MigrationRepository {
  readonly emulatorOnly = true as const;

  private inventory = new Map<string, LegacyPlaceInventoryRecord>();
  private candidates = new Map<string, LegacyPlaceMigrationCandidate>();
  private plans = new Map<string, PlaceMigrationPlan>();
  private aliases = new Map<string, LegacyAliasMapping>();
  private checkpoints = new Map<string, MigrationCheckpoint>();
  private canonicalRecords = new Map<string, EmulatorCanonicalRecord>();
  private rollbackPlans = new Map<string, MigrationRollbackPlan>();
  private auditEntries: MigrationAuditEntry[] = [];
  private comparisons: PlaceReadComparison[] = [];
  private markers = new Map<string, MigrationCompletionMarker>();

  reset(): void {
    this.inventory.clear();
    this.candidates.clear();
    this.plans.clear();
    this.aliases.clear();
    this.checkpoints.clear();
    this.canonicalRecords.clear();
    this.rollbackPlans.clear();
    this.auditEntries = [];
    this.comparisons = [];
    this.markers.clear();
  }

  // --- Inventori (baca sahaja bagi data legasi sebenar) ---------------------

  async saveInventory(records: readonly LegacyPlaceInventoryRecord[]): Promise<void> {
    for (const record of records) {
      this.inventory.set(record.legacyRecordId, clone(record));
    }
  }

  async listInventory(): Promise<readonly LegacyPlaceInventoryRecord[]> {
    return [...this.inventory.values()]
      .map(clone)
      .sort((a, b) => a.legacyRecordId.localeCompare(b.legacyRecordId));
  }

  async getInventoryRecord(
    legacyRecordId: string,
  ): Promise<LegacyPlaceInventoryRecord | null> {
    const found = this.inventory.get(legacyRecordId);
    return found ? clone(found) : null;
  }

  // --- Calon ---------------------------------------------------------------

  async saveCandidates(
    candidates: readonly LegacyPlaceMigrationCandidate[],
  ): Promise<void> {
    for (const candidate of candidates) {
      this.candidates.set(candidate.candidateId, clone(candidate));
    }
  }

  async listCandidates(): Promise<readonly LegacyPlaceMigrationCandidate[]> {
    return [...this.candidates.values()]
      .map(clone)
      .sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  }

  async getCandidate(
    candidateId: string,
  ): Promise<LegacyPlaceMigrationCandidate | null> {
    const found = this.candidates.get(candidateId);
    return found ? clone(found) : null;
  }

  // --- Pelan ---------------------------------------------------------------

  async savePlan(plan: PlaceMigrationPlan): Promise<void> {
    this.plans.set(plan.migrationPlanId, clone(plan));
  }

  async getPlan(migrationPlanId: string): Promise<PlaceMigrationPlan | null> {
    const found = this.plans.get(migrationPlanId);
    return found ? clone(found) : null;
  }

  async listPlans(): Promise<readonly PlaceMigrationPlan[]> {
    return [...this.plans.values()]
      .map(clone)
      .sort((a, b) => a.migrationPlanId.localeCompare(b.migrationPlanId));
  }

  async approveForEmulator(
    migrationPlanId: string,
    approvedBy: string,
    at: EpochMillis,
  ): Promise<PlaceMigrationPlan | null> {
    const plan = this.plans.get(migrationPlanId);
    if (!plan) return null;
    if (!canTransitionPlan(plan.status, "approved_for_emulator")) return null;
    const updated: PlaceMigrationPlan = {
      ...clone(plan),
      status: "approved_for_emulator",
      approvedBy,
      approvedAt: at,
    };
    this.plans.set(migrationPlanId, updated);
    return clone(updated);
  }

  // --- Alias ---------------------------------------------------------------

  async saveAliases(aliases: readonly LegacyAliasMapping[]): Promise<void> {
    for (const alias of aliases) {
      this.aliases.set(alias.aliasId, clone(alias));
    }
  }

  async listAliases(): Promise<readonly LegacyAliasMapping[]> {
    return [...this.aliases.values()]
      .map(clone)
      .sort((a, b) => a.aliasId.localeCompare(b.aliasId));
  }

  async markRolledBack(
    aliasIds: readonly string[],
    at: EpochMillis,
  ): Promise<void> {
    for (const aliasId of aliasIds) {
      const alias = this.aliases.get(aliasId);
      // Tandakan sahaja — alias tidak pernah dibuang daripada stor.
      if (alias) {
        this.aliases.set(aliasId, {
          ...alias,
          status: "rolled_back",
          supersededAt: at,
        });
      }
    }
  }

  // --- Checkpoint ----------------------------------------------------------

  async saveCheckpoint(checkpoint: MigrationCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.checkpointId, clone(checkpoint));
  }

  async getCheckpoint(checkpointId: string): Promise<MigrationCheckpoint | null> {
    const found = this.checkpoints.get(checkpointId);
    return found ? clone(found) : null;
  }

  // --- Rekod canonical emulator --------------------------------------------

  async saveCanonicalRecords(
    records: readonly EmulatorCanonicalRecord[],
  ): Promise<void> {
    for (const record of records) {
      this.canonicalRecords.set(record.canonicalPlaceId, clone(record));
    }
  }

  async listCanonicalRecords(): Promise<readonly EmulatorCanonicalRecord[]> {
    return [...this.canonicalRecords.values()]
      .map(clone)
      .sort((a, b) => a.canonicalPlaceId.localeCompare(b.canonicalPlaceId));
  }

  async deactivateCanonicalRecords(
    canonicalPlaceIds: readonly string[],
  ): Promise<void> {
    for (const id of canonicalPlaceIds) {
      const record = this.canonicalRecords.get(id);
      // Nyahaktif, bukan padam — rollback kekal boleh diaudit.
      if (record) this.canonicalRecords.set(id, { ...record, active: false });
    }
  }

  async saveRollbackPlan(plan: MigrationRollbackPlan): Promise<void> {
    this.rollbackPlans.set(plan.rollbackPlanId, clone(plan));
  }

  async getRollbackPlan(
    rollbackPlanId: string,
  ): Promise<MigrationRollbackPlan | null> {
    const found = this.rollbackPlans.get(rollbackPlanId);
    return found ? clone(found) : null;
  }

  // --- Audit (hanya-tambah) ------------------------------------------------

  async appendAudit(entries: readonly MigrationAuditEntry[]): Promise<void> {
    for (const entry of entries) {
      if (this.auditEntries.some((e) => e.auditId === entry.auditId)) continue;
      this.auditEntries.push(clone(entry));
    }
  }

  async listAudit(migrationPlanId: string): Promise<readonly MigrationAuditEntry[]> {
    return this.auditEntries
      .filter((e) => e.migrationPlanId === migrationPlanId)
      .map(clone);
  }

  // --- Perbandingan bayangan ----------------------------------------------

  async saveComparisons(
    comparisons: readonly PlaceReadComparison[],
  ): Promise<void> {
    this.comparisons.push(...comparisons.map(clone));
  }

  async listComparisons(): Promise<readonly PlaceReadComparison[]> {
    return this.comparisons.map(clone);
  }

  // --- Penanda penyiapan ---------------------------------------------------

  async saveMarker(marker: MigrationCompletionMarker): Promise<void> {
    this.markers.set(marker.markerId, clone(marker));
  }

  async listMarkers(): Promise<readonly MigrationCompletionMarker[]> {
    return [...this.markers.values()].map(clone);
  }
}
