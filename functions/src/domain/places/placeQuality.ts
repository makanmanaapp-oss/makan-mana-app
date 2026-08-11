/** Phase 1.2 — kualiti (rating/ulasan) dengan "tiada" eksplisit. */
import { SourceType } from "./placeEnums";

/**
 * `rating`/`reviewCount` = `undefined` bermakna TIDAK DIKETAHUI. Kami TIDAK
 * pernah menyimpan 0 untuk mewakili "tiada rating" (baiki risiko F-03 audit
 * Phase 1.1 — jangan papar 0.0 sebagai rating sebenar).
 */
export interface PlaceQualityData {
  rating?: number;
  reviewCount?: number;
  ratingSource?: SourceType;
}
