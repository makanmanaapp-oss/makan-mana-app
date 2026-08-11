/**
 * Phase 1.12 Part J — pelaksanaan migrasi EMULATOR SAHAJA.
 *
 * Fungsi ini tulen: ia mengira APA yang perlu dicipta dan memulangkan hasilnya.
 * Repository emulator kemudian mengekalkannya. Ini bermakna logik pelaksanaan
 * boleh diuji sepenuhnya tanpa Firestore.
 *
 * Ia TIDAK PERNAH:
 * - menulis `place_registry` produksi
 * - memadam `places_cache` atau `place_details`
 * - memadam favorites / meals / history / suggestions
 * - menerbitkan data yang boleh dilihat mudah alih
 */
import { EpochMillis } from "../common";
import { LegacyAliasMapping, activateAlias } from "./migrationAlias";
import { LegacyPlaceMigrationCandidate, candidateIsExecutable } from "./migrationCandidate";
import {
  MigrationCheckpoint,
  completeCheckpoint,
  recordCandidate,
  verifyCheckpoint,
} from "./migrationCheckpoint";
import { PlaceMigrationPlan, planIsExecutable } from "./migrationPlan";
import { MigrationAuditEntry } from "./migrationTypes";
import { MigrationRollbackPlan, buildRollbackPlan } from "./rollbackPlan";
import {
  ReferenceRewritePlan,
  markRewriteAppliedInEmulator,
} from "./referenceRewrite";

/** Rekod canonical yang dicipta dalam emulator (bukan produksi). */
export interface EmulatorCanonicalRecord {
  canonicalPlaceId: string;
  candidateId: string;
  migrationPlanId: string;
  displayName: string;
  lat?: number;
  lng?: number;
  address?: string;
  /** Sentiasa benar — rekod ini hidup dalam emulator sahaja. */
  emulatorOnly: true;
  /** Sentiasa false — migrasi tidak pernah menerbitkan. */
  published: false;
  active: boolean;
  createdAt: EpochMillis;
}

export const EXECUTION_REFUSAL_CODES = [
  "plan_not_executable",
  "dry_run_incomplete",
  "checkpoint_corrupt",
  "non_emulator_target",
] as const;
export type ExecutionRefusalCode = (typeof EXECUTION_REFUSAL_CODES)[number];

export interface ExecutionResult {
  ok: boolean;
  refusalCode: ExecutionRefusalCode | null;
  canonicalRecords: EmulatorCanonicalRecord[];
  aliases: LegacyAliasMapping[];
  rewrites: ReferenceRewritePlan[];
  heldCandidateIds: string[];
  skippedAlreadyProcessed: string[];
  checkpoint: MigrationCheckpoint;
  rollbackPlan: MigrationRollbackPlan | null;
  audit: MigrationAuditEntry[];
  /** Pengesahan eksplisit yang dibawa dalam hasil itu sendiri. */
  wroteProductionData: false;
  deletedLegacyData: false;
}

export interface ExecuteInput {
  plan: PlaceMigrationPlan;
  candidates: readonly LegacyPlaceMigrationCandidate[];
  checkpoint: MigrationCheckpoint;
  /** Rekod canonical yang sudah wujud daripada larian terdahulu. */
  existingCanonicalIds?: readonly string[];
  actorId: string;
}

function refuse(
  code: ExecutionRefusalCode,
  checkpoint: MigrationCheckpoint,
): ExecutionResult {
  return {
    ok: false,
    refusalCode: code,
    canonicalRecords: [],
    aliases: [],
    rewrites: [],
    heldCandidateIds: [],
    skippedAlreadyProcessed: [],
    checkpoint,
    rollbackPlan: null,
    audit: [],
    wroteProductionData: false,
    deletedLegacyData: false,
  };
}

let auditSequence = 0;
function audit(
  action: MigrationAuditEntry["action"],
  at: EpochMillis,
  fields: Partial<MigrationAuditEntry>,
): MigrationAuditEntry {
  auditSequence += 1;
  return {
    auditId: `MAU-${String(auditSequence).padStart(8, "0")}`,
    action,
    actorType: "system",
    reasonCode: "emulator_execution",
    at,
    ...fields,
  } as MigrationAuditEntry;
}

/**
 * Laksanakan pelan dalam emulator.
 *
 * Idempoten: calon yang sudah direkodkan dalam checkpoint dilangkau, jadi
 * menjalankan semula fungsi ini dengan checkpoint yang sama tidak menghasilkan
 * rekod pendua.
 */
export function executeMigrationPlanInEmulator(
  input: ExecuteInput,
  now: EpochMillis,
): ExecutionResult {
  const { plan, checkpoint } = input;

  // --- Prasyarat -----------------------------------------------------------
  if (plan.targetCollectionMode !== "emulator_only") {
    return refuse("non_emulator_target", checkpoint);
  }
  if (plan.status === "draft" || plan.status === "dry_run_ready") {
    return refuse("dry_run_incomplete", checkpoint);
  }
  if (!planIsExecutable(plan)) {
    return refuse("plan_not_executable", checkpoint);
  }
  const integrity = verifyCheckpoint(checkpoint);
  if (!integrity.ok) {
    return refuse("checkpoint_corrupt", checkpoint);
  }

  const existingCanonical = new Set(input.existingCanonicalIds ?? []);
  const canonicalRecords: EmulatorCanonicalRecord[] = [];
  const aliases: LegacyAliasMapping[] = [];
  const rewrites: ReferenceRewritePlan[] = [];
  const heldCandidateIds: string[] = [];
  const skippedAlreadyProcessed: string[] = [];
  const entries: MigrationAuditEntry[] = [
    audit("emulator_execution_started", now, { migrationPlanId: plan.migrationPlanId }),
  ];

  let workingCheckpoint = checkpoint;
  const planCandidateIds = new Set(plan.candidateIds);
  const ordered = [...input.candidates].sort((a, b) =>
    a.candidateId.localeCompare(b.candidateId),
  );

  for (const candidate of ordered) {
    if (!planCandidateIds.has(candidate.candidateId)) continue;

    // Idempotensi: jangan sekali-kali laksanakan calon yang sama dua kali.
    if (workingCheckpoint.processedCandidateIds.includes(candidate.candidateId)) {
      skippedAlreadyProcessed.push(candidate.candidateId);
      continue;
    }

    // Calon yang ditahan TIDAK PERNAH dilaksanakan.
    if (!candidateIsExecutable(candidate)) {
      heldCandidateIds.push(candidate.candidateId);
      workingCheckpoint = recordCandidate(
        workingCheckpoint,
        candidate.candidateId,
        "held",
        now,
      );
      entries.push(
        audit("candidate_held", now, {
          migrationPlanId: plan.migrationPlanId,
          candidateId: candidate.candidateId,
          reasonCode: candidate.holdReasons.join(",") || "not_ready",
        }),
      );
      continue;
    }

    // --- Cipta rekod canonical emulator ------------------------------------
    if (!existingCanonical.has(candidate.proposedCanonicalPlaceId)) {
      canonicalRecords.push({
        canonicalPlaceId: candidate.proposedCanonicalPlaceId,
        candidateId: candidate.candidateId,
        migrationPlanId: plan.migrationPlanId,
        displayName: candidate.proposedCanonicalSnapshot.canonicalName,
        lat: candidate.proposedCanonicalSnapshot.lat,
        lng: candidate.proposedCanonicalSnapshot.lng,
        address: candidate.proposedCanonicalSnapshot.address,
        emulatorOnly: true,
        published: false,
        active: true,
        createdAt: now,
      });
      existingCanonical.add(candidate.proposedCanonicalPlaceId);
      entries.push(
        audit("emulator_canonical_created", now, {
          migrationPlanId: plan.migrationPlanId,
          candidateId: candidate.candidateId,
          canonicalPlaceId: candidate.proposedCanonicalPlaceId,
        }),
      );
    }

    // --- Aktifkan alias ----------------------------------------------------
    for (const alias of plan.aliasesToCreate.filter(
      (a) => a.canonicalPlaceId === candidate.proposedCanonicalPlaceId,
    )) {
      aliases.push(activateAlias(alias));
      entries.push(
        audit("emulator_alias_created", now, {
          migrationPlanId: plan.migrationPlanId,
          candidateId: candidate.candidateId,
          canonicalPlaceId: alias.canonicalPlaceId,
          legacyPlaceId: alias.legacyValue,
        }),
      );
    }

    // --- Tulis semula rujukan (emulator sahaja, nilai legasi dikekalkan) ----
    for (const rewrite of plan.referenceRewritePlan.filter(
      (r) => r.canonicalPlaceId === candidate.proposedCanonicalPlaceId,
    )) {
      rewrites.push(markRewriteAppliedInEmulator(rewrite));
      entries.push(
        audit("emulator_reference_rewritten", now, {
          migrationPlanId: plan.migrationPlanId,
          candidateId: candidate.candidateId,
          legacyPlaceId: rewrite.legacyPlaceId,
          canonicalPlaceId: rewrite.canonicalPlaceId,
        }),
      );
    }

    workingCheckpoint = recordCandidate(
      workingCheckpoint,
      candidate.candidateId,
      "succeeded",
      now,
    );
    entries.push(
      audit("checkpoint_written", now, {
        migrationPlanId: plan.migrationPlanId,
        candidateId: candidate.candidateId,
      }),
    );
  }

  workingCheckpoint = completeCheckpoint(workingCheckpoint, now);

  const rollbackPlan = buildRollbackPlan(
    {
      rollbackPlanId: plan.rollbackPlanId,
      migrationPlanId: plan.migrationPlanId,
      createdCanonicalIds: canonicalRecords.map((r) => r.canonicalPlaceId),
      createdAliases: aliases,
      rewrites,
    },
    now,
  );

  entries.push(
    audit("rollback_prepared", now, { migrationPlanId: plan.migrationPlanId }),
    audit("emulator_execution_completed", now, {
      migrationPlanId: plan.migrationPlanId,
    }),
  );

  return {
    ok: true,
    refusalCode: null,
    canonicalRecords,
    aliases,
    rewrites,
    heldCandidateIds,
    skippedAlreadyProcessed,
    checkpoint: workingCheckpoint,
    rollbackPlan,
    audit: entries,
    wroteProductionData: false,
    deletedLegacyData: false,
  };
}

/** Tetapkan semula pembilang audit (ujian sahaja — menjaga ID deterministik). */
export function resetAuditSequenceForTests(): void {
  auditSequence = 0;
}
