/**
 * Phase 1.7 Part O & P — repository liputan Firestore — UJIAN EMULATOR SAHAJA.
 *
 * TIDAK diimport oleh functions/src/index.ts. Koleksi:
 *   food_coverage_cells/{cellId}
 *   place_coverage_memberships/{membershipId}
 *   coverage_metrics/{cellId}
 *   place_discovery_queue/{requestId}
 *   area_place_cache/{cacheKey}
 *
 * TIADA callable mobile, TIADA panggilan pembekal, TIADA place_registry,
 * TIADA hard delete sejarah penerbitan.
 */
import { FieldPath, Firestore } from "firebase-admin/firestore";
import { EpochMillis } from "../common";
import { TrustedActor } from "../staging/stagingAudit";
import { PlacePublicationVersion } from "../publication/publicationVersion";
import { AreaPlaceCacheEntry, isCacheEntryUsable } from "./areaCache";
import { makeEmptyCoverageCell, PlaceCoverageCell } from "./coverageCell";
import { membershipId, PlaceCoverageMembership } from "./coverageMembership";
import { CoverageMetrics } from "./coverageMetrics";
import { CoverageRemovalReason } from "./coverageIndexing";
import {
  coverageVersionFromMembers,
  CoverageVersionMember,
  EMPTY_COVERAGE_VERSION,
} from "./coverageVersion";
import {
  assertValidDiscoveryTransition,
  DiscoveryStatus,
  PlaceDiscoveryRequest,
} from "./discoveryQueue";
import {
  AreaPlaceCacheRepository,
  AreaPlaceReadRepository,
  CoveragePage,
  CoveragePagination,
  MAX_COVERAGE_PAGE_LIMIT,
  PlaceCoverageCellRepository,
  PlaceCoverageMembershipRepository,
  PlaceCoverageMetricsRepository,
  PlaceDiscoveryQueueRepository,
} from "./coverageRepository";

const C_CELLS = "food_coverage_cells";
const C_MEMBERSHIPS = "place_coverage_memberships";
const C_METRICS = "coverage_metrics";
const C_QUEUE = "place_discovery_queue";
const C_CACHE = "area_place_cache";
/** Koleksi penerbitan Phase 1.6 — dibaca SAHAJA di sini. */
const C_PUBLICATIONS = "place_publications";
const C_HEADS = "place_publication_heads";

function toPlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export interface CoverageFirestoreClock {
  now(): EpochMillis;
}

export class FirestoreCoverageStore
  implements
    PlaceCoverageCellRepository,
    PlaceCoverageMembershipRepository,
    PlaceCoverageMetricsRepository,
    PlaceDiscoveryQueueRepository,
    AreaPlaceReadRepository,
    AreaPlaceCacheRepository
{
  constructor(
    private db: Firestore,
    private clock: CoverageFirestoreClock = { now: () => Date.now() },
  ) {}

  // ---------------------------------------------------------------------
  // Sel
  // ---------------------------------------------------------------------

  async getCell(cellId: string): Promise<PlaceCoverageCell | null> {
    const s = await this.db.collection(C_CELLS).doc(cellId).get();
    return s.exists ? (s.data() as PlaceCoverageCell) : null;
  }

  async upsertCell(
    cell: PlaceCoverageCell,
    _actor: TrustedActor,
  ): Promise<PlaceCoverageCell> {
    await this.db.collection(C_CELLS).doc(cell.cellId).set(toPlain(cell), { merge: true });
    return cell;
  }

  async getCellsBounded(cellIds: string[]): Promise<PlaceCoverageCell[]> {
    const bounded = cellIds.slice(0, MAX_COVERAGE_PAGE_LIMIT);
    if (bounded.length === 0) return [];
    const refs = bounded.map((id) => this.db.collection(C_CELLS).doc(id));
    const snaps = await this.db.getAll(...refs);
    return snaps
      .filter((s) => s.exists)
      .map((s) => s.data() as PlaceCoverageCell);
  }

  async getCoverageVersions(cellIds: string[]): Promise<Record<string, string>> {
    const cells = await this.getCellsBounded(cellIds);
    const byId = new Map(cells.map((c) => [c.cellId, c.coverageVersion]));
    const out: Record<string, string> = {};
    for (const id of cellIds.slice(0, MAX_COVERAGE_PAGE_LIMIT)) {
      out[id] = byId.get(id) ?? EMPTY_COVERAGE_VERSION;
    }
    return out;
  }

  /** Kira semula satu sel daripada keahlian sebenar dalam Firestore. */
  async recomputeCell(
    cellId: string,
    actor: TrustedActor,
  ): Promise<PlaceCoverageCell> {
    const snap = await this.db
      .collection(C_MEMBERSHIPS)
      .where("searchableCellIds", "array-contains", cellId)
      .limit(MAX_COVERAGE_PAGE_LIMIT)
      .get();

    const members: CoverageVersionMember[] = [];
    const categoryCoverage: Record<string, number> = {};
    const cuisineCoverage: Record<string, number> = {};
    const sourceCoverage: Record<string, number> = {};

    for (const d of snap.docs) {
      const m = d.data() as PlaceCoverageMembership;
      if (m.eligibilityState === "blocked") continue;
      members.push({
        placeId: m.placeId,
        publicationId: m.publicationId,
        publicationVersion: m.publicationVersion,
      });
      const pub = await this.getPublicationById(m.publicationId);
      if (!pub) continue;
      for (const t of pub.snapshot.place.tagSet.tags) {
        if (t.family === "place_type") {
          categoryCoverage[t.tagId] = (categoryCoverage[t.tagId] ?? 0) + 1;
        } else if (t.family === "cuisine") {
          cuisineCoverage[t.tagId] = (cuisineCoverage[t.tagId] ?? 0) + 1;
        }
      }
      for (const ref of pub.snapshot.place.providerRefs) {
        sourceCoverage[ref.sourceType] = (sourceCoverage[ref.sourceType] ?? 0) + 1;
      }
    }

    const now = this.clock.now();
    const version = coverageVersionFromMembers(members);
    const existing = await this.getCell(cellId);
    const base = existing ?? makeEmptyCoverageCell(cellId, now, version);
    const updated: PlaceCoverageCell = {
      ...base,
      coverageVersion: version,
      activePlaceCount: members.length,
      publishedPlaceIds: members.map((m) => m.placeId).sort(),
      categoryCoverage,
      cuisineCoverage,
      sourceCoverage,
      updatedAt: now,
    };
    await this.upsertCell(updated, actor);
    return updated;
  }

  // ---------------------------------------------------------------------
  // Keahlian
  // ---------------------------------------------------------------------

  async upsertMembership(
    membership: PlaceCoverageMembership,
    _actor: TrustedActor,
  ): Promise<PlaceCoverageMembership> {
    const id = membershipId(membership.placeId);
    const ref = this.db.collection(C_MEMBERSHIPS).doc(id);
    const existing = await ref.get();
    if (existing.exists) {
      const prev = existing.data() as PlaceCoverageMembership;
      // IDEMPOTEN: kandungan sama → tiada tulisan semula.
      if (prev.contentHash === membership.contentHash) return prev;
    }
    await ref.set(toPlain(membership));
    return membership;
  }

  async getMembership(placeId: string): Promise<PlaceCoverageMembership | null> {
    const s = await this.db.collection(C_MEMBERSHIPS).doc(membershipId(placeId)).get();
    return s.exists ? (s.data() as PlaceCoverageMembership) : null;
  }

  async listMembershipsByCell(
    cellId: string,
    page: CoveragePagination,
  ): Promise<CoveragePage<PlaceCoverageMembership>> {
    const limit = Math.max(1, Math.min(page.limit, MAX_COVERAGE_PAGE_LIMIT));
    let q = this.db
      .collection(C_MEMBERSHIPS)
      .where("searchableCellIds", "array-contains", cellId)
      .orderBy(FieldPath.documentId());
    if (page.cursor) q = q.startAfter(page.cursor);
    const snap = await q.limit(limit + 1).get();
    const docs = snap.docs.slice(0, limit);
    return {
      items: docs.map((d) => d.data() as PlaceCoverageMembership),
      nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : undefined,
    };
  }

  async listMembershipsByCells(cellIds: string[]): Promise<PlaceCoverageMembership[]> {
    const seen = new Map<string, PlaceCoverageMembership>();
    for (const cellId of cellIds.slice(0, MAX_COVERAGE_PAGE_LIMIT)) {
      const page = await this.listMembershipsByCell(cellId, {
        limit: MAX_COVERAGE_PAGE_LIMIT,
      });
      for (const m of page.items) seen.set(m.placeId, m);
    }
    return [...seen.values()].sort((a, b) =>
      a.placeId < b.placeId ? -1 : a.placeId > b.placeId ? 1 : 0,
    );
  }

  /**
   * Buang keahlian liputan. Sejarah PENERBITAN (place_publications) TIDAK
   * disentuh — hanya indeks liputan dialih keluar.
   */
  async removeMembership(
    placeId: string,
    _reason: CoverageRemovalReason,
    actor: TrustedActor,
  ): Promise<void> {
    const existing = await this.getMembership(placeId);
    if (!existing) return;
    await this.db.collection(C_MEMBERSHIPS).doc(membershipId(placeId)).delete();
    for (const cellId of existing.searchableCellIds) {
      await this.recomputeCell(cellId, actor);
    }
  }

  // ---------------------------------------------------------------------
  // Metrik
  // ---------------------------------------------------------------------

  async putMetrics(
    metrics: CoverageMetrics,
    _actor: TrustedActor,
  ): Promise<CoverageMetrics> {
    await this.db.collection(C_METRICS).doc(metrics.cellId).set(toPlain(metrics));
    return metrics;
  }

  async getMetrics(cellId: string): Promise<CoverageMetrics | null> {
    const s = await this.db.collection(C_METRICS).doc(cellId).get();
    return s.exists ? (s.data() as CoverageMetrics) : null;
  }

  // ---------------------------------------------------------------------
  // Baris gilir discovery
  // ---------------------------------------------------------------------

  async enqueueDiscovery(
    request: PlaceDiscoveryRequest,
    _actor: TrustedActor,
  ): Promise<PlaceDiscoveryRequest> {
    const ref = this.db.collection(C_QUEUE).doc(request.requestId);
    const existing = await ref.get();
    if (existing.exists) return existing.data() as PlaceDiscoveryRequest; // IDEMPOTEN
    await ref.create(toPlain(request));
    return request;
  }

  async getDiscoveryRequest(requestId: string): Promise<PlaceDiscoveryRequest | null> {
    const s = await this.db.collection(C_QUEUE).doc(requestId).get();
    return s.exists ? (s.data() as PlaceDiscoveryRequest) : null;
  }

  async listQueue(
    status: DiscoveryStatus | undefined,
    page: CoveragePagination,
  ): Promise<CoveragePage<PlaceDiscoveryRequest>> {
    const limit = Math.max(1, Math.min(page.limit, MAX_COVERAGE_PAGE_LIMIT));
    let q = this.db.collection(C_QUEUE).orderBy(FieldPath.documentId());
    if (status) {
      q = this.db
        .collection(C_QUEUE)
        .where("status", "==", status)
        .orderBy(FieldPath.documentId());
    }
    if (page.cursor) q = q.startAfter(page.cursor);
    const snap = await q.limit(limit + 1).get();
    const docs = snap.docs.slice(0, limit);
    return {
      items: docs.map((d) => d.data() as PlaceDiscoveryRequest),
      nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : undefined,
    };
  }

  async transitionDiscoveryStatus(
    requestId: string,
    to: DiscoveryStatus,
    _actor: TrustedActor,
    errorCode?: string,
  ): Promise<PlaceDiscoveryRequest> {
    const r = await this.getDiscoveryRequest(requestId);
    if (!r) throw new Error(`discovery request not found: ${requestId}`);
    assertValidDiscoveryTransition(r.status, to);
    r.status = to;
    if (to === "processing") r.attemptCount += 1;
    if (errorCode) r.lastErrorCode = errorCode;
    await this.db.collection(C_QUEUE).doc(requestId).set(toPlain(r));
    return r;
  }

  // ---------------------------------------------------------------------
  // Bacaan penerbitan aktif (Phase 1.6 — BACA SAHAJA)
  // ---------------------------------------------------------------------

  private async getPublicationById(
    publicationId: string,
  ): Promise<PlacePublicationVersion | null> {
    const s = await this.db.collection(C_PUBLICATIONS).doc(publicationId).get();
    return s.exists ? (s.data() as PlacePublicationVersion) : null;
  }

  async getActivePublicationSnapshot(
    placeId: string,
  ): Promise<PlacePublicationVersion | null> {
    const head = await this.db.collection(C_HEADS).doc(placeId).get();
    if (!head.exists) return null;
    const activeId = (head.data() as { activePublicationId?: string })
      .activePublicationId;
    if (!activeId) return null;
    return this.getPublicationById(activeId);
  }

  // ---------------------------------------------------------------------
  // Cache kawasan
  // ---------------------------------------------------------------------

  async getCacheEntry(cacheKey: string): Promise<AreaPlaceCacheEntry | null> {
    const s = await this.db.collection(C_CACHE).doc(cacheKey).get();
    return s.exists ? (s.data() as AreaPlaceCacheEntry) : null;
  }

  async putCacheEntry(
    entry: AreaPlaceCacheEntry,
    _actor: TrustedActor,
  ): Promise<AreaPlaceCacheEntry> {
    await this.db.collection(C_CACHE).doc(entry.cacheKey).set(toPlain(entry));
    return entry;
  }

  async invalidateByCoverageVersion(
    centerCellId: string,
    currentPoolVersion: string,
  ): Promise<number> {
    const snap = await this.db
      .collection(C_CACHE)
      .where("centerCellId", "==", centerCellId)
      .limit(MAX_COVERAGE_PAGE_LIMIT)
      .get();
    const now = this.clock.now();
    let removed = 0;
    for (const d of snap.docs) {
      const e = d.data() as AreaPlaceCacheEntry;
      if (!isCacheEntryUsable(e, currentPoolVersion, now)) {
        await d.ref.delete();
        removed++;
      }
    }
    return removed;
  }
}
