/**
 * Phase 1.7 Part F & G — PENGINDEKSAN KEPALA PENERBITAN KE DALAM LIPUTAN.
 *
 * SATU-SATUNYA unit awam ialah VERSI PENERBITAN AKTIF (Phase 1.6), bukan
 * rekod place mentah. Keputusan pengindeksan adalah TULEN dan boleh diuji
 * berasingan daripada repository.
 */
import { EpochMillis } from "../common";
import { PlaceStatus } from "../placeEnums";
import {
  PlacePublicationHead,
  PlacePublicationVersion,
} from "../publication/publicationVersion";
import { deriveBusinessDisplayState } from "../publication/displayState";
import {
  getCoverageCellId,
  getSearchableCellIds,
} from "./coverageCell";
import {
  MembershipEligibilityState,
  PlaceCoverageMembership,
  membershipContentHash,
} from "./coverageMembership";
import { DEFAULT_CELL_RESOLUTION } from "./geohash";
import { CoverageMutationKind } from "./coverageVersion";

/** Sebab keahlian DITOLAK (kanonikal, bebas bahasa). */
export const INDEXING_DENY_REASONS = [
  "publication_not_active_head",
  "publication_status_not_published",
  "publication_not_eligible",
  "business_status_not_public",
  "permanently_closed",
  "merged_or_superseded_alias",
  "critical_freshness_blocked",
  "invalid_location",
] as const;
export type IndexingDenyReason = (typeof INDEXING_DENY_REASONS)[number];

export interface IndexingDecision {
  indexable: boolean;
  denyReasons: IndexingDenyReason[];
  eligibilityState: MembershipEligibilityState;
  /** Kedai boleh diindeks tetapi BUKAN calon cadangan utama. */
  primarySuggestionEligible: boolean;
}

export interface CanonicalLocation {
  lat: number;
  lng: number;
}

export interface IndexingContext {
  now: EpochMillis;
  resolution?: number;
  /** Set oleh enjin dedup/merge bila kedai ini ialah alias yang digabung. */
  mergedIntoPlaceId?: string;
}

/**
 * Keputusan TULEN: bolehkah penerbitan ini masuk ke liputan awam?
 *
 * Menolak: draft, needs_review, approved-belum-terbit, hidden, superseded,
 * rejected, tutup kekal, alias digabung, dan penerbitan yang disekat oleh
 * freshness kritikal yang luput.
 */
export function evaluateIndexingDecision(
  head: PlacePublicationHead | null,
  version: PlacePublicationVersion,
  location: CanonicalLocation,
  ctx: IndexingContext,
): IndexingDecision {
  const denyReasons: IndexingDenyReason[] = [];
  const place = version.snapshot.place;

  // 1. Mesti kepala AKTIF bagi kedai ini.
  if (!head || head.activePublicationId !== version.publicationId) {
    denyReasons.push("publication_not_active_head");
  }

  // 2. Status penerbitan mesti "published" — draft/needs_review/approved/
  //    hidden/stale/rejected/superseded semuanya ditolak di sini.
  if (version.publicationStatus !== "published") {
    denyReasons.push("publication_status_not_published");
  }

  // 3. Snapshot kelayakan mesti lulus.
  if (!version.eligibilitySnapshot.eligible) {
    denyReasons.push("publication_not_eligible");
  }

  // 4. Freshness kritikal yang luput menyekat keahlian.
  if (version.eligibilitySnapshot.criticalExpiredFieldIds.length > 0) {
    denyReasons.push("critical_freshness_blocked");
  }

  // 5. Alias digabung/superseded tidak pernah menjadi keahlian bebas.
  const merge = place.mergeState;
  if (
    ctx.mergedIntoPlaceId !== undefined ||
    merge.mergeStatus === "merged" ||
    merge.mergeStatus === "superseded" ||
    (merge.duplicateOf !== undefined && merge.duplicateOf.length > 0)
  ) {
    denyReasons.push("merged_or_superseded_alias");
  }

  // 6. Keadaan perniagaan mesti boleh dipaparkan kepada orang awam.
  const business = deriveBusinessDisplayState(place.status);
  if (place.status === "permanently_closed") {
    denyReasons.push("permanently_closed");
  } else if (business.blockedFromPublic) {
    denyReasons.push("business_status_not_public");
  }

  // 7. Koordinat mesti sah (sel diterbitkan daripadanya).
  if (
    !Number.isFinite(location.lat) ||
    !Number.isFinite(location.lng) ||
    location.lat < -90 ||
    location.lat > 90 ||
    location.lng < -180 ||
    location.lng > 180
  ) {
    denyReasons.push("invalid_location");
  }

  const indexable = denyReasons.length === 0;
  const eligibilityState: MembershipEligibilityState = !indexable
    ? "blocked"
    : version.eligibilitySnapshot.warnings.length > 0
      ? "eligible_with_warnings"
      : "eligible";

  return {
    indexable,
    denyReasons: Array.from(new Set(denyReasons)),
    eligibilityState,
    // Tutup sementara boleh diindeks tetapi BUKAN cadangan utama (peraturan 8).
    primarySuggestionEligible: indexable && business.eligibleAsPrimarySuggestion,
  };
}

/**
 * Bina rekod keahlian daripada penerbitan aktif. TULEN.
 * `contentHash` mengecualikan `indexedAt`/`coverageVersion`, jadi
 * pengindeksan semula kandungan yang sama adalah IDEMPOTEN.
 */
export function buildMembership(
  version: PlacePublicationVersion,
  location: CanonicalLocation,
  decision: IndexingDecision,
  ctx: IndexingContext,
  coverageVersion: string,
): PlaceCoverageMembership {
  const resolution = ctx.resolution ?? DEFAULT_CELL_RESOLUTION;
  const homeCellId = getCoverageCellId(location.lat, location.lng, resolution);
  const searchableCellIds = getSearchableCellIds(homeCellId);
  const placeStatus: PlaceStatus = version.snapshot.place.status;

  const core = {
    placeId: version.placeId,
    publicationId: version.publicationId,
    publicationVersion: version.versionNumber,
    homeCellId,
    searchableCellIds,
    lat: location.lat,
    lng: location.lng,
    placeStatus,
    eligibilityState: decision.eligibilityState,
    sourcePublicationHash: version.contentHash,
  };

  return {
    ...core,
    contentHash: membershipContentHash(core),
    indexedAt: ctx.now,
    coverageVersion,
  };
}

// ---------------------------------------------------------------------------
// Part G — sebab buang / indeks semula
// ---------------------------------------------------------------------------

export const COVERAGE_REMOVAL_REASONS = [
  "publication_superseded",
  "rollback_executed",
  "hidden",
  "restored",
  "permanently_closed",
  "moved",
  "merge_executed",
  "critical_freshness_expired",
  "location_corrected",
  "tag_set_changed",
] as const;
export type CoverageRemovalReason = (typeof COVERAGE_REMOVAL_REASONS)[number];

/** Petakan sebab liputan → jenis mutasi versi (Part E). */
export const REASON_TO_MUTATION: Record<CoverageRemovalReason, CoverageMutationKind> = {
  publication_superseded: "publication_superseded",
  rollback_executed: "rollback_executed",
  hidden: "place_hidden",
  restored: "place_restored",
  permanently_closed: "place_permanently_closed",
  moved: "place_moved",
  merge_executed: "merge_executed",
  critical_freshness_expired: "critical_freshness_blocked",
  location_corrected: "place_moved",
  tag_set_changed: "tag_coverage_changed",
};
