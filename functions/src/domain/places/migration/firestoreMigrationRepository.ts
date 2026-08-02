/**
 * Phase 1.12 — repository migrasi Firestore — UJIAN EMULATOR SAHAJA.
 *
 * TIDAK diimport oleh functions/src/index.ts. Koleksi:
 *   place_migration_inventory/{legacyRecordId}
 *   place_migration_candidates/{candidateId}
 *   place_migration_plans/{migrationPlanId}
 *   place_migration_checkpoints/{checkpointId}
 *   place_migration_aliases/{aliasId}
 *   place_migration_audit/{auditId}
 *   place_read_comparisons/{comparisonId}
 *   migration_completion_markers/{markerId}
 *   place_migration_emulator_canonical/{canonicalPlaceId}
 *   place_migration_rollback_plans/{rollbackPlanId}
 *
 * TIADA tulisan kepada `place_registry`, `places_cache` atau `place_details`.
 * TIADA hard delete bagi mana-mana koleksi legasi atau alias.
 */
import { Firestore } from "firebase-admin/firestore";
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

const C_INVENTORY = "place_migration_inventory";
const C_CANDIDATES = "place_migration_candidates";
const C_PLANS = "place_migration_plans";
const C_CHECKPOINTS = "place_migration_checkpoints";
const C_ALIASES = "place_migration_aliases";
const C_AUDIT = "place_migration_audit";
const C_COMPARISONS = "place_read_comparisons";
const C_MARKERS = "migration_completion_markers";
const C_EMU_CANONICAL = "place_migration_emulator_canonical";
const C_ROLLBACK = "place_migration_rollback_plans";

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class FirestoreMigrationStore implements MigrationRepository {
  readonly emulatorOnly = true as const;

  constructor(private db: Firestore) {}

  // --- Inventori -----------------------------------------------------------

  async saveInventory(records: readonly LegacyPlaceInventoryRecord[]): Promise<void> {
    const batch = this.db.batch();
    for (const record of records) {
      batch.set(
        this.db.collection(C_INVENTORY).doc(record.legacyRecordId),
        toPlain(record),
      );
    }
    await batch.commit();
  }

  async listInventory(): Promise<readonly LegacyPlaceInventoryRecord[]> {
    const snap = await this.db.collection(C_INVENTORY).get();
    return snap.docs
      .map((d) => d.data() as LegacyPlaceInventoryRecord)
      .sort((a, b) => a.legacyRecordId.localeCompare(b.legacyRecordId));
  }

  async getInventoryRecord(
    legacyRecordId: string,
  ): Promise<LegacyPlaceInventoryRecord | null> {
    const doc = await this.db.collection(C_INVENTORY).doc(legacyRecordId).get();
    return doc.exists ? (doc.data() as LegacyPlaceInventoryRecord) : null;
  }

  // --- Calon ---------------------------------------------------------------

  async saveCandidates(
    candidates: readonly LegacyPlaceMigrationCandidate[],
  ): Promise<void> {
    const batch = this.db.batch();
    for (const candidate of candidates) {
      batch.set(
        this.db.collection(C_CANDIDATES).doc(candidate.candidateId),
        toPlain(candidate),
      );
    }
    await batch.commit();
  }

  async listCandidates(): Promise<readonly LegacyPlaceMigrationCandidate[]> {
    const snap = await this.db.collection(C_CANDIDATES).get();
    return snap.docs
      .map((d) => d.data() as LegacyPlaceMigrationCandidate)
      .sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  }

  async getCandidate(
    candidateId: string,
  ): Promise<LegacyPlaceMigrationCandidate | null> {
    const doc = await this.db.collection(C_CANDIDATES).doc(candidateId).get();
    return doc.exists ? (doc.data() as LegacyPlaceMigrationCandidate) : null;
  }

  // --- Pelan ---------------------------------------------------------------

  async savePlan(plan: PlaceMigrationPlan): Promise<void> {
    await this.db.collection(C_PLANS).doc(plan.migrationPlanId).set(toPlain(plan));
  }

  async getPlan(migrationPlanId: string): Promise<PlaceMigrationPlan | null> {
    const doc = await this.db.collection(C_PLANS).doc(migrationPlanId).get();
    return doc.exists ? (doc.data() as PlaceMigrationPlan) : null;
  }

  async listPlans(): Promise<readonly PlaceMigrationPlan[]> {
    const snap = await this.db.collection(C_PLANS).get();
    return snap.docs
      .map((d) => d.data() as PlaceMigrationPlan)
      .sort((a, b) => a.migrationPlanId.localeCompare(b.migrationPlanId));
  }

  async approveForEmulator(
    migrationPlanId: string,
    approvedBy: string,
    at: EpochMillis,
  ): Promise<PlaceMigrationPlan | null> {
    const ref = this.db.collection(C_PLANS).doc(migrationPlanId);
    const doc = await ref.get();
    if (!doc.exists) return null;
    const plan = doc.data() as PlaceMigrationPlan;
    if (!canTransitionPlan(plan.status, "approved_for_emulator")) return null;
    const updated: PlaceMigrationPlan = {
      ...plan,
      status: "approved_for_emulator",
      approvedBy,
      approvedAt: at,
    };
    await ref.set(toPlain(updated));
    return updated;
  }

  // --- Alias ---------------------------------------------------------------

  async saveAliases(aliases: readonly LegacyAliasMapping[]): Promise<void> {
    const batch = this.db.batch();
    for (const alias of aliases) {
      batch.set(this.db.collection(C_ALIASES).doc(alias.aliasId), toPlain(alias));
    }
    await batch.commit();
  }

  async listAliases(): Promise<readonly LegacyAliasMapping[]> {
    const snap = await this.db.collection(C_ALIASES).get();
    return snap.docs
      .map((d) => d.data() as LegacyAliasMapping)
      .sort((a, b) => a.aliasId.localeCompare(b.aliasId));
  }

  async markRolledBack(
    aliasIds: readonly string[],
    at: EpochMillis,
  ): Promise<void> {
    const batch = this.db.batch();
    for (const aliasId of aliasIds) {
      // Kemas kini medan sahaja — dokumen alias TIDAK PERNAH dipadam.
      batch.set(
        this.db.collection(C_ALIASES).doc(aliasId),
        { status: "rolled_back", supersededAt: at },
        { merge: true },
      );
    }
    await batch.commit();
  }

  // --- Checkpoint ----------------------------------------------------------

  async saveCheckpoint(checkpoint: MigrationCheckpoint): Promise<void> {
    await this.db
      .collection(C_CHECKPOINTS)
      .doc(checkpoint.checkpointId)
      .set(toPlain(checkpoint));
  }

  async getCheckpoint(checkpointId: string): Promise<MigrationCheckpoint | null> {
    const doc = await this.db.collection(C_CHECKPOINTS).doc(checkpointId).get();
    return doc.exists ? (doc.data() as MigrationCheckpoint) : null;
  }

  // --- Rekod canonical emulator --------------------------------------------

  async saveCanonicalRecords(
    records: readonly EmulatorCanonicalRecord[],
  ): Promise<void> {
    const batch = this.db.batch();
    for (const record of records) {
      batch.set(
        this.db.collection(C_EMU_CANONICAL).doc(record.canonicalPlaceId),
        toPlain(record),
      );
    }
    await batch.commit();
  }

  async listCanonicalRecords(): Promise<readonly EmulatorCanonicalRecord[]> {
    const snap = await this.db.collection(C_EMU_CANONICAL).get();
    return snap.docs
      .map((d) => d.data() as EmulatorCanonicalRecord)
      .sort((a, b) => a.canonicalPlaceId.localeCompare(b.canonicalPlaceId));
  }

  async deactivateCanonicalRecords(
    canonicalPlaceIds: readonly string[],
  ): Promise<void> {
    const batch = this.db.batch();
    for (const id of canonicalPlaceIds) {
      // Nyahaktif, bukan padam.
      batch.set(
        this.db.collection(C_EMU_CANONICAL).doc(id),
        { active: false },
        { merge: true },
      );
    }
    await batch.commit();
  }

  async saveRollbackPlan(plan: MigrationRollbackPlan): Promise<void> {
    await this.db
      .collection(C_ROLLBACK)
      .doc(plan.rollbackPlanId)
      .set(toPlain(plan));
  }

  async getRollbackPlan(
    rollbackPlanId: string,
  ): Promise<MigrationRollbackPlan | null> {
    const doc = await this.db.collection(C_ROLLBACK).doc(rollbackPlanId).get();
    return doc.exists ? (doc.data() as MigrationRollbackPlan) : null;
  }

  // --- Audit (hanya-tambah melalui create) ---------------------------------

  async appendAudit(entries: readonly MigrationAuditEntry[]): Promise<void> {
    for (const entry of entries) {
      try {
        // `create` gagal jika dokumen wujud — menguatkuasa hanya-tambah.
        await this.db.collection(C_AUDIT).doc(entry.auditId).create(toPlain(entry));
      } catch {
        // Entri sedia ada dibiarkan tidak berubah (main semula idempoten).
      }
    }
  }

  async listAudit(migrationPlanId: string): Promise<readonly MigrationAuditEntry[]> {
    const snap = await this.db
      .collection(C_AUDIT)
      .where("migrationPlanId", "==", migrationPlanId)
      .get();
    return snap.docs.map((d) => d.data() as MigrationAuditEntry);
  }

  // --- Perbandingan bayangan ----------------------------------------------

  async saveComparisons(
    comparisons: readonly PlaceReadComparison[],
  ): Promise<void> {
    const batch = this.db.batch();
    for (const comparison of comparisons) {
      const id = `${comparison.placeId}_${comparison.comparedAt}`;
      batch.set(this.db.collection(C_COMPARISONS).doc(id), toPlain(comparison));
    }
    await batch.commit();
  }

  async listComparisons(): Promise<readonly PlaceReadComparison[]> {
    const snap = await this.db.collection(C_COMPARISONS).get();
    return snap.docs.map((d) => d.data() as PlaceReadComparison);
  }

  // --- Penanda penyiapan ---------------------------------------------------

  async saveMarker(marker: MigrationCompletionMarker): Promise<void> {
    await this.db.collection(C_MARKERS).doc(marker.markerId).set(toPlain(marker));
  }

  async listMarkers(): Promise<readonly MigrationCompletionMarker[]> {
    const snap = await this.db.collection(C_MARKERS).get();
    return snap.docs.map((d) => d.data() as MigrationCompletionMarker);
  }
}
