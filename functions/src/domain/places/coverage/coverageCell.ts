/**
 * Phase 1.7 Part A & B — KONTRAK SEL LIPUTAN + API ID SEL.
 *
 * PDF §5.3: "Cell ID mesti stabil dan tidak berdasarkan koordinat raw yang
 * berubah terlalu halus" dan "Radius exact masih dikira semasa read, cell
 * bukan pengganti distance."
 */
import { EpochMillis } from "../common";
import { FreshnessState } from "../placeEnums";
import {
  approxCellWidthMeters,
  CELL_SYSTEM,
  DEFAULT_CELL_RESOLUTION,
  decodeGeohashBounds,
  decodeGeohashCenter,
  encodeGeohash,
  GeohashBounds,
  GeohashCenter,
  geohashNeighbors,
} from "./geohash";

export interface CellBoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/** Ringkasan freshness peringkat sel (dikira daripada ahli). */
export interface CellFreshnessSummary {
  overallState: FreshnessState;
  staleCount: number;
  expiredCriticalCount: number;
  oldestIndexedAt?: EpochMillis;
}

/** Kiraan liputan mengikut ID kanonikal (bukan label terjemah). */
export type CoverageCountMap = Record<string, number>;

export interface PlaceCoverageCell {
  cellId: string;
  cellSystem: string;
  cellResolution: number;
  centerLat: number;
  centerLng: number;
  boundingBox: CellBoundingBox;
  neighboringCellIds: string[];
  activePlaceCount: number;
  publishedPlaceIds: string[];
  coverageVersion: string;
  freshnessSummary: CellFreshnessSummary;
  categoryCoverage: CoverageCountMap;
  cuisineCoverage: CoverageCountMap;
  sourceCoverage: CoverageCountMap;
  lastDiscoveryAt?: EpochMillis;
  lastRefreshAt?: EpochMillis;
  nextRefreshAt?: EpochMillis;
  createdAt: EpochMillis;
  updatedAt: EpochMillis;
}

// ---------------------------------------------------------------------------
// Part B — helper ID sel TULEN
// ---------------------------------------------------------------------------

/**
 * ID sel stabil untuk koordinat. MELEMPAR `InvalidCoordinateError` bila
 * lat/lng tidak sah. Koordinat mentah TIDAK PERNAH menjadi ID.
 */
export function getCoverageCellId(
  lat: number,
  lng: number,
  resolution: number = DEFAULT_CELL_RESOLUTION,
): string {
  return encodeGeohash(lat, lng, resolution);
}

export function getCoverageCellCenter(cellId: string): GeohashCenter {
  return decodeGeohashCenter(cellId);
}

export function getCoverageCellBounds(cellId: string): GeohashBounds {
  return decodeGeohashBounds(cellId);
}

/**
 * Lapan jiran, susunan tetap N, NE, E, SE, S, SW, W, NW.
 * Sel PUSAT DIKECUALIKAN secara konsisten (didokumenkan) — pemanggil yang
 * memerlukan pusat menambahnya sendiri melalui `getSearchableCellIds`.
 */
export function getNeighboringCoverageCells(cellId: string): string[] {
  return geohashNeighbors(cellId);
}

/**
 * Sel yang perlu dibaca untuk satu carian: pusat DAHULU, kemudian jiran
 * dalam susunan tetap. Tiada pendua. TERBATAS pada 9 sel untuk radius yang
 * muat dalam satu sel, berkembang secara terkawal untuk radius besar.
 */
export function getSearchableCellIds(cellId: string): string[] {
  return [cellId, ...getNeighboringCoverageCells(cellId)];
}

/** Had mutlak bilangan sel yang boleh disoal dalam satu bacaan kawasan. */
export const MAX_QUERIED_CELLS = 49;

/**
 * Pilih resolusi sel yang sesuai untuk radius yang diminta, supaya cincin
 * jiran 3×3 sentiasa meliputi radius sepenuhnya tanpa meletup bilangan sel.
 * Deterministik dan tidak menggunakan masa.
 */
export function resolutionForRadius(
  radiusMeters: number,
  maxResolution: number = DEFAULT_CELL_RESOLUTION,
): number {
  let best = maxResolution;
  for (let r = maxResolution; r >= 1; r--) {
    if (approxCellWidthMeters(r) >= radiusMeters) return r;
    best = r;
  }
  return best;
}

/**
 * Sel yang perlu disoal untuk (lat, lng, radius). Menggunakan resolusi yang
 * cukup kasar supaya cincin 3×3 meliputi radius; hasil sentiasa TERBATAS oleh
 * `MAX_QUERIED_CELLS`.
 *
 * NOTA PENTING: ini hanyalah PENAPIS KASAR. Jarak Haversine tepat MESTI
 * dikira selepas ini (Part H langkah 8) — sel bukan pengganti jarak.
 */
export function getQueryCellIds(
  lat: number,
  lng: number,
  radiusMeters: number,
  resolution: number = DEFAULT_CELL_RESOLUTION,
): { cellIds: string[]; resolution: number; centerCellId: string } {
  const chosen = resolutionForRadius(radiusMeters, resolution);
  const centerCellId = getCoverageCellId(lat, lng, chosen);
  const cellIds = getSearchableCellIds(centerCellId).slice(0, MAX_QUERIED_CELLS);
  return { cellIds, resolution: chosen, centerCellId };
}

/** Bina rekod sel kosong yang sah (dipakai repository semasa upsert). */
export function makeEmptyCoverageCell(
  cellId: string,
  now: EpochMillis,
  coverageVersion: string,
): PlaceCoverageCell {
  const bounds = getCoverageCellBounds(cellId);
  const center = getCoverageCellCenter(cellId);
  return {
    cellId,
    cellSystem: CELL_SYSTEM,
    cellResolution: cellId.length,
    centerLat: center.lat,
    centerLng: center.lng,
    boundingBox: bounds,
    neighboringCellIds: getNeighboringCoverageCells(cellId),
    activePlaceCount: 0,
    publishedPlaceIds: [],
    coverageVersion,
    freshnessSummary: {
      overallState: "unknown",
      staleCount: 0,
      expiredCriticalCount: 0,
    },
    categoryCoverage: {},
    cuisineCoverage: {},
    sourceCoverage: {},
    createdAt: now,
    updatedAt: now,
  };
}
