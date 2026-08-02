/**
 * Phase 1.6 Part J — PENERBITAN KEADAAN PAPARAN YANG JUJUR.
 *
 * Helper TULEN yang menerbitkan keadaan selamat-kad. TIADA helper di sini
 * boleh MEREKA "buka", harga, rating atau status keselamatan. Bila bukti
 * tiada atau luput, keputusannya ialah keadaan TIDAK DIKETAHUI yang eksplisit
 * — bukan tekaan yang kelihatan yakin.
 *
 * TIDAK disambungkan kepada Flutter dalam fasa ini (itu Phase 1.9).
 */
import { EpochMillis } from "../common";
import { HalalEvidenceState, PlaceStatus } from "../placeEnums";
import { PlaceCommercialData } from "../placeCommercial";
import { PlaceHoursData } from "../placeHours";
import { PlaceQualityData } from "../placeQuality";
import { PlaceSafetyEvidence } from "../placeSafetyEvidence";
import { FieldFreshnessResult } from "./freshnessEvaluator";

// ---------------------------------------------------------------------------
// Keadaan paparan kanonikal (ID bebas bahasa; label l10n pada Phase 1.9)
// ---------------------------------------------------------------------------

export const HOURS_DISPLAY_STATES = [
  "hours_known",
  "hours_unknown",
  "hours_expired",
  "temporarily_closed",
  "permanently_closed",
] as const;
export type HoursDisplayState = (typeof HOURS_DISPLAY_STATES)[number];

export const PRICE_DISPLAY_STATES_V16 = [
  "price_verified",
  "estimated_price",
  "price_unknown",
  "price_expired",
] as const;
export type PriceDisplayStateV16 = (typeof PRICE_DISPLAY_STATES_V16)[number];

export const RATING_DISPLAY_STATES = [
  "rating_shown",
  "rating_hidden",
  "rating_stale",
] as const;
export type RatingDisplayState = (typeof RATING_DISPLAY_STATES)[number];

export const BUSINESS_DISPLAY_STATES = [
  "operating",
  "temporarily_closed",
  "moved",
  "unverified_community",
  "status_unknown",
  "blocked",
] as const;
export type BusinessDisplayState = (typeof BUSINESS_DISPLAY_STATES)[number];

export const SAFETY_WARNING_STATES = [
  "halal_certified",
  "halal_merchant_claimed",
  "halal_community_reported",
  "halal_unknown",
  "halal_recheck_required",
  "halal_possible_non_halal",
] as const;
export type SafetyHalalDisplayState = (typeof SAFETY_WARNING_STATES)[number];

export interface HoursDisplayResult {
  state: HoursDisplayState;
  /** `open_now` HANYA boleh dikira bila ini true. */
  canComputeOpenNow: boolean;
  warningCode?: string;
}

export interface PriceDisplayResult {
  state: PriceDisplayStateV16;
  /** Nilai hanya disalurkan bila bukti membenarkan. */
  priceBandId?: string;
  averageSpend?: number;
  warningCode?: string;
}

export interface RatingDisplayResult {
  state: RatingDisplayState;
  rating?: number;
  reviewCount?: number;
  warningCode?: string;
}

export interface BusinessDisplayResult {
  state: BusinessDisplayState;
  /** Kedai disekat sepenuhnya daripada paparan awam. */
  blockedFromPublic: boolean;
  /** Layak menjadi cadangan LANGSUNG utama. */
  eligibleAsPrimarySuggestion: boolean;
  warningCode?: string;
}

export interface SafetyDisplayResult {
  halal: SafetyHalalDisplayState;
  /** true bila bukti alergen tiada/luput — mesti dilabel "tidak diketahui". */
  allergenUnknown: boolean;
  dietaryUnknown: boolean;
  warningCodes: string[];
}

// ---------------------------------------------------------------------------
// deriveHoursDisplayState
// ---------------------------------------------------------------------------

/**
 * Peraturan:
 * - Kedai tutup kekal → "permanently_closed" (paling utama).
 * - Kedai tutup sementara → "temporarily_closed".
 * - Freshness waktu LUPUT → "hours_expired" dan `canComputeOpenNow=false`.
 *   Ini menghalang `open_now` yang direka daripada waktu mati.
 * - `hoursState !== "known"` → "hours_unknown".
 * - Hanya waktu yang DIKETAHUI dan TIDAK luput boleh mengira `open_now`.
 */
export function deriveHoursDisplayState(
  hours: PlaceHoursData,
  status: PlaceStatus,
  hoursFreshness?: FieldFreshnessResult,
): HoursDisplayResult {
  if (status === "permanently_closed") {
    return { state: "permanently_closed", canComputeOpenNow: false };
  }
  if (status === "temporarily_closed") {
    return { state: "temporarily_closed", canComputeOpenNow: false };
  }
  if (hours.hoursState === "permanently_closed") {
    return { state: "permanently_closed", canComputeOpenNow: false };
  }
  if (hours.hoursState === "temporarily_closed") {
    return { state: "temporarily_closed", canComputeOpenNow: false };
  }
  // Waktu LUPUT tidak boleh menghasilkan open_now walaupun `periods` ada.
  if (hours.hoursState === "expired" || hoursFreshness?.expired === true) {
    return {
      state: "hours_expired",
      canComputeOpenNow: false,
      warningCode: "hours_expired",
    };
  }
  if (hours.hoursState !== "known") {
    return {
      state: "hours_unknown",
      canComputeOpenNow: false,
      warningCode: "hours_unknown",
    };
  }
  if (!hours.periods || hours.periods.length === 0) {
    // "known" tanpa tempoh = tiada maklumat sebenar → kekal tidak diketahui.
    return {
      state: "hours_unknown",
      canComputeOpenNow: false,
      warningCode: "hours_unknown",
    };
  }
  return {
    state: "hours_known",
    canComputeOpenNow: true,
    warningCode: hoursFreshness?.stale === true ? "hours_stale" : undefined,
  };
}

// ---------------------------------------------------------------------------
// derivePriceDisplayState
// ---------------------------------------------------------------------------

/**
 * Peraturan:
 * - `unknown` kekal `price_unknown` — TIDAK PERNAH direka sebagai julat RM.
 * - `estimated` dilabel `estimated_price` (bukan disamakan dengan disahkan).
 * - Freshness harga LUPUT menurunkan taraf kepada `price_expired`; nilai
 *   lama tidak disalurkan sebagai fakta semasa.
 */
export function derivePriceDisplayState(
  commercial: PlaceCommercialData,
  priceFreshness?: FieldFreshnessResult,
): PriceDisplayResult {
  if (commercial.priceState === "unknown") {
    return { state: "price_unknown", warningCode: "price_unknown" };
  }
  if (priceFreshness?.expired === true) {
    return { state: "price_expired", warningCode: "price_expired" };
  }
  if (commercial.priceState === "estimated") {
    return {
      state: "estimated_price",
      priceBandId: commercial.priceBandId,
      averageSpend: commercial.averageSpend,
      warningCode: "estimated_price",
    };
  }
  return {
    state: "price_verified",
    priceBandId: commercial.priceBandId,
    averageSpend: commercial.averageSpend,
    warningCode: priceFreshness?.stale === true ? "price_stale" : undefined,
  };
}

// ---------------------------------------------------------------------------
// deriveRatingDisplayState
// ---------------------------------------------------------------------------

/**
 * Peraturan:
 * - Rating tiada → SEMBUNYI (tidak pernah dipapar 0.0 sebagai rating sebenar).
 * - reviewCount tiada → SEMBUNYI (rating tanpa asas ulasan mengelirukan).
 * - Rating luput → SEMBUNYI (fakta mati bukan fakta semasa).
 * - Rating stale → dipapar dengan label stale.
 */
export function deriveRatingDisplayState(
  quality: PlaceQualityData,
  ratingFreshness?: FieldFreshnessResult,
): RatingDisplayResult {
  const hasRating = typeof quality.rating === "number" && Number.isFinite(quality.rating);
  const hasCount =
    typeof quality.reviewCount === "number" && Number.isFinite(quality.reviewCount);

  if (!hasRating) return { state: "rating_hidden", warningCode: "rating_missing" };
  if (!hasCount) return { state: "rating_hidden", warningCode: "review_count_missing" };
  if (ratingFreshness?.expired === true) {
    return { state: "rating_hidden", warningCode: "rating_expired" };
  }
  if (ratingFreshness?.stale === true) {
    return {
      state: "rating_stale",
      rating: quality.rating,
      reviewCount: quality.reviewCount,
      warningCode: "rating_stale",
    };
  }
  return {
    state: "rating_shown",
    rating: quality.rating,
    reviewCount: quality.reviewCount,
  };
}

// ---------------------------------------------------------------------------
// deriveBusinessDisplayState
// ---------------------------------------------------------------------------

/**
 * Peraturan:
 * - `permanently_closed` / `hidden_by_admin` → DISEKAT daripada paparan awam.
 * - `temporarily_closed` → boleh dipapar tetapi BUKAN cadangan utama langsung.
 * - `stale_critical` / `pending_validation` → status tidak diketahui,
 *   bukan cadangan utama.
 * - Freshness businessStatus LUPUT menurunkan taraf kepada `status_unknown`
 *   walaupun status tersimpan berkata "active" — status mati bukan fakta.
 */
export function deriveBusinessDisplayState(
  status: PlaceStatus,
  businessStatusFreshness?: FieldFreshnessResult,
): BusinessDisplayResult {
  if (status === "permanently_closed") {
    return {
      state: "blocked",
      blockedFromPublic: true,
      eligibleAsPrimarySuggestion: false,
      warningCode: "permanently_closed",
    };
  }
  if (status === "hidden_by_admin") {
    return {
      state: "blocked",
      blockedFromPublic: true,
      eligibleAsPrimarySuggestion: false,
      warningCode: "hidden_by_admin",
    };
  }
  if (status === "temporarily_closed") {
    return {
      state: "temporarily_closed",
      blockedFromPublic: false,
      eligibleAsPrimarySuggestion: false,
      warningCode: "temporarily_closed",
    };
  }
  if (status === "moved") {
    return {
      state: "moved",
      blockedFromPublic: false,
      eligibleAsPrimarySuggestion: false,
      warningCode: "place_moved",
    };
  }
  if (status === "pending_validation" || status === "stale_critical") {
    return {
      state: "status_unknown",
      blockedFromPublic: false,
      eligibleAsPrimarySuggestion: false,
      warningCode: "business_status_unverified",
    };
  }
  // Status tersimpan "active"/"community_unverified" — tetapi jika bukti
  // status LUPUT, kami tidak mendakwa ia masih beroperasi.
  if (businessStatusFreshness?.expired === true) {
    return {
      state: "status_unknown",
      blockedFromPublic: false,
      eligibleAsPrimarySuggestion: false,
      warningCode: "business_status_expired",
    };
  }
  if (status === "community_unverified") {
    return {
      state: "unverified_community",
      blockedFromPublic: false,
      eligibleAsPrimarySuggestion: true,
      warningCode: "community_reported_status",
    };
  }
  return {
    state: "operating",
    blockedFromPublic: false,
    eligibleAsPrimarySuggestion: true,
    warningCode: businessStatusFreshness?.stale === true ? "business_status_stale" : undefined,
  };
}

// ---------------------------------------------------------------------------
// deriveSafetyWarningState
// ---------------------------------------------------------------------------

const HALAL_DISPLAY: Record<HalalEvidenceState, SafetyHalalDisplayState> = {
  certified: "halal_certified",
  merchant_claimed: "halal_merchant_claimed",
  community_reported: "halal_community_reported",
  unknown: "halal_unknown",
  possible_non_halal: "halal_possible_non_halal",
};

/**
 * Peraturan keselamatan (paling ketat dalam fail ini):
 * - Bukti halal LUPUT → TIDAK boleh kekal "certified"; diturunkan kepada
 *   `halal_recheck_required` (bukan "unknown" senyap — kami memberitahu
 *   pengguna bahawa pengesahan semula diperlukan).
 * - Bukti halal `unknown` kekal `halal_unknown` — tidak pernah dinaik taraf.
 * - Bukti alergen tiada ATAU luput → `allergenUnknown = true`. Kami TIDAK
 *   PERNAH melaporkan kedai sebagai "selamat" untuk sebarang alergen.
 * - Senarai alergen yang dilaporkan bermakna "dilaporkan", BUKAN "selamat".
 */
export function deriveSafetyWarningState(
  safety: PlaceSafetyEvidence,
  halalFreshness?: FieldFreshnessResult,
  allergenFreshness?: FieldFreshnessResult,
  dietaryFreshness?: FieldFreshnessResult,
): SafetyDisplayResult {
  const warningCodes: string[] = [];

  let halal: SafetyHalalDisplayState = HALAL_DISPLAY[safety.halal.state];
  if (halalFreshness?.expired === true) {
    // Bukti mati tidak boleh mendakwa sijil.
    halal =
      safety.halal.state === "possible_non_halal"
        ? "halal_possible_non_halal" // amaran negatif KEKAL (selamat gagal-tertutup)
        : "halal_recheck_required";
    warningCodes.push("halal_evidence_expired");
  } else if (halalFreshness?.stale === true && safety.halal.state === "certified") {
    warningCodes.push("halal_evidence_stale");
  }
  if (halal === "halal_unknown") warningCodes.push("halal_unknown");

  const allergenMissing =
    safety.allergenEvidenceLevel === "unknown" || safety.allergenReported.length === 0;
  const allergenUnknown = allergenMissing || allergenFreshness?.expired === true;
  if (allergenUnknown) warningCodes.push("allergen_evidence_unknown");
  else if (allergenFreshness?.stale === true) warningCodes.push("allergen_evidence_stale");

  const dietaryUnknown =
    safety.dietaryReported.length === 0 || dietaryFreshness?.expired === true;
  if (dietaryUnknown) warningCodes.push("dietary_evidence_unknown");

  return {
    halal,
    allergenUnknown,
    dietaryUnknown,
    warningCodes: Array.from(new Set(warningCodes)),
  };
}

/** Bentuk gabungan semua keadaan paparan (untuk snapshot penerbitan). */
export interface HonestDisplayState {
  hours: HoursDisplayResult;
  price: PriceDisplayResult;
  rating: RatingDisplayResult;
  business: BusinessDisplayResult;
  safety: SafetyDisplayResult;
  derivedAt: EpochMillis;
}
