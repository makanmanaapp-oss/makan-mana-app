/**
 * Phase 1.12 Part L — perbandingan bacaan bayangan.
 *
 * Bacaan bayangan membandingkan apa yang laluan legasi memaparkan dengan apa
 * yang penyesuai canonical AKAN memaparkan. Hasil legasi kekal yang dilihat
 * pengguna; perbandingan hanyalah diagnostik.
 *
 * Perbandingan membandingkan KEADAAN, bukan nilai mentah. "Rating tidak
 * diketahui" lawan "rating 4.2" ialah ketidakpadanan; "tidak diketahui" lawan
 * "tidak diketahui" ialah padanan walaupun kedua-dua nilai kosong.
 */
import { EpochMillis } from "../common";
import { COMPARISON_VERSION } from "./migrationTypes";

export const COMPARISON_SEVERITIES = ["match", "info", "warning", "critical"] as const;
export type ComparisonSeverity = (typeof COMPARISON_SEVERITIES)[number];

export const COMPARED_FIELDS = [
  "title",
  "address",
  "coordinates",
  "ratingState",
  "reviewCountState",
  "priceState",
  "hoursState",
  "businessState",
  "imageState",
  "halalState",
  "tagIds",
] as const;
export type ComparedField = (typeof COMPARED_FIELDS)[number];

/**
 * Medan yang salah padanannya adalah SERIUS: ia bermakna pengguna akan melihat
 * kedai yang berbeza, atau maklumat keselamatan yang berbeza.
 */
const CRITICAL_FIELDS: readonly ComparedField[] = [
  "title",
  "coordinates",
  "businessState",
  "halalState",
];

/** Paparan yang diringkaskan bagi satu tempat, daripada mana-mana sumber. */
export interface ComparablePlaceView {
  placeId: string;
  title: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  ratingState: string;
  reviewCountState: string;
  priceState: string;
  hoursState: string;
  businessState: string;
  imageState: string;
  halalState: string;
  tagIds: readonly string[];
}

export interface FieldComparison {
  field: ComparedField;
  legacyValue: string;
  canonicalValue: string;
  match: boolean;
  severity: ComparisonSeverity;
}

export interface PlaceReadComparison {
  placeId: string;
  legacySource: string;
  canonicalSource: string;
  identityMatch: boolean;
  fieldComparisons: FieldComparison[];
  missingLegacyFields: ComparedField[];
  missingCanonicalFields: ComparedField[];
  warnings: string[];
  severity: ComparisonSeverity;
  comparedAt: EpochMillis;
  comparisonVersion: string;
}

/** Toleransi koordinat: ~11 m. Lebih daripada ini bermakna kedai lain. */
export const COORDINATE_TOLERANCE_DEGREES = 0.0001;

function coordinateLabel(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return "unknown";
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function coordinatesMatch(a: ComparablePlaceView, b: ComparablePlaceView): boolean {
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) {
    // Kedua-duanya tidak diketahui = padan; satu diketahui = tidak padan.
    return a.lat === b.lat && a.lng === b.lng;
  }
  return (
    Math.abs(a.lat - b.lat) <= COORDINATE_TOLERANCE_DEGREES &&
    Math.abs(a.lng - b.lng) <= COORDINATE_TOLERANCE_DEGREES
  );
}

function severityFor(field: ComparedField, match: boolean): ComparisonSeverity {
  if (match) return "match";
  return CRITICAL_FIELDS.includes(field) ? "critical" : "warning";
}

function compareValue(
  field: ComparedField,
  legacy: string,
  canonical: string,
): FieldComparison {
  const match = legacy === canonical;
  return {
    field,
    legacyValue: legacy,
    canonicalValue: canonical,
    match,
    severity: severityFor(field, match),
  };
}

/**
 * Bandingkan dua paparan. Tulen — masa disuntik, tiada I/O, tiada log.
 */
export function comparePlaceReads(
  legacy: ComparablePlaceView,
  canonical: ComparablePlaceView,
  sources: { legacySource: string; canonicalSource: string },
  now: EpochMillis,
): PlaceReadComparison {
  const comparisons: FieldComparison[] = [
    compareValue("title", legacy.title, canonical.title),
    compareValue("address", legacy.address ?? "unknown", canonical.address ?? "unknown"),
    {
      field: "coordinates",
      legacyValue: coordinateLabel(legacy.lat, legacy.lng),
      canonicalValue: coordinateLabel(canonical.lat, canonical.lng),
      match: coordinatesMatch(legacy, canonical),
      severity: severityFor("coordinates", coordinatesMatch(legacy, canonical)),
    },
    compareValue("ratingState", legacy.ratingState, canonical.ratingState),
    compareValue("reviewCountState", legacy.reviewCountState, canonical.reviewCountState),
    compareValue("priceState", legacy.priceState, canonical.priceState),
    compareValue("hoursState", legacy.hoursState, canonical.hoursState),
    compareValue("businessState", legacy.businessState, canonical.businessState),
    compareValue("imageState", legacy.imageState, canonical.imageState),
    compareValue("halalState", legacy.halalState, canonical.halalState),
    compareValue(
      "tagIds",
      [...legacy.tagIds].sort().join(","),
      [...canonical.tagIds].sort().join(","),
    ),
  ];

  const missingLegacyFields = comparisons
    .filter((c) => c.legacyValue === "unknown" || c.legacyValue === "")
    .map((c) => c.field);
  const missingCanonicalFields = comparisons
    .filter((c) => c.canonicalValue === "unknown" || c.canonicalValue === "")
    .map((c) => c.field);

  const warnings: string[] = [];
  if (legacy.placeId !== canonical.placeId) {
    warnings.push("place_id_differs_alias_resolution_required");
  }

  const worst: ComparisonSeverity = comparisons.some((c) => c.severity === "critical")
    ? "critical"
    : comparisons.some((c) => c.severity === "warning")
      ? "warning"
      : warnings.length > 0
        ? "info"
        : "match";

  return {
    placeId: legacy.placeId,
    legacySource: sources.legacySource,
    canonicalSource: sources.canonicalSource,
    // Identiti sepadan bermakna tajuk DAN koordinat sepadan.
    identityMatch:
      comparisons.find((c) => c.field === "title")!.match &&
      comparisons.find((c) => c.field === "coordinates")!.match,
    fieldComparisons: comparisons,
    missingLegacyFields,
    missingCanonicalFields,
    warnings,
    severity: worst,
    comparedAt: now,
    comparisonVersion: COMPARISON_VERSION,
  };
}

/** Ringkasan agregat merentas banyak perbandingan (untuk papan pemuka QA). */
export interface ShadowComparisonSummary {
  totalCompared: number;
  identityMatches: number;
  mismatches: number;
  criticalMismatches: number;
  mismatchesByField: Record<string, number>;
}

export function summarizeComparisons(
  comparisons: readonly PlaceReadComparison[],
): ShadowComparisonSummary {
  const byField: Record<string, number> = {};
  let mismatches = 0;
  let critical = 0;

  for (const comparison of comparisons) {
    let hasMismatch = false;
    for (const field of comparison.fieldComparisons) {
      if (field.match) continue;
      hasMismatch = true;
      byField[field.field] = (byField[field.field] ?? 0) + 1;
      if (field.severity === "critical") critical += 1;
    }
    if (hasMismatch) mismatches += 1;
  }

  return {
    totalCompared: comparisons.length,
    identityMatches: comparisons.filter((c) => c.identityMatch).length,
    mismatches,
    criticalMismatches: critical,
    mismatchesByField: byField,
  };
}
