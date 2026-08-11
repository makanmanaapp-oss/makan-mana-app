/**
 * Phase 1.12 Part F — perancang dry-run.
 *
 * `buildLegacyMigrationPlan` melaksanakan keseluruhan saluran paip 12 langkah
 * secara TULEN: tiada I/O, tiada Date.now(), tiada kesan sampingan. Ia hanya
 * membaca inventori yang sudah dikumpulkan dan menghasilkan satu pelan.
 *
 * Tiada tulisan produksi berlaku — pelan sentiasa `emulator_only`.
 */
import { EpochMillis } from "../common";
import { DEFAULT_DEDUP_CONFIG, DedupConfig } from "../dedup/config";
import {
  LegacyPlaceInventoryRecord,
  LegacyReferencePointer,
  groupByLegacyPlaceId,
} from "./legacyInventory";
import {
  AliasProposalInput,
  LegacyAliasMapping,
  aliasProposalsFor,
  buildAliasProposal,
  checkAliasProposal,
  resolveLegacyPlaceId,
} from "./migrationAlias";
import {
  LegacyPlaceMigrationCandidate,
  buildMigrationCandidate,
  candidateIsExecutable,
} from "./migrationCandidate";
import {
  CanonicalSnapshotToCreate,
  DryRunSummary,
  PlaceMigrationPlan,
  computePlanHash,
  migrationPlanId,
} from "./migrationPlan";
import {
  LegacyCollection,
  MIGRATION_ALGORITHM_VERSION,
  MIGRATION_CONFIG_VERSION,
} from "./migrationTypes";
import { ReferenceRewritePlan, buildRewritePreview } from "./referenceRewrite";
import {
  DEFAULT_REFERENCE_SCAN_LIMITS,
  ReferenceScanLimits,
  mergeReferenceImpact,
  scanReferenceImpact,
} from "./referenceImpact";

export interface BuildMigrationPlanInput {
  batchId: string;
  records: readonly LegacyPlaceInventoryRecord[];
  /** Alias yang sudah wujud (daripada larian sebelumnya atau fasa lain). */
  existingAliases?: readonly LegacyAliasMapping[];
  createdBy: string;
  config?: DedupConfig;
  scanLimits?: ReferenceScanLimits;
}

export interface MigrationPlanBuildResult {
  plan: PlaceMigrationPlan;
  candidates: LegacyPlaceMigrationCandidate[];
}

/**
 * Langkah 1-12 saluran paip dry-run.
 *
 * 1. inventori rekod legasi (diterima sebagai input, dibaca sahaja)
 * 2. normalisasi identiti
 * 3. selesaikan calon duplikat
 * 4. kesan cawangan
 * 5. selesaikan alias sedia ada
 * 6. imbas rujukan
 * 7. sahkan snapshot canonical
 * 8. kira sebab tahan
 * 9. cipta alias yang dicadangkan
 * 10. cipta pratonton penulisan semula rujukan
 * 11. kira cincang pelan deterministik
 * 12. hasilkan ringkasan dry-run
 */
export function buildLegacyMigrationPlan(
  input: BuildMigrationPlanInput,
  now: EpochMillis,
): MigrationPlanBuildResult {
  const config = input.config ?? DEFAULT_DEDUP_CONFIG;
  const scanLimits = input.scanLimits ?? DEFAULT_REFERENCE_SCAN_LIMITS;
  const existingAliases = input.existingAliases ?? [];

  // --- 1. Inventori (dibaca sahaja, diisih untuk determinisme) --------------
  const records = [...input.records].sort((a, b) =>
    a.legacyRecordId.localeCompare(b.legacyRecordId),
  );
  const byPlaceId = groupByLegacyPlaceId(records);

  const candidates: LegacyPlaceMigrationCandidate[] = [];
  const aliasesToCreate: LegacyAliasMapping[] = [];
  const canonicalSnapshotsToCreate: CanonicalSnapshotToCreate[] = [];
  const rewritePlan: ReferenceRewritePlan[] = [];
  const unresolvedReferences: ReferenceRewritePlan[] = [];
  const conflicts: string[] = [];
  const warnings: string[] = [];
  const sourceCollections = new Set<LegacyCollection>();

  // Alias yang berkembang semasa perancangan — perlanggaran dalam-pelan dikesan.
  const runningAliases: LegacyAliasMapping[] = [...existingAliases];

  // Identiti setiap kumpulan, dikira dahulu supaya semakan cawangan boleh
  // membandingkan setiap kumpulan dengan jirannya.
  const placeIds = [...byPlaceId.keys()].sort();

  for (const legacyPlaceId of placeIds) {
    const group = byPlaceId.get(legacyPlaceId)!;
    for (const record of group) sourceCollections.add(record.legacyCollection);

    // --- 6. Imbas rujukan --------------------------------------------------
    const pointers: LegacyReferencePointer[] = group.flatMap((r) => r.referencedBy);
    const impact = mergeReferenceImpact(
      legacyPlaceId,
      [scanReferenceImpact(legacyPlaceId, pointers, now, scanLimits)],
      now,
    );

    // --- 5. Alias sedia ada ------------------------------------------------
    const existing = resolveLegacyPlaceId(legacyPlaceId, existingAliases);
    const existingCanonicalPlaceId =
      existing.status === "resolved" ? existing.canonicalPlaceId : undefined;
    if (existing.status === "circular") {
      conflicts.push(`circular_alias:${legacyPlaceId}`);
    }

    // --- 3 + 4. Duplikat dan cawangan --------------------------------------
    // Kumpulan lain yang berkongsi nama ternormal dianggap adik-beradik dan
    // dinilai untuk konflik cawangan.
    const siblingIdentities = candidates
      .filter(
        (c) =>
          c.normalizedIdentity.normalizedName ===
          (group[0].displayName ?? "").toLowerCase().trim(),
      )
      .map((c) => c.normalizedIdentity);

    // --- 2 + 7 + 8. Identiti, pengesahan, sebab tahan ----------------------
    const candidate = buildMigrationCandidate(
      {
        records: group,
        referenceImpact: impact,
        siblingIdentities,
        existingCanonicalPlaceId,
        config,
      },
      now,
    );

    // --- 9. Alias yang dicadangkan -----------------------------------------
    const proposals: AliasProposalInput[] = aliasProposalsFor(
      candidate.proposedAliases,
      candidate.proposedCanonicalPlaceId,
      candidate.legacyRecordIds[0],
      // ID pelan belum diketahui sehingga langkah 11; diisi semula di bawah.
      "PENDING",
    );

    const collisions: string[] = [];
    const acceptedAliases: LegacyAliasMapping[] = [];
    for (const proposal of proposals) {
      const check = checkAliasProposal(proposal, runningAliases);
      if (!check.ok) {
        collisions.push(`${check.code}:${proposal.legacyValue}`);
        continue;
      }
      const alias = buildAliasProposal(proposal, now);
      acceptedAliases.push(alias);
      runningAliases.push(alias);
    }

    // Bina semula calon apabila perlanggaran ditemui supaya keputusannya
    // mencerminkan sebab tahan sebenar dan bukannya keadaan optimistik.
    const finalCandidate =
      collisions.length > 0
        ? buildMigrationCandidate(
            {
              records: group,
              referenceImpact: impact,
              siblingIdentities,
              existingCanonicalPlaceId,
              aliasCollisions: collisions,
              config,
            },
            now,
          )
        : candidate;

    candidates.push(finalCandidate);
    if (collisions.length > 0) conflicts.push(...collisions);
    warnings.push(...finalCandidate.warnings);

    // Hanya calon yang boleh dilaksanakan menyumbang kerja kepada pelan.
    if (!candidateIsExecutable(finalCandidate)) continue;

    aliasesToCreate.push(...acceptedAliases);
    canonicalSnapshotsToCreate.push({
      canonicalPlaceId: finalCandidate.proposedCanonicalPlaceId,
      candidateId: finalCandidate.candidateId,
      snapshot: finalCandidate.proposedCanonicalSnapshot,
    });

    // --- 10. Pratonton penulisan semula rujukan ----------------------------
    const preview = buildRewritePreview(
      pointers,
      legacyPlaceId,
      finalCandidate.proposedCanonicalPlaceId,
      now,
    );
    rewritePlan.push(...preview.rewrites);
    unresolvedReferences.push(...preview.unresolved);
  }

  // --- 11. Cincang pelan deterministik -------------------------------------
  const contentHash = computePlanHash({
    batchId: input.batchId,
    candidateHashes: candidates.map((c) => ({
      candidateId: c.candidateId,
      contentHash: c.contentHash,
    })),
    aliasKeys: aliasesToCreate.map((a) => `${a.aliasType}|${a.legacyValue}`),
    rewriteIds: rewritePlan.map((r) => r.rewriteId),
    targetCollectionMode: "emulator_only",
  });
  const planId = migrationPlanId(contentHash);

  // Isi ID pelan sebenar ke dalam alias sekarang setelah ia diketahui.
  const stampedAliases = aliasesToCreate.map((a) => ({
    ...a,
    createdByMigrationPlanId: planId,
  }));

  // --- 12. Ringkasan dry-run -----------------------------------------------
  const summary: DryRunSummary = {
    totalLegacyRecords: records.length,
    uniqueIdentities: placeIds.length,
    readyCandidates: candidates.filter((c) => c.migrationDecision === "ready").length,
    ambiguousCandidates: candidates.filter((c) => c.migrationDecision === "ambiguous")
      .length,
    branchConflicts: candidates.filter((c) => c.migrationDecision === "branch_conflict")
      .length,
    blockedCandidates: candidates.filter(
      (c) => c.migrationDecision === "blocked" || c.holdReasons.length > 0,
    ).length,
    aliasesProposed: stampedAliases.length,
    criticalReferences: candidates.reduce(
      (sum, c) => sum + c.referenceImpact.criticalReferences,
      0,
    ),
    unresolvedReferences: unresolvedReferences.length,
    estimatedAffectedDocuments:
      canonicalSnapshotsToCreate.length + stampedAliases.length + rewritePlan.length,
    zeroProductionWritesConfirmed: true,
  };

  const plan: PlaceMigrationPlan = {
    migrationPlanId: planId,
    batchId: input.batchId,
    candidateIds: candidates.map((c) => c.candidateId).sort(),
    sourceCollections: [...sourceCollections].sort(),
    targetCollectionMode: "emulator_only",
    aliasesToCreate: stampedAliases,
    canonicalSnapshotsToCreate: canonicalSnapshotsToCreate.sort((a, b) =>
      a.canonicalPlaceId.localeCompare(b.canonicalPlaceId),
    ),
    referenceRewritePlan: rewritePlan.sort((a, b) =>
      a.rewriteId.localeCompare(b.rewriteId),
    ),
    unresolvedReferences: unresolvedReferences.sort((a, b) =>
      a.rewriteId.localeCompare(b.rewriteId),
    ),
    conflicts: [...new Set(conflicts)].sort(),
    warnings: [...new Set(warnings)].sort(),
    dryRunSummary: summary,
    rollbackPlanId: `RBK-${contentHash.slice(0, 24)}`,
    checkpointStrategy: "per_candidate",
    contentHash,
    algorithmVersion: MIGRATION_ALGORITHM_VERSION,
    configVersion: MIGRATION_CONFIG_VERSION,
    status: "dry_run_completed",
    createdBy: input.createdBy,
    createdAt: now,
  };

  return { plan, candidates };
}
