"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.placeDetailsDocToView = placeDetailsDocToView;
exports.placesCacheDocToView = placesCacheDocToView;
function str(v) {
    return typeof v === "string" && v.trim() ? v : undefined;
}
function num(v) {
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
/** Petakan dokumen `place_details` produksi → TrustedPlaceView. */
function placeDetailsDocToView(placeId, d) {
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
function placesCacheDocToView() {
    return null;
}
