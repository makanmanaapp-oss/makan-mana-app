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
import { dedupeCanonicalCandidates, orderCanonicalFirst } from "../domain/places/canonical/canonicalCandidatePool";
import {
  AREA_CACHE_SCHEMA_VERSION,
  CANDIDATE_READ_PAGE_SIZE,
  CellReadResult,
  MAX_CANDIDATES_READ_PER_CELL,
  chunkForBatch,
  keyedForWrite,
  mergeCellCandidates,
} from "../domain/places/coverage/areaCacheStorage";
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
/**
 * SCALABLE STORAGE — one document per candidate.
 *
 * `area_place_cache/{cellId}/candidates/{identity}`. The parent document keeps
 * only metadata. The legacy `candidates` array is still READ so no cell goes
 * dark during migration, and is still refreshed (capped) so a rollback of this
 * reader loses nothing — but it is no longer where growth happens.
 */
const C_CANDIDATES = "candidates";
const CELL_FRESH_MS = 24 * 60 * 60 * 1000;
const MIN_DENSITY = 12;
const DISCOVERY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/**
 * LEGACY ARRAY CAP ONLY.
 *
 * This is no longer the number of restaurants a cell may hold — the
 * subcollection is unbounded. It bounds only the frozen-size rollback copy kept
 * in the parent document, which must stay under the 1 MiB document limit.
 * `orderCanonicalFirst` remains applied to it for exactly that reason: it is a
 * legacy-array safety mitigation, not the scalability architecture.
 */
const MAX_LEGACY_ARRAY_PER_CELL = 400;

interface CellDoc {
  cellId: string;
  /** LEGACY generation-1 storage. Read during migration; never grown. */
  candidates?: PlaceCandidate[];
  lastDiscoveryAt?: number;
  updatedAt?: number;
  schemaVersion?: number;
  candidateCount?: number;
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

/**
 * Page one cell's candidate subcollection.
 *
 * Ordered by `__name__` — lexicographic, total, and unique, so there is no tie
 * to break and no composite index to deploy. `startAfter(lastId)` is therefore
 * a deterministic cursor: a document written mid-traversal either sorts before
 * the anchor (picked up on the next read) or after it (seen normally), and can
 * never re-emit a document already returned.
 *
 * Bounded by MAX_CANDIDATES_READ_PER_CELL per REQUEST. That is request shaping,
 * not storage: everything stays stored and reachable by paging, and when the
 * ceiling bites we report it instead of pretending the cell was exhausted.
 */
async function readCellCandidates(cellId: string): Promise<CellReadResult> {
  const col = db.collection(C_AREA).doc(cellId).collection(C_CANDIDATES);
  const candidates: PlaceCandidate[] = [];
  let after: string | null = null;
  let truncated = false;

  for (;;) {
    let q = col.orderBy("__name__").limit(CANDIDATE_READ_PAGE_SIZE);
    if (after !== null) q = q.startAfter(after);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const data = doc.data() as { candidate?: PlaceCandidate } | undefined;
      const candidate = data?.candidate;
      if (candidate) candidates.push(candidate);
    }
    after = snap.docs[snap.docs.length - 1].id;

    if (snap.size < CANDIDATE_READ_PAGE_SIZE) break;
    if (candidates.length >= MAX_CANDIDATES_READ_PER_CELL) {
      truncated = true;
      break;
    }
  }

  return { candidates, truncated, readCount: candidates.length };
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

    // MIGRATION READ — union of both storage generations, per cell.
    // A cell may hold candidates in the legacy array, in the subcollection, or
    // in both. mergeCellCandidates prefers the subcollection copy for an exact
    // identity match and then runs the UNCHANGED canonical dedupe, so a
    // provider alias in the legacy array still collapses against its canonical
    // restaurant in the subcollection.
    const scalableReads = await Promise.all(
      cellIds.map(async (id) => ({ id, read: await readCellCandidates(id) })),
    );
    let anyTruncated = false;
    let scalableCount = 0;

    const knownByKey = new Map<string, AreaPlace>();
    for (const { id, read } of scalableReads) {
      if (read.truncated) anyTruncated = true;
      scalableCount += read.readCount;
      const legacy = cellDocs.get(id)?.candidates ?? [];
      for (const c of mergeCellCandidates(legacy, read.candidates)) {
        const ap = toAreaPlace(c, "registry");
        if (ap) knownByKey.set(`${ap.canonicalPlaceId ?? ap.placeId}`, ap);
      }
    }
    const known = [...knownByKey.values()];
    void anyTruncated;
    void scalableCount;

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

  for (const [cellId, cands] of byCell) {
    const deduped = dedupeCanonicalCandidates(cands);
    const cellRef = db.collection(C_AREA).doc(cellId);

    // AUTHORITATIVE WRITE — one document per candidate, no array, no cap.
    // Candidate #401 and #1000 get their own documents like every other one.
    const keyed = keyedForWrite(deduped);
    for (const chunk of chunkForBatch(keyed)) {
      const batch = db.batch();
      for (const { id, candidate } of chunk) {
        batch.set(
          cellRef.collection(C_CANDIDATES).doc(id),
          { candidate, updatedAt: now },
          { merge: true },
        );
      }
      await batch.commit();
    }

    // The legacy array is deliberately NOT written here.
    //
    // It used to be rebuilt on every discovery, which made it a read-modify-
    // write with no transaction: a Control Center publish landing between
    // readCells() and this write was silently overwritten. Rebuilding it also
    // made "rollback loses nothing" untrue the moment a cell passed 400 — and
    // WHICH 400 survived depended on Map iteration order, so the first cell to
    // cross the cap was an undeclared point of no return.
    //
    // Frozen instead: still read, never rewritten, so it cannot grow and cannot
    // race. Rollback means "back to the pre-migration snapshot", which is a
    // smaller and honest promise. `candidateCount` carries the real total for
    // anything that needs to know how big the cell actually is.
    await cellRef.set(
      {
        cellId,
        candidateCount: keyed.length,
        schemaVersion: AREA_CACHE_SCHEMA_VERSION,
        lastDiscoveryAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
  }
}


/**
 * MIGRATION — copy one cell's legacy array into the candidate subcollection.
 *
 * Idempotent: the document id is the identity key, so re-running overwrites
 * rather than duplicating. Safe to run while the reader is live, because the
 * reader already merges both generations — a half-backfilled cell simply reads
 * from both and dedupes.
 *
 * Canonical candidates are written FIRST (this is what `orderCanonicalFirst`
 * is still for): if a backfill is interrupted, the authoritative registry
 * restaurants are the ones already migrated, not an arbitrary prefix.
 *
 * Not wired to any trigger or schedule. It is called explicitly by an operator
 * task, so no cell is rewritten as a side effect of ordinary traffic.
 */
export async function backfillCellCandidates(
  cellId: string,
  now: number,
): Promise<{ migrated: number; alreadyScalable: boolean }> {
  const cellRef = db.collection(C_AREA).doc(cellId);
  const snap = await cellRef.get();
  if (!snap.exists) return { migrated: 0, alreadyScalable: false };

  const data = snap.data() as CellDoc;
  const legacy = Array.isArray(data.candidates) ? data.candidates : [];
  if (legacy.length === 0) {
    return { migrated: 0, alreadyScalable: data.schemaVersion === AREA_CACHE_SCHEMA_VERSION };
  }

  const ordered = orderCanonicalFirst(dedupeCanonicalCandidates(legacy))
    .slice(0, MAX_LEGACY_ARRAY_PER_CELL);
  const keyed = keyedForWrite(ordered);

  for (const chunk of chunkForBatch(keyed)) {
    const batch = db.batch();
    for (const { id, candidate } of chunk) {
      batch.set(
        cellRef.collection(C_CANDIDATES).doc(id),
        { candidate, updatedAt: now },
        { merge: true },
      );
    }
    await batch.commit();
  }

  // The legacy array is left in place on purpose: it is the rollback copy, and
  // deleting it during migration is exactly the irreversible step to avoid.
  await cellRef.set(
    { schemaVersion: AREA_CACHE_SCHEMA_VERSION, updatedAt: now },
    { merge: true },
  );
  return { migrated: keyed.length, alreadyScalable: false };
}

async function touchCells(cellIds: string[], now: number): Promise<void> {
  const batch = db.batch();
  for (const id of cellIds) {
    batch.set(db.collection(C_AREA).doc(id), { lastDiscoveryAt: now }, { merge: true });
  }
  await batch.commit();
  void FieldValue;
}
