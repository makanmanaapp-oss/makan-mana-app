/**
 * Algorithm 2 / FINAL RECOMMENDATION REPAIR — dasar TTL reject TULEN (Part 4/5).
 *
 * Reject BUKAN peristiwa UI sementara. Setiap reject ditindas untuk tempoh yang
 * BERGANTUNG pada SEBAB + bilangan reject terkumpul (progresif). do_not_suggest_
 * again = kekal (permanent avoid). Modul TULEN — tiada I/O, boleh diuji penuh.
 *
 * PRINSIP:
 *  - Reject > Shown: shown boleh dilonggarkan dahulu; reject-memory kekal kuat
 *    (selepas keselamatan keras / permanent-avoid).
 *  - Sebab dipetakan ke dimensi yang betul di tempat lain (brain); di sini kita
 *    hanya tentukan berapa lama TEMPAT itu ditindas.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Sentinel "kekal" — 10 tahun (praktikal permanent; boleh dibalik oleh pengguna). */
export const PERMANENT_TTL_MS = 3650 * DAY;

/** Sebab reject kanonikal (dinormalisasi). */
export type RejectReason =
  | "not_mood"
  | "recently_ate"
  | "too_far"
  | "too_expensive"
  | "do_not_suggest_again"
  | "other";

/** TTL asas seorang-reject mengikut sebab (ms). Eksplisit + boleh diuji. */
export const BASE_TTL_BY_REASON: Record<RejectReason, number> = {
  not_mood: 6 * HOUR, // penindasan tempat sementara; tiada penalti cuisine kekal
  recently_ate: 3 * DAY, // repeat suppression lebih kuat (3–7 hari)
  too_far: 24 * HOUR, // konteks lokasi/radius setara
  too_expensive: 48 * HOUR, // konteks bajet setara (24–72 jam)
  do_not_suggest_again: PERMANENT_TTL_MS, // permanent avoid sehingga pengguna balikkan
  other: 24 * HOUR, // lalai selamat
};

/** Normalisasi rentetan sebab mentah klien → sebab kanonikal. */
export function normalizeRejectReason(raw: string | null | undefined): RejectReason {
  const r = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (r) {
    case "not_mood":
    case "mood":
    case "not_in_mood":
    case "wrong_mood":
      return "not_mood";
    case "recently_ate":
    case "just_ate":
    case "ate_recently":
    case "already_ate":
      return "recently_ate";
    case "too_far":
    case "far":
    case "distance":
      return "too_far";
    case "too_expensive":
    case "expensive":
    case "price":
    case "over_budget":
      return "too_expensive";
    case "do_not_suggest_again":
    case "never":
    case "block":
    case "hide_forever":
    case "permanent":
      return "do_not_suggest_again";
    default:
      return "other";
  }
}

/**
 * TTL berkesan bagi reject: max(asas-sebab, penindasan progresif ikut kiraan).
 * Reject berulang → penindasan tempat lebih kuat (Part 4):
 *   count>=3 → sekurang-kurangnya 30 hari (kecuali permanent kekal permanent).
 *   count==2 → sekurang-kurangnya 24 jam.
 * not_mood seorang-reject kekal pendek (6 jam) — hanya berulang yang mengeras.
 *
 * @param reason sebab kanonikal
 * @param rejectCount bilangan reject TERKUMPUL untuk tempat ini (>=1)
 */
export function rejectTtlMs(reason: RejectReason, rejectCount: number): number {
  const base = BASE_TTL_BY_REASON[reason];
  if (reason === "do_not_suggest_again") return PERMANENT_TTL_MS;
  const count = Math.max(1, Math.floor(rejectCount));
  let progressive = 0;
  if (count >= 3) progressive = 30 * DAY;
  else if (count === 2) progressive = 24 * HOUR;
  return Math.max(base, progressive);
}

/** Adakah TTL ini bermakna "kekal" (permanent avoid)? */
export function isPermanentTtl(ttlMs: number): boolean {
  return ttlMs >= PERMANENT_TTL_MS;
}
