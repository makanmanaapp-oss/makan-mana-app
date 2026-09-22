/**
 * WAVE 4A — hasil carian tempat yang JUJUR. DIDAWAI (kelulusan pemilik).
 *
 * Sehingga Wave 3F, `getNearbyPlaces` dan `getSuggestions` memulangkan
 * `DUMMY_PLACES` — sepuluh restoran REKAAN dengan nama realistik, beberapa
 * dipasangkan dengan kawasan Malaysia SEBENAR — apabila Places gagal, apabila
 * kunci API tiada, atau apabila kawasan tiada hasil. Pengguna melihatnya
 * sebagai kedai sebenar.
 *
 * Modul ini menggantikannya dengan tiga hasil yang boleh dibezakan. Tiada
 * cabang mereka tempat.
 *
 * Asalnya `domain/places/proposals/truthfulPlacesOutcome.ts` (Wave 3F, tidak
 * didawai); didawai di sini selepas kelulusan pemilik Wave 4A.
 */

import {isFictionalPlaceId} from "./realPlaceIdentity";
import type {PlaceCandidate} from "../../types/place";

/** Sebab pembekal tempat tidak boleh dilayan. */
export type PlacesUnavailableReason = "provider_error" | "not_configured";

/** Status protokol wayar. Klien lama yang hanya membaca `places` kekal selamat. */
export const PLACES_STATUS_OK = "OK";
export const PLACES_STATUS_EMPTY = "OK_EMPTY";
export const PLACES_STATUS_UNAVAILABLE = "PLACES_UNAVAILABLE";

/** Hasil jujur carian tempat. Tiada varian yang memulangkan tempat rekaan. */
export type PlacesOutcome =
  | {status: typeof PLACES_STATUS_OK; places: PlaceCandidate[]}
  | {status: typeof PLACES_STATUS_EMPTY; places: []; retryable: false}
  | {
      status: typeof PLACES_STATUS_UNAVAILABLE;
      places: [];
      retryable: boolean;
      reason: PlacesUnavailableReason;
    };

/**
 * Petakan keadaan pembekal kepada hasil yang jujur.
 *
 * - Calon sebenar            -> OK, diteruskan tanpa diubah.
 * - Pembekal berjaya, sifar  -> OK_EMPTY: kawasan ini benar-benar tiada hasil.
 *                               BUKAN gangguan perkhidmatan.
 * - Pembekal gagal (termasuk had masa) -> PLACES_UNAVAILABLE, boleh dicuba
 *                               semula. BUKAN "tiada hasil".
 * - Kunci tiada              -> PLACES_UNAVAILABLE, tidak boleh dicuba semula
 *                               (salah konfigurasi, bukan gangguan sementara).
 *
 * Calon yang ID-nya rekaan ditapis keluar sebagai pertahanan jika data lama
 * masih mengalir melalui cache atau kolam kawasan yang berterusan.
 */
export function truthfulPlacesOutcome(input: {
  apiKeyPresent: boolean;
  providerError?: boolean;
  candidates?: readonly PlaceCandidate[] | null;
}): PlacesOutcome {
  if (!input.apiKeyPresent) {
    return {
      status: PLACES_STATUS_UNAVAILABLE,
      places: [],
      retryable: false,
      reason: "not_configured",
    };
  }
  if (input.providerError) {
    return {
      status: PLACES_STATUS_UNAVAILABLE,
      places: [],
      retryable: true,
      reason: "provider_error",
    };
  }
  const real = (input.candidates ?? []).filter((p) => !isFictionalPlaceId(p.placeId));
  if (real.length === 0) return {status: PLACES_STATUS_EMPTY, places: [], retryable: false};
  return {status: PLACES_STATUS_OK, places: [...real]};
}

/**
 * Medan respons yang diagihkan kepada klien untuk hasil bukan-OK.
 *
 * Diagnostik cukup untuk klien memilih antara "tiada hasil" dan "cuba lagi",
 * dan tidak lebih — tiada nama kunci, tiada butiran rahsia, tiada mesej ralat
 * pembekal mentah.
 */
export function placesOutcomeWireFields(outcome: PlacesOutcome): {
  status: string;
  places: PlaceCandidate[];
  retryable?: boolean;
  reason?: PlacesUnavailableReason;
} {
  if (outcome.status === PLACES_STATUS_OK) {
    return {status: outcome.status, places: outcome.places};
  }
  if (outcome.status === PLACES_STATUS_EMPTY) {
    return {status: outcome.status, places: [], retryable: false};
  }
  return {
    status: outcome.status,
    places: [],
    retryable: outcome.retryable,
    reason: outcome.reason,
  };
}
