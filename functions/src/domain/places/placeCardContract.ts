/**
 * Phase 1.2 — kontrak data kad (domain). Pemetaan Flutter sebenar = Phase 1.9.
 * Lapisan ini TIDAK mengira match cadangan (itu Part 2).
 */
import { CardSourceMode, HoursState } from "./placeEnums";
import { PlaceCommercialData, PriceDisplayState } from "./placeCommercial";
import { PlaceHoursData } from "./placeHours";
import { PlaceQualityData } from "./placeQuality";

export interface CardImageData {
  url?: string;
  isFallback: boolean;
  fallbackCategory?: string;
}

export interface CardReason {
  id: string;
  labelKey: string;
  strength?: "primary" | "secondary";
  evidence?: "verified" | "reported" | "inferred";
}

export interface CardWarning {
  id: string;
  severity: "info" | "caution" | "important";
  labelKey: string;
  relatedField?: string;
}

export interface CardBadge {
  id: string;
  labelKey: string;
}

/**
 * Data kad canonical. Utamakan nilai mentah + kunci l10n; JANGAN simpan teks
 * sudah-setempat kecuali nama/alamat venue diluluskan. `rating`/`reviewCount`
 * kekal `undefined` bila tiada. `matchScore` PILIHAN — kad tidak mengiranya.
 */
export interface PlaceCardData {
  placeId: string;
  title: string;
  subtitle?: string;
  image: CardImageData;
  distanceMeters?: number;
  rating?: number;
  reviewCount?: number;
  priceState: PriceDisplayState;
  priceLabelKey: string;
  hoursState: HoursState;
  cuisineTagIds: string[];
  placeTypeTagIds: string[];
  matchScore?: number;
  matchBand?: string;
  matchReasons: CardReason[];
  warnings: CardWarning[];
  verificationBadges: CardBadge[];
  sourceMode: CardSourceMode;
  publicationVersion?: number;
}

// ---- Pemeta JUJUR tulen (bukti tiada rekaan; digunakan oleh ujian 24) ----

/** Salin rating/ulasan HANYA bila hadir — tidak pernah ganti dengan 0. */
export function toCardQuality(q: PlaceQualityData): {
  rating?: number;
  reviewCount?: number;
} {
  const out: { rating?: number; reviewCount?: number } = {};
  if (typeof q.rating === "number" && Number.isFinite(q.rating)) {
    out.rating = q.rating;
  }
  if (typeof q.reviewCount === "number" && Number.isFinite(q.reviewCount)) {
    out.reviewCount = q.reviewCount;
  }
  return out;
}

/** Keadaan harga diteruskan apa adanya — tidak pernah direka "estimated". */
export function toCardPriceState(c: PlaceCommercialData): PriceDisplayState {
  return c.priceState;
}

/** Keadaan waktu diteruskan apa adanya — tidak pernah diandaikan "known". */
export function toCardHoursState(h: PlaceHoursData): HoursState {
  return h.hoursState;
}
