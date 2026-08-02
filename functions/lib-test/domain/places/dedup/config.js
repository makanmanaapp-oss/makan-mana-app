"use strict";
/**
 * Phase 1.4 — konfigurasi dedup (SEMUA ambang/pemberat/penalti bernama —
 * tiada nombor ajaib tersembunyi). ADDITIVE; tidak dipakai produksi.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_DEDUP_CONFIG = exports.ADDRESS_CONFLICT_MAX_SIMILARITY = exports.NAME_ONLY_MIN_SIMILARITY = exports.BRAND_SAME_NAME_SIMILARITY = exports.FAR_COORD_BLOCK_M = exports.DECISION_BANDS = exports.DUPLICATE_PENALTIES = exports.DUPLICATE_WEIGHTS = exports.GEO_SIMILARITY = exports.GEO_THRESHOLDS = exports.DEDUP_CONFIG_VERSION = exports.DEDUP_ALGORITHM_VERSION = void 0;
exports.DEDUP_ALGORITHM_VERSION = "dedup_v1";
exports.DEDUP_CONFIG_VERSION = "dedup_config_v1";
exports.GEO_THRESHOLDS = {
    veryStrongM: 15,
    strongM: 50,
    moderateM: 150,
};
/** Skor geoSimilarity ikut band. */
exports.GEO_SIMILARITY = {
    veryStrong: 1.0,
    strong: 0.85,
    moderate: 0.5,
    weak: 0.15,
    invalid: 0,
};
exports.DUPLICATE_WEIGHTS = {
    providerId: 0.4,
    verifiedPhone: 0.2,
    geoProximity: 0.15,
    nameSimilarity: 0.1,
    addressSimilarity: 0.1,
    websiteMatch: 0.05,
};
exports.DUPLICATE_PENALTIES = {
    branchConflict: 0.5,
    coordinateConflict: 0.25,
    phoneConflict: 0.4,
    addressConflict: 0.15,
};
exports.DECISION_BANDS = {
    exact: 0.95,
    review: 0.8,
    possible: 0.55,
};
/**
 * Melebihi jarak ini, auto-merge DISEKAT KECUALI identiti provider tepat.
 * Ambang similarity nama "brand sama" untuk pengesanan cawangan.
 */
exports.FAR_COORD_BLOCK_M = 150;
exports.BRAND_SAME_NAME_SIMILARITY = 0.6;
/** Similarity nama minimum untuk "same-name-only" cap possible_duplicate. */
exports.NAME_ONLY_MIN_SIMILARITY = 0.6;
/** Address token similarity di bawah ini = konflik alamat. */
exports.ADDRESS_CONFLICT_MAX_SIMILARITY = 0.2;
exports.DEFAULT_DEDUP_CONFIG = {
    geoThresholds: exports.GEO_THRESHOLDS,
    weights: exports.DUPLICATE_WEIGHTS,
    penalties: exports.DUPLICATE_PENALTIES,
    bands: exports.DECISION_BANDS,
    farCoordBlockM: exports.FAR_COORD_BLOCK_M,
    brandSameNameSimilarity: exports.BRAND_SAME_NAME_SIMILARITY,
    nameOnlyMinSimilarity: exports.NAME_ONLY_MIN_SIMILARITY,
    addressConflictMaxSimilarity: exports.ADDRESS_CONFLICT_MAX_SIMILARITY,
    algorithmVersion: exports.DEDUP_ALGORITHM_VERSION,
    configVersion: exports.DEDUP_CONFIG_VERSION,
};
