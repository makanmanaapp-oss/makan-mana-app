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
export * from "./correctionTypes";
export * from "./correctionCategories";
export * from "./correctionStateMachine";
export * from "./correctionDedup";
export * from "./correctionValidation";
export * from "./correctionPrivacy";
export * from "./correctionRepository";
export * from "./inMemoryCorrectionRepository";
