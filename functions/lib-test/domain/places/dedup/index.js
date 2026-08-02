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
 * Phase 1.4 — barrel domain dedup (additive; TIDAK diimport oleh
 * functions/src/index.ts). `firestoreDedupRepository` SENGAJA tidak di-barrel
 * supaya ujian dalam-ingatan bebas firebase-admin — import terus bila perlu.
 */
__exportStar(require("./config"), exports);
__exportStar(require("./geo"), exports);
__exportStar(require("./nameSimilarity"), exports);
__exportStar(require("./identityNormalizer"), exports);
__exportStar(require("./branchDetection"), exports);
__exportStar(require("./duplicateSignals"), exports);
__exportStar(require("./duplicateScoring"), exports);
__exportStar(require("./duplicateDecision"), exports);
__exportStar(require("./duplicateCandidate"), exports);
__exportStar(require("./dedupIds"), exports);
__exportStar(require("./dedupAudit"), exports);
__exportStar(require("./fieldResolution"), exports);
__exportStar(require("./aliasResolver"), exports);
__exportStar(require("./mergePlan"), exports);
__exportStar(require("./engine"), exports);
__exportStar(require("./dedupRepository"), exports);
__exportStar(require("./inMemoryDedupRepository"), exports);
