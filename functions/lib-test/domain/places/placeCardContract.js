"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCardQuality = toCardQuality;
exports.toCardPriceState = toCardPriceState;
exports.toCardHoursState = toCardHoursState;
// ---- Pemeta JUJUR tulen (bukti tiada rekaan; digunakan oleh ujian 24) ----
/** Salin rating/ulasan HANYA bila hadir — tidak pernah ganti dengan 0. */
function toCardQuality(q) {
    const out = {};
    if (typeof q.rating === "number" && Number.isFinite(q.rating)) {
        out.rating = q.rating;
    }
    if (typeof q.reviewCount === "number" && Number.isFinite(q.reviewCount)) {
        out.reviewCount = q.reviewCount;
    }
    return out;
}
/** Keadaan harga diteruskan apa adanya — tidak pernah direka "estimated". */
function toCardPriceState(c) {
    return c.priceState;
}
/** Keadaan waktu diteruskan apa adanya — tidak pernah diandaikan "known". */
function toCardHoursState(h) {
    return h.hoursState;
}
