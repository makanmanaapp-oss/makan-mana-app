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
  priceEstimate: string;
  /** URL foto sebenar (googleusercontent, dicache bersama tempat). */
  photoUrl?: string | null;
  /**
   * Jadual operasi (disimpan dalam cache jangka panjang) supaya
   * status buka/tutup boleh dikira semula tanpa panggilan API.
   * null = jadual tidak diketahui (anggap buka).
   */
  openingPeriods?: OpeningPeriod[] | null;
}
