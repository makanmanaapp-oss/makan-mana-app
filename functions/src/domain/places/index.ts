/**
 * Phase 1.2 — barrel domain canonical place.
 *
 * ADDITIVE. Modul ini TIDAK diimport oleh functions/src/index.ts, jadi tiada
 * fungsi dieksport ke produksi dan laluan getSuggestions/kad kekal tidak
 * berubah. Digunakan hanya oleh ujian domain (Phase 1.2) dan fasa akan datang.
 */
export * from "./common";
export * from "./placeEnums";
export * from "./placeIdentity";
export * from "./placeSource";
export * from "./placeProvenance";
export * from "./placeTags";
export * from "./placeMedia";
export * from "./placeCommercial";
export * from "./placeHours";
export * from "./placeQuality";
export * from "./placeSafetyEvidence";
export * from "./placeFreshness";
export * from "./placeCompleteness";
export * from "./placeMerge";
export * from "./placeCardContract";
export * from "./placePublication";
export * from "./canonicalPlace";
export * from "./validation";
