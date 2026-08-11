/** Phase 1.4 — jarak geo tulen (Haversine) + geoSimilarity. */
import { isValidLatLng } from "../common";
import { GEO_SIMILARITY, GeoThresholds, GEO_THRESHOLDS } from "./config";

export interface GeoResult {
  distanceMeters: number; // Infinity bila koordinat tidak sah/tiada
  geoSimilarity: number; // 0..1
  valid: boolean;
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // meter
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function geoProximity(
  a: { lat?: number; lng?: number },
  b: { lat?: number; lng?: number },
  thresholds: GeoThresholds = GEO_THRESHOLDS,
): GeoResult {
  if (
    a.lat === undefined ||
    a.lng === undefined ||
    b.lat === undefined ||
    b.lng === undefined ||
    !isValidLatLng(a.lat, a.lng) ||
    !isValidLatLng(b.lat, b.lng)
  ) {
    return { distanceMeters: Infinity, geoSimilarity: GEO_SIMILARITY.invalid, valid: false };
  }
  const d = haversineMeters(a.lat, a.lng, b.lat, b.lng);
  let sim: number;
  if (d <= thresholds.veryStrongM) sim = GEO_SIMILARITY.veryStrong;
  else if (d <= thresholds.strongM) sim = GEO_SIMILARITY.strong;
  else if (d <= thresholds.moderateM) sim = GEO_SIMILARITY.moderate;
  else sim = GEO_SIMILARITY.weak;
  return { distanceMeters: Math.round(d * 100) / 100, geoSimilarity: sim, valid: true };
}
