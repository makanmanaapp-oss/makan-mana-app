"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COORDINATE_TOLERANCE_DEGREES = exports.COMPARED_FIELDS = exports.COMPARISON_SEVERITIES = void 0;
exports.comparePlaceReads = comparePlaceReads;
exports.summarizeComparisons = summarizeComparisons;
const migrationTypes_1 = require("./migrationTypes");
exports.COMPARISON_SEVERITIES = ["match", "info", "warning", "critical"];
exports.COMPARED_FIELDS = [
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
];
/**
 * Medan yang salah padanannya adalah SERIUS: ia bermakna pengguna akan melihat
 * kedai yang berbeza, atau maklumat keselamatan yang berbeza.
 */
const CRITICAL_FIELDS = [
    "title",
    "coordinates",
    "businessState",
    "halalState",
];
/** Toleransi koordinat: ~11 m. Lebih daripada ini bermakna kedai lain. */
exports.COORDINATE_TOLERANCE_DEGREES = 0.0001;
function coordinateLabel(lat, lng) {
    if (lat === null || lng === null)
        return "unknown";
    return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}
function coordinatesMatch(a, b) {
    if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) {
        // Kedua-duanya tidak diketahui = padan; satu diketahui = tidak padan.
        return a.lat === b.lat && a.lng === b.lng;
    }
    return (Math.abs(a.lat - b.lat) <= exports.COORDINATE_TOLERANCE_DEGREES &&
        Math.abs(a.lng - b.lng) <= exports.COORDINATE_TOLERANCE_DEGREES);
}
function severityFor(field, match) {
    if (match)
        return "match";
    return CRITICAL_FIELDS.includes(field) ? "critical" : "warning";
}
function compareValue(field, legacy, canonical) {
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
function comparePlaceReads(legacy, canonical, sources, now) {
    const comparisons = [
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
        compareValue("tagIds", [...legacy.tagIds].sort().join(","), [...canonical.tagIds].sort().join(",")),
    ];
    const missingLegacyFields = comparisons
        .filter((c) => c.legacyValue === "unknown" || c.legacyValue === "")
        .map((c) => c.field);
    const missingCanonicalFields = comparisons
        .filter((c) => c.canonicalValue === "unknown" || c.canonicalValue === "")
        .map((c) => c.field);
    const warnings = [];
    if (legacy.placeId !== canonical.placeId) {
        warnings.push("place_id_differs_alias_resolution_required");
    }
    const worst = comparisons.some((c) => c.severity === "critical")
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
        identityMatch: comparisons.find((c) => c.field === "title").match &&
            comparisons.find((c) => c.field === "coordinates").match,
        fieldComparisons: comparisons,
        missingLegacyFields,
        missingCanonicalFields,
        warnings,
        severity: worst,
        comparedAt: now,
        comparisonVersion: migrationTypes_1.COMPARISON_VERSION,
    };
}
function summarizeComparisons(comparisons) {
    const byField = {};
    let mismatches = 0;
    let critical = 0;
    for (const comparison of comparisons) {
        let hasMismatch = false;
        for (const field of comparison.fieldComparisons) {
            if (field.match)
                continue;
            hasMismatch = true;
            byField[field.field] = (byField[field.field] ?? 0) + 1;
            if (field.severity === "critical")
                critical += 1;
        }
        if (hasMismatch)
            mismatches += 1;
    }
    return {
        totalCompared: comparisons.length,
        identityMatches: comparisons.filter((c) => c.identityMatch).length,
        mismatches,
        criticalMismatches: critical,
        mismatchesByField: byField,
    };
}
