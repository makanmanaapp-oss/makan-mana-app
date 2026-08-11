/**
 * Phase 1.7 Part C & D — KEAHLIAN SEL & KOLAM LIPUTAN.
 *
 * Keahlian diterbitkan HANYA daripada penerbitan AKTIF (Phase 1.6 head).
 * Rekod staging mentah, draf, alias digabung dan kedai tutup kekal TIDAK
 * PERNAH menjadi ahli.
 */
import { EpochMillis } from "../common";
import { PlaceStatus } from "../placeEnums";
import { hashCanonical } from "../staging/hashing";

/** Keadaan kelayakan keahlian (dari snapshot kelayakan Phase 1.6). */
export const MEMBERSHIP_ELIGIBILITY_STATES = [
  "eligible",
  "eligible_with_warnings",
  "blocked",
] as const;
export type MembershipEligibilityState =
  (typeof MEMBERSHIP_ELIGIBILITY_STATES)[number];

export interface PlaceCoverageMembership {
  placeId: string;
  publicationId: string;
  publicationVersion: number;
  /** SATU sel rumah kanonikal. */
  homeCellId: string;
  /** Sel rumah + jiran boleh-cari (tiada pendua, susunan deterministik). */
  searchableCellIds: string[];
  /** Koordinat TEPAT dikekalkan untuk penapisan radius sebenar. */
  lat: number;
  lng: number;
  placeStatus: PlaceStatus;
  eligibilityState: MembershipEligibilityState;
  indexedAt: EpochMillis;
  contentHash: string;
  coverageVersion: string;
  sourcePublicationHash: string;
}

/** ID keahlian deterministik — satu keahlian aktif per kedai. */
export function membershipId(placeId: string): string {
  return `mem_${hashCanonical({ placeId }).slice(0, 32)}`;
}

/**
 * Hash kandungan keahlian. Sengaja MENGECUALIKAN `indexedAt` dan
 * `coverageVersion` supaya pengindeksan semula kandungan yang sama adalah
 * IDEMPOTEN (Part F: "create or update membership idempotently").
 */
export function membershipContentHash(
  m: Omit<PlaceCoverageMembership, "contentHash" | "indexedAt" | "coverageVersion">,
): string {
  return hashCanonical({
    placeId: m.placeId,
    publicationId: m.publicationId,
    publicationVersion: m.publicationVersion,
    homeCellId: m.homeCellId,
    searchableCellIds: [...m.searchableCellIds].sort(),
    lat: m.lat,
    lng: m.lng,
    placeStatus: m.placeStatus,
    eligibilityState: m.eligibilityState,
    sourcePublicationHash: m.sourcePublicationHash,
  });
}

// ---------------------------------------------------------------------------
// Part D — kontrak kolam liputan
// ---------------------------------------------------------------------------

export const COVERAGE_POOL_SOURCES = [
  "approved_database",
  "approved_cache",
  "partial_coverage",
  "empty_coverage",
] as const;
export type CoveragePoolSource = (typeof COVERAGE_POOL_SOURCES)[number];

/**
 * Kolam liputan untuk satu set sel. TIDAK PERNAH mengandungi rekod staging
 * mentah atau rekod contoh/dummy — hanya penerbitan yang diluluskan.
 */
export interface PlaceCoveragePool {
  poolId: string;
  requestedCellIds: string[];
  publicationIds: string[];
  canonicalPlaceIds: string[];
  /** cellId → coverageVersion pada masa kolam dibina. */
  coverageVersions: Record<string, string>;
  generatedAt: EpochMillis;
  source: CoveragePoolSource;
  freshness: string;
  incomplete: boolean;
  discoveryQueued: boolean;
  warnings: string[];
}

/** ID kolam deterministik daripada sel + versi liputannya. */
export function coveragePoolId(
  cellIds: string[],
  coverageVersions: Record<string, string>,
): string {
  const digest = hashCanonical({
    cells: [...cellIds].sort(),
    versions: coverageVersions,
  });
  return `pool_${digest.slice(0, 32)}`;
}
