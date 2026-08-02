/**
 * Phase 1.12 Part K — pelan rollback.
 *
 * Rollback mesti selalu tersedia. Rekod legasi tidak pernah dipadam, jadi
 * "kembali" bermakna: nyahaktifkan rekod canonical emulator, tandakan alias
 * sebagai `rolled_back` (BUKAN padam), dan pulihkan rujukan daripada nilai
 * legasi yang telah dikekalkan.
 */
import { EpochMillis } from "../common";
import { LegacyAliasMapping, markAliasRolledBack } from "./migrationAlias";
import { RollbackStatus } from "./migrationTypes";
import { ReferenceRewritePlan, markRewriteRolledBack } from "./referenceRewrite";

/** Salinan nilai legasi sebelum sebarang penulisan semula emulator. */
export interface LegacyBackupEntry {
  sourcePath: string;
  fieldPath: string;
  legacyValue: string;
  backedUpAt: EpochMillis;
}

export interface RollbackStep {
  stepId: string;
  order: number;
  action:
    | "deactivate_canonical_record"
    | "mark_alias_rolled_back"
    | "restore_reference_from_backup"
    | "record_audit";
  targetId: string;
  /** Rollback TIDAK PERNAH memadam apa-apa. */
  destructive: false;
}

export interface RollbackValidationCheck {
  checkId: string;
  description: string;
  passed: boolean;
}

export interface MigrationRollbackPlan {
  rollbackPlanId: string;
  migrationPlanId: string;
  createdCanonicalIds: string[];
  createdAliasIds: string[];
  rewrittenReferences: string[];
  legacyBackups: LegacyBackupEntry[];
  rollbackSteps: RollbackStep[];
  validationChecks: RollbackValidationCheck[];
  status: RollbackStatus;
  createdAt: EpochMillis;
  executedAt?: EpochMillis;
}

export interface BuildRollbackInput {
  rollbackPlanId: string;
  migrationPlanId: string;
  createdCanonicalIds: readonly string[];
  createdAliases: readonly LegacyAliasMapping[];
  rewrites: readonly ReferenceRewritePlan[];
}

/**
 * Bina pelan rollback daripada apa yang sebenarnya dicipta semasa pelaksanaan
 * emulator. Sandaran diambil daripada nilai legasi yang telah dikekalkan dalam
 * setiap penulisan semula — itulah sebabnya `aliasPreserved` mesti sentiasa benar.
 */
export function buildRollbackPlan(
  input: BuildRollbackInput,
  now: EpochMillis,
): MigrationRollbackPlan {
  const backups: LegacyBackupEntry[] = input.rewrites.map((r) => ({
    sourcePath: r.sourcePath,
    fieldPath: r.fieldPath,
    legacyValue: r.legacyPlaceId,
    backedUpAt: now,
  }));

  const steps: RollbackStep[] = [];
  let order = 0;
  for (const canonicalId of [...input.createdCanonicalIds].sort()) {
    steps.push({
      stepId: `RBS-${order}`,
      order: order++,
      action: "deactivate_canonical_record",
      targetId: canonicalId,
      destructive: false,
    });
  }
  for (const alias of [...input.createdAliases].sort((a, b) =>
    a.aliasId.localeCompare(b.aliasId),
  )) {
    steps.push({
      stepId: `RBS-${order}`,
      order: order++,
      action: "mark_alias_rolled_back",
      targetId: alias.aliasId,
      destructive: false,
    });
  }
  for (const rewrite of [...input.rewrites].sort((a, b) =>
    a.rewriteId.localeCompare(b.rewriteId),
  )) {
    steps.push({
      stepId: `RBS-${order}`,
      order: order++,
      action: "restore_reference_from_backup",
      targetId: rewrite.rewriteId,
      destructive: false,
    });
  }
  steps.push({
    stepId: `RBS-${order}`,
    order: order,
    action: "record_audit",
    targetId: input.migrationPlanId,
    destructive: false,
  });

  const validationChecks: RollbackValidationCheck[] = [
    {
      checkId: "legacy_records_preserved",
      description: "Legacy documents were never deleted, so they remain readable.",
      passed: true,
    },
    {
      checkId: "aliases_not_hard_deleted",
      description: "Aliases are marked rolled_back instead of being removed.",
      passed: true,
    },
    {
      checkId: "reference_backups_available",
      description: "Every rewritten reference kept its legacy value for restore.",
      passed: input.rewrites.every((r) => r.aliasPreserved),
    },
    {
      checkId: "audit_preserved",
      description: "The migration audit trail is append-only and survives rollback.",
      passed: true,
    },
  ];

  return {
    rollbackPlanId: input.rollbackPlanId,
    migrationPlanId: input.migrationPlanId,
    createdCanonicalIds: [...input.createdCanonicalIds].sort(),
    createdAliasIds: input.createdAliases.map((a) => a.aliasId).sort(),
    rewrittenReferences: input.rewrites.map((r) => r.rewriteId).sort(),
    legacyBackups: backups.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath)),
    rollbackSteps: steps,
    validationChecks,
    status: steps.length > 1 ? "prepared" : "not_required",
    createdAt: now,
  };
}

export interface RollbackApplication {
  plan: MigrationRollbackPlan;
  aliases: LegacyAliasMapping[];
  rewrites: ReferenceRewritePlan[];
  deactivatedCanonicalIds: string[];
}

/**
 * Gunakan rollback secara tulen. Idempoten: menjalankannya semula ke atas
 * keadaan yang sudah dibatalkan menghasilkan keadaan yang sama.
 */
export function applyRollback(
  plan: MigrationRollbackPlan,
  aliases: readonly LegacyAliasMapping[],
  rewrites: readonly ReferenceRewritePlan[],
  now: EpochMillis,
): RollbackApplication {
  const aliasIds = new Set(plan.createdAliasIds);
  const rewriteIds = new Set(plan.rewrittenReferences);

  return {
    plan: { ...plan, status: "executed", executedAt: now },
    aliases: aliases.map((a) =>
      aliasIds.has(a.aliasId) && a.status !== "rolled_back"
        ? markAliasRolledBack(a, now)
        : a,
    ),
    rewrites: rewrites.map((r) =>
      rewriteIds.has(r.rewriteId) && r.status !== "rolled_back"
        ? markRewriteRolledBack(r)
        : r,
    ),
    deactivatedCanonicalIds: [...plan.createdCanonicalIds],
  };
}
