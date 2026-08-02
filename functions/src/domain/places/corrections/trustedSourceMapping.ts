/**
 * Phase 1.14B.4 — pemetaan dokumen sumber DIPERCAYAI → TrustedPlaceView (TULEN).
 *
 * Disahkan terhadap SKEMA PRODUKSI SEBENAR (sampel baca-sahaja 1.14B.4):
 *   place_details : { displayName, keywords[], lastFetchedAt, photoUrl,
 *                     priceLevel(number), rating(number), userRatingCount(number) }
 *   places_cache  : cache pertanyaan-kawasan (center{lat,lng}, radiusMeters,
 *                   places[], timeSegment, createdAt, expiresAt) — BUKAN dokumen
 *                   satu-tempat mengikut placeId.
 *
 * KESELAMATAN: medan yang TIDAK wujud dalam produksi kekal *_unknown (JANGAN reka).
 */
import {TrustedPlaceView} from "./trustedSnapshotResolver";

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Petakan dokumen `place_details` produksi → TrustedPlaceView. */
export function placeDetailsDocToView(placeId: string, d: Record<string, unknown>): TrustedPlaceView {
  const rating = num(d.rating);
  const reviews = num(d.userRatingCount);
  const priceLevel = num(d.priceLevel);
  const photo = str(d.photoUrl);
  return {
    placeId,
    // Produksi guna `displayName`; fallback selamat untuk skema lama.
    title: str(d.displayName) ?? str(d.name) ?? str(d.title) ?? placeId,
    // Phase 1.14C.1: enrichment lokasi menulis `formattedAddress` (camelCase).
    address: str(d.formattedAddress) ?? str(d.formatted_address) ?? str(d.address),
    // rating diketahui HANYA jika ada nilai + kiraan; jika tidak, sembunyi.
    ratingState: rating !== undefined && rating > 0 && (reviews ?? 0) > 0 ? "rating_shown" : "rating_hidden",
    // priceLevel (0-4 provider) → band provider; jika tiada → unknown.
    priceState: priceLevel !== undefined ? "price_provider_band" : "price_unknown",
    // Medan berikut TIDAK wujud dalam place_details produksi → kekal unknown.
    hoursState: "hours_unknown",
    businessState: "status_unknown",
    halalState: "halal_unknown",
    dietaryState: "dietary_unknown",
    allergenState: "allergen_unknown",
    imageReferences: photo ? [photo] : [],
    tagIds: [],
    warnings: [],
    sourceMode: "live",
    blocked: false,
  };
}

/**
 * `places_cache` ialah cache pertanyaan-kawasan, BUKAN dokumen satu-tempat.
 * Ia TIDAK boleh menjadi sumber snapshot dipercayai mengikut placeId. Sentiasa
 * null → penyelesai jatuh ke sumber lain atau menolak dengan selamat.
 */
export function placesCacheDocToView(): TrustedPlaceView | null {
  return null;
}
