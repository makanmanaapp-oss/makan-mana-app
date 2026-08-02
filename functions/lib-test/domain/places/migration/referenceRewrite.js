"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReferenceRewrite = buildReferenceRewrite;
exports.buildRewritePreview = buildRewritePreview;
exports.markRewriteAppliedInEmulator = markRewriteAppliedInEmulator;
exports.markRewriteRolledBack = markRewriteRolledBack;
const hashing_1 = require("../staging/hashing");
const KIND_TO_TYPE = {
    favorite: "favorite_reference",
    meal: "meal_reference",
    history: "history_reference",
    suggestion: "suggestion_reference",
    session: "session_reference",
    deep_link: "deep_link_reference",
    correction: "correction_reference",
    other: "other_reference",
};
/** Rujukan yang MESTI ditulis semula supaya data pengguna tidak pecah. */
const REQUIRED_TYPES = [
    "favorite_reference",
    "meal_reference",
    "deep_link_reference",
];
function documentIdOf(path) {
    const parts = path.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? path;
}
function buildReferenceRewrite(pointer, legacyPlaceId, canonicalPlaceId, now) {
    const rewriteType = KIND_TO_TYPE[pointer.kind];
    const known = pointer.kind !== "other";
    return {
        rewriteId: `RWR-${(0, hashing_1.hashCanonical)({
            path: pointer.path,
            fieldPath: pointer.fieldPath,
            legacyPlaceId,
        }).slice(0, 24)}`,
        sourcePath: pointer.path,
        sourceDocumentId: documentIdOf(pointer.path),
        fieldPath: pointer.fieldPath,
        legacyPlaceId,
        canonicalPlaceId,
        // Nilai legasi tidak pernah dibuang — inilah yang menjadikan rollback selamat.
        aliasPreserved: true,
        rewriteType,
        required: REQUIRED_TYPES.includes(rewriteType),
        // Laluan yang tidak dikenali tidak boleh dipratonton sebagai boleh ditulis.
        status: known ? "preview" : "held",
        reason: known ? "preview_only_no_production_write" : "unknown_reference_path",
        createdAt: now,
    };
}
/**
 * Bina pratonton bagi semua penunjuk yang mengarah kepada satu ID legasi.
 * Output diisih supaya pelan deterministik.
 */
function buildRewritePreview(pointers, legacyPlaceId, canonicalPlaceId, now) {
    const rewrites = pointers
        .map((p) => buildReferenceRewrite(p, legacyPlaceId, canonicalPlaceId, now))
        .sort((a, b) => a.rewriteId.localeCompare(b.rewriteId));
    return {
        rewrites: rewrites.filter((r) => r.status === "preview"),
        unresolved: rewrites.filter((r) => r.status === "held"),
    };
}
/**
 * Tandakan penulisan semula sebagai dilaksanakan dalam emulator. Nilai legasi
 * kekal — hanya statusnya berubah.
 */
function markRewriteAppliedInEmulator(rewrite) {
    return {
        ...rewrite,
        status: "applied_in_emulator",
        reason: "emulator_only_execution",
    };
}
function markRewriteRolledBack(rewrite) {
    return {
        ...rewrite,
        status: "rolled_back",
        reason: "restored_from_preserved_legacy_value",
    };
}
