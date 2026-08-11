/**
 * Algorithm 2 / Phase 2.2A — retrieval pool DIPERLUAS (I/O). Kohort sahaja.
 *
 * Strategi berpagar: cache v3 dahulu → jika tidak cukup, JALANKAN sehingga 3
 * kueri searchNearby tidak-bertindih (pusat + 2 sel/gelang bersebelahan) →
 * gabung + nyahduplikasi (provider id + alias) → cache v3. TIDAK PERNAH melebihi
 * 3 kueri provider. searchNearby itu sendiri cache-first (7 hari), jadi warm = 0
 * panggilan provider. Cuaca tidak direka; berat skor tidak berubah.
 */
import { db, FieldValue } from "../config/firebase";
import { searchNearby } from "./placesService";
import { PlaceCandidate } from "../types/place";
import { mergeDedupe, planProviderQueries } from "../domain/algorithm2/sessionEngine";

const C_POOL = "places_pool_v3";
const POOL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TARGET_UNIQUE = 40;

export interface ExpandedPoolResult {
  candidates: PlaceCandidate[];
  diagnostics: {
    providerCalls: number;
    rawCount: number;
    uniqueCount: number;
    duplicateCount: number;
    sourceBatchCount: number;
    cacheHit: boolean;
    cacheAgeMs: number | null;
    schemaVersion: 3;
  };
}

function cellId(lat: number, lng: number, radiusMeters: number): string {
  const radiusBucket = Math.round(radiusMeters / 500) * 500;
  return `v3_${lat.toFixed(2)}_${lng.toFixed(2)}_${radiusBucket}`; // mood-independent
}

/** Pusat gelang bersebelahan (tidak-bertindih) berdasarkan radius. */
function ringCenters(lat: number, lng: number, radiusMeters: number): Array<{ lat: number; lng: number }> {
  const d = (radiusMeters / 111000) * 1.2; // ~offset satu radius
  return [
    { lat, lng }, // pusat
    { lat: lat + d, lng }, // utara
    { lat, lng: lng + d }, // timur
  ];
}

export async function getExpandedPool(
  opts: { lat: number; lng: number; radiusMeters: number; languageCode: string; apiKey: string; now: number },
): Promise<ExpandedPoolResult> {
  const id = cellId(opts.lat, opts.lng, opts.radiusMeters);
  const ref = db.collection(C_POOL).doc(id);
  const snap = await ref.get();

  // Cache v3 dahulu.
  if (snap.exists) {
    const d = snap.data() ?? {};
    const expiresAt = (d.expiresAt as number | undefined) ?? 0;
    const cached = (d.candidates as PlaceCandidate[] | undefined) ?? [];
    if (expiresAt > opts.now && cached.length >= Math.min(TARGET_UNIQUE, 25)) {
      return {
        candidates: cached,
        diagnostics: {
          providerCalls: 0, rawCount: cached.length, uniqueCount: cached.length,
          duplicateCount: 0, sourceBatchCount: (d.sourceBatches as number | undefined) ?? 1,
          cacheHit: true, cacheAgeMs: opts.now - ((d.createdAt as number | undefined) ?? opts.now),
          schemaVersion: 3,
        },
      };
    }
  }

  // Tidak cukup → kueri berpagar (≤3). searchNearby cache-first per pusat.
  const maxCalls = planProviderQueries(0, TARGET_UNIQUE); // 1..3
  const centers = ringCenters(opts.lat, opts.lng, opts.radiusMeters).slice(0, maxCalls);
  const batches: PlaceCandidate[][] = [];
  let providerCalls = 0;
  for (const c of centers) {
    if (providerCalls >= 3) break; // had keras
    const batch = await searchNearby({
      lat: c.lat, lng: c.lng, radiusMeters: opts.radiusMeters,
      languageCode: opts.languageCode, apiKey: opts.apiKey,
    });
    providerCalls++;
    batches.push(batch);
  }
  const rawCount = batches.reduce((n, b) => n + b.length, 0);
  const merged = mergeDedupe(batches);

  await ref.set({
    schemaVersion: 3,
    cell: id,
    createdAt: opts.now,
    expiresAt: opts.now + POOL_TTL_MS,
    earlyRefreshAt: opts.now + POOL_TTL_MS / 7,
    providerQueryCount: providerCalls,
    rawCount,
    uniqueCount: merged.length,
    sourceBatches: batches.length,
    candidates: merged,
    placeIds: merged.map((p) => p.placeId),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    candidates: merged,
    diagnostics: {
      providerCalls, rawCount, uniqueCount: merged.length,
      duplicateCount: rawCount - merged.length, sourceBatchCount: batches.length,
      cacheHit: false, cacheAgeMs: null, schemaVersion: 3,
    },
  };
}
