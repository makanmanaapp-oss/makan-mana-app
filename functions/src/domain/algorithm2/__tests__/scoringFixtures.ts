/**
 * Algorithm 2 / Phase 2.3 — fixtures pemarkahan deterministik (TEST-ONLY).
 * 50+ calon merentas jarak/harga/rating/cuisine/halal/alahan/tutup/tag.
 */
import { PlaceCandidate, OpeningPeriod } from "../../../types/place";
import {
  RecommendationUserContext,
  RawRecommendationInput,
  buildRecommendationContext,
} from "../recommendationContext";
import { place } from "./fixtures";

const HOURS: OpeningPeriod[] = [{ openMinuteOfWeek: 0, closeMinuteOfWeek: 10080 }];

/** Calon dengan jadual waktu diketahui (availability tinggi). */
export function openPlace(over: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return place({ openingPeriods: HOURS, ...over });
}

const CUISINES = [
  "malay", "chinese", "indian", "thai", "japanese", "korean", "cafe",
  "western", "mamak", "seafood", "vegetarian", "burger", "noodle", "bakery",
  "salad", "healthy",
];

/** 52 calon unik deterministik (jadual diketahui, ~5 tutup). */
export const POOL_52: PlaceCandidate[] = Array.from({ length: 52 }, (_, i) =>
  openPlace({
    placeId: `s_${String(i).padStart(2, "0")}`,
    name: `Kedai ${i} ${CUISINES[i % CUISINES.length]}`,
    cuisine: CUISINES[i % CUISINES.length],
    rating: 3.4 + ((i % 5) * 0.35), // 3.4..4.8
    userRatingCount: 5 + (i * 37) % 1500, // 5..~1490
    priceLevel: 1 + (i % 4), // 1..4
    distanceKm: 0.3 + (i % 12) * 0.5, // 0.3..5.8
    isOpen: i % 11 !== 0,
  }),
);

// Fixtures bersasar
export const NEAR_CHEAP = openPlace({ placeId: "near_cheap", name: "Warung Dekat Murah", cuisine: "malay", distanceKm: 0.4, priceLevel: 1, rating: 4.1, userRatingCount: 300 });
export const FAR_PRICEY = openPlace({ placeId: "far_pricey", name: "Fine Dining Jauh", cuisine: "western", distanceKm: 8.0, priceLevel: 4, rating: 4.6, userRatingCount: 400 });
export const HIGH_CONF = openPlace({ placeId: "high_conf", name: "Popular Nasi Lemak", cuisine: "malay", rating: 4.5, userRatingCount: 1000, distanceKm: 2.0, priceLevel: 2 });
export const LOW_CONF = openPlace({ placeId: "low_conf", name: "Kedai Baru", cuisine: "malay", rating: 5.0, userRatingCount: 2, distanceKm: 2.0, priceLevel: 2 });
export const HEALTHY_PLACE = openPlace({ placeId: "healthy_1", name: "Green Salad Bar", cuisine: "salad", rating: 4.3, userRatingCount: 250, distanceKm: 1.5, priceLevel: 2 });
export const HEAVY_PLACE = openPlace({ placeId: "heavy_1", name: "Fried Burger Joint", cuisine: "burger", rating: 4.3, userRatingCount: 250, distanceKm: 1.5, priceLevel: 2 });
export const CAFE_PLACE = openPlace({ placeId: "cafe_1", name: "Kopi Kafe Chill", cuisine: "cafe", rating: 4.2, userRatingCount: 300, distanceKm: 1.2, priceLevel: 2 });
export const SPICY_PLACE = openPlace({ placeId: "spicy_1", name: "Thai Tomyam Pedas", cuisine: "thai", rating: 4.2, userRatingCount: 300, distanceKm: 1.2, priceLevel: 2 });
export const PROTEIN_PLACE = openPlace({ placeId: "protein_1", name: "Grilled Chicken Protein", cuisine: "western", rating: 4.2, userRatingCount: 300, distanceKm: 1.2, priceLevel: 2 });
export const LATE_PLACE = openPlace({ placeId: "late_1", name: "Mamak 24 Jam", cuisine: "mamak", rating: 4.0, userRatingCount: 500, distanceKm: 1.0, priceLevel: 1 });

// Keselamatan
export const ALLERGY_SEAFOOD = openPlace({ placeId: "alg_sf", name: "Seafood Prawn House", cuisine: "seafood" });
export const NON_HALAL = openPlace({ placeId: "nonhalal", name: "Bak Kut Teh Pork", cuisine: "chinese" });
export const HALAL_UNKNOWN = openPlace({ placeId: "halal_unk", name: "Random Bistro", cuisine: "western" });
export const HALAL_POS = openPlace({ placeId: "halal_pos", name: "Nasi Melayu Muslim", cuisine: "malay" });
export const CLOSED = openPlace({ placeId: "closed_x", name: "Kedai Tutup", isOpen: false });
export const HOURS_UNKNOWN = place({ placeId: "hours_unk", name: "Jam Tak Pasti", cuisine: "malay", openingPeriods: null, rating: 4.2, userRatingCount: 200, distanceKm: 1.0, priceLevel: 2 });
export const PRICE_UNKNOWN = openPlace({ placeId: "price_unk", name: "Harga Tak Pasti", cuisine: "malay", priceLevel: 0, rating: 4.2, userRatingCount: 200, distanceKm: 1.0 });

/** Bina RecommendationUserContext ujian dengan override mentah. */
export function ctx(over: Partial<RawRecommendationInput> = {}): RecommendationUserContext {
  return buildRecommendationContext({
    uid: "u_test",
    latitude: 3.15,
    longitude: 101.7,
    radiusMeters: 5000,
    ...over,
  });
}
