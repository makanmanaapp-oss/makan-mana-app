/**
 * FULL RADIUS COVERAGE — perkhidmatan AreaCandidatePool (I/O).
 *
 * Database-first: baca kolam calon SATU kawasan dari simpanan kekal per-sel
 * (`area_place_cache/{cellId}`) DAHULU. Temui jurang provider (expandedPool)
 * HANYA bila liputan tidak cukup/basi, kemudian SIMPAN calon baharu (preserve
 * old) supaya pangkalan data tumbuh: 37 → 52 → 88 → 140 → 220+.
 *
 * SELAMAT:
 *  - Idempoten: upsert per placeId; tempat diketahui TIDAK dipadam bila provider
 *    berhenti memulangkannya (Part 3).
 *  - Kolam kawasan TIDAK terhad 30 — session chunk diuruskan oleh pemanggil.
 *  - Fallback ke expandedPool bila lapisan liputan gagal (Part 33; TIADA dummy).
 *  - Gerbang: dipanggil HANYA bila kohort layak + bendera areaCoveragePool ON.
 */
import { db, FieldValue } from "../config/firebase";
import { PlaceCandidate } from "../types/place";
import { getExpandedPool } from "./expandedPoolService";
import {
  AreaCandidatePool,
  AreaCoverageStatus,
  AreaPlace,
  buildAreaCandidatePool,
  coverageCellsForRadius,
  decideAreaDiscovery,
  mergeAreaPlaces,
} from "../domain/places/coverage/areaCandidatePool";

const C_AREA = "area_place_cache";
/** Sel dianggap segar untuk ~24 jam (database-first tanpa kueri provider). */
const CELL_FRESH_MS = 24 * 60 * 60 * 1000;
/** Ketumpatan minimum sebelum langkau penemuan. */
const MIN_DENSITY = 12;
/** Cooldown penemuan per-sel — elak kueri provider berulang setiap Spin. */
const DISCOVERY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** Had calon disimpan per dokumen sel (had saiz dokumen Firestore). */
const MAX_CANDIDATES_PER_CELL = 400;

interface CellDoc {
  cellId: string;
  candidates: PlaceCandidate[];
  lastDiscoveryAt?: number;
  updatedAt?: number;
}

/** Peta calon (dengan koordinat) → AreaPlace untuk logik kolam TULEN. */
function toAreaPlace(c: PlaceCandidate, origin: "registry" | "discovery"): AreaPlace | null {
  const lat = c.lat;
  const lng = c.lng;
  if (typeof lat !== "number" || typeof lng !== "number" ||
      !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null; // tiada koordinat → tak boleh indeks geo (langkau selamat)
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
  /** Radius bertambah berbanding sesi sebelum (dari pemanggil). */
  radiusExpanded?: boolean;
  /** Admin rescan / refresh paksa. */
  forced?: boolean;
}

export interface AreaPoolOutcome {
  pool: AreaCandidatePool;
  /** Fallback digunakan (lapisan liputan gagal) — pemanggil boleh log. */
  usedFallback: boolean;
  fallbackReason: string | null;
  providerQueryCount: number;
}

/** Baca dokumen sel (database-first). */
async function readCells(cellIds: string[]): Promise<Map<string, CellDoc>> {
  const out = new Map<string, CellDoc>();
  const refs = cellIds.map((id) => db.collection(C_AREA).doc(id));
  const snaps = await db.getAll(...refs);
  for (const s of snaps) {
    if (s.exists) out.set(s.id, s.data() as CellDoc);
  }
  return out;
}

/** Status liputan agregat dari dokumen sel + kesegaran. */
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

/**
 * Bina kolam calon kawasan (database-first + penemuan jurang + simpan).
 * Fallback selamat ke expandedPool bila lapisan liputan gagal.
 */
export async function getAreaCandidatePool(req: AreaPoolRequest): Promise<AreaPoolOutcome> {
  try {
    const cellIds = coverageCellsForRadius(req.lat, req.lng, req.radiusMeters);
    const cellDocs = await readCells(cellIds);

    // 1) DIKETAHUI dari simpanan kekal (union calon semua sel; dedup di merge).
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

    // Kira aktif-dalam-radius untuk keputusan penemuan.
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

    // 2) Penemuan jurang HANYA bila diputuskan.
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

      // 3) SIMPAN — tumbuh + preserve old. Upsert calon ke sel masing-masing.
      if (newlyDiscovered > 0 || known.length === 0) {
        await persistDiscovered(merged, req.now);
      } else {
        // Tandakan lastDiscoveryAt (cooldown) walau tiada baru.
        await touchCells(cellIds, req.now);
      }
    }

    const pool = buildAreaCandidatePool({
      centerLat: req.lat, centerLng: req.lng, radiusMeters: req.radiusMeters,
      coverageCellIds: cellIds, merged, knownCanonicalCount: known.length,
      freshnessStatus: status,
      discoveryPerformed: decision.discover, discoveryReason: decision.reason,
      newlyDiscoveredCount: newlyDiscovered, now: req.now,
    });
    return { pool, usedFallback: false, fallbackReason: null, providerQueryCount };
  } catch (e) {
    // Part 33 — fallback selamat; TIADA dummy. Recommendation availability kekal.
    const reason = e instanceof Error ? e.message.slice(0, 80) : "coverage_error";
    return fallbackPool(req, reason);
  }
}

/** Fallback: expandedPool terus → AreaCandidatePool (tiada simpanan). */
async function fallbackPool(req: AreaPoolRequest, reason: string): Promise<AreaPoolOutcome> {
  const exp = await getExpandedPool({
    lat: req.lat, lng: req.lng, radiusMeters: req.radiusMeters,
    languageCode: req.languageCode, apiKey: req.apiKey, now: req.now,
  });
  const merged = exp.candidates
    .map((c) => toAreaPlace(c, "discovery"))
    .filter((x): x is AreaPlace => x !== null);
  const pool = buildAreaCandidatePool({
    centerLat: req.lat, centerLng: req.lng, radiusMeters: req.radiusMeters,
    coverageCellIds: [], merged, knownCanonicalCount: 0,
    freshnessStatus: "PROVIDER_LIMITED", discoveryPerformed: true,
    discoveryReason: "fallback", newlyDiscoveredCount: merged.length, now: req.now,
  });
  return {
    pool, usedFallback: true, fallbackReason: reason,
    providerQueryCount: exp.diagnostics.providerCalls ?? 0,
  };
}

/** Upsert calon ke dokumen sel (per placeId; preserve old; bounded). */
async function persistDiscovered(merged: readonly AreaPlace[], now: number): Promise<void> {
  // Kumpulkan calon mengikut sel geohash (resolusi database — guna cell tempat).
  const byCell = new Map<string, PlaceCandidate[]>();
  for (const p of merged) {
    if (!p.candidate) continue;
    const cellId = coverageCellsForRadius(p.lat, p.lng, 0)[0]; // sel pusat tempat
    const arr = byCell.get(cellId) ?? [];
    arr.push({ ...p.candidate, lat: p.lat, lng: p.lng });
    byCell.set(cellId, arr);
  }
  const batch = db.batch();
  for (const [cellId, cands] of byCell) {
    // Preserve old: dedup by placeId, cap saiz dokumen.
    const dedup = new Map<string, PlaceCandidate>();
    for (const c of cands) dedup.set(c.placeId, c);
    const list = [...dedup.values()].slice(0, MAX_CANDIDATES_PER_CELL);
    batch.set(
      db.collection(C_AREA).doc(cellId),
      { cellId, candidates: list, lastDiscoveryAt: now, updatedAt: now },
      { merge: true },
    );
  }
  await batch.commit();
}

/** Tandakan lastDiscoveryAt (cooldown) tanpa mengubah calon. */
async function touchCells(cellIds: string[], now: number): Promise<void> {
  const batch = db.batch();
  for (const id of cellIds) {
    batch.set(db.collection(C_AREA).doc(id), { lastDiscoveryAt: now }, { merge: true });
  }
  await batch.commit();
  void FieldValue; // (reserved for future metrics increments)
}
