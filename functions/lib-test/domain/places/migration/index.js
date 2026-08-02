"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.12 — barrel domain migrasi (additive; TIDAK diimport oleh
 * `functions/src/index.ts`). `firestoreMigrationRepository` SENGAJA tidak
 * di-barrel supaya ujian dalam-ingatan kekal bebas firebase-admin — import
 * terus bila perlu.
 */
__exportStar(require("./migrationTypes"), exports);
__exportStar(require("./legacyInventory"), exports);
__exportStar(require("./referenceImpact"), exports);
__exportStar(require("./migrationAlias"), exports);
__exportStar(require("./migrationCandidate"), exports);
__exportStar(require("./referenceRewrite"), exports);
__exportStar(require("./migrationPlan"), exports);
__exportStar(require("./dryRunPlanner"), exports);
__exportStar(require("./migrationCheckpoint"), exports);
__exportStar(require("./rollbackPlan"), exports);
__exportStar(require("./emulatorExecution"), exports);
__exportStar(require("./shadowRead"), exports);
__exportStar(require("./completionMarker"), exports);
__exportStar(require("./migrationRepository"), exports);
__exportStar(require("./inMemoryMigrationRepository"), exports);
