"use strict";
/**
 * Phase 1.4 — resolusi alias → canonical (terbatas & selamat).
 * Melindungi favorites/meals/suggestions/deep-link daripada pecah bila ID
 * bermigrasi kelak: placeId Google lama menjadi alias ke canonical.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ALIAS_HOPS = void 0;
exports.resolveCanonicalPlaceId = resolveCanonicalPlaceId;
exports.MAX_ALIAS_HOPS = 16;
/**
 * `aliasMap`: alias → sasaran (hop seterusnya atau canonical). Peraturan:
 * - ID canonical semasa (nilai sasaran, bukan kunci) pulang dirinya.
 * - alias legasi diselesaikan ke canonical (rantaian terbatas).
 * - alias bulat gagal selamat (tiada gelung tak terhingga).
 * - alias tidak diketahui pulang not_found eksplisit.
 */
function resolveCanonicalPlaceId(aliasId, aliasMap, maxHops = exports.MAX_ALIAS_HOPS) {
    if (!aliasMap.has(aliasId)) {
        const values = new Set(aliasMap.values());
        if (values.has(aliasId)) {
            return { status: "resolved", canonicalPlaceId: aliasId, hops: 0 };
        }
        return { status: "not_found", hops: 0 };
    }
    const visited = new Set();
    let current = aliasId;
    let hops = 0;
    while (aliasMap.has(current)) {
        if (visited.has(current))
            return { status: "circular", hops };
        visited.add(current);
        current = aliasMap.get(current);
        hops++;
        if (hops > maxHops)
            return { status: "circular", hops };
    }
    return { status: "resolved", canonicalPlaceId: current, hops };
}
