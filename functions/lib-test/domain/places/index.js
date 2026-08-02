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
 * Phase 1.2 — barrel domain canonical place.
 *
 * ADDITIVE. Modul ini TIDAK diimport oleh functions/src/index.ts, jadi tiada
 * fungsi dieksport ke produksi dan laluan getSuggestions/kad kekal tidak
 * berubah. Digunakan hanya oleh ujian domain (Phase 1.2) dan fasa akan datang.
 */
__exportStar(require("./common"), exports);
__exportStar(require("./placeEnums"), exports);
__exportStar(require("./placeIdentity"), exports);
__exportStar(require("./placeSource"), exports);
__exportStar(require("./placeProvenance"), exports);
__exportStar(require("./placeTags"), exports);
__exportStar(require("./placeMedia"), exports);
__exportStar(require("./placeCommercial"), exports);
__exportStar(require("./placeHours"), exports);
__exportStar(require("./placeQuality"), exports);
__exportStar(require("./placeSafetyEvidence"), exports);
__exportStar(require("./placeFreshness"), exports);
__exportStar(require("./placeCompleteness"), exports);
__exportStar(require("./placeMerge"), exports);
__exportStar(require("./placeCardContract"), exports);
__exportStar(require("./placePublication"), exports);
__exportStar(require("./canonicalPlace"), exports);
__exportStar(require("./validation"), exports);
