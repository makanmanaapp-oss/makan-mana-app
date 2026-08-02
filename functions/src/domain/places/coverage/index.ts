/**
 * Phase 1.7 — barrel modul liputan (Shared Place Database).
 *
 * ADDITIVE. TIDAK diimport oleh functions/src/index.ts → tiada fungsi
 * dieksport ke produksi. Aplikasi mobile MASIH menggunakan laluan
 * places_cache / place_details sedia ada.
 *
 * NOTA: `firestoreCoverageRepository` SENGAJA tidak dieksport di sini — ia
 * mengimport `firebase-admin/firestore` dan hanya dimuat oleh ujian emulator.
 */
export * from "./geohash";
export * from "./coverageCell";
export * from "./coverageMembership";
export * from "./coverageVersion";
export * from "./coverageIndexing";
export * from "./coverageMetrics";
export * from "./discoveryQueue";
export * from "./areaCache";
export * from "./areaRead";
export * from "./coverageRepository";
export * from "./inMemoryCoverageRepository";
