/**
 * Phase 1.7 Part A & B — GEOHASH BASE32 DETERMINISTIK (implementasi kecil).
 *
 * Kami TIDAK menambah kebergantungan besar. Geohash ialah sistem grid yang
 * didokumenkan luas dan stabil: setiap aksara base32 menambah 5 bit, berselang
 * antara longitud dan latitud bermula dengan longitud.
 *
 * TULEN — tiada masa semasa, tiada I/O, tiada rawak. ID sel adalah SAMA untuk
 * semua pengguna pada koordinat yang sama (syarat "stable across users").
 *
 * KOORDINAT MENTAH TIDAK PERNAH menjadi ID dokumen — ID ialah geohash yang
 * dikuantumkan mengikut resolusi (rujuk PDF §5.3).
 */
import { isValidLatLng } from "../common";

/** Abjad base32 geohash standard (tanpa a, i, l, o). */
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

const LAT_RANGE: readonly [number, number] = [-90, 90];
const LNG_RANGE: readonly [number, number] = [-180, 180];

/** Resolusi geohash yang disokong (bilangan aksara). */
export const MIN_CELL_RESOLUTION = 1;
export const MAX_CELL_RESOLUTION = 12;

/**
 * Resolusi lalai = 6 aksara ≈ 1.2 km × 0.6 km.
 * Dipilih supaya satu sel ialah "kejiranan" yang bermakna untuk carian makanan
 * bandar, dan supaya bilangan sel jiran kekal kecil (8) untuk radius biasa.
 */
export const DEFAULT_CELL_RESOLUTION = 6;

export const CELL_SYSTEM = "geohash_base32";

export class InvalidCoordinateError extends Error {
  constructor(lat: unknown, lng: unknown) {
    super(`invalid coordinate: lat=${String(lat)} lng=${String(lng)}`);
    this.name = "InvalidCoordinateError";
  }
}

export class InvalidCellIdError extends Error {
  constructor(cellId: unknown) {
    super(`invalid cell id: ${String(cellId)}`);
    this.name = "InvalidCellIdError";
  }
}

function assertResolution(resolution: number): void {
  if (
    !Number.isInteger(resolution) ||
    resolution < MIN_CELL_RESOLUTION ||
    resolution > MAX_CELL_RESOLUTION
  ) {
    throw new RangeError(
      `resolution mesti integer ${MIN_CELL_RESOLUTION}..${MAX_CELL_RESOLUTION}, dapat ${resolution}`,
    );
  }
}

/** Anggaran saiz sel (meter) mengikut resolusi — untuk pengiraan jiran. */
const CELL_WIDTH_M: Record<number, number> = {
  1: 5_009_400,
  2: 1_252_300,
  3: 156_500,
  4: 39_100,
  5: 4_900,
  6: 1_200,
  7: 152.9,
  8: 38.2,
  9: 4.77,
  10: 1.19,
  11: 0.149,
  12: 0.037,
};

/** Lebar (meter) sel pada resolusi tertentu — dipakai oleh pengembangan radius. */
export function approxCellWidthMeters(resolution: number): number {
  assertResolution(resolution);
  return CELL_WIDTH_M[resolution];
}

/**
 * Encode koordinat → geohash. Deterministik.
 * MELEMPAR `InvalidCoordinateError` untuk lat/lng tidak sah (syarat ujian 3/4).
 */
export function encodeGeohash(
  lat: number,
  lng: number,
  resolution: number = DEFAULT_CELL_RESOLUTION,
): string {
  assertResolution(resolution);
  if (!isValidLatLng(lat, lng)) throw new InvalidCoordinateError(lat, lng);

  let latMin = LAT_RANGE[0];
  let latMax = LAT_RANGE[1];
  let lngMin = LNG_RANGE[0];
  let lngMax = LNG_RANGE[1];

  let hash = "";
  let bit = 0;
  let ch = 0;
  let evenBit = true; // true = longitud (geohash bermula dengan longitud)

  while (hash.length < resolution) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        ch = (ch << 1) + 1;
        lngMin = mid;
      } else {
        ch = ch << 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = (ch << 1) + 1;
        latMin = mid;
      } else {
        ch = ch << 1;
        latMax = mid;
      }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      hash += BASE32.charAt(ch);
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

export interface GeohashBounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/** Nyahkod geohash → kotak sempadan. MELEMPAR untuk ID tidak sah. */
export function decodeGeohashBounds(hash: string): GeohashBounds {
  if (typeof hash !== "string" || hash.length === 0) throw new InvalidCellIdError(hash);
  if (hash.length > MAX_CELL_RESOLUTION) throw new InvalidCellIdError(hash);

  let latMin = LAT_RANGE[0];
  let latMax = LAT_RANGE[1];
  let lngMin = LNG_RANGE[0];
  let lngMax = LNG_RANGE[1];
  let evenBit = true;

  for (const c of hash.toLowerCase()) {
    const idx = BASE32.indexOf(c);
    if (idx === -1) throw new InvalidCellIdError(hash);
    for (let n = 4; n >= 0; n--) {
      const bitN = (idx >> n) & 1;
      if (evenBit) {
        const mid = (lngMin + lngMax) / 2;
        if (bitN === 1) lngMin = mid;
        else lngMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (bitN === 1) latMin = mid;
        else latMax = mid;
      }
      evenBit = !evenBit;
    }
  }
  return { minLat: latMin, minLng: lngMin, maxLat: latMax, maxLng: lngMax };
}

export interface GeohashCenter {
  lat: number;
  lng: number;
}

/** Pusat geometri sel. Deterministik. */
export function decodeGeohashCenter(hash: string): GeohashCenter {
  const b = decodeGeohashBounds(hash);
  return { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
}

/**
 * Lapan sel bersebelahan (8-connected), TIDAK termasuk sel pusat.
 * Susunan DETERMINISTIK: N, NE, E, SE, S, SW, W, NW.
 *
 * Kaedah: ambil pusat sel, langkah satu ketinggian/lebar sel ke setiap arah,
 * kemudian encode semula. Koordinat di luar julat lat dijepit (kutub) dan
 * longitud dibalut (antimeridian) — jadi hasil sentiasa sah dan TERBATAS.
 * Pendua dibuang (berlaku berhampiran kutub).
 */
export function geohashNeighbors(hash: string): string[] {
  const bounds = decodeGeohashBounds(hash);
  const center = decodeGeohashCenter(hash);
  const latStep = bounds.maxLat - bounds.minLat;
  const lngStep = bounds.maxLng - bounds.minLng;
  const resolution = hash.length;

  // Susunan tetap N, NE, E, SE, S, SW, W, NW (dLat, dLng).
  const offsets: readonly (readonly [number, number])[] = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];

  const out: string[] = [];
  const seen = new Set<string>([hash]); // pusat DIKECUALIKAN secara konsisten
  for (const [dLat, dLng] of offsets) {
    const lat = Math.min(90, Math.max(-90, center.lat + dLat * latStep));
    // Balut longitud ke julat [-180, 180).
    let lng = center.lng + dLng * lngStep;
    while (lng < -180) lng += 360;
    while (lng >= 180) lng -= 360;
    const n = encodeGeohash(lat, lng, resolution);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
