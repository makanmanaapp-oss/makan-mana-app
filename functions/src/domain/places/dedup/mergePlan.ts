/** Phase 1.4 — pelan merge (selamat, boleh balik, kekalkan alias & sumber). */
import { EpochMillis } from "../common";
import { PlaceAlias } from "../placeMerge";
import { SourceReference } from "../placeSource";
import { hashCanonical } from "../staging/hashing";
import { PlaceMergeAuditEntry } from "./dedupAudit";

export const MERGE_PLAN_STATUS = [
  "draft",
  "review_required",
  "approved",
  "executed_in_emulator",
  "cancelled",
  "rolled_back",
] as const;
export type MergePlanStatus = (typeof MERGE_PLAN_STATUS)[number];

export interface FieldResolutionPlanEntry {
  field: string;
  selectedValue: unknown;
  selectedFrom: string;
  rejected: unknown[];
  conflict: boolean;
  reason: string;
}

export interface ResolutionPlanEntry {
  key: string;
  selected: unknown;
  reason: string;
}

export interface ReversibleMergeMetadata {
  originalSourceIds: string[];
  originalAliases: PlaceAlias[];
  originalSourceRefs: SourceReference[];
  snapshotHash: string;
}

export interface PlaceMergePlan {
  mergePlanId: string;
  sourcePlaceIds: string[];
  targetCanonicalPlaceId: string;
  preservedAliases: PlaceAlias[];
  preservedSourceRefs: SourceReference[];
  fieldResolutionPlan: FieldResolutionPlanEntry[];
  tagResolutionPlan: ResolutionPlanEntry[];
  mediaResolutionPlan: ResolutionPlanEntry[];
  provenanceResolutionPlan: ResolutionPlanEntry[];
  conflictList: string[];
  auditEntries: PlaceMergeAuditEntry[];
  createdBy: string;
  createdAt: EpochMillis;
  approvedBy?: string;
  approvedAt?: EpochMillis;
  reversibleMetadata: ReversibleMergeMetadata;
  status: MergePlanStatus;
}

export interface BuildMergePlanInput {
  mergePlanId: string;
  sourcePlaceIds: string[];
  targetCanonicalPlaceId: string;
  aliases: PlaceAlias[];
  sourceRefs: SourceReference[];
  fieldResolutionPlan?: FieldResolutionPlanEntry[];
  tagResolutionPlan?: ResolutionPlanEntry[];
  mediaResolutionPlan?: ResolutionPlanEntry[];
  provenanceResolutionPlan?: ResolutionPlanEntry[];
  conflictList?: string[];
  createdBy: string;
  now: EpochMillis;
}

/**
 * Bina pelan merge yang MENGEKALKAN setiap sourcePlaceId sebagai alias ke
 * target (tiada rujukan pengguna pecah) + semua source refs + metadata boleh
 * balik. Status awal "draft". TIDAK melaksanakan apa-apa terhadap produksi.
 */
export function buildMergePlan(input: BuildMergePlanInput): PlaceMergePlan {
  const preservedAliases: PlaceAlias[] = [...input.aliases];
  for (const sid of input.sourcePlaceIds) {
    if (sid === input.targetCanonicalPlaceId) continue;
    if (!preservedAliases.some((a) => a.aliasId === sid)) {
      preservedAliases.push({
        aliasId: sid,
        canonicalPlaceId: input.targetCanonicalPlaceId,
        aliasType: "merged_from",
        createdAt: input.now,
        reason: "merge_source_preserved",
      });
    }
  }

  const reversibleMetadata: ReversibleMergeMetadata = {
    originalSourceIds: [...input.sourcePlaceIds],
    originalAliases: [...input.aliases],
    originalSourceRefs: [...input.sourceRefs],
    snapshotHash: hashCanonical({
      sourceIds: [...input.sourcePlaceIds].sort(),
      target: input.targetCanonicalPlaceId,
    }),
  };

  return {
    mergePlanId: input.mergePlanId,
    sourcePlaceIds: [...input.sourcePlaceIds],
    targetCanonicalPlaceId: input.targetCanonicalPlaceId,
    preservedAliases,
    preservedSourceRefs: [...input.sourceRefs],
    fieldResolutionPlan: input.fieldResolutionPlan ?? [],
    tagResolutionPlan: input.tagResolutionPlan ?? [],
    mediaResolutionPlan: input.mediaResolutionPlan ?? [],
    provenanceResolutionPlan: input.provenanceResolutionPlan ?? [],
    conflictList: input.conflictList ?? [],
    auditEntries: [],
    createdBy: input.createdBy,
    createdAt: input.now,
    reversibleMetadata,
    status: "draft",
  };
}

const ALLOWED_PLAN: Record<MergePlanStatus, MergePlanStatus[]> = {
  draft: ["review_required", "cancelled"],
  review_required: ["approved", "cancelled"],
  approved: ["executed_in_emulator", "cancelled"],
  executed_in_emulator: ["rolled_back"],
  cancelled: [],
  rolled_back: [],
};

export function canTransitionMergePlan(
  from: MergePlanStatus,
  to: MergePlanStatus,
): boolean {
  if (from === to) return false;
  return (ALLOWED_PLAN[from] ?? []).includes(to);
}

export function assertValidMergePlanTransition(
  from: MergePlanStatus,
  to: MergePlanStatus,
): void {
  if (!canTransitionMergePlan(from, to)) {
    throw new Error(`invalid merge plan transition: ${from} -> ${to}`);
  }
}
