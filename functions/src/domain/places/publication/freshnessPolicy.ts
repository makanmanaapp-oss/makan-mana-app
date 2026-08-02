/**
 * Phase 1.6 Part A — REGISTRI POLISI FRESHNESS.
 *
 * Setiap medan mempunyai TTL bebas. SEMUA ambang adalah pemalar bernama —
 * TIADA nombor ajaib tersembunyi di dalam penilai. Registri ini boleh
 * dikonfigurasi (boleh diganti pada masa ujian) dan berversi.
 *
 * ADDITIVE. Tidak diimport oleh functions/src/index.ts → tiada kesan produksi.
 */

/** Saat → milisaat (pembantu keterbacaan; bukan nombor ajaib). */
export const SECOND = 1;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const FRESHNESS_POLICY_VERSION = "freshness_policy_v1";

/**
 * Medan yang mempunyai freshness bebas (Phase 1.6 Part A).
 * Superset bagi `FRESHNESS_FIELDS` Phase 1.2 — menambah tiga medan bukti
 * keselamatan (halal/diet/allergen) yang mesti luput secara berasingan.
 */
export const FRESHNESS_POLICY_FIELDS = [
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
] as const;
export type FreshnessPolicyField = (typeof FRESHNESS_POLICY_FIELDS)[number];

/** Kritikaliti medan — memandu sekatan penerbitan & keutamaan refresh. */
export const FRESHNESS_CRITICALITY = ["low", "medium", "high", "critical"] as const;
export type FreshnessCriticality = (typeof FRESHNESS_CRITICALITY)[number];

/** Keutamaan refresh (1 = paling segera). Nilai bernama, bukan ajaib. */
export const REFRESH_PRIORITY = {
  immediate: 1,
  high: 2,
  normal: 3,
  low: 4,
  deferred: 5,
} as const;
export type RefreshPriority = (typeof REFRESH_PRIORITY)[keyof typeof REFRESH_PRIORITY];

/**
 * Polisi freshness untuk SATU medan.
 *
 * - `staleAfterSeconds`   : umur di mana medan mula "aging/stale".
 * - `expiresAfterSeconds` : umur di mana medan menjadi "expired" (fakta mati).
 * - `allowStaleDisplay`   : bolehkah nilai stale dipapar (dengan amaran)?
 * - `blockPublicationWhenExpired` : adakah luput MENYEKAT penerbitan?
 * - `requiresWarningWhenStale`    : adakah stale WAJIB menghasilkan amaran?
 */
export interface FieldFreshnessPolicy {
  fieldId: FreshnessPolicyField;
  staleAfterSeconds: number;
  expiresAfterSeconds: number;
  criticality: FreshnessCriticality;
  allowStaleDisplay: boolean;
  blockPublicationWhenExpired: boolean;
  requiresWarningWhenStale: boolean;
  refreshPriority: RefreshPriority;
  version: string;
}

export type FreshnessPolicyRegistry = {
  [K in FreshnessPolicyField]: FieldFreshnessPolicy;
};

function policy(
  fieldId: FreshnessPolicyField,
  staleAfterSeconds: number,
  expiresAfterSeconds: number,
  criticality: FreshnessCriticality,
  allowStaleDisplay: boolean,
  blockPublicationWhenExpired: boolean,
  requiresWarningWhenStale: boolean,
  refreshPriority: RefreshPriority,
): FieldFreshnessPolicy {
  if (!(staleAfterSeconds > 0) || !(expiresAfterSeconds > 0)) {
    throw new RangeError(`policy ${fieldId}: TTL mesti positif`);
  }
  if (staleAfterSeconds >= expiresAfterSeconds) {
    throw new RangeError(
      `policy ${fieldId}: staleAfterSeconds (${staleAfterSeconds}) mesti < ` +
        `expiresAfterSeconds (${expiresAfterSeconds})`,
    );
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
    version: FRESHNESS_POLICY_VERSION,
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
export const DEFAULT_FRESHNESS_POLICY_REGISTRY: FreshnessPolicyRegistry = {
  // fieldId, stale, expires, criticality, allowStale, blockPubExpired, warnStale, priority
  businessStatus: policy("businessStatus", 3 * DAY, 30 * DAY, "critical", true, true, true, REFRESH_PRIORITY.immediate),
  openingHours: policy("openingHours", 7 * DAY, 60 * DAY, "critical", false, true, true, REFRESH_PRIORITY.immediate),
  halalEvidence: policy("halalEvidence", 90 * DAY, 365 * DAY, "critical", false, true, true, REFRESH_PRIORITY.high),
  allergenEvidence: policy("allergenEvidence", 90 * DAY, 365 * DAY, "critical", false, true, true, REFRESH_PRIORITY.high),
  dietaryEvidence: policy("dietaryEvidence", 90 * DAY, 365 * DAY, "high", true, false, true, REFRESH_PRIORITY.high),
  location: policy("location", 90 * DAY, 365 * DAY, "high", true, true, true, REFRESH_PRIORITY.high),
  address: policy("address", 90 * DAY, 365 * DAY, "high", true, false, true, REFRESH_PRIORITY.normal),
  merchantData: policy("merchantData", 30 * DAY, 180 * DAY, "high", true, false, true, REFRESH_PRIORITY.normal),
  price: policy("price", 30 * DAY, 180 * DAY, "medium", true, false, true, REFRESH_PRIORITY.normal),
  rating: policy("rating", 14 * DAY, 120 * DAY, "medium", true, false, true, REFRESH_PRIORITY.normal),
  reviewCount: policy("reviewCount", 14 * DAY, 120 * DAY, "medium", true, false, true, REFRESH_PRIORITY.normal),
  tags: policy("tags", 60 * DAY, 365 * DAY, "medium", true, false, false, REFRESH_PRIORITY.low),
  images: policy("images", 90 * DAY, 540 * DAY, "low", true, false, false, REFRESH_PRIORITY.deferred),
};

/** Medan yang polisinya menyekat penerbitan bila luput (untuk dokumentasi/ujian). */
export function publicationBlockingFields(
  registry: FreshnessPolicyRegistry = DEFAULT_FRESHNESS_POLICY_REGISTRY,
): FreshnessPolicyField[] {
  return FRESHNESS_POLICY_FIELDS.filter((f) => registry[f].blockPublicationWhenExpired);
}

/** Bina registri ubahsuai untuk ujian tanpa mengubah lalai (immutable spread). */
export function withPolicyOverrides(
  overrides: Partial<Record<FreshnessPolicyField, Partial<FieldFreshnessPolicy>>>,
  base: FreshnessPolicyRegistry = DEFAULT_FRESHNESS_POLICY_REGISTRY,
): FreshnessPolicyRegistry {
  const out = {} as FreshnessPolicyRegistry;
  for (const f of FRESHNESS_POLICY_FIELDS) {
    out[f] = { ...base[f], ...(overrides[f] ?? {}) };
  }
  return out;
}
