"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductionMigrationRefusal = exports.PRODUCTION_REFUSAL_CODES = exports.PRODUCTION_WRITE_FORBIDDEN = exports.PRODUCTION_WRITE_ALLOWLIST = void 0;
exports.buildProductionCanonicalWrite = buildProductionCanonicalWrite;
exports.productionBatchId = productionBatchId;
/**
 * Phase 1.14E — PRODUCTION canonical write builder (domain TULEN, tiada I/O).
 *
 * Mengadaptasi calon migrasi DILULUSKAN (dari executor sedia ada) kepada rekod
 * PRODUKSI: registry kanonikal, versi penerbitan IMMUTABLE, penunjuk penerbitan
 * aktif (head), dan alias legasi→kanonikal. Bentuk penerbitan SELARAS dengan
 * kontrak baca dipercayai (submitPlaceCorrection.getActivePublication) supaya
 * callable + adapter baca boleh menggunakannya.
 *
 * KESELAMATAN:
 *  - Hanya calon `ready` (SAFE) diterima; HELD/CONFLICT/INVALID ditolak.
 *  - Lokasi mesti sah (lat/lng) — jika tidak, ditolak.
 *  - ID kanonikal mesti = proposedCanonicalPlaceId (tiada drift).
 *  - Medan tak-diketahui kekal *_unknown — TIDAK PERNAH direka.
 *  - Senarai putih koleksi tulis dikuatkuasakan oleh pemanggil.
 */
const common_1 = require("../common");
const hashing_1 = require("../staging/hashing");
const migrationCandidate_1 = require("./migrationCandidate");
/** Koleksi produksi yang DIBENARKAN ditulis oleh migrasi (Part C). */
exports.PRODUCTION_WRITE_ALLOWLIST = [
    "place_registry",
    "place_publications",
    "place_publication_heads",
    "place_migration_aliases",
    "place_migration_batches",
    "place_migration_audit",
];
/** Koleksi yang TIDAK PERNAH boleh ditulis oleh migrasi (Part C). */
exports.PRODUCTION_WRITE_FORBIDDEN = [
    "place_details", "places_cache", "users", "user_profiles",
    "suggestion_sessions", "suggestions", "favorites", "meals", "meal_wallet",
    "reviews", "feed_posts", "history",
];
exports.PRODUCTION_REFUSAL_CODES = [
    "not_ready",
    "missing_location",
    "provider_mismatch",
    "canonical_id_drift",
    "empty_display_name",
];
class ProductionMigrationRefusal extends Error {
    code;
    candidateId;
    constructor(code, candidateId) {
        super(`production migration refused: ${code} (${candidateId})`);
        this.code = code;
        this.candidateId = candidateId;
        this.name = "ProductionMigrationRefusal";
    }
}
exports.ProductionMigrationRefusal = ProductionMigrationRefusal;
const CANONICAL_VERSION = "1.14E.1";
/**
 * Bina set tulisan produksi untuk SATU calon. TULEN: masa disuntik.
 * Melempar `ProductionMigrationRefusal` untuk apa-apa keadaan tidak selamat.
 */
function buildProductionCanonicalWrite(candidate, batchId, backupReference, now) {
    // --- Gerbang keselamatan ---------------------------------------------------
    if (candidate.migrationDecision !== "ready" || candidate.holdReasons.length > 0) {
        throw new ProductionMigrationRefusal("not_ready", candidate.candidateId);
    }
    const snap = candidate.proposedCanonicalSnapshot;
    if (snap.lat === undefined || snap.lng === undefined || !(0, common_1.isValidLatLng)(snap.lat, snap.lng)) {
        throw new ProductionMigrationRefusal("missing_location", candidate.candidateId);
    }
    const providerPlaceId = candidate.normalizedIdentity.providerPlaceId ?? snap.providerPlaceId;
    if (!(0, common_1.isNonEmptyString)(providerPlaceId)) {
        throw new ProductionMigrationRefusal("provider_mismatch", candidate.candidateId);
    }
    if (!(0, common_1.isNonEmptyString)(snap.canonicalName)) {
        throw new ProductionMigrationRefusal("empty_display_name", candidate.candidateId);
    }
    // ID kanonikal mesti = ID deterministik dari kunci identiti stabil (tiada drift).
    const expectedCanonical = (0, migrationCandidate_1.proposedCanonicalPlaceId)(`provider:${providerPlaceId}`);
    if (candidate.proposedCanonicalPlaceId !== expectedCanonical) {
        throw new ProductionMigrationRefusal("canonical_id_drift", candidate.candidateId);
    }
    const canonicalPlaceId = candidate.proposedCanonicalPlaceId;
    const address = (0, common_1.isNonEmptyString)(snap.address) ? snap.address : null;
    const registry = {
        canonicalPlaceId,
        providerPlaceId,
        displayName: snap.canonicalName,
        lat: snap.lat,
        lng: snap.lng,
        address,
        canonicalVersion: CANONICAL_VERSION,
        ratingKnown: snap.ratingKnown,
        priceKnown: snap.priceKnown,
        hoursKnown: snap.hoursKnown,
        provenanceSource: "google_places_details",
        migrationBatchId: batchId,
        backupReference,
        createdAt: now,
        publicScope: "internal_cohort_only",
    };
    const contentHash = (0, hashing_1.hashCanonical)({
        canonicalPlaceId, providerPlaceId, name: snap.canonicalName,
        lat: snap.lat, lng: snap.lng, address, v: CANONICAL_VERSION,
    });
    const publicationId = `PUB-${contentHash.slice(0, 24)}`;
    const publication = {
        publicationId,
        placeId: canonicalPlaceId,
        versionNumber: 1,
        title: snap.canonicalName,
        address,
        // Jujur: rating ditunjuk hanya jika diketahui; medan lain kekal unknown.
        ratingState: snap.ratingKnown ? "rating_shown" : "rating_hidden",
        priceState: snap.priceKnown ? "price_provider_band" : "price_unknown",
        hoursState: "hours_unknown",
        businessState: "status_unknown",
        halalState: "halal_unknown",
        dietaryState: "dietary_unknown",
        allergenState: "allergen_unknown",
        lat: snap.lat,
        lng: snap.lng,
        publicationStatus: "published",
        blocked: false,
        contentHash,
        sourceCanonicalVersion: CANONICAL_VERSION,
        publishedAt: now,
        createdAt: now,
    };
    const head = {
        placeId: canonicalPlaceId,
        activePublicationId: publicationId,
        updatedAt: now,
    };
    // Alias: setiap ID pembekal/legasi → kanonikal (dikunci mengikut ID legasi
    // supaya resolver submitPlaceCorrection boleh menyelesaikannya).
    const aliasIds = new Set([providerPlaceId, ...candidate.legacyPlaceIds]);
    const aliases = [...aliasIds]
        .filter(common_1.isNonEmptyString)
        .sort()
        .map((legacyId) => ({
        aliasDocId: legacyId,
        canonicalPlaceId,
        aliasType: legacyId === providerPlaceId ? "provider_place_id" : "legacy_document_id",
        status: "active",
        migrationBatchId: batchId,
        createdAt: now,
    }));
    return { registry, publication, head, aliases };
}
/** Deterministic batch id daripada checksum manifest. */
function productionBatchId(manifestChecksum) {
    return `PMB-${manifestChecksum.slice(0, 24)}`;
}
