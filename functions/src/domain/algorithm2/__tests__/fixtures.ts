/**
 * Algorithm 2 / Phase 2.1 — fixtures calon deterministik (TEST-ONLY).
 * 40+ tempat unik + varian (pertindihan, cawangan, alahan, halal, tutup).
 * TIADA data Google langsung.
 */
import { PlaceCandidate } from "../../../types/place";

export function place(over: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    placeId: over.placeId ?? "p_default",
    name: over.name ?? "Kedai Default",
    cuisine: over.cuisine ?? "Restoran",
    emoji: "🍽️",
    rating: over.rating ?? 4.0,
    userRatingCount: over.userRatingCount ?? 120,
    priceLevel: over.priceLevel ?? 2,
    distanceKm: over.distanceKm ?? 1.5,
    isOpen: over.isOpen ?? true,
    address: over.address ?? "Jalan Contoh, KL",
    matchScore: 0,
    matchReasonKeys: [],
    priceEstimate: over.priceEstimate ?? "RM12 - RM30",
    ...over,
  };
}

const CUISINES = [
  "malay", "chinese", "indian", "thai", "japanese", "korean", "cafe",
  "western", "mamak", "seafood", "vegetarian", "burger", "noodle", "bakery",
];

/** 40 tempat unik deterministik merentas cuisine/harga/jarak/rating. */
export const FORTY_PLACES: PlaceCandidate[] = Array.from({ length: 40 }, (_, i) =>
  place({
    placeId: `p_${String(i).padStart(2, "0")}`,
    name: `Tempat ${i}`,
    cuisine: CUISINES[i % CUISINES.length],
    rating: 3.5 + ((i % 4) * 0.4), // 3.5..4.7
    userRatingCount: 20 + (i * 17) % 500,
    priceLevel: 1 + (i % 4), // 1..4
    distanceKm: 0.3 + (i % 10) * 0.55, // 0.3..5.25
    isOpen: i % 9 !== 0, // ~4 closed
  }),
);

/** Pertindihan ID pembekal (dua entri placeId sama). */
export const DUP_PLACES: PlaceCandidate[] = [
  place({ placeId: "dup_1", name: "Dup A", cuisine: "malay" }),
  place({ placeId: "dup_1", name: "Dup A copy", cuisine: "malay" }),
  place({ placeId: "dup_2", name: "Unique B", cuisine: "thai" }),
];

/** Cawangan berbeza, nama serupa, ID berbeza. */
export const BRANCH_PLACES: PlaceCandidate[] = [
  place({ placeId: "br_kl", name: "Nasi Kandar Pelita KLCC", cuisine: "mamak", distanceKm: 1.0 }),
  place({ placeId: "br_pj", name: "Nasi Kandar Pelita PJ", cuisine: "mamak", distanceKm: 4.5 }),
];

/** Alahan / halal / tutup. */
export const ALLERGY_PLACE = place({ placeId: "alg_1", name: "Tomyam Seafood House", cuisine: "seafood" });
export const HALAL_NEG_PLACE = place({ placeId: "hal_neg", name: "Bak Kut Teh Pork House", cuisine: "chinese" });
export const HALAL_POS_PLACE = place({ placeId: "hal_pos", name: "Restoran Muslim Nasi Melayu", cuisine: "malay" });
export const CLOSED_PLACE = place({ placeId: "closed_1", name: "Tutup Sekarang", isOpen: false });

/** Skor hampir-sama (untuk uji tie-break/rotasi). */
export const NEAR_EQUAL: PlaceCandidate[] = [
  place({ placeId: "eq_a", name: "Eq A", cuisine: "cafe", rating: 4.2, userRatingCount: 200, priceLevel: 2, distanceKm: 1.0 }),
  place({ placeId: "eq_b", name: "Eq B", cuisine: "cafe", rating: 4.2, userRatingCount: 200, priceLevel: 2, distanceKm: 1.0 }),
  place({ placeId: "eq_c", name: "Eq C", cuisine: "cafe", rating: 4.2, userRatingCount: 200, priceLevel: 2, distanceKm: 1.0 }),
];
