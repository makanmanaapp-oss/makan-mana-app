"use strict";
/** Phase 1.2 — completeness (10 dimensi) + helper formula tulen. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPLETENESS_WEIGHTS = void 0;
exports.calculatePlaceCompleteness = calculatePlaceCompleteness;
/**
 * Pemberat formula rasmi (PDF §10.2). Jumlah = 1.00.
 * `safetyEvidenceCompleteness` SENGAJA dikecualikan (kekal berasingan).
 */
exports.COMPLETENESS_WEIGHTS = {
    identity: 0.2,
    location: 0.2,
    display: 0.15,
    commercial: 0.1,
    hours: 0.1,
    quality: 0.1,
    tag: 0.1,
    provenance: 0.05,
};
const COMPONENT_KEYS = [
    "identityCompleteness",
    "locationCompleteness",
    "displayCompleteness",
    "commercialCompleteness",
    "hoursCompleteness",
    "qualityCompleteness",
    "tagCompleteness",
    "provenanceCompleteness",
    "safetyEvidenceCompleteness",
];
/**
 * Kira overallScore secara deterministik. Semua komponen mesti dalam [0,1]
 * (jika tidak lempar RangeError — pengesahan skema mengendalikan input tidak
 * sah secara graceful; helper ini mengandaikan input tersahih).
 */
function calculatePlaceCompleteness(input) {
    for (const k of COMPONENT_KEYS) {
        const v = input[k];
        if (!(typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1)) {
            throw new RangeError(`completeness component out of range: ${k}=${v}`);
        }
    }
    const w = exports.COMPLETENESS_WEIGHTS;
    const raw = w.identity * input.identityCompleteness +
        w.location * input.locationCompleteness +
        w.display * input.displayCompleteness +
        w.commercial * input.commercialCompleteness +
        w.hours * input.hoursCompleteness +
        w.quality * input.qualityCompleteness +
        w.tag * input.tagCompleteness +
        w.provenance * input.provenanceCompleteness;
    // Bundarkan untuk keputusan deterministik (elak hingar float).
    const overallScore = Math.round(raw * 1e6) / 1e6;
    return { ...input, overallScore };
}
