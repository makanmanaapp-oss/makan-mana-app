/**
 * Phase 1.11 — fixtures ujian deterministik untuk pembetulan/laporan.
 * Data rekaan. Masa = pemalar T.
 */
import { hashCanonical } from "../../staging/hashing";
import { TrustedActor } from "../../staging/stagingAudit";
import type {
  PlaceCorrectionProposal,
  PlaceReportEvidence,
  PlaceReportOriginalSnapshot,
  ReportCategory,
  SubmissionType,
} from "../index";
import type { ClientSubmissionInput } from "../correctionValidation";

export const T = 1_800_000_000_000;
export const DAY = 86_400_000;

export const REPORTER = "user_reporter_mock_1";
export const OTHER_REPORTER = "user_reporter_mock_2";
export const REVIEWER: TrustedActor = { actorUid: "server_reviewer_1", actorRole: "admin" };
export const SAFETY_REVIEWER: TrustedActor = { actorUid: "server_safety_1", actorRole: "moderator" };

export function snapshot(
  overrides: Partial<PlaceReportOriginalSnapshot> = {},
): PlaceReportOriginalSnapshot {
  const base: Omit<PlaceReportOriginalSnapshot, "contentHash"> = {
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
    capturedAt: T,
    ...overrides,
  };
  return { ...base, contentHash: hashCanonical(base) } as PlaceReportOriginalSnapshot;
}

export function evidence(
  overrides: Partial<PlaceReportEvidence> = {},
): PlaceReportEvidence {
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
    observedAt: T - DAY,
    capturedAt: T - DAY,
    confidence: 0.7,
    status: "submitted",
    createdAt: T,
    ...overrides,
  };
}

export function submissionInput(
  overrides: Partial<ClientSubmissionInput> = {},
): ClientSubmissionInput {
  return {
    placeId: "PLACE-MOCK-0001",
    submissionType: "correction" as SubmissionType,
    category: "wrong_phone" as ReportCategory,
    affectedFields: ["phone"],
    originalSnapshot: snapshot(),
    proposedValues: { phone: "+60312349999" } as PlaceCorrectionProposal,
    evidence: [],
    description: "Nombor telefon yang dipaparkan sudah tidak digunakan lagi.",
    ...overrides,
  };
}

/** Laporan tutup kekal yang SAH (bukti + tarikh pemerhatian). */
export function closureInput(
  overrides: Partial<ClientSubmissionInput> = {},
): ClientSubmissionInput {
  return submissionInput({
    submissionType: "closure_report",
    category: "permanently_closed",
    affectedFields: ["businessStatus"],
    proposedValues: { businessStatus: "permanently_closed" },
    evidence: [evidence({ evidenceId: "ev_closure_1", observedAt: T - DAY })],
    description: "Kedai sudah tutup; papan tanda dibuka dan ruang kosong.",
    ...overrides,
  });
}

/** Laporan halal — TIDAK PERNAH boleh mensijilkan. */
export function halalInput(
  overrides: Partial<ClientSubmissionInput> = {},
): ClientSubmissionInput {
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
export function allergenInput(
  overrides: Partial<ClientSubmissionInput> = {},
): ClientSubmissionInput {
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

export function duplicateInput(
  overrides: Partial<ClientSubmissionInput> = {},
): ClientSubmissionInput {
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
