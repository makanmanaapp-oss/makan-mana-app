/**
 * Phase 1.2 — primitif kongsi untuk domain canonical place.
 *
 * ADDITIVE SAHAJA. Tiada import firebase/Firestore. Tiada kesan sampingan.
 * TIDAK digunakan oleh laluan produksi (getSuggestions/cards) dalam fasa ini.
 */

/**
 * Milisaat epoch (UTC). Konvensyen masa domain — deterministik & selamat
 * serialisasi. Pada masa persistence (fasa kemudian) ini dipetakan kepada
 * Firestore `Timestamp`. Kami TIDAK memanggil `Date.now()` di dalam helper
 * tulen supaya ujian kekal deterministik (masa disuntik).
 */
export type EpochMillis = number;

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Nombor terikat [0,1] (untuk confidence & skor completeness). */
export function inUnitRange(v: unknown): v is number {
  return isFiniteNumber(v) && v >= 0 && v <= 1;
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Timestamp sah = tiada (undefined) ATAU nombor terhingga bukan negatif. */
export function isValidOptionalTimestamp(v: unknown): boolean {
  return v === undefined || (isFiniteNumber(v) && v >= 0);
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    isFiniteNumber(lat) &&
    isFiniteNumber(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/**
 * ID tag/canonical mesti bebas bahasa: huruf kecil ascii, digit, underscore.
 * Ini mengesan label terjemah yang tersilap dipakai sebagai kunci pangkalan
 * data (cth. "Nasi Lemak", "泰国", "Kafe") — dilarang oleh spesifikasi.
 */
export function isCanonicalId(v: unknown): v is string {
  return typeof v === "string" && /^[a-z0-9_]+$/.test(v);
}

/** Bentuk keputusan pengesahan yang dikongsi semua validator hand-rolled. */
export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/** Pembina keputusan: kumpul isu, `ok` benar bila kosong. */
export function toResult(issues: ValidationIssue[]): ValidationResult {
  return { ok: issues.length === 0, issues };
}

export function isMember<T extends readonly string[]>(
  allowed: T,
  v: unknown,
): v is T[number] {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}
