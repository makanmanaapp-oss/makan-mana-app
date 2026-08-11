/**
 * Phase 1.14B — penyelesai snapshot pembetulan DIPERCAYAI (TULEN).
 *
 * Snapshot "nilai semasa" bagi laporan pembetulan MESTI diperoleh daripada data
 * yang boleh dibaca server yang DIPERCAYAI — BUKAN daripada nilai yang diisytihar
 * klien. Klien hanya boleh MENCADANGKAN pembetulan; ia TIDAK PERNAH boleh menetapkan
 * keadaan semasa yang dipercayai (nama/alamat/koordinat/rating/harga/waktu/halal/
 * alergen/diet/status).
 *
 * Sumber data disuntik (`TrustedPlaceDataSource`) supaya modul ini boleh diuji unit
 * tanpa Firebase. TIDAK menulis apa-apa.
 */
import {createHash} from "crypto";

import {PlaceReportOriginalSnapshot, ReportSourceMode} from "./correctionTypes";

/** Paparan tempat DIPERCAYAI daripada mana-mana sumber dibaca-server. */
export interface TrustedPlaceView {
  placeId: string;
  title: string;
  address?: string;
  coordinates?: {lat: number; lng: number};
  hoursState: string;
  priceState: string;
  ratingState: string;
  businessState: string;
  halalState: string;
  dietaryState: string;
  allergenState: string;
  imageReferences: readonly string[];
  tagIds: readonly string[];
  warnings: readonly string[];
  sourceMode: ReportSourceMode;
  publicationId?: string;
  publicationVersion?: number;
  legacySourceVersion?: number;
  /** true = rekod disekat/tersembunyi — TIDAK PERNAH boleh menjadi asas laporan. */
  blocked?: boolean;
}

export type TrustedSource =
  | "canonical_publication"
  | "canonical_test"
  | "place_details"
  | "places_cache";

export type AliasStatus = "identity" | "resolved" | "circular" | "blocked" | "not_found";

export interface AliasResolution {
  requestedPlaceId: string;
  resolvedCanonicalPlaceId: string;
  chain: readonly string[];
  status: AliasStatus;
}

/** Sumber data BACA-SAHAJA dipercayai (Admin SDK dalam callable; fake dalam ujian). */
export interface TrustedPlaceDataSource {
  resolveAlias(placeId: string): Promise<AliasResolution>;
  getActivePublication(canonicalPlaceId: string): Promise<TrustedPlaceView | null>;
  getApprovedCanonicalTestSource(canonicalPlaceId: string): Promise<TrustedPlaceView | null>;
  getPlaceDetails(placeId: string): Promise<TrustedPlaceView | null>;
  getPlacesCache(placeId: string): Promise<TrustedPlaceView | null>;
}

export interface TrustedSnapshotResult {
  trustedOriginalSnapshot: PlaceReportOriginalSnapshot;
  sourceUsed: TrustedSource;
  resolvedCanonicalPlaceId: string;
  aliasResolution: AliasResolution;
  publicationVersion?: number;
  legacySourceVersion?: number;
  derivedAt: number;
  contentHash: string;
}

export class TrustedSnapshotError extends Error {
  constructor(public readonly code: "invalid_place" | "alias_unsafe" | "no_trusted_source", message?: string) {
    super(message ?? code);
    this.name = "TrustedSnapshotError";
  }
}

export const MAX_ALIAS_HOPS = 8;

function sha(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Hash kandungan DETERMINISTIK bagi paparan dipercayai (medan diisih). */
export function trustedContentHash(view: TrustedPlaceView, resolvedPlaceId: string): string {
  const canonical = JSON.stringify({
    placeId: resolvedPlaceId,
    title: view.title,
    address: view.address ?? "",
    coordinates: view.coordinates ? `${view.coordinates.lat},${view.coordinates.lng}` : "",
    hoursState: view.hoursState,
    priceState: view.priceState,
    ratingState: view.ratingState,
    businessState: view.businessState,
    halalState: view.halalState,
    dietaryState: view.dietaryState,
    allergenState: view.allergenState,
    imageReferences: [...view.imageReferences].sort(),
    tagIds: [...view.tagIds].sort(),
    warnings: [...view.warnings].sort(),
    publicationVersion: view.publicationVersion ?? null,
  });
  return sha(canonical).slice(0, 32);
}

/** Bina PlaceReportOriginalSnapshot DIPERCAYAI daripada paparan. Tiada PII/admin. */
export function toTrustedSnapshot(
  view: TrustedPlaceView,
  resolvedPlaceId: string,
  now: number,
): PlaceReportOriginalSnapshot {
  return {
    placeId: resolvedPlaceId,
    publicationId: view.publicationId,
    publicationVersion: view.publicationVersion,
    title: view.title,
    address: view.address,
    coordinates: view.coordinates,
    hoursState: view.hoursState,
    priceState: view.priceState,
    ratingState: view.ratingState,
    businessState: view.businessState,
    halalState: view.halalState,
    dietaryState: view.dietaryState,
    allergenState: view.allergenState,
    imageReferences: [...view.imageReferences],
    tagIds: [...view.tagIds],
    warnings: [...view.warnings],
    sourceMode: view.sourceMode,
    capturedAt: now,
    contentHash: trustedContentHash(view, resolvedPlaceId),
  };
}

export interface ResolveSnapshotInput {
  uid: string;
  placeId: string;
  publicationId?: string;
  publicationVersion?: number;
  sourceMode?: string;
}

/**
 * Selesaikan snapshot DIPERCAYAI mengikut keutamaan:
 *   1. penerbitan canonical aktif
 *   2. sumber canonical ujian/emulator diluluskan
 *   3. place_details dipercayai
 *   4. places_cache dipercayai
 *   5. tolak dengan selamat jika tiada
 *
 * Alias diselesaikan dahulu; rantai bertutup; circular/blocked ditolak.
 * TIDAK PERNAH jatuh balik ke nilai klien.
 */
export async function resolveTrustedSnapshot(
  input: ResolveSnapshotInput,
  source: TrustedPlaceDataSource,
  now: number,
): Promise<TrustedSnapshotResult> {
  if (!input.placeId?.trim()) throw new TrustedSnapshotError("invalid_place", "place_id_required");

  // --- 1. Selesaikan alias (bertutup + selamat) ---------------------------
  const alias = await source.resolveAlias(input.placeId);
  if (alias.status === "circular") throw new TrustedSnapshotError("alias_unsafe", "circular_alias");
  if (alias.status === "blocked") throw new TrustedSnapshotError("alias_unsafe", "blocked_alias");
  if (alias.chain.length > MAX_ALIAS_HOPS) throw new TrustedSnapshotError("alias_unsafe", "alias_chain_too_long");
  const resolvedId = alias.status === "not_found" ? input.placeId : alias.resolvedCanonicalPlaceId;

  // --- 2. Keutamaan sumber dipercayai -------------------------------------
  const attempts: Array<{src: TrustedSource; view: TrustedPlaceView | null}> = [
    {src: "canonical_publication", view: await source.getActivePublication(resolvedId)},
    {src: "canonical_test", view: await source.getApprovedCanonicalTestSource(resolvedId)},
    {src: "place_details", view: await source.getPlaceDetails(resolvedId)},
    {src: "places_cache", view: await source.getPlacesCache(resolvedId)},
  ];

  for (const {src, view} of attempts) {
    if (!view) continue;
    // Rekod disekat TIDAK PERNAH boleh menjadi asas laporan.
    if (view.blocked) throw new TrustedSnapshotError("invalid_place", "blocked_record");
    return {
      trustedOriginalSnapshot: toTrustedSnapshot(view, resolvedId, now),
      sourceUsed: src,
      resolvedCanonicalPlaceId: resolvedId,
      aliasResolution: alias,
      publicationVersion: view.publicationVersion,
      legacySourceVersion: view.legacySourceVersion,
      derivedAt: now,
      contentHash: trustedContentHash(view, resolvedId),
    };
  }

  // --- 5. Tiada sumber dipercayai → tolak (JANGAN guna nilai klien) --------
  throw new TrustedSnapshotError("no_trusted_source", "no_trusted_snapshot");
}

// ---------------------------------------------------------------------------
// Part B — model ketidakpadanan snapshot (RINGKAS + DIREDAKSI)
// ---------------------------------------------------------------------------

export type SnapshotMismatchType =
  | "stale_client"
  | "publication_version_mismatch"
  | "alias_resolved"
  | "value_changed"
  | "field_missing_client"
  | "field_missing_server"
  | "unsupported_client_field";

export interface CorrectionSnapshotMismatch {
  fieldPath: string;
  /** Hash sahaja — TIDAK PERNAH nilai mentah sensitif. */
  clientValueHash?: string;
  serverValueHash?: string;
  mismatchType: SnapshotMismatchType;
  severity: "info" | "warning";
  warningCode: string;
}

function hashValue(v: string | undefined): string | undefined {
  return v === undefined ? undefined : sha(v).slice(0, 16);
}

/**
 * Bandingkan nilai yang diisytihar klien dengan snapshot dipercayai. Menghasilkan
 * amaran DIREDAKSI sahaja (hash, bukan nilai mentah). Ketidakpadanan BUKAN penipuan
 * — ia menandakan data klien lapuk/alias diselesaikan.
 */
export function compareClientToTrusted(
  client: {placeId: string; currentValue?: string; affectedFieldState?: string; publicationVersion?: number},
  trusted: TrustedSnapshotResult,
): CorrectionSnapshotMismatch[] {
  const out: CorrectionSnapshotMismatch[] = [];

  // Alias diselesaikan (placeId klien != canonical dipercayai).
  if (client.placeId !== trusted.resolvedCanonicalPlaceId) {
    out.push({
      fieldPath: "placeId",
      clientValueHash: hashValue(client.placeId),
      serverValueHash: hashValue(trusted.resolvedCanonicalPlaceId),
      mismatchType: "alias_resolved",
      severity: "info",
      warningCode: "alias_resolved",
    });
  }

  // Versi penerbitan berbeza → data klien mungkin lapuk.
  if (
    client.publicationVersion !== undefined &&
    trusted.publicationVersion !== undefined &&
    client.publicationVersion !== trusted.publicationVersion
  ) {
    out.push({
      fieldPath: "publicationVersion",
      mismatchType: "publication_version_mismatch",
      severity: "warning",
      warningCode: "stale_publication_version",
    });
  }

  // Nilai semasa yang diisytihar klien berbeza daripada keadaan dipercayai.
  if (client.affectedFieldState !== undefined && client.currentValue !== undefined) {
    if (client.currentValue !== client.affectedFieldState) {
      out.push({
        fieldPath: "currentValue",
        clientValueHash: hashValue(client.currentValue),
        serverValueHash: hashValue(client.affectedFieldState),
        mismatchType: "value_changed",
        severity: "info",
        warningCode: "current_value_changed",
      });
    }
  }

  return out;
}
