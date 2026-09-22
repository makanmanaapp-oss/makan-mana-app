/**
 * WAVE 4A — tempat SEBENAR lawan tempat bukan-sebenar.
 *
 * Satu sumber kebenaran untuk soalan "bolehkah tempat ini dilayan sebagai
 * perniagaan sebenar?". Digunakan oleh pemarkahan, maklum balas, penggunaan
 * semula sesi dan otak AI supaya tiada satu laluan pun boleh terlepas.
 *
 * Dua keluarga ID bukan-sebenar wujud:
 *   - `dummy_`        restoran REKAAN legasi (dibuang daripada produksi dalam
 *                     gelombang ini; dokumen lama masih mengandunginya)
 *   - `qa_synthetic_` data ujian QA yang dilabel (QA sahaja, tidak pernah
 *                     produksi)
 *
 * Tulen: tiada I/O, tiada Firestore, tiada masa.
 */

/** Awalan ID restoran REKAAN legasi. */
export const FICTIONAL_PLACE_ID_PREFIX = "dummy_";

/** Awalan ID tempat sintetik QA (lihat `domain/security/qaSurfaces.ts`). */
export const QA_SYNTHETIC_PLACE_ID_PREFIX = "qa_synthetic_";

/**
 * Nilai `source` yang bermaksud "ini contoh, bukan cadangan langsung".
 * Sepadan dengan `PlaceSummary.isSample` pada klien dan penapis otak AI.
 */
export const SAMPLE_SOURCES: readonly string[] = [
  "mock_fallback",
  "demo_preview",
  "offline_fallback",
  "qa_synthetic",
  "dummy",
];

/** Restoran REKAAN legasi. */
export function isFictionalPlaceId(placeId: string | null | undefined): boolean {
  return typeof placeId === "string" && placeId.startsWith(FICTIONAL_PLACE_ID_PREFIX);
}

/** Tempat ujian sintetik QA. */
export function isQaSyntheticPlaceId(placeId: string | null | undefined): boolean {
  return typeof placeId === "string" && placeId.startsWith(QA_SYNTHETIC_PLACE_ID_PREFIX);
}

/**
 * Bolehkah tempat ini dilayan sebagai perniagaan sebenar — dinavigasi dalam
 * peta, disimpan sebagai makan, dipelajari sebagai citarasa?
 *
 * `false` untuk tempat rekaan DAN tempat sintetik QA. Kedua-duanya nyata
 * bukan perniagaan sebenar; hanya satu daripadanya pernah sampai ke produksi.
 */
export function isRealPlaceId(placeId: string | null | undefined): boolean {
  if (typeof placeId !== "string" || placeId.length === 0) return false;
  return !isFictionalPlaceId(placeId) && !isQaSyntheticPlaceId(placeId);
}

/** Bolehkah isyarat pada tempat ini melatih otak AI? */
export function isLearningEligiblePlaceId(placeId: string | null | undefined): boolean {
  return isRealPlaceId(placeId);
}

/**
 * Buang tempat bukan-sebenar daripada senarai calon.
 *
 * Pertahanan bacaan-masa: dokumen lama (sesi, cache, kolam kawasan) mungkin
 * masih mengandungi ID rekaan. Tiada dokumen dipadam atau ditulis semula.
 */
export function withoutFictionalPlaces<T extends {placeId: string}>(
  candidates: readonly T[] | null | undefined,
): T[] {
  return (candidates ?? []).filter((c) => !isFictionalPlaceId(c.placeId));
}
