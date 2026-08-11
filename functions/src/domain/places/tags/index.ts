/**
 * Phase 1.5 — barrel domain tags (additive; TIDAK diimport oleh
 * functions/src/index.ts). `firestoreTagRepository` SENGAJA tidak di-barrel
 * supaya ujian dalam-ingatan bebas firebase-admin.
 */
export * from "./tagFamilies";
export * from "./tagRegistry";
export * from "./tagEvidence";
export * from "./evidencePolicy";
export * from "./tagValidation";
export * from "./tagConflicts";
export * from "./tagNormalization";
export * from "./tagMerge";
export * from "./tagLocalization";
export * from "./tagAudit";
export * from "./tagRepository";
export * from "./inMemoryTagRepository";
