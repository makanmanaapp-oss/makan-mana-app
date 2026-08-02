/**
 * Phase 1.4 — barrel domain dedup (additive; TIDAK diimport oleh
 * functions/src/index.ts). `firestoreDedupRepository` SENGAJA tidak di-barrel
 * supaya ujian dalam-ingatan bebas firebase-admin — import terus bila perlu.
 */
export * from "./config";
export * from "./geo";
export * from "./nameSimilarity";
export * from "./identityNormalizer";
export * from "./branchDetection";
export * from "./duplicateSignals";
export * from "./duplicateScoring";
export * from "./duplicateDecision";
export * from "./duplicateCandidate";
export * from "./dedupIds";
export * from "./dedupAudit";
export * from "./fieldResolution";
export * from "./aliasResolver";
export * from "./mergePlan";
export * from "./engine";
export * from "./dedupRepository";
export * from "./inMemoryDedupRepository";
