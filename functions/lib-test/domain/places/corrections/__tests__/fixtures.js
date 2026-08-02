"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SAFETY_REVIEWER = exports.REVIEWER = exports.OTHER_REPORTER = exports.REPORTER = exports.DAY = exports.T = void 0;
exports.snapshot = snapshot;
exports.evidence = evidence;
exports.submissionInput = submissionInput;
exports.closureInput = closureInput;
exports.halalInput = halalInput;
exports.allergenInput = allergenInput;
exports.duplicateInput = duplicateInput;
/**
 * Phase 1.11 — fixtures ujian deterministik untuk pembetulan/laporan.
 * Data rekaan. Masa = pemalar T.
 */
const hashing_1 = require("../../staging/hashing");
exports.T = 1_800_000_000_000;
exports.DAY = 86_400_000;
exports.REPORTER = "user_reporter_mock_1";
exports.OTHER_REPORTER = "user_reporter_mock_2";
exports.REVIEWER = { actorUid: "server_reviewer_1", actorRole: "admin" };
exports.SAFETY_REVIEWER = { actorUid: "server_safety_1", actorRole: "moderator" };
function snapshot(overrides = {}) {
    const base = {
        placeId: "PLACE-MOCK-0001",
        publicationId: "PUB-MOCK-0001-V1",
        publicationVersion: 1,
        title: "Warung Mock Satu",
        address: "1 Jalan Mock, Petaling Jaya",
        coordinates: { lat: 3.1189, lng: 101.6252 },
        phone: "+60312345678",
        website: "https://mock-1.example.test",
        hoursState: "hours_known",
        priceState: "price_verified",
        ratingState: "rating_shown",
        businessState: "operating",
        halalState: "halal_merchant_claimed",
        dietaryState: "dietary_unknown",
        allergenState: "allergen_unknown",
        imageReferences: ["MEDIA-MOCK-1"],
        tagIds: ["restaurant", "malay"],
        warnings: ["unknown_price"],
        sourceMode: "approved_cache",
        capturedAt: exports.T,
        ...overrides,
    };
    return { ...base, contentHash: (0, hashing_1.hashCanonical)(base) };
}
function evidence(overrides = {}) {
    return {
        evidenceId: "ev_mock_1",
        evidenceType: "storefront_photo",
        source: "reporter",
        fileMetadata: {
            fileName: "storefront.jpg",
            mimeType: "image/jpeg",
            byteSize: 120_000,
            exifStripped: true,
        },
        textNote: "Papan tanda kedai jelas kelihatan.",
        observedAt: exports.T - exports.DAY,
        capturedAt: exports.T - exports.DAY,
        confidence: 0.7,
        status: "submitted",
        createdAt: exports.T,
        ...overrides,
    };
}
function submissionInput(overrides = {}) {
    return {
        placeId: "PLACE-MOCK-0001",
        submissionType: "correction",
        category: "wrong_phone",
        affectedFields: ["phone"],
        originalSnapshot: snapshot(),
        proposedValues: { phone: "+60312349999" },
        evidence: [],
        description: "Nombor telefon yang dipaparkan sudah tidak digunakan lagi.",
        ...overrides,
    };
}
/** Laporan tutup kekal yang SAH (bukti + tarikh pemerhatian). */
function closureInput(overrides = {}) {
    return submissionInput({
        submissionType: "closure_report",
        category: "permanently_closed",
        affectedFields: ["businessStatus"],
        proposedValues: { businessStatus: "permanently_closed" },
        evidence: [evidence({ evidenceId: "ev_closure_1", observedAt: exports.T - exports.DAY })],
        description: "Kedai sudah tutup; papan tanda dibuka dan ruang kosong.",
        ...overrides,
    });
}
/** Laporan halal — TIDAK PERNAH boleh mensijilkan. */
function halalInput(overrides = {}) {
    return submissionInput({
        submissionType: "halal_evidence_report",
        category: "wrong_halal_status",
        affectedFields: ["halalEvidence"],
        proposedValues: { halalEvidence: "certified" },
        evidence: [evidence({ evidenceId: "ev_cert_1", evidenceType: "certificate_photo" })],
        description: "Sijil halal dipamerkan di kaunter kedai.",
        ...overrides,
    });
}
/** Laporan alergen — TIDAK PERNAH boleh menanda selamat. */
function allergenInput(overrides = {}) {
    return submissionInput({
        submissionType: "allergen_information_report",
        category: "wrong_allergen_information",
        affectedFields: ["allergenEvidence"],
        proposedValues: { allergenEvidence: ["peanuts"] },
        evidence: [evidence({ evidenceId: "ev_menu_1", evidenceType: "menu_photo" })],
        description: "Menu menyatakan hidangan mengandungi kacang tanah.",
        ...overrides,
    });
}
function duplicateInput(overrides = {}) {
    return submissionInput({
        submissionType: "duplicate_place_report",
        category: "duplicate_place",
        affectedFields: ["duplicateTargetPlaceId"],
        proposedValues: { duplicateTargetPlaceId: "PLACE-MOCK-0002" },
        evidence: [],
        description: "Kedai ini disenaraikan dua kali dengan nama yang sama.",
        ...overrides,
    });
}
