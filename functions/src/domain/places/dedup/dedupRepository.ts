/**
 * Phase 1.4 — antara muka repository dedup (selamat).
 * TIADA merge canonical produksi, TIADA hard delete, TIADA publish,
 * TIADA tulisan place_registry. createDuplicateCandidate = IDEMPOTEN.
 */
import { AliasResolution } from "./aliasResolver";
import { PlaceAlias } from "../placeMerge";
import { PlaceDuplicateCandidate, DuplicateReviewStatus } from "./duplicateCandidate";
import { DuplicateDecision } from "./duplicateDecision";
import { PlaceMergePlan, MergePlanStatus } from "./mergePlan";
import { PlaceMergeAuditEntry } from "./dedupAudit";
import { TrustedActor } from "../staging/stagingAudit";

export const MAX_DEDUP_PAGE_LIMIT = 100;

export interface DedupPagination {
  limit: number;
  cursor?: string;
}
export interface DedupPage<T> {
  items: T[];
  nextCursor?: string;
}
export interface DuplicateListFilter {
  reviewStatus?: DuplicateReviewStatus;
  decision?: DuplicateDecision;
  stagingRecordId?: string;
}

export interface PlaceDuplicateRepository {
  /** Idempoten — jika ID sudah wujud, pulang entri sedia ada (tiada gandaan). */
  createDuplicateCandidate(
    candidate: PlaceDuplicateCandidate,
    actor: TrustedActor,
  ): Promise<PlaceDuplicateCandidate>;
  getDuplicateCandidate(id: string): Promise<PlaceDuplicateCandidate | null>;
  listDuplicateCandidates(
    filter: DuplicateListFilter,
    page: DedupPagination,
  ): Promise<DedupPage<PlaceDuplicateCandidate>>;
  updateDuplicateReviewStatus(
    id: string,
    to: DuplicateReviewStatus,
    actor: TrustedActor,
    resolution?: string,
  ): Promise<PlaceDuplicateCandidate>;
}

export interface PlaceMergePlanRepository {
  createMergePlan(plan: PlaceMergePlan, actor: TrustedActor): Promise<PlaceMergePlan>;
  getMergePlan(id: string): Promise<PlaceMergePlan | null>;
  transitionMergePlan(
    id: string,
    to: MergePlanStatus,
    actor: TrustedActor,
  ): Promise<PlaceMergePlan>;
  cancelMergePlan(id: string, actor: TrustedActor): Promise<PlaceMergePlan>;
  appendMergeAudit(
    planId: string,
    entry: PlaceMergeAuditEntry,
  ): Promise<PlaceMergeAuditEntry>;
  listMergeAudit(planId: string): Promise<PlaceMergeAuditEntry[]>;
}

export interface PlaceAliasRepository {
  putAlias(alias: PlaceAlias, actor: TrustedActor): Promise<PlaceAlias>;
  getAlias(aliasId: string): Promise<PlaceAlias | null>;
  /** Peta alias→canonical untuk resolusi (emulator/ujian sahaja). */
  buildAliasMap(): Promise<Map<string, string>>;
  resolve(aliasId: string): Promise<AliasResolution>;
}
