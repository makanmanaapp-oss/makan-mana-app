/**
 * Phase 1.14E — PRODUCTION canonical write builder (domain TULEN, tiada I/O).
 *
 * Mengadaptasi calon migrasi DILULUSKAN (dari executor sedia ada) kepada rekod
 * PRODUKSI: registry kanonikal, versi penerbitan IMMUTABLE, penunjuk penerbitan
 * aktif (head), dan alias legasi→kanonikal. Bentuk penerbitan SELARAS dengan
 * kontrak baca dipercayai (submitPlaceCorrection.getActivePublication) supaya
 * callable + adapter baca boleh menggunakannya.
 *
 * KESELAMATAN:
 *  - Hanya calon `ready` (SAFE) diterima; HELD/CONFLICT/INVALID ditolak.
 *  - Lokasi mesti sah (lat/lng) — jika tidak, ditolak.
 *  - ID kanonikal mesti = proposedCanonicalPlaceId (tiada drift).
 *  - Medan tak-diketahui kekal *_unknown — TIDAK PERNAH direka.
 *  - Senarai putih koleksi tulis dikuatkuasakan oleh pemanggil.
 */
import { EpochMillis, isNonEmptyString, isValidLatLng } from "../common";
import { hashCanonical } from "../staging/hashing";
import { LegacyPlaceMigrationCandidate, proposedCanonicalPlaceId } from "./migrationCandidate";

/** Koleksi produksi yang DIBENARKAN ditulis oleh migrasi (Part C). */
export const PRODUCTION_WRITE_ALLOWLIST = [
  "place_registry",
  "place_publications",
  "place_publication_heads",
  "place_migration_aliases",
  "place_migration_batches",
  "place_migration_audit",
] as const;
export type ProductionWriteCollection = (typeof PRODUCTION_WRITE_ALLOWLIST)[number];

/** Koleksi yang TIDAK PERNAH boleh ditulis oleh migrasi (Part C). */
export const PRODUCTION_WRITE_FORBIDDEN = [
  "place_details", "places_cache", "users", "user_profiles",
  "suggestion_sessions", "suggestions", "favorites", "meals", "meal_wallet",
  "reviews", "feed_posts", "history",
] as const;

export interface ProductionCanonicalRegistryRecord {
  canonicalPlaceId: string;
  providerPlaceId: string;
  displayName: string;
  lat: number;
  lng: number;
  address: string | null;
  canonicalVersion: string;
  ratingKnown: boolean;
  priceKnown: boolean;
  hoursKnown: boolean;
  provenanceSource: string; // google_places_details (dari enrichment)
  migrationBatchId: string;
  backupReference: string;
  createdAt: EpochMillis;
  /** Migrasi tidak pernah menerbitkan data yang boleh dilihat awam secara global. */
  publicScope: "internal_cohort_only";
}

/** Versi penerbitan — bentuk yang dibaca oleh getActivePublication + adapter. */
export interface ProductionPublicationRecord {
  publicationId: string;
  placeId: string; // canonicalPlaceId
  versionNumber: number;
  title: string;
  address: string | null;
  ratingState: "rating_shown" | "rating_hidden";
  priceState: "price_provider_band" | "price_unknown";
  hoursState: "hours_unknown";
  businessState: "status_unknown";
  halalState: "halal_unknown";
  dietaryState: "dietary_unknown";
  allergenState: "allergen_unknown";
  lat: number;
  lng: number;
  publicationStatus: "published";
  blocked: false;
  contentHash: string;
  sourceCanonicalVersion: string;
  publishedAt: EpochMillis;
  createdAt: EpochMillis;
}

export interface ProductionPublicationHead {
  placeId: string; // canonicalPlaceId
  activePublicationId: string;
  updatedAt: EpochMillis;
}

export interface ProductionAliasRecord {
  /** ID dokumen = legacy/provider place id (resolver membaca mengikut ID ini). */
  aliasDocId: string;
  canonicalPlaceId: string;
  aliasType: "provider_place_id" | "legacy_document_id";
  status: "active";
  migrationBatchId: string;
  createdAt: EpochMillis;
}

export interface ProductionCanonicalWrite {
  registry: ProductionCanonicalRegistryRecord;
  publication: ProductionPublicationRecord;
  head: ProductionPublicationHead;
  aliases: ProductionAliasRecord[];
}

export const PRODUCTION_REFUSAL_CODES = [
  "not_ready",
  "missing_location",
  "provider_mismatch",
  "canonical_id_drift",
  "empty_display_name",
] as const;
export type ProductionRefusalCode = (typeof PRODUCTION_REFUSAL_CODES)[number];

export class ProductionMigrationRefusal extends Error {
  constructor(public readonly code: ProductionRefusalCode, public readonly candidateId: string) {
    super(`production migration refused: ${code} (${candidateId})`);
    this.name = "ProductionMigrationRefusal";
  }
}

const CANONICAL_VERSION = "1.14E.1";

/**
 * Bina set tulisan produksi untuk SATU calon. TULEN: masa disuntik.
 * Melempar `ProductionMigrationRefusal` untuk apa-apa keadaan tidak selamat.
 */
export function buildProductionCanonicalWrite(
  candidate: LegacyPlaceMigrationCandidate,
  batchId: string,
  backupReference: string,
  now: EpochMillis,
): ProductionCanonicalWrite {
  // --- Gerbang keselamatan ---------------------------------------------------
  if (candidate.migrationDecision !== "ready" || candidate.holdReasons.length > 0) {
    throw new ProductionMigrationRefusal("not_ready", candidate.candidateId);
  }
  const snap = candidate.proposedCanonicalSnapshot;
  if (snap.lat === undefined || snap.lng === undefined || !isValidLatLng(snap.lat, snap.lng)) {
    throw new ProductionMigrationRefusal("missing_location", candidate.candidateId);
  }
  const providerPlaceId = candidate.normalizedIdentity.providerPlaceId ?? snap.providerPlaceId;
  if (!isNonEmptyString(providerPlaceId)) {
    throw new ProductionMigrationRefusal("provider_mismatch", candidate.candidateId);
  }
  if (!isNonEmptyString(snap.canonicalName)) {
    throw new ProductionMigrationRefusal("empty_display_name", candidate.candidateId);
  }
  // ID kanonikal mesti = ID deterministik dari kunci identiti stabil (tiada drift).
  const expectedCanonical = proposedCanonicalPlaceId(`provider:${providerPlaceId}`);
  if (candidate.proposedCanonicalPlaceId !== expectedCanonical) {
    throw new ProductionMigrationRefusal("canonical_id_drift", candidate.candidateId);
  }

  const canonicalPlaceId = candidate.proposedCanonicalPlaceId;
  const address = isNonEmptyString(snap.address) ? snap.address : null;

  const registry: ProductionCanonicalRegistryRecord = {
    canonicalPlaceId,
    providerPlaceId,
    displayName: snap.canonicalName,
    lat: snap.lat,
    lng: snap.lng,
    address,
    canonicalVersion: CANONICAL_VERSION,
    ratingKnown: snap.ratingKnown,
    priceKnown: snap.priceKnown,
    hoursKnown: snap.hoursKnown,
    provenanceSource: "google_places_details",
    migrationBatchId: batchId,
    backupReference,
    createdAt: now,
    publicScope: "internal_cohort_only",
  };

  const contentHash = hashCanonical({
    canonicalPlaceId, providerPlaceId, name: snap.canonicalName,
    lat: snap.lat, lng: snap.lng, address, v: CANONICAL_VERSION,
  });
  const publicationId = `PUB-${contentHash.slice(0, 24)}`;

  const publication: ProductionPublicationRecord = {
    publicationId,
    placeId: canonicalPlaceId,
    versionNumber: 1,
    title: snap.canonicalName,
    address,
    // Jujur: rating ditunjuk hanya jika diketahui; medan lain kekal unknown.
    ratingState: snap.ratingKnown ? "rating_shown" : "rating_hidden",
    priceState: snap.priceKnown ? "price_provider_band" : "price_unknown",
    hoursState: "hours_unknown",
    businessState: "status_unknown",
    halalState: "halal_unknown",
    dietaryState: "dietary_unknown",
    allergenState: "allergen_unknown",
    lat: snap.lat,
    lng: snap.lng,
    publicationStatus: "published",
    blocked: false,
    contentHash,
    sourceCanonicalVersion: CANONICAL_VERSION,
    publishedAt: now,
    createdAt: now,
  };

  const head: ProductionPublicationHead = {
    placeId: canonicalPlaceId,
    activePublicationId: publicationId,
    updatedAt: now,
  };

  // Alias: setiap ID pembekal/legasi → kanonikal (dikunci mengikut ID legasi
  // supaya resolver submitPlaceCorrection boleh menyelesaikannya).
  const aliasIds = new Set<string>([providerPlaceId, ...candidate.legacyPlaceIds]);
  const aliases: ProductionAliasRecord[] = [...aliasIds]
    .filter(isNonEmptyString)
    .sort()
    .map((legacyId) => ({
      aliasDocId: legacyId,
      canonicalPlaceId,
      aliasType: legacyId === providerPlaceId ? "provider_place_id" : "legacy_document_id",
      status: "active",
      migrationBatchId: batchId,
      createdAt: now,
    }));

  return { registry, publication, head, aliases };
}

/** Deterministic batch id daripada checksum manifest. */
export function productionBatchId(manifestChecksum: string): string {
  return `PMB-${manifestChecksum.slice(0, 24)}`;
}
