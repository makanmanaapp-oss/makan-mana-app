/**
 * Phase 1.12 Part A — inventori kedai legasi (BACA SAHAJA).
 *
 * Inventori memerhati data legasi dan merekod apa yang dilihatnya. Ia TIDAK
 * PERNAH menulis, mengubah suai atau memadam dokumen legasi. Setiap rekod
 * membawa laluan dokumen asalnya supaya jejak balik sentiasa mungkin.
 */
import { EpochMillis, isNonEmptyString, isValidLatLng } from "../common";
import { hashCanonical } from "../staging/hashing";
import {
  InventoryStatus,
  LegacyCollection,
  LegacySource,
  ReferenceKind,
} from "./migrationTypes";

/** Satu rujukan yang menunjuk kepada kedai legasi ini. */
export interface LegacyReferencePointer {
  kind: ReferenceKind;
  /** Laluan dokumen yang memegang rujukan (cth. users/{uid}/favorites/{id}). */
  path: string;
  fieldPath: string;
}

export interface LegacyPlaceInventoryRecord {
  legacyRecordId: string;
  legacyCollection: LegacyCollection;
  legacyDocumentPath: string;
  legacyPlaceId: string;
  providerPlaceId?: string;
  displayName: string;
  address?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  priceEstimate?: string;
  isOpen?: boolean;
  source: LegacySource;
  referencedBy: LegacyReferencePointer[];
  firstSeenAt?: EpochMillis;
  lastSeenAt?: EpochMillis;
  /** Cincang kandungan legasi mentah — mengesan drift antara dry-run. */
  rawContentHash: string;
  inventoryStatus: InventoryStatus;
  warnings: string[];
  createdAt: EpochMillis;
}

/** Input mentah seperti yang wujud dalam koleksi legasi. */
export interface LegacyRecordInput {
  legacyCollection: LegacyCollection;
  legacyDocumentPath: string;
  legacyPlaceId: string;
  providerPlaceId?: string;
  displayName?: string;
  address?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  priceEstimate?: string;
  isOpen?: boolean;
  source?: LegacySource;
  firstSeenAt?: EpochMillis;
  lastSeenAt?: EpochMillis;
  referencedBy?: LegacyReferencePointer[];
}

/**
 * Medan yang menyumbang kepada cincang kandungan. Masa penemuan SENGAJA
 * dikecualikan supaya mengimbas semula data yang sama menghasilkan cincang
 * yang sama (dry-run mesti idempoten).
 */
function hashableContent(input: LegacyRecordInput) {
  return {
    legacyCollection: input.legacyCollection,
    legacyDocumentPath: input.legacyDocumentPath,
    legacyPlaceId: input.legacyPlaceId,
    providerPlaceId: input.providerPlaceId,
    displayName: input.displayName,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    phone: input.phone,
    website: input.website,
    rating: input.rating,
    reviewCount: input.reviewCount,
    priceEstimate: input.priceEstimate,
    isOpen: input.isOpen,
  };
}

export function legacyContentHash(input: LegacyRecordInput): string {
  return hashCanonical(hashableContent(input));
}

/** ID rekod inventori deterministik — laluan dokumen ialah kunci semula jadi. */
export function legacyRecordId(input: LegacyRecordInput): string {
  return `LEG-${hashCanonical({
    path: input.legacyDocumentPath,
    placeId: input.legacyPlaceId,
  }).slice(0, 24)}`;
}

/**
 * Kelayakan awal. Identiti stabil bermakna sekurang-kurangnya satu pengenal
 * yang BUKAN nama: ID pembekal, ID tempat legasi, atau koordinat sah.
 * Nama sahaja tidak pernah mencukupi.
 */
function assessStatus(input: LegacyRecordInput, warnings: string[]): InventoryStatus {
  const hasProviderId = isNonEmptyString(input.providerPlaceId);
  const hasLegacyId = isNonEmptyString(input.legacyPlaceId);
  const hasCoordinates =
    input.lat !== undefined &&
    input.lng !== undefined &&
    isValidLatLng(input.lat, input.lng);

  if (!hasLegacyId) {
    warnings.push("missing_legacy_place_id");
    return "blocked";
  }
  if (!isNonEmptyString(input.displayName)) {
    warnings.push("missing_display_name");
    return "incomplete";
  }
  if (input.lat !== undefined || input.lng !== undefined) {
    if (!hasCoordinates) {
      warnings.push("invalid_coordinates");
      return "incomplete";
    }
  }
  if (!hasProviderId && !hasCoordinates) {
    // Tiada pengenal stabil selain nama → tidak boleh dipetakan dengan selamat.
    warnings.push("no_stable_identity_beyond_name");
    return "ambiguous";
  }
  return "eligible";
}

/** Bina satu rekod inventori. Tulen: tiada I/O, masa disuntik. */
export function buildInventoryRecord(
  input: LegacyRecordInput,
  now: EpochMillis,
): LegacyPlaceInventoryRecord {
  const warnings: string[] = [];
  const status = assessStatus(input, warnings);

  if (input.rating !== undefined && (input.rating < 0 || input.rating > 5)) {
    warnings.push("rating_out_of_range");
  }
  if (input.reviewCount !== undefined && input.reviewCount < 0) {
    warnings.push("negative_review_count");
  }

  return {
    legacyRecordId: legacyRecordId(input),
    legacyCollection: input.legacyCollection,
    legacyDocumentPath: input.legacyDocumentPath,
    legacyPlaceId: input.legacyPlaceId,
    providerPlaceId: input.providerPlaceId,
    displayName: input.displayName ?? "",
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    phone: input.phone,
    website: input.website,
    rating: input.rating,
    reviewCount: input.reviewCount,
    priceEstimate: input.priceEstimate,
    isOpen: input.isOpen,
    source: input.source ?? "unknown",
    referencedBy: [...(input.referencedBy ?? [])],
    firstSeenAt: input.firstSeenAt,
    lastSeenAt: input.lastSeenAt,
    rawContentHash: legacyContentHash(input),
    inventoryStatus: status,
    warnings,
    createdAt: now,
  };
}

/**
 * Bina inventori penuh. Rekod diisih mengikut ID supaya output deterministik
 * tanpa mengira susunan input.
 */
export function buildLegacyInventory(
  inputs: readonly LegacyRecordInput[],
  now: EpochMillis,
): LegacyPlaceInventoryRecord[] {
  return inputs
    .map((input) => buildInventoryRecord(input, now))
    .sort((a, b) => a.legacyRecordId.localeCompare(b.legacyRecordId));
}

/**
 * Kumpulkan rekod inventori mengikut ID tempat legasi. Satu ID tempat boleh
 * muncul dalam beberapa koleksi (cache + details + rujukan).
 */
export function groupByLegacyPlaceId(
  records: readonly LegacyPlaceInventoryRecord[],
): Map<string, LegacyPlaceInventoryRecord[]> {
  const map = new Map<string, LegacyPlaceInventoryRecord[]>();
  for (const record of records) {
    const list = map.get(record.legacyPlaceId) ?? [];
    list.push(record);
    map.set(record.legacyPlaceId, list);
  }
  return map;
}

/** Cincang inventori keseluruhan — mengesan sebarang perubahan data legasi. */
export function inventoryHash(
  records: readonly LegacyPlaceInventoryRecord[],
): string {
  return hashCanonical(
    [...records]
      .map((r) => ({ id: r.legacyRecordId, hash: r.rawContentHash }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}
