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
 * Phase 1.7 — barrel modul liputan (Shared Place Database).
 *
 * ADDITIVE. TIDAK diimport oleh functions/src/index.ts → tiada fungsi
 * dieksport ke produksi. Aplikasi mobile MASIH menggunakan laluan
 * places_cache / place_details sedia ada.
 *
 * NOTA: `firestoreCoverageRepository` SENGAJA tidak dieksport di sini — ia
 * mengimport `firebase-admin/firestore` dan hanya dimuat oleh ujian emulator.
 */
__exportStar(require("./geohash"), exports);
__exportStar(require("./coverageCell"), exports);
__exportStar(require("./coverageMembership"), exports);
__exportStar(require("./coverageVersion"), exports);
__exportStar(require("./coverageIndexing"), exports);
__exportStar(require("./coverageMetrics"), exports);
__exportStar(require("./discoveryQueue"), exports);
__exportStar(require("./areaCache"), exports);
__exportStar(require("./areaRead"), exports);
__exportStar(require("./coverageRepository"), exports);
__exportStar(require("./inMemoryCoverageRepository"), exports);
