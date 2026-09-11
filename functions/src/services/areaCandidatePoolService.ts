/**
 * FULL RADIUS COVERAGE — perkhidmatan AreaCandidatePool (I/O).
 *
 * Database-first: baca kolam calon SATU kawasan dari simpanan kekal per-sel
 * (`area_place_cache/{cellId}`) DAHULU. Temui jurang provider (expandedPool)
 * HANYA bila liputan tidak cukup/basi, kemudian SIMPAN calon baharu (preserve
 * old) supaya pangkalan data tumbuh: 37 → 52 → 88 → 140 → 220+.
 */
import { db, FieldValue } from "../config/firebase";
import { PlaceCandidate } from "../types/place";
import { dedupeCanonicalCandidates } from "../domain/places/canonical/canonicalCandidatePool";
import { getExpandedPool } from "./expandedPoolService";
import {
  AreaCandidatePool,
  AreaCoverageStatus,
  AreaPlace,
  buildAreaCandidatePool,
  decideAreaDiscovery,
  enumerateCellsForRadius,
  mergeAreaPlaces,
  storageCellForPlace,
} from "../domain/places/coverage/areaCandidatePool";

const C_AREA = "area_place_cache";
const CELL_FRESH_MS = 24 * 60 * 60 * 1000;
const MIN_DENSITY = 12;
const DISCOVERY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAX_CANDIDATES_PER_CELL = 400;

interface CellDoc {
  cellId: string;
  candidates: PlaceCandidate[];
  lastDiscoveryAt?: number;
  updatedAt?: number;
}

function toAreaPlace(c: PlaceCandidate, origin: "registry" | "discovery"): AreaPlace | null {
  const lat = c.lat;
  const lng = c.lng;
  if (typeof lat !== "number" || typeof lng !== "number" ||
      !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return {
    canonicalPlaceId: c.canonicalPlaceId ?? null,
    placeId: c.placeId,
    lat,
    lng,
    status: c.isOpen === false ? "temporarily_closed" : "active",
    origin,
    candidate: c,
  };
}

export interface AreaPoolRequest {
  lat: number;
  lng: number;
  radiusMeters: number;
  languageCode: string;
  apiKey: string;
  now: number;
  radiusExpanded?: boolean;
  forced?: boolean;
}

export interface AreaPoolOutcome {
  pool: AreaCandidatePool;
  usedFallback: boolean;
  fallbackReason: string | null;
  providerQueryCount: number;
}

async function readCells(cellIds: string[]): Promise<Map<string, CellDoc>> {
  const out = new Map<string, CellDoc>();
  const refs = cellIds.map((id) => db.collection(C_AREA).doc(id));
  const snaps = await db.getAll(...refs);
  for (const s of snaps) {
    if (s.exists) out.set(s.id, s.data() as CellDoc);
  }
  return out;
}

function coverageStatusOf(
  cellIds: string[],
  cellDocs: Map<string, CellDoc>,
  now: number,
): { status: AreaCoverageStatus; cooldownActive: boolean } {
  const seen = cellIds.filter((id) => cellDocs.has(id));
  if (seen.length === 0) return { status: "UNKNOWN", cooldownActive: false };
  let anyStale = false;
  let cooldownActive = false;
  for (const id of seen) {
    const d = cellDocs.get(id)!;
    const age = now - (d.updatedAt ?? 0);
    if (age > CELL_FRESH_MS) anyStale = true;
    if (now - (d.lastDiscoveryAt ?? 0) < DISCOVERY_COOLDOWN_MS) cooldownActive = true;
  }
  if (seen.length < cellIds.length) return { status: "PARTIAL", cooldownActive };
  if (anyStale) return { status: "STALE", cooldownActive };
  return { status: "HEALTHY", cooldownActive };
}

function dedupePool(pool: AreaCandidatePool): AreaCandidatePool {
  const candidates = dedupeCanonicalCandidates(pool.candidates);
  return {
    ...pool,
    candidates,
    // Keep diagnostics honest after user-visible identity dedupe.
    exactRadiusCount: Math.min(pool.exactRadiusCount, candidates.length),
    activePlaceCount: Math.min(pool.activePlaceCount, candidates.length),
  };
}

export async function getAreaCandidatePool(req: AreaPoolRequest): Promise<AreaPoolOutcome> {
  try {
    const cellIds = enumerateCellsForRadius(req.lat, req.lng, req.radiusMeters);
    const cellDocs = await readCells(cellIds);

    const knownByKey = new Map<string, AreaPlace>();
    for (const id of cellIds) {
      const d = cellDocs.get(id);
      if (!d?.candidates) continue;
      for (const c of d.candidates) {
        const ap = toAreaPlace(c, "registry");
        if (ap) knownByKey.set(`${ap.canonicalPlaceId ?? ap.placeId}`, ap);
      }
    }
    const known = [...knownByKey.values()];

    const knownPoolPre = buildAreaCandidatePool({
      centerLat: req.lat, centerLng: req.lng, radiusMeters: req.radiusMeters,
      coverageCellIds: cellIds, merged: known, knownCanonicalCount: known.length,
      freshnessStatus: "HEALTHY", discoveryPerformed: false, discoveryReason: "db",
      newlyDiscoveredCount: 0, now: req.now,
    });

    const { status, cooldownActive } = coverageStatusOf(cellIds, cellDocs, req.now);
    const decision = decideAreaDiscovery({
      knownActiveCount: knownPoolPre.activePlaceCount,
      coverageStatus: status,
      minDensity: MIN_DENSITY,
      radiusExpanded: req.radiusExpanded === true,
      cooldownActive,
      forced: req.forced === true,
    });

    let merged = known;
    let newlyDiscovered = 0;
    let providerQueryCount = 0;

    if (decision.discover) {
      const exp = await getExpandedPool({
        lat: req.lat, lng: req.lng, radiusMeters: req.radiusMeters,
        languageCode: req.languageCode, apiKey: req.apiKey, now: req.now,
      });
      providerQueryCount = exp.diagnostics.providerCalls ?? 0;
      const discovered = exp.candidates
        .map((c) => toAreaPlace(c, "discovery"))
        .filter((x): x is AreaPlace => x !== null);
      const res = mergeAreaPlaces(known, discovered);
      merged = res.merged;
      newlyDiscovered = res.newCount;

      if (newlyDiscovered > 0 || known.length === 0) {
        await persistDiscovered(merged, req.now);
      } else {
        await touchCells(cellIds, req.now);
      }
    }

    const pool = dedupePool(buildAreaCandidatePool({
      centerLat: req.lat, centerLng: req.lng, radiusMeters: req.radiusMeters,
      coverageCellIds: cellIds, merged, knownCanonicalCount: known.length,
      freshnessStatus: status,
      discoveryPerformed: decision.discover, discoveryReason: decision.reason,
      newlyDiscoveredCount: newlyDiscovered, now: req.now,
    }));
    return { pool, usedFallback: false, fallbackReason: null, providerQueryCount };
  } catch (e) {
    const reason = e instanceof Error ? e.message.slice(0, 80) : "coverage_error";
    return fallbackPool(req, reason);
  }
}

async function fallbackPool(req: AreaPoolRequest, reason: string): Promise<AreaPoolOutcome> {
  const exp = await getExpandedPool({
    lat: req.lat, lng: req.lng, radiusMeters: req.radiusMeters,
    languageCode: req.languageCode, apiKey: req.apiKey, now: req.now,
  });
  const merged = exp.candidates
    .map((c) => toAreaPlace(c, "discovery"))
    .filter((x): x is AreaPlace => x !== null);
  const pool = dedupePool(buildAreaCandidatePool({
    centerLat: req.lat, centerLng: req.lng, radiusMeters: req.radiusMeters,
    coverageCellIds: [], merged, knownCanonicalCount: 0,
    freshnessStatus: "PROVIDER_LIMITED", discoveryPerformed: true,
    discoveryReason: "fallback", newlyDiscoveredCount: merged.length, now: req.now,
  }));
  return {
    pool, usedFallback: true, fallbackReason: reason,
    providerQueryCount: exp.diagnostics.providerCalls ?? 0,
  };
}

async function persistDiscovered(merged: readonly AreaPlace[], now: number): Promise<void> {
  const byCell = new Map<string, PlaceCandidate[]>();
  for (const p of merged) {
    if (!p.candidate) continue;
    const cellId = storageCellForPlace(p.lat, p.lng);
    const arr = byCell.get(cellId) ?? [];
    arr.push({ ...p.candidate, lat: p.lat, lng: p.lng });
    byCell.set(cellId, arr);
  }
  const batch = db.batch();
  for (const [cellId, cands] of byCell) {
    const list = dedupeCanonicalCandidates(cands).slice(0, MAX_CANDIDATES_PER_CELL);
    batch.set(
      db.collection(C_AREA).doc(cellId),
      { cellId, candidates: list, lastDiscoveryAt: now, updatedAt: now },
      { merge: true },
    );
  }
  await batch.commit();
}

async function touchCells(cellIds: string[], now: number): Promise<void> {
  const batch = db.batch();
  for (const id of cellIds) {
    batch.set(db.collection(C_AREA).doc(id), { lastDiscoveryAt: now }, { merge: true });
  }
  await batch.commit();
  void FieldValue;
}
