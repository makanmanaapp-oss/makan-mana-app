"use strict";
/** Phase 1.2 — data komersial (harga) dengan keadaan paparan eksplisit. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRICE_DISPLAY_STATES = void 0;
/**
 * Keadaan paparan harga — harga tidak diketahui MESTI eksplisit `unknown`,
 * bukan direka sebagai julat RM (baiki risiko F-05 audit Phase 1.1).
 */
exports.PRICE_DISPLAY_STATES = ["verified", "estimated", "unknown"];
