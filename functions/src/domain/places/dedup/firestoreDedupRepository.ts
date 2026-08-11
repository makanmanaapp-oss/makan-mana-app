/**
 * Phase 1.4 — repository dedup Firestore (firebase-admin) untuk UJIAN EMULATOR
 * SAHAJA. Tidak diimport oleh functions/src/index.ts. Koleksi:
 * place_merge_queue, place_aliases, place_merge_plans (+audit subkoleksi).
 * TIADA hard delete, TIADA publish, TIADA place_registry.
 */
import { FieldPath, Firestore } from "firebase-admin/firestore";
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

const C_QUEUE = "place_merge_queue";
const C_ALIAS = "place_aliases";
const C_PLAN = "place_merge_plans";

function toPlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export interface DedupFirestoreClock {
  now(): number;
}

export class FirestoreDedupStore
  implements PlaceDuplicateRepository, PlaceMergePlanRepository, PlaceAliasRepository
{
  constructor(
    private db: Firestore,
    private clock: DedupFirestoreClock = { now: () => Date.now() },
  ) {}

  async createDuplicateCandidate(
    candidate: PlaceDuplicateCandidate,
    _actor: TrustedActor,
  ): Promise<PlaceDuplicateCandidate> {
    const ref = this.db.collection(C_QUEUE).doc(candidate.duplicateCandidateId);
    const existing = await ref.get();
    if (existing.exists) return existing.data() as PlaceDuplicateCandidate; // idempoten
    await ref.create(toPlain(candidate));
    return candidate;
  }

  async getDuplicateCandidate(id: string): Promise<PlaceDuplicateCandidate | null> {
    const s = await this.db.collection(C_QUEUE).doc(id).get();
    return s.exists ? (s.data() as PlaceDuplicateCandidate) : null;
  }

  async listDuplicateCandidates(
    filter: DuplicateListFilter,
    page: DedupPagination,
  ): Promise<DedupPage<PlaceDuplicateCandidate>> {
    const limit = Math.max(1, Math.min(page.limit, MAX_DEDUP_PAGE_LIMIT));
    let q = this.db.collection(C_QUEUE).orderBy(FieldPath.documentId());
    if (filter.reviewStatus) q = q.where("reviewStatus", "==", filter.reviewStatus);
    if (filter.decision) q = q.where("decision", "==", filter.decision);
    if (filter.stagingRecordId) q = q.where("stagingRecordId", "==", filter.stagingRecordId);
    if (page.cursor) q = q.startAfter(page.cursor);
    const snap = await q.limit(limit + 1).get();
    const docs = snap.docs.slice(0, limit);
    return {
      items: docs.map((d) => d.data() as PlaceDuplicateCandidate),
      nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : undefined,
    };
  }

  async updateDuplicateReviewStatus(
    id: string,
    to: DuplicateReviewStatus,
    actor: TrustedActor,
    resolution?: string,
  ): Promise<PlaceDuplicateCandidate> {
    const ref = this.db.collection(C_QUEUE).doc(id);
    return this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw new Error(`duplicate candidate not found: ${id}`);
      const c = s.data() as PlaceDuplicateCandidate;
      assertValidDuplicateTransition(c.reviewStatus, to);
      const patch: Partial<PlaceDuplicateCandidate> = {
        reviewStatus: to,
        resolvedBy: actor.actorUid,
        resolvedAt: this.clock.now(),
      };
      if (resolution) patch.resolution = resolution;
      tx.set(ref, toPlain(patch), { merge: true });
      return { ...c, ...patch } as PlaceDuplicateCandidate;
    });
  }

  async createMergePlan(plan: PlaceMergePlan, _actor: TrustedActor): Promise<PlaceMergePlan> {
    await this.db.collection(C_PLAN).doc(plan.mergePlanId).create(toPlain(plan));
    return plan;
  }

  async getMergePlan(id: string): Promise<PlaceMergePlan | null> {
    const s = await this.db.collection(C_PLAN).doc(id).get();
    return s.exists ? (s.data() as PlaceMergePlan) : null;
  }

  async transitionMergePlan(
    id: string,
    to: MergePlanStatus,
    actor: TrustedActor,
  ): Promise<PlaceMergePlan> {
    const ref = this.db.collection(C_PLAN).doc(id);
    return this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw new Error(`merge plan not found: ${id}`);
      const p = s.data() as PlaceMergePlan;
      assertValidMergePlanTransition(p.status, to);
      const patch: Partial<PlaceMergePlan> = { status: to };
      if (to === "approved") {
        patch.approvedBy = actor.actorUid;
        patch.approvedAt = this.clock.now();
      }
      tx.set(ref, toPlain(patch), { merge: true });
      return { ...p, ...patch } as PlaceMergePlan;
    });
  }

  async cancelMergePlan(id: string, actor: TrustedActor): Promise<PlaceMergePlan> {
    return this.transitionMergePlan(id, "cancelled", actor);
  }

  async appendMergeAudit(
    planId: string,
    entry: PlaceMergeAuditEntry,
  ): Promise<PlaceMergeAuditEntry> {
    await this.db
      .collection(C_PLAN)
      .doc(planId)
      .collection("audit")
      .doc(entry.auditId)
      .create(toPlain(entry));
    return entry;
  }

  async listMergeAudit(planId: string): Promise<PlaceMergeAuditEntry[]> {
    const snap = await this.db
      .collection(C_PLAN)
      .doc(planId)
      .collection("audit")
      .orderBy("createdAt")
      .get();
    return snap.docs.map((d) => d.data() as PlaceMergeAuditEntry);
  }

  async putAlias(alias: PlaceAlias, _actor: TrustedActor): Promise<PlaceAlias> {
    await this.db.collection(C_ALIAS).doc(alias.aliasId).set(toPlain(alias), { merge: true });
    return alias;
  }

  async getAlias(aliasId: string): Promise<PlaceAlias | null> {
    const s = await this.db.collection(C_ALIAS).doc(aliasId).get();
    return s.exists ? (s.data() as PlaceAlias) : null;
  }

  async buildAliasMap(): Promise<Map<string, string>> {
    const snap = await this.db.collection(C_ALIAS).get();
    const map = new Map<string, string>();
    for (const d of snap.docs) {
      const a = d.data() as PlaceAlias;
      map.set(a.aliasId, a.canonicalPlaceId);
    }
    return map;
  }

  async resolve(aliasId: string): Promise<AliasResolution> {
    return resolveCanonicalPlaceId(aliasId, await this.buildAliasMap());
  }
}
