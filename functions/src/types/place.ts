/** Julat waktu operasi dalam minit-minggu [buka, tutup). */
export interface OpeningPeriod {
  openMinuteOfWeek: number;
  closeMinuteOfWeek: number;
}

/** Bentuk tempat makan yang dihantar ke client (sepadan PlaceSummary Flutter). */
export interface PlaceCandidate {
  placeId: string;
  name: string;
  cuisine: string;
  emoji: string;
  rating: number;
  userRatingCount: number;
  priceLevel: number;
  distanceKm: number;
  isOpen: boolean;
  address: string;
  matchScore: number;
  matchReasonKeys: string[];
  /** Isyarat negatif jujur (cth. possible_allergy_conflict, price_unknown). */
  negativeSignals?: string[];
  priceEstimate: string;
  /** URL foto sebenar (googleusercontent, dicache bersama tempat). */
  photoUrl?: string | null;
  /**
   * Jadual operasi (disimpan dalam cache jangka panjang) supaya
   * status buka/tutup boleh dikira semula tanpa panggilan API.
   * null = jadual tidak diketahui (anggap buka).
   */
  openingPeriods?: OpeningPeriod[] | null;
  /**
   * Phase 1.14G — sumber data (kohort dalaman sahaja; awam tidak menerima medan
   * ini). "canonical" = ditindih dari penerbitan kanonikal server-mediated;
   * "legacy" = data legasi place_details/Google. Tidak hadir = laluan awam biasa.
   */
  dataSource?: "canonical" | "legacy";
  /** Phase 1.14G — ID kanonikal (kohort sahaja) untuk penghalaan stabil. */
  canonicalPlaceId?: string;
  /**
   * FULL RADIUS COVERAGE — koordinat mentah tempat (opsyenal). Diisi oleh
   * searchNearby supaya penemuan boleh disimpan ke place_registry + sel liputan
   * (indeks geo). Tidak wajib; laluan lama tidak terjejas.
   */
  lat?: number;
  lng?: number;
}
