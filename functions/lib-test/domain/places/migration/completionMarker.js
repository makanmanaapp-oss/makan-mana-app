"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MARKER_REFUSAL_CODES = exports.MIGRATION_ENVIRONMENTS = void 0;
exports.createCompletionMarker = createCompletionMarker;
exports.productionCanonicalReadAllowed = productionCanonicalReadAllowed;
const hashing_1 = require("../staging/hashing");
const migrationTypes_1 = require("./migrationTypes");
exports.MIGRATION_ENVIRONMENTS = ["emulator", "qa", "production"];
exports.MARKER_REFUSAL_CODES = [
    "forbidden_status_in_this_phase",
    "non_emulator_environment",
    "held_candidates_present",
    "production_write_reported",
    "legacy_deletion_reported",
];
function refuse(code) {
    return { ok: false, refusalCode: code, marker: null };
}
/**
 * Cipta penanda penyiapan. Setiap penolakan di bawah adalah pagar keselamatan
 * yang disengajakan, bukan pengesahan input.
 */
function createCompletionMarker(input, now) {
    // Fasa 1.12: penanda produksi DILARANG sepenuhnya.
    if (migrationTypes_1.FORBIDDEN_MARKER_STATUSES.includes(input.status)) {
        return refuse("forbidden_status_in_this_phase");
    }
    if (input.status !== "emulator_complete" && input.status !== "rolled_back") {
        // `qa_complete` memerlukan larian QA yang diluluskan — bukan fasa ini.
        return refuse("forbidden_status_in_this_phase");
    }
    if (input.environment !== "emulator") {
        return refuse("non_emulator_environment");
    }
    if (input.validationSummary.heldCandidates > 0) {
        // Migrasi dengan calon yang ditahan tidak boleh dipanggil selesai.
        return refuse("held_candidates_present");
    }
    if (input.validationSummary.productionWrites !== 0) {
        return refuse("production_write_reported");
    }
    if (input.validationSummary.legacyRecordsDeleted !== 0) {
        return refuse("legacy_deletion_reported");
    }
    return {
        ok: true,
        refusalCode: null,
        marker: {
            markerId: `MCM-${(0, hashing_1.hashCanonical)({
                migrationPlanId: input.migrationPlanId,
                environment: input.environment,
            }).slice(0, 24)}`,
            migrationPlanId: input.migrationPlanId,
            environment: input.environment,
            canonicalDataVersion: input.canonicalDataVersion,
            aliasVersion: input.aliasVersion,
            referenceRewriteVersion: input.referenceRewriteVersion,
            validationSummary: input.validationSummary,
            completedAt: now,
            approvedBy: input.approvedBy,
            status: input.status,
        },
    };
}
/**
 * Adakah bacaan canonical produksi dibenarkan? Ia memerlukan penanda
 * `production_complete`, yang fasa ini tidak boleh cipta — jadi jawapannya
 * sentiasa tidak. Ini adalah fungsi yang dirujuk oleh penyelaras feature flag.
 */
function productionCanonicalReadAllowed(markers) {
    return markers.some((m) => m.environment === "production" && m.status === "production_complete");
}
