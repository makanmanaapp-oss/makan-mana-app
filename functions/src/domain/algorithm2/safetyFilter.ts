/**
 * Algorithm 2 / Phase 2.3 — Penapis KESELAMATAN KERAS (dijalankan SEBELUM markah).
 *
 * PRINSIP: keselamatan tidak boleh dilemahkan oleh markah positif. Konflik alahan
 * yang jelas & bukti bukan-halal yang jelas MENGELUARKAN calon terus (bukan penalti
 * lembut). Data TIDAK DIKETAHUI kekal amaran lembut (tidak dikeluarkan, tidak
 * didakwa selamat).
 *
 * Modul TULEN (tiada I/O). Boleh diuji sepenuhnya.
 */
import { PlaceCandidate } from "../../types/place";
import { RecommendationUserContext } from "./recommendationContext";

/**
 * Token konflik alahan (best-effort ikut nama/cuisine). Padanan = BUKTI CUKUP
 * untuk mengeluarkan (kami pilih selamat: lebih baik keluarkan daripada berisiko).
 */
export const ALLERGY_CONFLICT_TOKENS: Record<string, string[]> = {
  seafood: ["seafood", "shellfish", "prawn", "udang", "ketam", "crab",
    "fish", "ikan", "tomyam", "tom yam", "sushi", "sashimi", "oyster", "tiram"],
  shellfish: ["shellfish", "prawn", "udang", "ketam", "crab", "oyster", "tiram", "lobster"],
  kacang: ["satay", "sate", "rojak", "kacang", "peanut", "gado", "pecal"],
  peanut: ["satay", "sate", "peanut", "kacang", "gado", "pecal"],
  telur: ["telur", "egg"],
  egg: ["telur", "egg"],
  susu: ["dairy", "cheese", "keju", "milk", "susu", "ice cream",
    "ais krim", "gelato", "creamery"],
  dairy: ["dairy", "cheese", "keju", "milk", "susu", "ice cream", "gelato", "creamery"],
  gluten: ["bakery", "bread", "roti", "noodle", "mee", "pasta",
    "ramen", "wheat", "bakeri"],
};

/** Bukti bukan-halal yang JELAS (mengeluarkan bila pengguna perlu halal). */
export const NON_HALAL_TOKENS = ["pork", "bak kut", "babi", "char siu",
  "siu yuk", "bacon", "ham ", "non-halal", "lard", "char siew"];

export type SafetyFilterReason =
  | "invalid"
  | "closed"
  | "allergy_conflict"
  | "non_halal"
  | "suppressed_session"
  | "reject_memory"
  | "duplicate";

export interface FilteredPlace {
  placeId: string;
  reason: SafetyFilterReason;
}

export interface HardSafetyResult {
  eligible: PlaceCandidate[];
  filtered: FilteredPlace[];
  counts: Record<SafetyFilterReason, number>;
}

export interface HardSafetyOptions {
  /** ID ditindas (sesi shown/rejected + reject-memory) — dari perkhidmatan sesi. */
  suppressedIds?: Set<string>;
  rejectMemoryIds?: Set<string>;
  /** Anggap calon dengan isOpen===false sebagai TUTUP (keluarkan). */
  excludeClosed?: boolean;
}

function textOf(p: PlaceCandidate): string {
  return `${p.cuisine} ${p.name}`.toLowerCase();
}

/** Adakah calon ini bercanggah dengan mana-mana alahan pengguna (bukti jelas)? */
export function hasAllergyConflict(
  p: PlaceCandidate,
  allergies: string[],
): boolean {
  if (allergies.length === 0) return false;
  const text = textOf(p);
  return allergies.some((a) =>
    (ALLERGY_CONFLICT_TOKENS[a] ?? []).some((t) => text.includes(t)));
}

/** Adakah bukti bukan-halal yang JELAS? */
export function hasExplicitNonHalal(p: PlaceCandidate): boolean {
  const text = textOf(p);
  return NON_HALAL_TOKENS.some((t) => text.includes(t));
}

/**
 * Penapis keras: keluarkan calon TIDAK LAYAK sebelum pemarkahan.
 * Susunan pemeriksaan: id-tak-sah → pendua → ditindas → reject-memory →
 * tutup → konflik-alahan → bukan-halal. Keselamatan (alahan/halal) sentiasa
 * mengeluarkan tanpa mengira markah positif.
 */
export function applyHardSafety(
  candidates: PlaceCandidate[],
  ctx: RecommendationUserContext,
  opts: HardSafetyOptions = {},
): HardSafetyResult {
  const suppressed = opts.suppressedIds ?? new Set<string>();
  const rejectMem = opts.rejectMemoryIds ?? new Set<string>();
  const excludeClosed = opts.excludeClosed !== false; // default true
  const eligible: PlaceCandidate[] = [];
  const filtered: FilteredPlace[] = [];
  const counts: Record<SafetyFilterReason, number> = {
    invalid: 0, closed: 0, allergy_conflict: 0, non_halal: 0,
    suppressed_session: 0, reject_memory: 0, duplicate: 0,
  };
  const seen = new Set<string>();

  const drop = (p: PlaceCandidate, reason: SafetyFilterReason) => {
    filtered.push({ placeId: p.placeId, reason });
    counts[reason] += 1;
  };

  for (const p of candidates) {
    // 1. ID tak sah.
    if (!p || typeof p.placeId !== "string" || p.placeId.length === 0) {
      if (p) drop(p, "invalid");
      continue;
    }
    // 7. Pendua / alias-setara (placeId ATAU canonicalPlaceId).
    const dupKey = p.canonicalPlaceId ?? p.placeId;
    if (seen.has(p.placeId) || seen.has(dupKey)) { drop(p, "duplicate"); continue; }

    // 8+9. Penindasan sesi + reject-memory 24 jam.
    if (suppressed.has(p.placeId) || (p.canonicalPlaceId && suppressed.has(p.canonicalPlaceId))) {
      drop(p, "suppressed_session"); continue;
    }
    if (rejectMem.has(p.placeId) || (p.canonicalPlaceId && rejectMem.has(p.canonicalPlaceId))) {
      drop(p, "reject_memory"); continue;
    }

    // 2/4. Tutup (tidak boleh tersenarai sebagai "tersedia"). openingPeriods===null
    // bermakna JADUAL TIDAK DIKETAHUI → dianggap buka (isOpen=true di hulu) dan
    // dikendali oleh penalti ketersediaan-tidak-diketahui dalam pemarkahan.
    if (excludeClosed && p.isOpen === false) { drop(p, "closed"); continue; }

    // 3. Konflik alahan JELAS → KELUARKAN (keselamatan tidak boleh dilemahkan).
    if (hasAllergyConflict(p, ctx.allergies)) { drop(p, "allergy_conflict"); continue; }

    // 5. Bukti bukan-halal JELAS bila pengguna perlu halal → KELUARKAN.
    if (ctx.halalPreference && hasExplicitNonHalal(p)) { drop(p, "non_halal"); continue; }

    seen.add(p.placeId);
    seen.add(dupKey);
    eligible.push(p);
  }

  return { eligible, filtered, counts };
}
