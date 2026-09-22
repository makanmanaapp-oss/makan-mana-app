/**
 * CADANGAN — TIDAK DIDAWAI — OWNER APPROVAL REQUIRED.
 *
 * WAVE 3F. Gantian yang jujur untuk sandaran `DUMMY_PLACES`.
 *
 * Hari ini `getNearbyPlaces` (Explore) dan `getSuggestions` (Home/Spin)
 * memulangkan `DUMMY_PLACES` — sepuluh restoran REKAAN dengan nama realistik,
 * beberapa dipasangkan dengan kawasan SEBENAR ("Jalan Gasing, PJ", "Medan
 * Selera SS2", "Sunway Geo Avenue") — apabila Places gagal, apabila kunci API
 * tiada, atau apabila kawasan tiada hasil. Pengguna sebenar melihatnya sebagai
 * kedai sebenar, dan `openPlaceInMaps` menghantar mereka ke carian Google Maps
 * bagi "nama rekaan + kawasan sebenar".
 *
 * Modul ini TIDAK diimport oleh mana-mana kod produksi (ujian menegaskannya).
 * Ia wujud supaya keputusan pemilik mempunyai kontrak yang boleh diuji, bukan
 * prosa. Mendawainya ialah perubahan tingkah laku produksi yang memerlukan
 * kelulusan dan pengesahan peranti.
 */

import type {PlaceCandidate} from "../../../types/place";

/** Hasil jujur carian tempat. Tiada varian yang memulangkan tempat rekaan. */
export type PlacesOutcome =
  | {status: "OK"; places: PlaceCandidate[]}
  | {status: "OK_EMPTY"; places: []; retryable: false}
  | {
      status: "PLACES_UNAVAILABLE";
      places: [];
      retryable: boolean;
      reason: "provider_error" | "not_configured";
    };

/**
 * Petakan keadaan pembekal kepada hasil yang jujur.
 *
 * - Calon sebenar            -> OK, diteruskan tanpa diubah.
 * - Pembekal berjaya, sifar  -> OK_EMPTY: kawasan ini benar-benar tiada hasil.
 * - Pembekal gagal           -> PLACES_UNAVAILABLE, boleh dicuba semula.
 * - Kunci tiada              -> PLACES_UNAVAILABLE, tidak boleh dicuba semula
 *                               (salah konfigurasi, bukan gangguan sementara).
 *
 * Tiada cabang yang mereka tempat. Calon yang ID-nya bermula `dummy_` ditapis
 * keluar sebagai pertahanan jika data lama masih mengalir melalui cache.
 */
export function truthfulPlacesOutcome(input: {
  apiKeyPresent: boolean;
  providerError?: boolean;
  candidates?: PlaceCandidate[] | null;
}): PlacesOutcome {
  if (!input.apiKeyPresent) {
    return {status: "PLACES_UNAVAILABLE", places: [], retryable: false, reason: "not_configured"};
  }
  if (input.providerError) {
    return {status: "PLACES_UNAVAILABLE", places: [], retryable: true, reason: "provider_error"};
  }
  const real = (input.candidates ?? []).filter((p) => !p.placeId.startsWith("dummy_"));
  if (real.length === 0) return {status: "OK_EMPTY", places: [], retryable: false};
  return {status: "OK", places: real};
}
