import {PlaceCandidate} from "../types/place";

const CELL_FRESH_MS = 24 * 60 * 60 * 1000;

export interface ProductionAreaCellDoc {
  candidates?: PlaceCandidate[];
  lastDiscoveryAt?: number;
  updatedAt?: number;
}

export interface CoverageCellMirrorRecord {
  cell_id: string;
  area_key: string;
  known_places: number;
  active_places: number;
  closed_places: number;
  open_now_places: number;
  coverage_status: "HEALTHY" | "STALE";
  last_discovery_at?: string;
  source_updated_at?: string;
}

function asEpoch(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function iso(value: number | undefined): string | undefined {
  return value === undefined ? undefined : new Date(value).toISOString();
}

export function sanitizeCoverageCell(
  cellId: string,
  data: ProductionAreaCellDoc,
  now: number,
): CoverageCellMirrorRecord {
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const valid = candidates.filter(
    (candidate) => candidate && typeof candidate.placeId === "string" && candidate.placeId.length > 0,
  );
  const unique = new Map(valid.map((candidate) => [candidate.placeId, candidate]));
  const rows = [...unique.values()];
  const updatedAt = asEpoch(data.updatedAt);
  const lastDiscoveryAt = asEpoch(data.lastDiscoveryAt);
  const stale = updatedAt === undefined || Math.max(0, now - updatedAt) > CELL_FRESH_MS;

  return {
    cell_id: cellId,
    area_key: `cell:${cellId}`,
    known_places: rows.length,
    active_places: rows.filter((candidate) => candidate.isOpen !== false).length,
    closed_places: rows.filter((candidate) => candidate.isOpen === false).length,
    open_now_places: rows.filter((candidate) => candidate.isOpen === true).length,
    coverage_status: stale ? "STALE" : "HEALTHY",
    ...(lastDiscoveryAt !== undefined ? {last_discovery_at: iso(lastDiscoveryAt)} : {}),
    ...(updatedAt !== undefined ? {source_updated_at: iso(updatedAt)} : {}),
  };
}
