"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ALIAS_HOPS = exports.TrustedSnapshotError = void 0;
exports.trustedContentHash = trustedContentHash;
exports.toTrustedSnapshot = toTrustedSnapshot;
exports.resolveTrustedSnapshot = resolveTrustedSnapshot;
exports.compareClientToTrusted = compareClientToTrusted;
/**
 * Phase 1.14B — penyelesai snapshot pembetulan DIPERCAYAI (TULEN).
 *
 * Snapshot "nilai semasa" bagi laporan pembetulan MESTI diperoleh daripada data
 * yang boleh dibaca server yang DIPERCAYAI — BUKAN daripada nilai yang diisytihar
 * klien. Klien hanya boleh MENCADANGKAN pembetulan; ia TIDAK PERNAH boleh menetapkan
 * keadaan semasa yang dipercayai (nama/alamat/koordinat/rating/harga/waktu/halal/
 * alergen/diet/status).
 *
 * Sumber data disuntik (`TrustedPlaceDataSource`) supaya modul ini boleh diuji unit
 * tanpa Firebase. TIDAK menulis apa-apa.
 */
const crypto_1 = require("crypto");
class TrustedSnapshotError extends Error {
    code;
    constructor(code, message) {
        super(message ?? code);
        this.code = code;
        this.name = "TrustedSnapshotError";
    }
}
exports.TrustedSnapshotError = TrustedSnapshotError;
exports.MAX_ALIAS_HOPS = 8;
function sha(input) {
    return (0, crypto_1.createHash)("sha256").update(input).digest("hex");
}
/** Hash kandungan DETERMINISTIK bagi paparan dipercayai (medan diisih). */
function trustedContentHash(view, resolvedPlaceId) {
    const canonical = JSON.stringify({
        placeId: resolvedPlaceId,
        title: view.title,
        address: view.address ?? "",
        coordinates: view.coordinates ? `${view.coordinates.lat},${view.coordinates.lng}` : "",
        hoursState: view.hoursState,
        priceState: view.priceState,
        ratingState: view.ratingState,
        businessState: view.businessState,
        halalState: view.halalState,
        dietaryState: view.dietaryState,
        allergenState: view.allergenState,
        imageReferences: [...view.imageReferences].sort(),
        tagIds: [...view.tagIds].sort(),
        warnings: [...view.warnings].sort(),
        publicationVersion: view.publicationVersion ?? null,
    });
    return sha(canonical).slice(0, 32);
}
/** Bina PlaceReportOriginalSnapshot DIPERCAYAI daripada paparan. Tiada PII/admin. */
function toTrustedSnapshot(view, resolvedPlaceId, now) {
    return {
        placeId: resolvedPlaceId,
        publicationId: view.publicationId,
        publicationVersion: view.publicationVersion,
        title: view.title,
        address: view.address,
        coordinates: view.coordinates,
        hoursState: view.hoursState,
        priceState: view.priceState,
        ratingState: view.ratingState,
        businessState: view.businessState,
        halalState: view.halalState,
        dietaryState: view.dietaryState,
        allergenState: view.allergenState,
        imageReferences: [...view.imageReferences],
        tagIds: [...view.tagIds],
        warnings: [...view.warnings],
        sourceMode: view.sourceMode,
        capturedAt: now,
        contentHash: trustedContentHash(view, resolvedPlaceId),
    };
}
/**
 * Selesaikan snapshot DIPERCAYAI mengikut keutamaan:
 *   1. penerbitan canonical aktif
 *   2. sumber canonical ujian/emulator diluluskan
 *   3. place_details dipercayai
 *   4. places_cache dipercayai
 *   5. tolak dengan selamat jika tiada
 *
 * Alias diselesaikan dahulu; rantai bertutup; circular/blocked ditolak.
 * TIDAK PERNAH jatuh balik ke nilai klien.
 */
async function resolveTrustedSnapshot(input, source, now) {
    if (!input.placeId?.trim())
        throw new TrustedSnapshotError("invalid_place", "place_id_required");
    // --- 1. Selesaikan alias (bertutup + selamat) ---------------------------
    const alias = await source.resolveAlias(input.placeId);
    if (alias.status === "circular")
        throw new TrustedSnapshotError("alias_unsafe", "circular_alias");
    if (alias.status === "blocked")
        throw new TrustedSnapshotError("alias_unsafe", "blocked_alias");
    if (alias.chain.length > exports.MAX_ALIAS_HOPS)
        throw new TrustedSnapshotError("alias_unsafe", "alias_chain_too_long");
    const resolvedId = alias.status === "not_found" ? input.placeId : alias.resolvedCanonicalPlaceId;
    // --- 2. Keutamaan sumber dipercayai -------------------------------------
    const attempts = [
        { src: "canonical_publication", view: await source.getActivePublication(resolvedId) },
        { src: "canonical_test", view: await source.getApprovedCanonicalTestSource(resolvedId) },
        { src: "place_details", view: await source.getPlaceDetails(resolvedId) },
        { src: "places_cache", view: await source.getPlacesCache(resolvedId) },
    ];
    for (const { src, view } of attempts) {
        if (!view)
            continue;
        // Rekod disekat TIDAK PERNAH boleh menjadi asas laporan.
        if (view.blocked)
            throw new TrustedSnapshotError("invalid_place", "blocked_record");
        return {
            trustedOriginalSnapshot: toTrustedSnapshot(view, resolvedId, now),
            sourceUsed: src,
            resolvedCanonicalPlaceId: resolvedId,
            aliasResolution: alias,
            publicationVersion: view.publicationVersion,
            legacySourceVersion: view.legacySourceVersion,
            derivedAt: now,
            contentHash: trustedContentHash(view, resolvedId),
        };
    }
    // --- 5. Tiada sumber dipercayai → tolak (JANGAN guna nilai klien) --------
    throw new TrustedSnapshotError("no_trusted_source", "no_trusted_snapshot");
}
function hashValue(v) {
    return v === undefined ? undefined : sha(v).slice(0, 16);
}
/**
 * Bandingkan nilai yang diisytihar klien dengan snapshot dipercayai. Menghasilkan
 * amaran DIREDAKSI sahaja (hash, bukan nilai mentah). Ketidakpadanan BUKAN penipuan
 * — ia menandakan data klien lapuk/alias diselesaikan.
 */
function compareClientToTrusted(client, trusted) {
    const out = [];
    // Alias diselesaikan (placeId klien != canonical dipercayai).
    if (client.placeId !== trusted.resolvedCanonicalPlaceId) {
        out.push({
            fieldPath: "placeId",
            clientValueHash: hashValue(client.placeId),
            serverValueHash: hashValue(trusted.resolvedCanonicalPlaceId),
            mismatchType: "alias_resolved",
            severity: "info",
            warningCode: "alias_resolved",
        });
    }
    // Versi penerbitan berbeza → data klien mungkin lapuk.
    if (client.publicationVersion !== undefined &&
        trusted.publicationVersion !== undefined &&
        client.publicationVersion !== trusted.publicationVersion) {
        out.push({
            fieldPath: "publicationVersion",
            mismatchType: "publication_version_mismatch",
            severity: "warning",
            warningCode: "stale_publication_version",
        });
    }
    // Nilai semasa yang diisytihar klien berbeza daripada keadaan dipercayai.
    if (client.affectedFieldState !== undefined && client.currentValue !== undefined) {
        if (client.currentValue !== client.affectedFieldState) {
            out.push({
                fieldPath: "currentValue",
                clientValueHash: hashValue(client.currentValue),
                serverValueHash: hashValue(client.affectedFieldState),
                mismatchType: "value_changed",
                severity: "info",
                warningCode: "current_value_changed",
            });
        }
    }
    return out;
}
