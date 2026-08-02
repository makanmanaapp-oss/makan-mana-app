"use strict";
/**
 * Phase 1.4 — normalisasi identiti tulen untuk pengesanan duplikat.
 * TIDAK menterjemah, TIDAK mereka nama, TIDAK membuang teks pengenal cawangan
 * atau nombor bermakna. Contoh yang MESTI kekal berbeza:
 *   "Restoran Ali Shah Alam" vs "Restoran Ali Bangi" vs "Restoran Ali Cawangan 2"
 *   vs "Restoran Ali Express" vs "Ali Cafe" vs "Ali Restaurant".
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeName = normalizeName;
exports.nameTokens = nameTokens;
exports.normalizePhone = normalizePhone;
exports.extractDomain = extractDomain;
exports.normalizeAddressTokens = normalizeAddressTokens;
exports.buildIdentity = buildIdentity;
const ADDRESS_STOPWORDS = new Set(["jalan", "jln", "no", "lot", "lorong"]);
/** Buang tanda baca (jadi ruang), huruf kecil, mampatkan ruang. Kekalkan
 * huruf+digit (nombor bermakna KEKAL). */
function stripPunct(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9À-ɏ一-鿿]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
/** Normalisasi nama: huruf kecil + tanda baca + suffix guaman kecil sahaja. */
function normalizeName(raw) {
    let s = stripPunct(raw ?? "");
    // Suffix guaman selamat sahaja (tidak menyentuh teks cawangan/nombor).
    s = s.replace(/\bsdn bhd\b/g, "").replace(/\bberhad\b/g, "");
    return s.replace(/\s+/g, " ").trim();
}
function nameTokens(normalized) {
    return normalized.split(" ").filter((t) => t.length > 0);
}
/** Nombor telefon → digit kebangsaan (buang +60/60/0 di hadapan). */
function normalizePhone(raw) {
    let d = (raw ?? "").replace(/\D/g, "");
    if (d.startsWith("60"))
        d = d.slice(2);
    if (d.startsWith("0"))
        d = d.slice(1);
    return d;
}
function extractDomain(url) {
    if (!url)
        return undefined;
    try {
        const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        const host = new URL(withProto).hostname.toLowerCase();
        return host.replace(/^www\./, "");
    }
    catch {
        return undefined;
    }
}
function normalizeAddressTokens(address) {
    if (!address)
        return [];
    return stripPunct(address)
        .split(" ")
        .filter((t) => t.length > 0 && !ADDRESS_STOPWORDS.has(t));
}
function buildIdentity(input) {
    const displayName = (input.displayName ?? "").trim();
    const normalizedName = normalizeName(displayName);
    const phoneDigits = Array.from(new Set((input.phones ?? []).map(normalizePhone).filter((p) => p.length >= 6)));
    return {
        displayName,
        normalizedName,
        nameTokens: nameTokens(normalizedName),
        branchName: input.branchName ? normalizeName(input.branchName) : undefined,
        phoneDigits,
        websiteDomain: extractDomain(input.website),
        addressTokens: normalizeAddressTokens(input.address),
        postalCode: input.postalCode?.replace(/\s+/g, ""),
        lat: input.lat,
        lng: input.lng,
        providerPlaceId: input.providerPlaceId,
        merchantRegistrationId: input.merchantRegistrationId,
    };
}
