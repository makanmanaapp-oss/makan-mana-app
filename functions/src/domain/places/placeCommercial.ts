/** Phase 1.2 — data komersial (harga) dengan keadaan paparan eksplisit. */

/**
 * Keadaan paparan harga — harga tidak diketahui MESTI eksplisit `unknown`,
 * bukan direka sebagai julat RM (baiki risiko F-05 audit Phase 1.1).
 */
export const PRICE_DISPLAY_STATES = ["verified", "estimated", "unknown"] as const;
export type PriceDisplayState = (typeof PRICE_DISPLAY_STATES)[number];

export interface PlaceCommercialData {
  priceState: PriceDisplayState;
  /** ID tag band harga canonical (cth. "budget", "moderate"). */
  priceBandId?: string;
  /** Purata belanja diluluskan/dianggar (bila ada bukti). */
  averageSpend?: number;
  currency?: string;
}
