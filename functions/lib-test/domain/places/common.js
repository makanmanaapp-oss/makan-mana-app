"use strict";
/**
 * Phase 1.2 — primitif kongsi untuk domain canonical place.
 *
 * ADDITIVE SAHAJA. Tiada import firebase/Firestore. Tiada kesan sampingan.
 * TIDAK digunakan oleh laluan produksi (getSuggestions/cards) dalam fasa ini.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFiniteNumber = isFiniteNumber;
exports.inUnitRange = inUnitRange;
exports.isNonEmptyString = isNonEmptyString;
exports.isValidOptionalTimestamp = isValidOptionalTimestamp;
exports.isValidLatLng = isValidLatLng;
exports.clamp01 = clamp01;
exports.dedupe = dedupe;
exports.isCanonicalId = isCanonicalId;
exports.toResult = toResult;
exports.isMember = isMember;
function isFiniteNumber(v) {
    return typeof v === "number" && Number.isFinite(v);
}
/** Nombor terikat [0,1] (untuk confidence & skor completeness). */
function inUnitRange(v) {
    return isFiniteNumber(v) && v >= 0 && v <= 1;
}
function isNonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
}
/** Timestamp sah = tiada (undefined) ATAU nombor terhingga bukan negatif. */
function isValidOptionalTimestamp(v) {
    return v === undefined || (isFiniteNumber(v) && v >= 0);
}
function isValidLatLng(lat, lng) {
    return (isFiniteNumber(lat) &&
        isFiniteNumber(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180);
}
function clamp01(v) {
    if (Number.isNaN(v))
        return 0;
    return Math.max(0, Math.min(1, v));
}
function dedupe(arr) {
    return Array.from(new Set(arr));
}
/**
 * ID tag/canonical mesti bebas bahasa: huruf kecil ascii, digit, underscore.
 * Ini mengesan label terjemah yang tersilap dipakai sebagai kunci pangkalan
 * data (cth. "Nasi Lemak", "泰国", "Kafe") — dilarang oleh spesifikasi.
 */
function isCanonicalId(v) {
    return typeof v === "string" && /^[a-z0-9_]+$/.test(v);
}
/** Pembina keputusan: kumpul isu, `ok` benar bila kosong. */
function toResult(issues) {
    return { ok: issues.length === 0, issues };
}
function isMember(allowed, v) {
    return typeof v === "string" && allowed.includes(v);
}
