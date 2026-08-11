/**
 * Phase 1.12 — barrel domain migrasi (additive; TIDAK diimport oleh
 * `functions/src/index.ts`). `firestoreMigrationRepository` SENGAJA tidak
 * di-barrel supaya ujian dalam-ingatan kekal bebas firebase-admin — import
 * terus bila perlu.
 */
export * from "./migrationTypes";
export * from "./legacyInventory";
export * from "./referenceImpact";
export * from "./migrationAlias";
export * from "./migrationCandidate";
export * from "./referenceRewrite";
export * from "./migrationPlan";
export * from "./dryRunPlanner";
export * from "./migrationCheckpoint";
export * from "./rollbackPlan";
export * from "./emulatorExecution";
export * from "./shadowRead";
export * from "./completionMarker";
export * from "./migrationRepository";
export * from "./inMemoryMigrationRepository";
