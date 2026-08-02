"use strict";
/**
 * Phase 1.6 Part A — REGISTRI POLISI FRESHNESS.
 *
 * Setiap medan mempunyai TTL bebas. SEMUA ambang adalah pemalar bernama —
 * TIADA nombor ajaib tersembunyi di dalam penilai. Registri ini boleh
 * dikonfigurasi (boleh diganti pada masa ujian) dan berversi.
 *
 * ADDITIVE. Tidak diimport oleh functions/src/index.ts → tiada kesan produksi.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_FRESHNESS_POLICY_REGISTRY = exports.REFRESH_PRIORITY = exports.FRESHNESS_CRITICALITY = exports.FRESHNESS_POLICY_FIELDS = exports.FRESHNESS_POLICY_VERSION = exports.DAY = exports.HOUR = exports.MINUTE = exports.SECOND = void 0;
exports.publicationBlockingFields = publicationBlockingFields;
exports.withPolicyOverrides = withPolicyOverrides;
/** Saat → milisaat (pembantu keterbacaan; bukan nombor ajaib). */
exports.SECOND = 1;
exports.MINUTE = 60 * exports.SECOND;
exports.HOUR = 60 * exports.MINUTE;
exports.DAY = 24 * exports.HOUR;
exports.FRESHNESS_POLICY_VERSION = "freshness_policy_v1";
/**
 * Medan yang mempunyai freshness bebas (Phase 1.6 Part A).
 * Superset bagi `FRESHNESS_FIELDS` Phase 1.2 — menambah tiga medan bukti
 * keselamatan (halal/diet/allergen) yang mesti luput secara berasingan.
 */
exports.FRESHNESS_POLICY_FIELDS = [
    "businessStatus",
    "openingHours",
    "rating",
    "reviewCount",
    "price",
    "images",
    "address",
    "location",
    "tags",
    "merchantData",
    "halalEvidence",
    "dietaryEvidence",
    "allergenEvidence",
];
/** Kritikaliti medan — memandu sekatan penerbitan & keutamaan refresh. */
exports.FRESHNESS_CRITICALITY = ["low", "medium", "high", "critical"];
/** Keutamaan refresh (1 = paling segera). Nilai bernama, bukan ajaib. */
exports.REFRESH_PRIORITY = {
    immediate: 1,
    high: 2,
    normal: 3,
    low: 4,
    deferred: 5,
};
function policy(fieldId, staleAfterSeconds, expiresAfterSeconds, criticality, allowStaleDisplay, blockPublicationWhenExpired, requiresWarningWhenStale, refreshPriority) {
    if (!(staleAfterSeconds > 0) || !(expiresAfterSeconds > 0)) {
        throw new RangeError(`policy ${fieldId}: TTL mesti positif`);
    }
    if (staleAfterSeconds >= expiresAfterSeconds) {
        throw new RangeError(`policy ${fieldId}: staleAfterSeconds (${staleAfterSeconds}) mesti < ` +
            `expiresAfterSeconds (${expiresAfterSeconds})`);
    }
    return {
        fieldId,
        staleAfterSeconds,
        expiresAfterSeconds,
        criticality,
        allowStaleDisplay,
        blockPublicationWhenExpired,
        requiresWarningWhenStale,
        refreshPriority,
        version: exports.FRESHNESS_POLICY_VERSION,
    };
}
/**
 * Registri lalai.
 *
 * Rasional kritikaliti:
 * - `businessStatus`  : CRITICAL — kedai tutup kekal tidak boleh dipapar buka.
 * - `openingHours`    : CRITICAL — waktu luput TIDAK boleh menghasilkan
 *                       `open_now` (risiko F-04 audit Phase 1.1).
 * - `halalEvidence`   : CRITICAL — bukti halal luput TIDAK boleh kekal
 *                       "certified" (keselamatan agama/pemakanan).
 * - `allergenEvidence`: CRITICAL — bukti alergen luput TIDAK boleh kekal
 *                       "selamat" (keselamatan nyawa).
 * - `dietaryEvidence` : HIGH — penting tetapi tidak mengancam nyawa serta-merta.
 * - `location`/`address`: HIGH — lokasi salah merosakkan navigasi.
 * - `price`/`rating`/`reviewCount`/`images`/`tags`: MEDIUM/LOW — boleh papar
 *   stale DENGAN label jujur.
 *
 * `blockPublicationWhenExpired` HANYA true untuk medan CRITICAL + HIGH
 * terpilih — kami tidak menyekat penerbitan kerana gambar lama.
 */
exports.DEFAULT_FRESHNESS_POLICY_REGISTRY = {
    // fieldId, stale, expires, criticality, allowStale, blockPubExpired, warnStale, priority
    businessStatus: policy("businessStatus", 3 * exports.DAY, 30 * exports.DAY, "critical", true, true, true, exports.REFRESH_PRIORITY.immediate),
    openingHours: policy("openingHours", 7 * exports.DAY, 60 * exports.DAY, "critical", false, true, true, exports.REFRESH_PRIORITY.immediate),
    halalEvidence: policy("halalEvidence", 90 * exports.DAY, 365 * exports.DAY, "critical", false, true, true, exports.REFRESH_PRIORITY.high),
    allergenEvidence: policy("allergenEvidence", 90 * exports.DAY, 365 * exports.DAY, "critical", false, true, true, exports.REFRESH_PRIORITY.high),
    dietaryEvidence: policy("dietaryEvidence", 90 * exports.DAY, 365 * exports.DAY, "high", true, false, true, exports.REFRESH_PRIORITY.high),
    location: policy("location", 90 * exports.DAY, 365 * exports.DAY, "high", true, true, true, exports.REFRESH_PRIORITY.high),
    address: policy("address", 90 * exports.DAY, 365 * exports.DAY, "high", true, false, true, exports.REFRESH_PRIORITY.normal),
    merchantData: policy("merchantData", 30 * exports.DAY, 180 * exports.DAY, "high", true, false, true, exports.REFRESH_PRIORITY.normal),
    price: policy("price", 30 * exports.DAY, 180 * exports.DAY, "medium", true, false, true, exports.REFRESH_PRIORITY.normal),
    rating: policy("rating", 14 * exports.DAY, 120 * exports.DAY, "medium", true, false, true, exports.REFRESH_PRIORITY.normal),
    reviewCount: policy("reviewCount", 14 * exports.DAY, 120 * exports.DAY, "medium", true, false, true, exports.REFRESH_PRIORITY.normal),
    tags: policy("tags", 60 * exports.DAY, 365 * exports.DAY, "medium", true, false, false, exports.REFRESH_PRIORITY.low),
    images: policy("images", 90 * exports.DAY, 540 * exports.DAY, "low", true, false, false, exports.REFRESH_PRIORITY.deferred),
};
/** Medan yang polisinya menyekat penerbitan bila luput (untuk dokumentasi/ujian). */
function publicationBlockingFields(registry = exports.DEFAULT_FRESHNESS_POLICY_REGISTRY) {
    return exports.FRESHNESS_POLICY_FIELDS.filter((f) => registry[f].blockPublicationWhenExpired);
}
/** Bina registri ubahsuai untuk ujian tanpa mengubah lalai (immutable spread). */
function withPolicyOverrides(overrides, base = exports.DEFAULT_FRESHNESS_POLICY_REGISTRY) {
    const out = {};
    for (const f of exports.FRESHNESS_POLICY_FIELDS) {
        out[f] = { ...base[f], ...(overrides[f] ?? {}) };
    }
    return out;
}
