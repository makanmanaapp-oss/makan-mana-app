"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_COVERAGE_HEALTH_CONFIG = exports.COVERAGE_HEALTH_STATES = exports.FORBIDDEN_METRIC_FIELDS = void 0;
exports.computeCoverageMetrics = computeCoverageMetrics;
exports.evaluateCoverageHealth = evaluateCoverageHealth;
/** Medan yang DILARANG muncul dalam metrik (dikuatkuasa oleh ujian 45). */
exports.FORBIDDEN_METRIC_FIELDS = [
    "uid",
    "userId",
    "userLat",
    "userLng",
    "email",
    "displayName",
    "moodId",
    "favorites",
    "history",
    "deviceId",
];
function bump(map, key) {
    if (!key)
        return;
    map[key] = (map[key] ?? 0) + 1;
}
/**
 * Kira metrik daripada keahlian + versi penerbitannya. TULEN (masa disuntik).
 * Hanya keahlian yang TIDAK disekat dikira sebagai "aktif diterbitkan".
 */
function computeCoverageMetrics(params) {
    const { cellId, memberships, versionsByPublicationId, coverageVersion, now, } = params;
    const placeTypeCounts = {};
    const cuisineCounts = {};
    const mealSlotCounts = {};
    const sourceTypeCounts = {};
    let activePublishedPlaces = 0;
    let stalePlaceCount = 0;
    let expiredCriticalCount = 0;
    let missingImageCount = 0;
    let unknownPriceCount = 0;
    let unknownHoursCount = 0;
    for (const m of memberships) {
        if (m.eligibilityState === "blocked")
            continue;
        const v = versionsByPublicationId.get(m.publicationId);
        if (!v)
            continue;
        activePublishedPlaces++;
        const place = v.snapshot.place;
        for (const tag of place.tagSet.tags) {
            if (tag.family === "place_type")
                bump(placeTypeCounts, tag.tagId);
            else if (tag.family === "cuisine")
                bump(cuisineCounts, tag.tagId);
            else if (tag.family === "meal_slot")
                bump(mealSlotCounts, tag.tagId);
        }
        for (const ref of place.providerRefs)
            bump(sourceTypeCounts, ref.sourceType);
        const freshness = v.eligibilitySnapshot;
        if (freshness.overallFreshnessState === "stale")
            stalePlaceCount++;
        if (freshness.criticalExpiredFieldIds.length > 0)
            expiredCriticalCount++;
        const canonicalMedia = place.media.items.find((i) => i.mediaId === place.media.canonicalMediaId);
        if (!canonicalMedia || canonicalMedia.isFallback || !canonicalMedia.url) {
            missingImageCount++;
        }
        if (place.commercial.priceState === "unknown")
            unknownPriceCount++;
        if (place.hours.hoursState !== "known")
            unknownHoursCount++;
    }
    return {
        cellId,
        activePublishedPlaces,
        placeTypeCounts,
        cuisineCounts,
        mealSlotCounts,
        sourceTypeCounts,
        stalePlaceCount,
        expiredCriticalCount,
        duplicateCandidateCount: params.duplicateCandidateCount ?? 0,
        missingImageCount,
        unknownPriceCount,
        unknownHoursCount,
        lastComputedAt: now,
        coverageVersion,
    };
}
// ---------------------------------------------------------------------------
// Part L — polisi kelengkapan liputan
// ---------------------------------------------------------------------------
exports.COVERAGE_HEALTH_STATES = [
    "healthy",
    "adequate",
    "low",
    "empty",
    "stale",
    "critical",
];
/**
 * Lalai. NOTA REKA BENTUK: sasaran produk "100 tempat" TIDAK dikodkan sebagai
 * peraturan per-sel. Kolam kawasan berkembang merentas BEBERAPA sel jiran,
 * jadi sasaran per-sel kekal kecil dan boleh dikonfigurasi. Kolam 9 sel pada
 * `targetPlacesForHealthyCell = 12` sudah melebihi 100 tempat.
 */
exports.DEFAULT_COVERAGE_HEALTH_CONFIG = {
    minimumPlacesForCoveredCell: 5,
    targetPlacesForHealthyCell: 12,
    minimumCuisineDiversity: 3,
    minimumPlaceTypeDiversity: 2,
    maxCoverageAgeMs: 14 * 24 * 60 * 60 * 1000,
    criticalExpiredRatio: 0.25,
    unknownHoursRatio: 0.5,
    unknownPriceRatio: 0.6,
};
/**
 * Nilai kesihatan sel. TULEN; `now` disuntik untuk pemeriksaan umur.
 * Susunan keutamaan keadaan: empty > critical > stale > low > adequate > healthy.
 */
function evaluateCoverageHealth(metrics, config = exports.DEFAULT_COVERAGE_HEALTH_CONFIG, now) {
    const reasons = [];
    const n = metrics.activePublishedPlaces;
    const cuisineDiversity = Object.keys(metrics.cuisineCounts).length;
    const placeTypeDiversity = Object.keys(metrics.placeTypeCounts).length;
    const criticalRatio = n === 0 ? 0 : metrics.expiredCriticalCount / n;
    const hoursRatio = n === 0 ? 0 : metrics.unknownHoursCount / n;
    const priceRatio = n === 0 ? 0 : metrics.unknownPriceCount / n;
    const ageMs = now === undefined ? 0 : Math.max(0, now - metrics.lastComputedAt);
    const tooOld = now !== undefined && ageMs > config.maxCoverageAgeMs;
    // 1. Kosong.
    if (n === 0) {
        return {
            healthState: "empty",
            incomplete: true,
            discoveryRequired: true,
            refreshRequired: false,
            reasons: ["no_active_published_places"],
            priority: 1,
        };
    }
    // 2. Kritikal — terlalu banyak kedai dengan bukti kritikal luput.
    if (criticalRatio >= config.criticalExpiredRatio) {
        reasons.push("critical_expired_ratio_exceeded");
        return {
            healthState: "critical",
            incomplete: true,
            discoveryRequired: false,
            refreshRequired: true,
            reasons,
            priority: 1,
        };
    }
    // 3. Basi — liputan terlalu lama tidak dikira semula.
    if (tooOld) {
        reasons.push("coverage_age_exceeded");
        return {
            healthState: "stale",
            incomplete: false,
            discoveryRequired: false,
            refreshRequired: true,
            reasons,
            priority: 2,
        };
    }
    // 4. Rendah — di bawah minimum, atau kepelbagaian terlalu sempit.
    const belowMinimum = n < config.minimumPlacesForCoveredCell;
    const lowCuisine = cuisineDiversity < config.minimumCuisineDiversity;
    const lowPlaceType = placeTypeDiversity < config.minimumPlaceTypeDiversity;
    if (belowMinimum || lowCuisine || lowPlaceType) {
        if (belowMinimum)
            reasons.push("below_minimum_places");
        if (lowCuisine)
            reasons.push("low_cuisine_diversity");
        if (lowPlaceType)
            reasons.push("low_place_type_diversity");
        return {
            healthState: "low",
            incomplete: true,
            discoveryRequired: true,
            refreshRequired: false,
            reasons,
            priority: 2,
        };
    }
    // 5. Kualiti data — banyak waktu/harga tidak diketahui (bukan sekatan).
    if (hoursRatio > config.unknownHoursRatio)
        reasons.push("many_unknown_hours");
    if (priceRatio > config.unknownPriceRatio)
        reasons.push("many_unknown_price");
    // 6. Sihat vs memadai.
    if (n >= config.targetPlacesForHealthyCell) {
        return {
            healthState: "healthy",
            incomplete: false,
            discoveryRequired: false,
            refreshRequired: reasons.length > 0,
            reasons,
            priority: 5,
        };
    }
    reasons.push("below_healthy_target");
    return {
        healthState: "adequate",
        incomplete: false,
        discoveryRequired: true,
        refreshRequired: false,
        reasons,
        priority: 3,
    };
}
