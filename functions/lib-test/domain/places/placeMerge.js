"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALIAS_TYPES = void 0;
/**
 * Jenis alias. `google_place_id` ialah kunci keserasian: placeId Google
 * semasa (dipakai favorites/meals/suggestions/deep-link) menjadi alias yang
 * menunjuk ke `canonicalPlaceId` — tiada rujukan pengguna pecah bila migrasi.
 */
exports.ALIAS_TYPES = [
    "google_place_id",
    "legacy_place_id",
    "provider_id",
    "former_name",
    "merged_from",
];
