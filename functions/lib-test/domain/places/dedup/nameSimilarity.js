"use strict";
/**
 * Phase 1.4 — persamaan nama deterministik (tiada AI/LLM, tiada dep besar).
 * Guna pekali Dice bigram aksara (teguh untuk variasi ejaan) + persamaan set
 * token sebagai rujukan. Kedua-dua 0..1, deterministik.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.nameSimilarity = nameSimilarity;
exports.tokenSetSimilarity = tokenSetSimilarity;
function bigrams(s) {
    const clean = s.replace(/\s+/g, " ").trim();
    const out = [];
    for (let i = 0; i < clean.length - 1; i++)
        out.push(clean.slice(i, i + 2));
    return out;
}
/** Pekali Dice pada bigram aksara nama ternormal. */
function nameSimilarity(a, b) {
    if (!a && !b)
        return 1;
    if (!a || !b)
        return 0;
    if (a === b)
        return 1;
    const ba = bigrams(a);
    const bb = bigrams(b);
    if (ba.length === 0 || bb.length === 0)
        return a === b ? 1 : 0;
    const counts = new Map();
    for (const g of ba)
        counts.set(g, (counts.get(g) ?? 0) + 1);
    let overlap = 0;
    for (const g of bb) {
        const c = counts.get(g) ?? 0;
        if (c > 0) {
            overlap++;
            counts.set(g, c - 1);
        }
    }
    return Math.round(((2 * overlap) / (ba.length + bb.length)) * 1000) / 1000;
}
/** Pekali Dice pada SET token (untuk isyarat alamat/token). */
function tokenSetSimilarity(a, b) {
    const sa = new Set(a.filter((t) => t.length > 0));
    const sb = new Set(b.filter((t) => t.length > 0));
    if (sa.size === 0 && sb.size === 0)
        return 1;
    if (sa.size === 0 || sb.size === 0)
        return 0;
    let inter = 0;
    for (const t of sa)
        if (sb.has(t))
            inter++;
    return Math.round(((2 * inter) / (sa.size + sb.size)) * 1000) / 1000;
}
