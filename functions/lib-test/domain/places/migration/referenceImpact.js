"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_REFERENCE_SCAN_LIMITS = void 0;
exports.scanReferenceImpact = scanReferenceImpact;
exports.scanInventoryReferenceImpact = scanInventoryReferenceImpact;
exports.mergeReferenceImpact = mergeReferenceImpact;
exports.emptyReferenceImpact = emptyReferenceImpact;
const migrationTypes_1 = require("./migrationTypes");
exports.DEFAULT_REFERENCE_SCAN_LIMITS = {
    maxReferencesPerPlace: 5000,
    maxUnknownPathsRecorded: 50,
};
/** Laluan yang kita tahu bagaimana untuk menulis semula dengan selamat. */
const KNOWN_KINDS = [
    "favorite",
    "meal",
    "history",
    "suggestion",
    "session",
    "deep_link",
    "correction",
];
function riskFor(critical, total, hasUnknown) {
    if (critical > 0 && hasUnknown)
        return "critical";
    if (critical >= 10)
        return "critical";
    if (critical > 0)
        return "high";
    if (hasUnknown)
        return "medium";
    if (total >= 10)
        return "medium";
    if (total > 0)
        return "low";
    return "none";
}
/**
 * Imbas semua penunjuk rujukan untuk satu ID tempat legasi.
 *
 * Penunjuk datang daripada inventori (yang mengumpulnya semasa membaca
 * koleksi legasi) — pengimbas ini tulen dan tidak melakukan I/O sendiri.
 */
function scanReferenceImpact(legacyPlaceId, pointers, now, limits = exports.DEFAULT_REFERENCE_SCAN_LIMITS) {
    const warnings = [];
    let scanned = pointers;
    if (pointers.length > limits.maxReferencesPerPlace) {
        // Terikat: kita lapor pemotongan dan bukannya senyap-senyap mengimbas semua.
        warnings.push("reference_scan_truncated");
        scanned = pointers.slice(0, limits.maxReferencesPerPlace);
    }
    const counts = {
        favorite: 0,
        meal: 0,
        history: 0,
        suggestion: 0,
        session: 0,
        deep_link: 0,
        correction: 0,
        other: 0,
    };
    const otherPaths = [];
    for (const pointer of scanned) {
        if (KNOWN_KINDS.includes(pointer.kind)) {
            counts[pointer.kind] += 1;
            continue;
        }
        counts.other += 1;
        if (otherPaths.length < limits.maxUnknownPathsRecorded) {
            otherPaths.push(pointer.path);
        }
    }
    if (counts.other > 0) {
        // Laluan yang tidak diketahui TIDAK PERNAH senyap — ia menaikkan amaran.
        warnings.push("unknown_reference_path");
    }
    const total = counts.favorite +
        counts.meal +
        counts.history +
        counts.suggestion +
        counts.session +
        counts.deep_link +
        counts.correction +
        counts.other;
    const critical = migrationTypes_1.CRITICAL_REFERENCE_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
    return {
        legacyPlaceId,
        favoriteReferenceCount: counts.favorite,
        mealReferenceCount: counts.meal,
        historyReferenceCount: counts.history,
        suggestionReferenceCount: counts.suggestion,
        sessionReferenceCount: counts.session,
        deepLinkReferenceCount: counts.deep_link,
        correctionReferenceCount: counts.correction,
        otherReferencePaths: otherPaths,
        totalReferences: total,
        criticalReferences: critical,
        migrationRisk: riskFor(critical, total, counts.other > 0),
        warnings,
        scannedAt: now,
    };
}
/** Imbas kesan bagi setiap ID tempat legasi dalam inventori. */
function scanInventoryReferenceImpact(records, now, limits = exports.DEFAULT_REFERENCE_SCAN_LIMITS) {
    const pointersByPlace = new Map();
    for (const record of records) {
        const list = pointersByPlace.get(record.legacyPlaceId) ?? [];
        list.push(...record.referencedBy);
        pointersByPlace.set(record.legacyPlaceId, list);
    }
    const out = new Map();
    for (const [placeId, pointers] of pointersByPlace) {
        out.set(placeId, scanReferenceImpact(placeId, pointers, now, limits));
    }
    return out;
}
/**
 * Gabungkan kesan beberapa ID legasi yang dipetakan kepada SATU identiti
 * canonical (cth. cache + details bagi kedai yang sama).
 */
function mergeReferenceImpact(legacyPlaceId, impacts, now) {
    const sum = (pick) => impacts.reduce((total, i) => total + pick(i), 0);
    const otherPaths = [...new Set(impacts.flatMap((i) => i.otherReferencePaths))].sort();
    const warnings = [...new Set(impacts.flatMap((i) => i.warnings))].sort();
    const critical = sum((i) => i.criticalReferences);
    const total = sum((i) => i.totalReferences);
    return {
        legacyPlaceId,
        favoriteReferenceCount: sum((i) => i.favoriteReferenceCount),
        mealReferenceCount: sum((i) => i.mealReferenceCount),
        historyReferenceCount: sum((i) => i.historyReferenceCount),
        suggestionReferenceCount: sum((i) => i.suggestionReferenceCount),
        sessionReferenceCount: sum((i) => i.sessionReferenceCount),
        deepLinkReferenceCount: sum((i) => i.deepLinkReferenceCount),
        correctionReferenceCount: sum((i) => i.correctionReferenceCount),
        otherReferencePaths: otherPaths,
        totalReferences: total,
        criticalReferences: critical,
        migrationRisk: riskFor(critical, total, otherPaths.length > 0),
        warnings,
        scannedAt: now,
    };
}
/** Kesan kosong (tiada rujukan langsung ditemui). */
function emptyReferenceImpact(legacyPlaceId, now) {
    return scanReferenceImpact(legacyPlaceId, [], now);
}
