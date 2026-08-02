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
 * Phase 1.11 — barrel modul pembetulan/laporan.
 *
 * ADDITIVE. TIDAK diimport oleh functions/src/index.ts → tiada eksport
 * produksi. Laporan pengguna TIDAK PERNAH mengubah suai atau menerbitkan data
 * kedai yang dipercayai.
 *
 * NOTA: `firestoreCorrectionRepository` sengaja tidak dieksport di sini — ia
 * mengimport `firebase-admin/firestore` dan hanya dimuat oleh ujian emulator.
 */
__exportStar(require("./correctionTypes"), exports);
__exportStar(require("./correctionCategories"), exports);
__exportStar(require("./correctionStateMachine"), exports);
__exportStar(require("./correctionDedup"), exports);
__exportStar(require("./correctionValidation"), exports);
__exportStar(require("./correctionPrivacy"), exports);
__exportStar(require("./correctionRepository"), exports);
__exportStar(require("./inMemoryCorrectionRepository"), exports);
