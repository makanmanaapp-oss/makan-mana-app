"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tagLabelKey = tagLabelKey;
exports.isLikelyLocalizedTagId = isLikelyLocalizedTagId;
function tagLabelKey(familyId, tagId) {
    return `tag.${familyId}.${tagId}`;
}
/**
 * Kesan ID yang berkemungkinan label terjemah/teks setempat dipakai sebagai
 * kunci DB: ruang, huruf besar, tanda baca berat, Unicode bukan-ascii.
 * Transliterasi canonical sah (cth. "ayam_geprek", "nasi_lemak") TIDAK ditolak.
 */
function isLikelyLocalizedTagId(id) {
    const reasons = [];
    if (/\s/.test(id))
        reasons.push("contains_space");
    if (/[A-Z]/.test(id))
        reasons.push("contains_uppercase");
    if (/[^a-z0-9_]/.test(id)) {
        if (/[^\x00-\x7F]/.test(id))
            reasons.push("non_ascii");
        else
            reasons.push("punctuation");
    }
    return { localized: reasons.length > 0, reasons };
}
