/**
 * Phase 1.12 Part E — kontrak pelan migrasi.
 *
 * Pelan adalah artifak DETERMINISTIK: input legasi yang sama menghasilkan
 * `contentHash` yang sama. Mengubah walau satu bait data legasi mengubah hash,
 * yang bermakna pelan lama tidak boleh dilaksanakan secara senyap terhadap
 * data baharu.
 */
import { EpochMillis } from "../common";
import { hashCanonical } from "../staging/hashing";
import { LegacyAliasMapping } from "./migrationAlias";
import { ProposedCanonicalSnapshot } from "./migrationCandidate";
import {
  CheckpointStrategy,
  LegacyCollection,
  MIGRATION_ALGORITHM_VERSION,
  MIGRATION_CONFIG_VERSION,
  MigrationPlanStatus,
  TargetCollectionMode,
} from "./migrationTypes";
import { ReferenceRewritePlan } from "./referenceRewrite";

export interface DryRunSummary {
  totalLegacyRecords: number;
  uniqueIdentities: number;
  readyCandidates: number;
  ambiguousCandidates: number;
  branchConflicts: number;
  blockedCandidates: number;
  aliasesProposed: number;
  criticalReferences: number;
  unresolvedReferences: number;
  estimatedAffectedDocuments: number;
  /**
   * Pengesahan eksplisit yang dibawa dalam pelan itu sendiri. Ia sentiasa
   * benar dalam fasa ini kerana satu-satunya mod sasaran ialah emulator.
   */
  zeroProductionWritesConfirmed: true;
}

export interface CanonicalSnapshotToCreate {
  canonicalPlaceId: string;
  candidateId: string;
  snapshot: ProposedCanonicalSnapshot;
}

export interface PlaceMigrationPlan {
  migrationPlanId: string;
  batchId: string;
  candidateIds: string[];
  sourceCollections: LegacyCollection[];
  targetCollectionMode: TargetCollectionMode;
  aliasesToCreate: LegacyAliasMapping[];
  canonicalSnapshotsToCreate: CanonicalSnapshotToCreate[];
  referenceRewritePlan: ReferenceRewritePlan[];
  unresolvedReferences: ReferenceRewritePlan[];
  conflicts: string[];
  warnings: string[];
  dryRunSummary: DryRunSummary;
  rollbackPlanId: string;
  checkpointStrategy: CheckpointStrategy;
  contentHash: string;
  algorithmVersion: string;
  configVersion: string;
  status: MigrationPlanStatus;
  createdBy: string;
  createdAt: EpochMillis;
  approvedBy?: string;
  approvedAt?: EpochMillis;
}

/** Peralihan status pelan yang dibenarkan. */
const PLAN_TRANSITIONS: Readonly<
  Record<MigrationPlanStatus, readonly MigrationPlanStatus[]>
> = {
  draft: ["dry_run_ready", "cancelled", "blocked"],
  dry_run_ready: ["dry_run_completed", "blocked", "cancelled"],
  dry_run_completed: ["review_required", "approved_for_emulator", "blocked", "cancelled"],
  review_required: ["approved_for_emulator", "blocked", "cancelled"],
  approved_for_emulator: ["executed_in_emulator", "paused", "cancelled", "blocked"],
  executed_in_emulator: ["rolled_back", "paused"],
  paused: ["approved_for_emulator", "executed_in_emulator", "cancelled", "rolled_back"],
  cancelled: [],
  rolled_back: [],
  blocked: ["draft", "cancelled"],
};

export function canTransitionPlan(
  from: MigrationPlanStatus,
  to: MigrationPlanStatus,
): boolean {
  return PLAN_TRANSITIONS[from].includes(to);
}

/**
 * Cincang kandungan pelan. SENGAJA mengecualikan cap masa, pengarang dan
 * status supaya dry-run berulang atas data yang sama menghasilkan hash yang
 * sama (idempotensi), sambil kekal sensitif kepada perubahan data legasi.
 */
export function computePlanHash(input: {
  batchId: string;
  candidateHashes: readonly { candidateId: string; contentHash: string }[];
  aliasKeys: readonly string[];
  rewriteIds: readonly string[];
  targetCollectionMode: TargetCollectionMode;
}): string {
  return hashCanonical({
    batchId: input.batchId,
    candidateHashes: [...input.candidateHashes].sort((a, b) =>
      a.candidateId.localeCompare(b.candidateId),
    ),
    aliasKeys: [...input.aliasKeys].sort(),
    rewriteIds: [...input.rewriteIds].sort(),
    targetCollectionMode: input.targetCollectionMode,
    algorithmVersion: MIGRATION_ALGORITHM_VERSION,
    configVersion: MIGRATION_CONFIG_VERSION,
  });
}

/** ID pelan deterministik daripada cincang kandungannya. */
export function migrationPlanId(contentHash: string): string {
  return `MPL-${contentHash.slice(0, 24)}`;
}

/**
 * Pelan boleh dilaksanakan HANYA apabila diluluskan untuk emulator dan tiada
 * konflik yang belum diselesaikan.
 */
export function planIsExecutable(plan: PlaceMigrationPlan): boolean {
  if (plan.targetCollectionMode !== "emulator_only") return false;
  if (plan.status !== "approved_for_emulator" && plan.status !== "paused") {
    return false;
  }
  if (plan.conflicts.length > 0) return false;
  return plan.candidateIds.length > 0;
}
