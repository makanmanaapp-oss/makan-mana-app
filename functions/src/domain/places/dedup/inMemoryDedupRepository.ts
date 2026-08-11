/**
 * Phase 1.4 — repository dedup DALAM-INGATAN (deterministik, emulator-safe).
 * Menguatkuasa: idempotency calon duplikat, peralihan status dikawal mesin
 * keadaan, audit append-only, resolusi alias terbatas. TIADA hard delete,
 * TIADA publish, TIADA place_registry.
 */
import { EpochMillis } from "../common";
import { PlaceAlias } from "../placeMerge";
import { AliasResolution, resolveCanonicalPlaceId } from "./aliasResolver";
import {
  PlaceDuplicateCandidate,
  DuplicateReviewStatus,
  assertValidDuplicateTransition,
} from "./duplicateCandidate";
import {
  PlaceMergePlan,
  MergePlanStatus,
  assertValidMergePlanTransition,
} from "./mergePlan";
import { PlaceMergeAuditEntry } from "./dedupAudit";
import { TrustedActor } from "../staging/stagingAudit";
import {
  DedupPage,
  DedupPagination,
  DuplicateListFilter,
  MAX_DEDUP_PAGE_LIMIT,
  PlaceAliasRepository,
  PlaceDuplicateRepository,
  PlaceMergePlanRepository,
} from "./dedupRepository";

export interface DedupClock {
  now(): EpochMillis;
}

export class InMemoryDedupStore
  implements PlaceDuplicateRepository, PlaceMergePlanRepository, PlaceAliasRepository
{
  private candidates = new Map<string, PlaceDuplicateCandidate>();
  private candidateOrder: string[] = [];
  private plans = new Map<string, PlaceMergePlan>();
  private planAudit = new Map<string, PlaceMergeAuditEntry[]>();
  private aliases = new Map<string, PlaceAlias>();

  constructor(private clock: DedupClock = { now: () => Date.now() }) {}

  // ---- Duplicate candidates ----
  async createDuplicateCandidate(
    candidate: PlaceDuplicateCandidate,
    _actor: TrustedActor,
  ): Promise<PlaceDuplicateCandidate> {
    const existing = this.candidates.get(candidate.duplicateCandidateId);
    if (existing) return { ...existing }; // IDEMPOTEN — tiada gandaan
    this.candidates.set(candidate.duplicateCandidateId, { ...candidate });
    this.candidateOrder.push(candidate.duplicateCandidateId);
    return { ...candidate };
  }

  async getDuplicateCandidate(id: string): Promise<PlaceDuplicateCandidate | null> {
    const c = this.candidates.get(id);
    return c ? { ...c } : null;
  }

  async listDuplicateCandidates(
    filter: DuplicateListFilter,
    page: DedupPagination,
  ): Promise<DedupPage<PlaceDuplicateCandidate>> {
    const limit = Math.max(1, Math.min(page.limit, MAX_DEDUP_PAGE_LIMIT));
    let ids = this.candidateOrder.filter((id) => {
      const c = this.candidates.get(id)!;
      if (filter.reviewStatus && c.reviewStatus !== filter.reviewStatus) return false;
      if (filter.decision && c.decision !== filter.decision) return false;
      if (filter.stagingRecordId && c.stagingRecordId !== filter.stagingRecordId) return false;
      return true;
    });
    if (page.cursor) {
      const idx = ids.indexOf(page.cursor);
      ids = idx >= 0 ? ids.slice(idx + 1) : ids;
    }
    const slice = ids.slice(0, limit);
    return {
      items: slice.map((id) => ({ ...this.candidates.get(id)! })),
      nextCursor: ids.length > limit ? slice[slice.length - 1] : undefined,
    };
  }

  async updateDuplicateReviewStatus(
    id: string,
    to: DuplicateReviewStatus,
    actor: TrustedActor,
    resolution?: string,
  ): Promise<PlaceDuplicateCandidate> {
    const c = this.candidates.get(id);
    if (!c) throw new Error(`duplicate candidate not found: ${id}`);
    assertValidDuplicateTransition(c.reviewStatus, to);
    c.reviewStatus = to;
    c.resolvedBy = actor.actorUid; // pelaku dipercayai
    c.resolvedAt = this.clock.now();
    if (resolution) c.resolution = resolution;
    return { ...c };
  }

  // ---- Merge plans ----
  async createMergePlan(plan: PlaceMergePlan, _actor: TrustedActor): Promise<PlaceMergePlan> {
    if (this.plans.has(plan.mergePlanId)) {
      throw new Error(`merge plan exists: ${plan.mergePlanId}`);
    }
    this.plans.set(plan.mergePlanId, { ...plan });
    return { ...plan };
  }

  async getMergePlan(id: string): Promise<PlaceMergePlan | null> {
    const p = this.plans.get(id);
    return p ? { ...p } : null;
  }

  async transitionMergePlan(
    id: string,
    to: MergePlanStatus,
    actor: TrustedActor,
  ): Promise<PlaceMergePlan> {
    const p = this.plans.get(id);
    if (!p) throw new Error(`merge plan not found: ${id}`);
    assertValidMergePlanTransition(p.status, to);
    if (to === "approved") {
      p.approvedBy = actor.actorUid;
      p.approvedAt = this.clock.now();
    }
    p.status = to;
    return { ...p };
  }

  async cancelMergePlan(id: string, actor: TrustedActor): Promise<PlaceMergePlan> {
    return this.transitionMergePlan(id, "cancelled", actor);
  }

  async appendMergeAudit(
    planId: string,
    entry: PlaceMergeAuditEntry,
  ): Promise<PlaceMergeAuditEntry> {
    const list = this.planAudit.get(planId) ?? [];
    list.push({ ...entry });
    this.planAudit.set(planId, list);
    return { ...entry };
  }

  async listMergeAudit(planId: string): Promise<PlaceMergeAuditEntry[]> {
    return (this.planAudit.get(planId) ?? []).map((e) => ({ ...e }));
  }

  // ---- Aliases ----
  async putAlias(alias: PlaceAlias, _actor: TrustedActor): Promise<PlaceAlias> {
    this.aliases.set(alias.aliasId, { ...alias });
    return { ...alias };
  }

  async getAlias(aliasId: string): Promise<PlaceAlias | null> {
    const a = this.aliases.get(aliasId);
    return a ? { ...a } : null;
  }

  async buildAliasMap(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const a of this.aliases.values()) map.set(a.aliasId, a.canonicalPlaceId);
    return map;
  }

  async resolve(aliasId: string): Promise<AliasResolution> {
    return resolveCanonicalPlaceId(aliasId, await this.buildAliasMap());
  }
}
