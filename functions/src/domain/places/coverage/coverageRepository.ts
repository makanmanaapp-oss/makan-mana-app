/**
 * Phase 1.7 Part O — ANTARA MUKA REPOSITORY LIPUTAN (emulator sahaja).
 *
 * Sengaja TIADA operasi untuk:
 * - callable mobile produksi
 * - permintaan pembekal langsung (Google Places)
 * - tulisan terus browser-admin
 * - tulisan `place_registry` produksi
 * - hard delete sejarah penerbitan
 */
import { EpochMillis } from "../common";
import { TrustedActor } from "../staging/stagingAudit";
import { PlacePublicationVersion } from "../publication/publicationVersion";
import { AreaPlaceCacheEntry } from "./areaCache";
import { PlaceCoverageCell } from "./coverageCell";
import { PlaceCoverageMembership } from "./coverageMembership";
import { CoverageMetrics } from "./coverageMetrics";
import { CoverageRemovalReason, IndexingContext } from "./coverageIndexing";
import { DiscoveryReason, PlaceDiscoveryRequest, DiscoveryStatus } from "./discoveryQueue";

export const MAX_COVERAGE_PAGE_LIMIT = 100;

export interface CoveragePagination {
  limit: number;
  cursor?: string;
}
export interface CoveragePage<T> {
  items: T[];
  nextCursor?: string;
}

export interface PlaceCoverageCellRepository {
  getCell(cellId: string): Promise<PlaceCoverageCell | null>;
  /** Cipta jika tiada, kemas kini jika ada. Idempoten pada kandungan sama. */
  upsertCell(cell: PlaceCoverageCell, actor: TrustedActor): Promise<PlaceCoverageCell>;
  /** Bacaan berbilang sel TERBATAS (tiada imbasan koleksi penuh). */
  getCellsBounded(cellIds: string[]): Promise<PlaceCoverageCell[]>;
  getCoverageVersions(cellIds: string[]): Promise<Record<string, string>>;
}

export interface PlaceCoverageMembershipRepository {
  /** Upsert IDEMPOTEN — contentHash sama tidak menulis semula. */
  upsertMembership(
    membership: PlaceCoverageMembership,
    actor: TrustedActor,
  ): Promise<PlaceCoverageMembership>;
  getMembership(placeId: string): Promise<PlaceCoverageMembership | null>;
  listMembershipsByCell(
    cellId: string,
    page: CoveragePagination,
  ): Promise<CoveragePage<PlaceCoverageMembership>>;
  listMembershipsByCells(cellIds: string[]): Promise<PlaceCoverageMembership[]>;
  /**
   * Buang/gantikan keahlian. Sejarah PENERBITAN tidak pernah dipadam — hanya
   * keahlian liputan dialih keluar.
   */
  removeMembership(
    placeId: string,
    reason: CoverageRemovalReason,
    actor: TrustedActor,
  ): Promise<void>;
}

export interface PlaceCoverageMetricsRepository {
  putMetrics(metrics: CoverageMetrics, actor: TrustedActor): Promise<CoverageMetrics>;
  getMetrics(cellId: string): Promise<CoverageMetrics | null>;
}

export interface PlaceDiscoveryQueueRepository {
  /** IDEMPOTEN pada `idempotencyKey` — permintaan berulang tidak menggandakan. */
  enqueueDiscovery(
    request: PlaceDiscoveryRequest,
    actor: TrustedActor,
  ): Promise<PlaceDiscoveryRequest>;
  getDiscoveryRequest(requestId: string): Promise<PlaceDiscoveryRequest | null>;
  listQueue(
    status: DiscoveryStatus | undefined,
    page: CoveragePagination,
  ): Promise<CoveragePage<PlaceDiscoveryRequest>>;
  transitionDiscoveryStatus(
    requestId: string,
    to: DiscoveryStatus,
    actor: TrustedActor,
    errorCode?: string,
  ): Promise<PlaceDiscoveryRequest>;
}

export interface AreaPlaceReadRepository {
  /** Snapshot penerbitan AKTIF bagi kedai (null bila tiada). */
  getActivePublicationSnapshot(placeId: string): Promise<PlacePublicationVersion | null>;
}

export interface AreaPlaceCacheRepository {
  getCacheEntry(cacheKey: string): Promise<AreaPlaceCacheEntry | null>;
  putCacheEntry(
    entry: AreaPlaceCacheEntry,
    actor: TrustedActor,
  ): Promise<AreaPlaceCacheEntry>;
  /** Buang entri emulator yang versi kolamnya tidak lagi sepadan. */
  invalidateByCoverageVersion(
    centerCellId: string,
    currentPoolVersion: string,
  ): Promise<number>;
}

/** Hasil operasi pengindeksan (dilaporkan kepada pemanggil/audit). */
export interface CoverageIndexResult {
  indexed: boolean;
  denyReasons: string[];
  membership?: PlaceCoverageMembership;
  affectedCellIds: string[];
  previousCoverageVersion?: string;
  coverageVersion?: string;
  coverageVersionChanged: boolean;
}

/** Perkhidmatan pengindeksan peringkat tinggi (emulator sahaja). */
export interface CoverageIndexingService {
  indexPublishedPlaceIntoCoverage(params: {
    publicationHead: { placeId: string; activePublicationId: string } | null;
    publicationVersion: PlacePublicationVersion;
    canonicalLocation: { lat: number; lng: number };
    context: IndexingContext;
    actor: TrustedActor;
  }): Promise<CoverageIndexResult>;

  removePlaceFromCoverage(params: {
    placeId: string;
    reason: CoverageRemovalReason;
    actor: TrustedActor;
    now: EpochMillis;
  }): Promise<CoverageIndexResult>;

  reindexPlaceCoverage(params: {
    publicationHead: { placeId: string; activePublicationId: string } | null;
    publicationVersion: PlacePublicationVersion;
    canonicalLocation: { lat: number; lng: number };
    reason: CoverageRemovalReason;
    context: IndexingContext;
    actor: TrustedActor;
  }): Promise<CoverageIndexResult>;
}

/** Sebab enqueue discovery yang dibenarkan daripada bacaan kawasan. */
export const AREA_READ_DISCOVERY_REASONS: DiscoveryReason[] = [
  "empty_coverage",
  "low_coverage",
];
