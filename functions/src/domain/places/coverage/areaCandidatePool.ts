/**
 * FULL RADIUS COVERAGE — AreaCandidatePool TULEN (tiada I/O).
 *
 * Kolam calon SATU kawasan dibina dari Pangkalan Data Tempat Berkongsi
 * (place_registry via sel liputan) + penemuan jurang bila perlu. Kolam ini
 * BUKAN terhad 30 — ia berkembang mengikut bekalan sebenar yang ditemui.
 *
 * PRINSIP (locked product decision):
 *  - Database-first: baca yang diketahui dahulu; jangan mula dari sifar.
 *  - Preserve old knowledge: tempat yang sudah diketahui KEKAL walaupun kueri
 *    provider terbaru tidak memulangkannya (Part 3).
 *  - Discovery hanya untuk jurang/basi (Part 8).
 *  - Session chunk (cth. 30) ≠ had kolam kawasan (Part 11/16).
 *  - Penapis radius TEPAT autoritatif; sel hanya mekanisme indeks (Part 5/6).
 * Modul TULEN — deterministik, boleh diuji sepenuhnya.
 */
import { PlaceCandidate } from "../../../types/place";
import { haversineMeters } from "../dedup/geo";
import {
  DEFAULT_CELL_RESOLUTION,
  MAX_CELL_RESOLUTION,
  MIN_CELL_RESOLUTION,
  approxCellWidthMeters,
} from "./geohash";
import {
  getCoverageCellId,
  getSearchableCellIds,
} from "./coverageCell";

/** Status operasi tempat (dikekalkan; tidak dipadam) — Part 3/19. */
export type AreaPlaceStatus =
  | "active"
  | "temporarily_closed"
  | "permanently_closed"
  | "unknown";

/** Status kesegaran liputan sel/kawasan (Part 5). */
export type AreaCoverageStatus =
  | "UNKNOWN"
  | "DISCOVERING"
  | "PARTIAL"
  | "HEALTHY"
  | "STALE"
  | "PROVIDER_LIMITED";

/** Rekod geo minimum untuk kolam kawasan (identiti + lokasi + status). */
export interface AreaPlace {
  canonicalPlaceId: string | null;
  /** ID provider/legacy — pengenal calon untuk ranking/penindasan. */
  placeId: string;
  lat: number;
  lng: number;
  status: AreaPlaceStatus;
  /** Sumber: 'registry' (DB dikenali) atau 'discovery' (baru ditemui). */
  origin: "registry" | "discovery";
  /** Calon penuh untuk ranking (bila ada). */
  candidate?: PlaceCandidate;
}

/** Kontrak kolam calon kawasan (Part 7). Boleh mengandungi >30. */
export interface AreaCandidatePool {
  locationBucket: string;
  radiusMeters: number;
  coverageCellIds: string[];
  /** Bilangan tempat DIKENALI dari DB (sebelum penemuan). */
  knownCanonicalCount: number;
  /** Bilangan dalam radius TEPAT (selepas penapis haversine). */
  exactRadiusCount: number;
  /** Bilangan aktif + dalam radius (calon cadangan sebenar). */
  activePlaceCount: number;
  /** ID kanonikal (atau placeId) tersusun — boleh >30. */
  canonicalPlaceIds: string[];
  /** Calon untuk ranking (dalam radius; TIDAK terhad 30). */
  candidates: PlaceCandidate[];
  generatedAt: number;
  freshnessStatus: AreaCoverageStatus;
  discoveryPerformed: boolean;
  discoveryReason: string;
  newlyDiscoveredCount: number;
}

/**
 * Pilih resolusi geohash untuk radius: grid boleh-cari 3×3 (pusat + 8 jiran)
 * mesti melitupi diameter (2·radius). Pilih resolusi TERHALUS (nombor besar)
 * yang lebar selnya ≥ 2·radius/3, dalam had [MIN, MAX]. Radius lebih besar →
 * resolusi lebih rendah → sel lebih besar → lebih banyak bekalan diketahui
 * boleh masuk (Part 6). Deterministik.
 */
export function resolutionForRadius(radiusMeters: number): number {
  const need = (2 * Math.max(0, radiusMeters)) / 3;
  for (let res = MAX_CELL_RESOLUTION; res >= MIN_CELL_RESOLUTION; res--) {
    if (approxCellWidthMeters(res) >= need) return res;
  }
  return MIN_CELL_RESOLUTION;
}

/** Sel liputan (pusat + jiran) yang menyelaputi radius dari tengah (Part 6). */
export function coverageCellsForRadius(
  lat: number,
  lng: number,
  radiusMeters: number,
): string[] {
  const res = Number.isFinite(radiusMeters) && radiusMeters > 0
    ? resolutionForRadius(radiusMeters)
    : DEFAULT_CELL_RESOLUTION;
  const center = getCoverageCellId(lat, lng, res);
  return getSearchableCellIds(center);
}

/** Bucket lokasi deterministik (grid ~111m + radius dibucket) untuk id kolam. */
export function areaLocationBucket(lat: number, lng: number, radiusMeters: number): string {
  const la = Number.isFinite(lat) ? lat.toFixed(3) : "0";
  const ln = Number.isFinite(lng) ? lng.toFixed(3) : "0";
  const rb = Math.round((radiusMeters || 0) / 500) * 500;
  return `${la},${ln},${rb}`;
}

export interface ExactFilterResult<T> {
  within: Array<T & { distanceMeters: number }>;
  droppedBeyondRadius: number;
  droppedInvalid: number;
}

/**
 * Penapis radius TEPAT (haversine). Autoritatif — sel hanya indeks kasar.
 * Koordinat tak sah → digugurkan (dikira invalid, bukan dalam radius).
 */
export function exactRadiusFilter<T extends { lat: number; lng: number }>(
  places: readonly T[],
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
): ExactFilterResult<T> {
  const within: Array<T & { distanceMeters: number }> = [];
  let droppedBeyondRadius = 0;
  let droppedInvalid = 0;
  for (const p of places) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) {
      droppedInvalid++;
      continue;
    }
    const d = haversineMeters(centerLat, centerLng, p.lat, p.lng);
    if (d <= radiusMeters) within.push({ ...p, distanceMeters: d });
    else droppedBeyondRadius++;
  }
  within.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return { within, droppedBeyondRadius, droppedInvalid };
}

/** Kunci identiti kanonikal-atau-provider (untuk dedup + preserve). */
export function areaPlaceKey(p: { canonicalPlaceId: string | null; placeId: string }): string {
  return (p.canonicalPlaceId && p.canonicalPlaceId.length > 0)
    ? `c:${p.canonicalPlaceId}`
    : `p:${p.placeId}`;
}

export interface MergeResult {
  merged: AreaPlace[];
  newCount: number;
  duplicateCount: number;
}

/**
 * Gabung DIKENALI + DITEMUI (Part 3): union + dedup kanonikal/provider.
 * KEKALKAN semua yang diketahui — tempat diketahui yang TIDAK dipulangkan oleh
 * penemuan terbaru TIDAK digugurkan. Untuk pertindihan, rekod DIKENALI (registry)
 * diutamakan sebagai identiti; medan calon terbaru dari penemuan diambil bila
 * yang diketahui tiada calon.
 */
export function mergeAreaPlaces(
  known: readonly AreaPlace[],
  discovered: readonly AreaPlace[],
): MergeResult {
  const byKey = new Map<string, AreaPlace>();
  for (const k of known) byKey.set(areaPlaceKey(k), { ...k, origin: "registry" });
  let newCount = 0;
  let duplicateCount = 0;
  for (const d of discovered) {
    const key = areaPlaceKey(d);
    const existing = byKey.get(key);
    if (existing) {
      duplicateCount++;
      // Kekal identiti diketahui; isi calon/koordinat jika yang diketahui tiada.
      byKey.set(key, {
        ...existing,
        candidate: existing.candidate ?? d.candidate,
        lat: Number.isFinite(existing.lat) ? existing.lat : d.lat,
        lng: Number.isFinite(existing.lng) ? existing.lng : d.lng,
        // Status: jangan naik taraf closed→active secara senyap; ambil yang
        // diketahui kecuali ia 'unknown'.
        status: existing.status === "unknown" ? d.status : existing.status,
      });
    } else {
      byKey.set(key, { ...d, origin: "discovery" });
      newCount++;
    }
  }
  return { merged: [...byKey.values()], newCount, duplicateCount };
}

export interface DiscoveryDecisionInput {
  /** Bilangan tempat AKTIF diketahui dalam radius (dari DB). */
  knownActiveCount: number;
  /** Status liputan sel-sel kawasan. */
  coverageStatus: AreaCoverageStatus;
  /** Ambang ketumpatan minimum sebelum langkau penemuan (Part 17). */
  minDensity: number;
  /** Radius bertambah berbanding liputan tersimpan (Part 8). */
  radiusExpanded: boolean;
  /** Cooldown penemuan masih aktif untuk sel ini (Part 8/17). */
  cooldownActive: boolean;
  /** Paksa (admin rescan / refresh). */
  forced?: boolean;
}

export interface DiscoveryDecision {
  discover: boolean;
  reason: string;
}

/**
 * Keputusan penemuan-jurang (Part 8/17). Utamakan DB; temui hanya bila jurang.
 * Cooldown menghalang kueri provider berulang pada setiap Spin — KECUALI dipaksa
 * atau bekalan benar-benar kosong (UNKNOWN/DISCOVERING dgn 0 diketahui).
 */
export function decideAreaDiscovery(input: DiscoveryDecisionInput): DiscoveryDecision {
  if (input.forced) return { discover: true, reason: "forced_rescan" };
  const emptyUnknown =
    (input.coverageStatus === "UNKNOWN" || input.coverageStatus === "DISCOVERING") &&
    input.knownActiveCount === 0;
  // Kolam kosong tanpa liputan → mesti temui walau cooldown (elak 0 hasil).
  if (emptyUnknown) return { discover: true, reason: "empty_uncovered" };
  if (input.cooldownActive) return { discover: false, reason: "cooldown_active" };
  if (input.coverageStatus === "UNKNOWN") return { discover: true, reason: "cell_never_scanned" };
  if (input.coverageStatus === "PARTIAL") return { discover: true, reason: "coverage_partial" };
  if (input.coverageStatus === "STALE") return { discover: true, reason: "coverage_stale" };
  if (input.radiusExpanded) return { discover: true, reason: "radius_expanded" };
  if (input.knownActiveCount < input.minDensity) {
    return { discover: true, reason: "low_known_density" };
  }
  // HEALTHY + segar + cukup padat → database-first, tiada kueri provider.
  return { discover: false, reason: "coverage_healthy_database_first" };
}

export interface BuildAreaPoolInput {
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  coverageCellIds: string[];
  merged: readonly AreaPlace[];
  knownCanonicalCount: number;
  freshnessStatus: AreaCoverageStatus;
  discoveryPerformed: boolean;
  discoveryReason: string;
  newlyDiscoveredCount: number;
  now: number;
  /** Kecualikan tempat tutup-kekal dari calon cadangan (Part 19). */
  excludePermanentlyClosed?: boolean;
}

/**
 * Bina AreaCandidatePool: penapis radius TEPAT + susun jarak, TIADA had 30.
 * activePlaceCount = aktif (bukan permanently_closed) dalam radius.
 */
export function buildAreaCandidatePool(input: BuildAreaPoolInput): AreaCandidatePool {
  const excludePermClosed = input.excludePermanentlyClosed !== false;
  const filtered = exactRadiusFilter(
    input.merged as AreaPlace[],
    input.centerLat,
    input.centerLng,
    input.radiusMeters,
  );
  const within = filtered.within.filter(
    (p) => !(excludePermClosed && p.status === "permanently_closed"),
  );
  const candidates: PlaceCandidate[] = [];
  const canonicalPlaceIds: string[] = [];
  let activeCount = 0;
  for (const p of within) {
    if (p.status === "active") activeCount++;
    canonicalPlaceIds.push(p.canonicalPlaceId ?? p.placeId);
    if (p.candidate) {
      candidates.push({ ...p.candidate, distanceKm: p.distanceMeters / 1000 });
    }
  }
  return {
    locationBucket: areaLocationBucket(input.centerLat, input.centerLng, input.radiusMeters),
    radiusMeters: input.radiusMeters,
    coverageCellIds: input.coverageCellIds,
    knownCanonicalCount: input.knownCanonicalCount,
    exactRadiusCount: within.length,
    activePlaceCount: activeCount,
    canonicalPlaceIds,
    candidates,
    generatedAt: input.now,
    freshnessStatus: input.freshnessStatus,
    discoveryPerformed: input.discoveryPerformed,
    discoveryReason: input.discoveryReason,
    newlyDiscoveredCount: input.newlyDiscoveredCount,
  };
}
