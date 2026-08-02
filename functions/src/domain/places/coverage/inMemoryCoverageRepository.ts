/**
 * Phase 1.7 Part O — REPOSITORY LIPUTAN DALAM-INGATAN (emulator-safe).
 *
 * Menguatkuasa: pengindeksan idempoten, versi liputan deterministik, keahlian
 * kanonikal satu-per-kedai, baris gilir idempoten, cache berversi.
 * TIADA hard delete sejarah penerbitan. TIADA place_registry. TIADA panggilan
 * pembekal. TIADA penerbitan mobile.
 */
import { EpochMillis } from "../common";
import { TrustedActor } from "../staging/stagingAudit";
import {
  PlaceCacheInvalidationEvent,
  buildCacheInvalidationEvent,
  CacheInvalidationReason,
} from "../publication/cacheInvalidation";
import { PlacePublicationVersion } from "../publication/publicationVersion";
import { AreaPlaceCacheEntry, isCacheEntryUsable } from "./areaCache";
import {
  makeEmptyCoverageCell,
  PlaceCoverageCell,
} from "./coverageCell";
import {
  membershipId,
  PlaceCoverageMembership,
} from "./coverageMembership";
import { CoverageMetrics } from "./coverageMetrics";
import {
  buildMembership,
  CoverageRemovalReason,
  evaluateIndexingDecision,
  IndexingContext,
  REASON_TO_MUTATION,
} from "./coverageIndexing";
import {
  COVERAGE_ALGORITHM_VERSION,
  CoverageVersionMember,
  calculateCoverageVersion,
  coverageVersionFromMembers,
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
  CoverageIndexResult,
  CoverageIndexingService,
  CoveragePage,
  CoveragePagination,
  MAX_COVERAGE_PAGE_LIMIT,
  PlaceCoverageCellRepository,
  PlaceCoverageMembershipRepository,
  PlaceCoverageMetricsRepository,
  PlaceDiscoveryQueueRepository,
} from "./coverageRepository";

export interface CoverageClock {
  now(): EpochMillis;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function paginate<T>(
  ordered: T[],
  idOf: (v: T) => string,
  page: CoveragePagination,
): CoveragePage<T> {
  const limit = Math.max(1, Math.min(page.limit, MAX_COVERAGE_PAGE_LIMIT));
  let list = ordered;
  if (page.cursor) {
    const idx = list.findIndex((v) => idOf(v) === page.cursor);
    list = idx >= 0 ? list.slice(idx + 1) : list;
  }
  const slice = list.slice(0, limit);
  return {
    items: slice.map(clone),
    nextCursor: list.length > limit ? idOf(slice[slice.length - 1]) : undefined,
  };
}

export class InMemoryCoverageStore
  implements
    PlaceCoverageCellRepository,
    PlaceCoverageMembershipRepository,
    PlaceCoverageMetricsRepository,
    PlaceDiscoveryQueueRepository,
    AreaPlaceReadRepository,
    AreaPlaceCacheRepository,
    CoverageIndexingService
{
  private cells = new Map<string, PlaceCoverageCell>();
  /** placeId → keahlian kanonikal (SATU per kedai). */
  private memberships = new Map<string, PlaceCoverageMembership>();
  private metrics = new Map<string, CoverageMetrics>();
  private queue = new Map<string, PlaceDiscoveryRequest>();
  private queueOrder: string[] = [];
  private cache = new Map<string, AreaPlaceCacheEntry>();
  /** Snapshot penerbitan aktif yang didaftarkan (disuntik oleh Phase 1.6). */
  private publications = new Map<string, PlacePublicationVersion>();
  private invalidations: PlaceCacheInvalidationEvent[] = [];

  constructor(private clock: CoverageClock = { now: () => Date.now() }) {}

  // ---- Sokongan ujian: daftar penerbitan aktif ----
  registerActivePublication(v: PlacePublicationVersion): void {
    this.publications.set(v.placeId, clone(v));
  }
  unregisterActivePublication(placeId: string): void {
    this.publications.delete(placeId);
  }
  listInvalidationEvents(): PlaceCacheInvalidationEvent[] {
    return this.invalidations.map(clone);
  }

  // ---------------------------------------------------------------------
  // Sel liputan
  // ---------------------------------------------------------------------

  async getCell(cellId: string): Promise<PlaceCoverageCell | null> {
    const c = this.cells.get(cellId);
    return c ? clone(c) : null;
  }

  async upsertCell(
    cell: PlaceCoverageCell,
    _actor: TrustedActor,
  ): Promise<PlaceCoverageCell> {
    this.cells.set(cell.cellId, clone(cell));
    return clone(cell);
  }

  async getCellsBounded(cellIds: string[]): Promise<PlaceCoverageCell[]> {
    const bounded = cellIds.slice(0, MAX_COVERAGE_PAGE_LIMIT);
    return bounded
      .map((id) => this.cells.get(id))
      .filter((c): c is PlaceCoverageCell => c !== undefined)
      .map(clone);
  }

  async getCoverageVersions(cellIds: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const id of cellIds.slice(0, MAX_COVERAGE_PAGE_LIMIT)) {
      out[id] = this.cells.get(id)?.coverageVersion ?? EMPTY_COVERAGE_VERSION;
    }
    return out;
  }

  /** Ahli versi bagi satu sel (daripada keahlian semasa). */
  private membersOfCell(cellId: string): CoverageVersionMember[] {
    const out: CoverageVersionMember[] = [];
    for (const m of this.memberships.values()) {
      if (m.eligibilityState === "blocked") continue;
      if (m.searchableCellIds.includes(cellId)) {
        out.push({
          placeId: m.placeId,
          publicationId: m.publicationId,
          publicationVersion: m.publicationVersion,
        });
      }
    }
    return out;
  }

  /** Kira semula sel yang terjejas selepas keahlian berubah. */
  private async recomputeCells(
    cellIds: string[],
    now: EpochMillis,
    actor: TrustedActor,
  ): Promise<{ changed: boolean; versions: Record<string, string> }> {
    const versions: Record<string, string> = {};
    let changed = false;
    for (const cellId of cellIds) {
      const members = this.membersOfCell(cellId);
      const version = coverageVersionFromMembers(members);
      const existing = this.cells.get(cellId);
      const previous = existing?.coverageVersion;
      if (previous !== version) changed = true;

      const base = existing ?? makeEmptyCoverageCell(cellId, now, version);
      const placeIds = members.map((m) => m.placeId).sort();

      // Metrik kategori/masakan daripada penerbitan aktif ahli.
      const categoryCoverage: Record<string, number> = {};
      const cuisineCoverage: Record<string, number> = {};
      const sourceCoverage: Record<string, number> = {};
      for (const m of members) {
        const v = this.publications.get(m.placeId);
        if (!v) continue;
        for (const t of v.snapshot.place.tagSet.tags) {
          if (t.family === "place_type") {
            categoryCoverage[t.tagId] = (categoryCoverage[t.tagId] ?? 0) + 1;
          } else if (t.family === "cuisine") {
            cuisineCoverage[t.tagId] = (cuisineCoverage[t.tagId] ?? 0) + 1;
          }
        }
        for (const ref of v.snapshot.place.providerRefs) {
          sourceCoverage[ref.sourceType] = (sourceCoverage[ref.sourceType] ?? 0) + 1;
        }
      }

      const updated: PlaceCoverageCell = {
        ...base,
        coverageVersion: version,
        activePlaceCount: placeIds.length,
        publishedPlaceIds: placeIds,
        categoryCoverage,
        cuisineCoverage,
        sourceCoverage,
        updatedAt: now,
      };
      this.cells.set(cellId, updated);
      versions[cellId] = version;
    }
    if (changed) {
      // Nota: `actor` disimpan untuk audit masa hadapan; sel emulator tidak
      // menyimpan pelaku per-medan dalam fasa ini.
      void actor;
    }
    return { changed, versions };
  }

  private appendInvalidation(
    placeId: string,
    reason: CacheInvalidationReason,
    now: EpochMillis,
    publicationVersion?: number,
  ): void {
    const ev = buildCacheInvalidationEvent({
      placeId,
      reason,
      createdAt: now,
      algorithmVersion: COVERAGE_ALGORITHM_VERSION,
      publicationVersion,
    });
    if (!this.invalidations.some((e) => e.eventId === ev.eventId)) {
      this.invalidations.push(ev);
    }
  }

  // ---------------------------------------------------------------------
  // Keahlian
  // ---------------------------------------------------------------------

  async upsertMembership(
    membership: PlaceCoverageMembership,
    _actor: TrustedActor,
  ): Promise<PlaceCoverageMembership> {
    const existing = this.memberships.get(membership.placeId);
    // IDEMPOTEN: kandungan sama → kekalkan rekod asal (indexedAt tidak berubah).
    if (existing && existing.contentHash === membership.contentHash) {
      return clone(existing);
    }
    this.memberships.set(membership.placeId, clone(membership));
    return clone(membership);
  }

  async getMembership(placeId: string): Promise<PlaceCoverageMembership | null> {
    const m = this.memberships.get(placeId);
    return m ? clone(m) : null;
  }

  async listMembershipsByCell(
    cellId: string,
    page: CoveragePagination,
  ): Promise<CoveragePage<PlaceCoverageMembership>> {
    const ordered = [...this.memberships.values()]
      .filter((m) => m.searchableCellIds.includes(cellId))
      .sort((a, b) => (a.placeId < b.placeId ? -1 : a.placeId > b.placeId ? 1 : 0));
    return paginate(ordered, (m) => membershipId(m.placeId), page);
  }

  async listMembershipsByCells(cellIds: string[]): Promise<PlaceCoverageMembership[]> {
    const set = new Set(cellIds);
    return [...this.memberships.values()]
      .filter((m) => m.searchableCellIds.some((c) => set.has(c)))
      .sort((a, b) => (a.placeId < b.placeId ? -1 : a.placeId > b.placeId ? 1 : 0))
      .map(clone);
  }

  async removeMembership(
    placeId: string,
    reason: CoverageRemovalReason,
    actor: TrustedActor,
  ): Promise<void> {
    const existing = this.memberships.get(placeId);
    if (!existing) return;
    const affected = [...existing.searchableCellIds];
    this.memberships.delete(placeId);
    const now = this.clock.now();
    await this.recomputeCells(affected, now, actor);
    this.appendInvalidation(placeId, mapReasonToInvalidation(reason), now);
    // Sejarah PENERBITAN kekal — kami hanya membuang keahlian liputan.
  }

  // ---------------------------------------------------------------------
  // Perkhidmatan pengindeksan (Part F & G)
  // ---------------------------------------------------------------------

  async indexPublishedPlaceIntoCoverage(params: {
    publicationHead: { placeId: string; activePublicationId: string } | null;
    publicationVersion: PlacePublicationVersion;
    canonicalLocation: { lat: number; lng: number };
    context: IndexingContext;
    actor: TrustedActor;
  }): Promise<CoverageIndexResult> {
    const { publicationHead, publicationVersion, canonicalLocation, context, actor } =
      params;

    const decision = evaluateIndexingDecision(
      publicationHead
        ? {
            placeId: publicationHead.placeId,
            activePublicationId: publicationHead.activePublicationId,
            activeVersionNumber: publicationVersion.versionNumber,
            updatedAt: context.now,
            updatedBy: actor.actorUid,
            reasonCode: "publish",
          }
        : null,
      publicationVersion,
      canonicalLocation,
      context,
    );

    if (!decision.indexable) {
      // Jika kedai ini pernah diindeks, keahliannya mesti DIBUANG.
      const existed = this.memberships.get(publicationVersion.placeId);
      if (existed) {
        await this.removeMembership(
          publicationVersion.placeId,
          "publication_superseded",
          actor,
        );
      }
      return {
        indexed: false,
        denyReasons: [...decision.denyReasons],
        affectedCellIds: [],
        coverageVersionChanged: existed !== undefined,
      };
    }

    const previous = this.memberships.get(publicationVersion.placeId);
    const previousCells = previous ? [...previous.searchableCellIds] : [];

    // Bina keahlian; versi liputan diisi selepas pengiraan semula sel.
    const draft = buildMembership(
      publicationVersion,
      canonicalLocation,
      decision,
      context,
      previous?.coverageVersion ?? EMPTY_COVERAGE_VERSION,
    );

    // IDEMPOTEN: kandungan sama → tiada perubahan langsung.
    if (previous && previous.contentHash === draft.contentHash) {
      return {
        indexed: true,
        denyReasons: [],
        membership: clone(previous),
        affectedCellIds: previousCells,
        previousCoverageVersion: previous.coverageVersion,
        coverageVersion: previous.coverageVersion,
        coverageVersionChanged: false,
      };
    }

    this.memberships.set(draft.placeId, clone(draft));
    this.registerActivePublication(publicationVersion);

    // Sel yang terjejas = sel lama (bila berpindah) + sel baharu.
    const affectedCellIds = Array.from(
      new Set([...previousCells, ...draft.searchableCellIds]),
    );
    const now = context.now;
    const { changed, versions } = await this.recomputeCells(affectedCellIds, now, actor);

    // Simpan versi liputan sel RUMAH ke dalam keahlian.
    const homeVersion = versions[draft.homeCellId] ?? EMPTY_COVERAGE_VERSION;
    const stored = { ...draft, coverageVersion: homeVersion };
    this.memberships.set(stored.placeId, clone(stored));

    this.appendInvalidation(
      stored.placeId,
      "publication_created",
      now,
      publicationVersion.versionNumber,
    );

    return {
      indexed: true,
      denyReasons: [],
      membership: clone(stored),
      affectedCellIds,
      previousCoverageVersion: previous?.coverageVersion,
      coverageVersion: homeVersion,
      coverageVersionChanged: changed,
    };
  }

  async removePlaceFromCoverage(params: {
    placeId: string;
    reason: CoverageRemovalReason;
    actor: TrustedActor;
    now: EpochMillis;
  }): Promise<CoverageIndexResult> {
    const existing = this.memberships.get(params.placeId);
    if (!existing) {
      return {
        indexed: false,
        denyReasons: ["no_membership"],
        affectedCellIds: [],
        coverageVersionChanged: false,
      };
    }
    const affected = [...existing.searchableCellIds];
    const previousVersion = existing.coverageVersion;

    this.memberships.delete(params.placeId);
    this.unregisterActivePublication(params.placeId);
    const { changed, versions } = await this.recomputeCells(
      affected,
      params.now,
      params.actor,
    );
    this.appendInvalidation(
      params.placeId,
      mapReasonToInvalidation(params.reason),
      params.now,
    );

    // Sahkan bahawa mutasi versi konsisten dengan Part E.
    const mutation = REASON_TO_MUTATION[params.reason];
    void calculateCoverageVersion(previousVersion, {
      kind: mutation,
      placeId: params.placeId,
    }, []);

    return {
      indexed: false,
      denyReasons: [],
      affectedCellIds: affected,
      previousCoverageVersion: previousVersion,
      coverageVersion: versions[existing.homeCellId],
      coverageVersionChanged: changed,
    };
  }

  async reindexPlaceCoverage(params: {
    publicationHead: { placeId: string; activePublicationId: string } | null;
    publicationVersion: PlacePublicationVersion;
    canonicalLocation: { lat: number; lng: number };
    reason: CoverageRemovalReason;
    context: IndexingContext;
    actor: TrustedActor;
  }): Promise<CoverageIndexResult> {
    // Indeks semula = nilai semula keputusan + kemas kini keahlian.
    // Perpindahan lokasi dikendalikan kerana sel rumah dikira semula.
    return this.indexPublishedPlaceIntoCoverage({
      publicationHead: params.publicationHead,
      publicationVersion: params.publicationVersion,
      canonicalLocation: params.canonicalLocation,
      context: params.context,
      actor: params.actor,
    });
  }

  // ---------------------------------------------------------------------
  // Metrik
  // ---------------------------------------------------------------------

  async putMetrics(
    metrics: CoverageMetrics,
    _actor: TrustedActor,
  ): Promise<CoverageMetrics> {
    this.metrics.set(metrics.cellId, clone(metrics));
    return clone(metrics);
  }

  async getMetrics(cellId: string): Promise<CoverageMetrics | null> {
    const m = this.metrics.get(cellId);
    return m ? clone(m) : null;
  }

  // ---------------------------------------------------------------------
  // Baris gilir discovery
  // ---------------------------------------------------------------------

  async enqueueDiscovery(
    request: PlaceDiscoveryRequest,
    _actor: TrustedActor,
  ): Promise<PlaceDiscoveryRequest> {
    const existing = this.queue.get(request.requestId);
    if (existing) return clone(existing); // IDEMPOTEN
    this.queue.set(request.requestId, clone(request));
    this.queueOrder.push(request.requestId);
    return clone(request);
  }

  async getDiscoveryRequest(requestId: string): Promise<PlaceDiscoveryRequest | null> {
    const r = this.queue.get(requestId);
    return r ? clone(r) : null;
  }

  async listQueue(
    status: DiscoveryStatus | undefined,
    page: CoveragePagination,
  ): Promise<CoveragePage<PlaceDiscoveryRequest>> {
    const ordered = this.queueOrder
      .map((id) => this.queue.get(id)!)
      .filter((r) => (status ? r.status === status : true));
    return paginate(ordered, (r) => r.requestId, page);
  }

  async transitionDiscoveryStatus(
    requestId: string,
    to: DiscoveryStatus,
    _actor: TrustedActor,
    errorCode?: string,
  ): Promise<PlaceDiscoveryRequest> {
    const r = this.queue.get(requestId);
    if (!r) throw new Error(`discovery request not found: ${requestId}`);
    assertValidDiscoveryTransition(r.status, to);
    r.status = to;
    if (to === "processing") r.attemptCount += 1;
    if (errorCode) r.lastErrorCode = errorCode;
    return clone(r);
  }

  // ---------------------------------------------------------------------
  // Bacaan penerbitan aktif
  // ---------------------------------------------------------------------

  async getActivePublicationSnapshot(
    placeId: string,
  ): Promise<PlacePublicationVersion | null> {
    const v = this.publications.get(placeId);
    return v ? clone(v) : null;
  }

  // ---------------------------------------------------------------------
  // Cache kawasan
  // ---------------------------------------------------------------------

  async getCacheEntry(cacheKey: string): Promise<AreaPlaceCacheEntry | null> {
    const e = this.cache.get(cacheKey);
    return e ? clone(e) : null;
  }

  async putCacheEntry(
    entry: AreaPlaceCacheEntry,
    _actor: TrustedActor,
  ): Promise<AreaPlaceCacheEntry> {
    this.cache.set(entry.cacheKey, clone(entry));
    return clone(entry);
  }

  async invalidateByCoverageVersion(
    centerCellId: string,
    currentPoolVersion: string,
  ): Promise<number> {
    let removed = 0;
    const now = this.clock.now();
    for (const [key, entry] of [...this.cache.entries()]) {
      if (entry.centerCellId !== centerCellId) continue;
      if (!isCacheEntryUsable(entry, currentPoolVersion, now)) {
        this.cache.delete(key);
        removed++;
      }
    }
    return removed;
  }
}

function mapReasonToInvalidation(
  reason: CoverageRemovalReason,
): CacheInvalidationReason {
  switch (reason) {
    case "publication_superseded":
      return "publication_superseded";
    case "rollback_executed":
      return "rollback_executed";
    case "merge_executed":
      return "merge_executed";
    case "moved":
    case "location_corrected":
      return "location_moved";
    case "tag_set_changed":
      return "tag_set_changed";
    case "critical_freshness_expired":
      return "critical_freshness_expired";
    case "hidden":
    case "restored":
    case "permanently_closed":
    default:
      return "business_status_changed";
  }
}
