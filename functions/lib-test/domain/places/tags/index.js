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
 * Phase 1.5 — barrel domain tags (additive; TIDAK diimport oleh
 * functions/src/index.ts). `firestoreTagRepository` SENGAJA tidak di-barrel
 * supaya ujian dalam-ingatan bebas firebase-admin.
 */
__exportStar(require("./tagFamilies"), exports);
__exportStar(require("./tagRegistry"), exports);
__exportStar(require("./tagEvidence"), exports);
__exportStar(require("./evidencePolicy"), exports);
__exportStar(require("./tagValidation"), exports);
__exportStar(require("./tagConflicts"), exports);
__exportStar(require("./tagNormalization"), exports);
__exportStar(require("./tagMerge"), exports);
__exportStar(require("./tagLocalization"), exports);
__exportStar(require("./tagAudit"), exports);
__exportStar(require("./tagRepository"), exports);
__exportStar(require("./inMemoryTagRepository"), exports);
