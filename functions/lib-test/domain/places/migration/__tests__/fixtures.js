"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pointer = exports.DAY = exports.T = void 0;
exports.legacyRecord = legacyRecord;
exports.nameOnlyRecord = nameOnlyRecord;
exports.branchRecords = branchRecords;
exports.referencedRecord = referencedRecord;
/** Titik masa tetap: 2026-01-05T00:00:00Z. */
exports.T = 1767571200000;
exports.DAY = 86400000;
const pointer = (kind, path, fieldPath = "placeId") => ({ kind, path, fieldPath });
exports.pointer = pointer;
/** Rekod legasi lengkap dan boleh dimigrasi. */
function legacyRecord(overrides = {}) {
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
        firstSeenAt: exports.T - 30 * exports.DAY,
        lastSeenAt: exports.T,
        referencedBy: [],
        ...overrides,
    };
}
/** Rekod tanpa ID pembekal DAN tanpa koordinat — hanya nama. */
function nameOnlyRecord(overrides = {}) {
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
function branchRecords() {
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
function referencedRecord() {
    return legacyRecord({
        legacyDocumentPath: "place_details/ChIJ_mock_referenced",
        legacyPlaceId: "ChIJ_mock_referenced",
        providerPlaceId: "ChIJ_mock_referenced",
        displayName: "Kopitiam Sri Muda",
        referencedBy: [
            (0, exports.pointer)("favorite", "users/user_a/favorites/ChIJ_mock_referenced"),
            (0, exports.pointer)("favorite", "users/user_b/favorites/ChIJ_mock_referenced"),
            (0, exports.pointer)("meal", "users/user_a/meals/meal_1"),
            (0, exports.pointer)("history", "users/user_a/history/h_1"),
            (0, exports.pointer)("suggestion", "users/user_a/suggestions/s_1"),
            (0, exports.pointer)("session", "suggestion_sessions/sess_1"),
            (0, exports.pointer)("deep_link", "deep_links/dl_1"),
            (0, exports.pointer)("correction", "place_correction_submissions/MM-RPT-000001"),
        ],
    });
}
