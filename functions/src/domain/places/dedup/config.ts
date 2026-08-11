/**
 * Phase 1.4 — konfigurasi dedup (SEMUA ambang/pemberat/penalti bernama —
 * tiada nombor ajaib tersembunyi). ADDITIVE; tidak dipakai produksi.
 */

export const DEDUP_ALGORITHM_VERSION = "dedup_v1";
export const DEDUP_CONFIG_VERSION = "dedup_config_v1";

/** Ambang jarak (meter) untuk kekuatan proximity. */
export interface GeoThresholds {
  veryStrongM: number;
  strongM: number;
  moderateM: number;
}
export const GEO_THRESHOLDS: GeoThresholds = {
  veryStrongM: 15,
  strongM: 50,
  moderateM: 150,
};

/** Skor geoSimilarity ikut band. */
export const GEO_SIMILARITY = {
  veryStrong: 1.0,
  strong: 0.85,
  moderate: 0.5,
  weak: 0.15,
  invalid: 0,
} as const;

/** Pemberat formula duplicateScore (rujuk PDF §8.2). Jumlah = 1.00. */
export interface DuplicateWeights {
  providerId: number;
  verifiedPhone: number;
  geoProximity: number;
  nameSimilarity: number;
  addressSimilarity: number;
  websiteMatch: number;
}
export const DUPLICATE_WEIGHTS: DuplicateWeights = {
  providerId: 0.4,
  verifiedPhone: 0.2,
  geoProximity: 0.15,
  nameSimilarity: 0.1,
  addressSimilarity: 0.1,
  websiteMatch: 0.05,
};

/** Penalti konflik (ditolak daripada skor asas). */
export interface DuplicatePenalties {
  branchConflict: number;
  coordinateConflict: number;
  phoneConflict: number;
  addressConflict: number;
}
export const DUPLICATE_PENALTIES: DuplicatePenalties = {
  branchConflict: 0.5,
  coordinateConflict: 0.25,
  phoneConflict: 0.4,
  addressConflict: 0.15,
};

/** Band keputusan (rujuk PDF §8.2). */
export interface DecisionBands {
  exact: number; // >= exact → exact/auto-link
  review: number; // >= review → mandatory review
  possible: number; // >= possible → possible duplicate
}
export const DECISION_BANDS: DecisionBands = {
  exact: 0.95,
  review: 0.8,
  possible: 0.55,
};

/**
 * Melebihi jarak ini, auto-merge DISEKAT KECUALI identiti provider tepat.
 * Ambang similarity nama "brand sama" untuk pengesanan cawangan.
 */
export const FAR_COORD_BLOCK_M = 150;
export const BRAND_SAME_NAME_SIMILARITY = 0.6;
/** Similarity nama minimum untuk "same-name-only" cap possible_duplicate. */
export const NAME_ONLY_MIN_SIMILARITY = 0.6;
/** Address token similarity di bawah ini = konflik alamat. */
export const ADDRESS_CONFLICT_MAX_SIMILARITY = 0.2;

export interface DedupConfig {
  geoThresholds: GeoThresholds;
  weights: DuplicateWeights;
  penalties: DuplicatePenalties;
  bands: DecisionBands;
  farCoordBlockM: number;
  brandSameNameSimilarity: number;
  nameOnlyMinSimilarity: number;
  addressConflictMaxSimilarity: number;
  algorithmVersion: string;
  configVersion: string;
}

export const DEFAULT_DEDUP_CONFIG: DedupConfig = {
  geoThresholds: GEO_THRESHOLDS,
  weights: DUPLICATE_WEIGHTS,
  penalties: DUPLICATE_PENALTIES,
  bands: DECISION_BANDS,
  farCoordBlockM: FAR_COORD_BLOCK_M,
  brandSameNameSimilarity: BRAND_SAME_NAME_SIMILARITY,
  nameOnlyMinSimilarity: NAME_ONLY_MIN_SIMILARITY,
  addressConflictMaxSimilarity: ADDRESS_CONFLICT_MAX_SIMILARITY,
  algorithmVersion: DEDUP_ALGORITHM_VERSION,
  configVersion: DEDUP_CONFIG_VERSION,
};
