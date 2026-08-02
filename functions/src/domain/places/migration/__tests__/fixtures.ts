/**
 * Phase 1.12 — fixture ujian migrasi.
 *
 * Semua data adalah rekaan. Masa disuntik (tiada Date.now()) supaya setiap
 * ujian deterministik.
 */
import { LegacyRecordInput, LegacyReferencePointer } from "../legacyInventory";

/** Titik masa tetap: 2026-01-05T00:00:00Z. */
export const T = 1767571200000;
export const DAY = 86400000;

export const pointer = (
  kind: LegacyReferencePointer["kind"],
  path: string,
  fieldPath = "placeId",
): LegacyReferencePointer => ({ kind, path, fieldPath });

/** Rekod legasi lengkap dan boleh dimigrasi. */
export function legacyRecord(
  overrides: Partial<LegacyRecordInput> = {},
): LegacyRecordInput {
  return {
    legacyCollection: "place_details",
    legacyDocumentPath: "place_details/ChIJ_mock_alpha",
    legacyPlaceId: "ChIJ_mock_alpha",
    providerPlaceId: "ChIJ_mock_alpha",
    displayName: "Nasi Kandar Semarak",
    address: "Lot 12, Jalan Ampang, 50450 Kuala Lumpur",
    lat: 3.1595,
    lng: 101.7123,
    phone: "+60 3-2161 0000",
    website: "https://semarak.example.test",
    rating: 4.3,
    reviewCount: 512,
    priceEstimate: "RM10-RM15",
    isOpen: true,
    source: "google_places",
    firstSeenAt: T - 30 * DAY,
    lastSeenAt: T,
    referencedBy: [],
    ...overrides,
  };
}

/** Rekod tanpa ID pembekal DAN tanpa koordinat — hanya nama. */
export function nameOnlyRecord(
  overrides: Partial<LegacyRecordInput> = {},
): LegacyRecordInput {
  return legacyRecord({
    legacyDocumentPath: "places_cache/name_only_beta",
    legacyPlaceId: "legacy_name_only_beta",
    legacyCollection: "places_cache",
    providerPlaceId: undefined,
    lat: undefined,
    lng: undefined,
    displayName: "Warung Tepi Sawah",
    ...overrides,
  });
}

/** Dua cawangan jenama yang sama, jauh berasingan. */
export function branchRecords(): LegacyRecordInput[] {
  return [
    legacyRecord({
      legacyDocumentPath: "place_details/ChIJ_ali_shah_alam",
      legacyPlaceId: "ChIJ_ali_shah_alam",
      providerPlaceId: "ChIJ_ali_shah_alam",
      displayName: "Restoran Ali",
      address: "Seksyen 7, Shah Alam",
      lat: 3.0733,
      lng: 101.5185,
      phone: "+60 3-5511 1111",
    }),
    legacyRecord({
      legacyDocumentPath: "place_details/ChIJ_ali_bangi",
      legacyPlaceId: "ChIJ_ali_bangi",
      providerPlaceId: "ChIJ_ali_bangi",
      displayName: "Restoran Ali",
      address: "Seksyen 9, Bandar Baru Bangi",
      lat: 2.9679,
      lng: 101.7654,
      phone: "+60 3-8922 2222",
    }),
  ];
}

/** Rekod dengan rujukan kritikal (favorites, meals, deep link). */
export function referencedRecord(): LegacyRecordInput {
  return legacyRecord({
    legacyDocumentPath: "place_details/ChIJ_mock_referenced",
    legacyPlaceId: "ChIJ_mock_referenced",
    providerPlaceId: "ChIJ_mock_referenced",
    displayName: "Kopitiam Sri Muda",
    referencedBy: [
      pointer("favorite", "users/user_a/favorites/ChIJ_mock_referenced"),
      pointer("favorite", "users/user_b/favorites/ChIJ_mock_referenced"),
      pointer("meal", "users/user_a/meals/meal_1"),
      pointer("history", "users/user_a/history/h_1"),
      pointer("suggestion", "users/user_a/suggestions/s_1"),
      pointer("session", "suggestion_sessions/sess_1"),
      pointer("deep_link", "deep_links/dl_1"),
      pointer("correction", "place_correction_submissions/MM-RPT-000001"),
    ],
  });
}
