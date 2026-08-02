/**
 * Phase 1.11 Part A, C, D, E — kontrak pembetulan & laporan pengguna.
 *
 * PRINSIP TIDAK BOLEH DIRUNDING: laporan pengguna ialah CADANGAN, bukan fakta
 * yang disahkan. Tiada rekod di sini boleh menulis data kedai yang dipercayai
 * secara langsung, dan tiada penerbitan berlaku daripada penghantaran pengguna.
 *
 * ADDITIVE. Tidak diimport oleh functions/src/index.ts.
 */
import { EpochMillis } from "../common";

export const CORRECTION_SCHEMA_VERSION = "correction_schema_v1";
export const CORRECTION_ALGORITHM_VERSION = "correction_v1";

// ---------------------------------------------------------------------------
// Part A — jenis penghantaran
// ---------------------------------------------------------------------------

export const SUBMISSION_TYPES = [
  "correction",
  "safety_report",
  "closure_report",
  "moved_report",
  "duplicate_place_report",
  "inappropriate_content",
  "image_report",
  "menu_price_report",
  "hours_report",
  "contact_report",
  "location_report",
  "halal_evidence_report",
  "allergen_information_report",
  "general_report",
] as const;
export type SubmissionType = (typeof SUBMISSION_TYPES)[number];

export const REPORT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type ReportSeverity = (typeof REPORT_SEVERITIES)[number];

/** Mod sumber yang dilihat pengguna semasa melaporkan. */
export const REPORT_SOURCE_MODES = ["live", "approved_cache", "community", "sample"] as const;
export type ReportSourceMode = (typeof REPORT_SOURCE_MODES)[number];

// ---------------------------------------------------------------------------
// Part B — kategori laporan
// ---------------------------------------------------------------------------

export const REPORT_CATEGORIES = [
  "wrong_name",
  "wrong_address",
  "wrong_coordinates",
  "wrong_phone",
  "wrong_website",
  "wrong_hours",
  "wrong_price",
  "wrong_rating_source",
  "permanently_closed",
  "temporarily_closed",
  "moved_location",
  "duplicate_place",
  "wrong_cuisine",
  "wrong_place_type",
  "wrong_halal_status",
  "unsafe_halal_claim",
  "wrong_allergen_information",
  "unsafe_allergen_claim",
  "wrong_dietary_information",
  "wrong_image",
  "inappropriate_image",
  "spam_or_fake_place",
  "other",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

/** Medan yang boleh dicadangkan oleh pengguna (Part E). */
export const CORRECTABLE_FIELDS = [
  "displayName",
  "address",
  "coordinates",
  "phone",
  "website",
  "openingHours",
  "price",
  "businessStatus",
  "halalEvidence",
  "dietaryEvidence",
  "allergenEvidence",
  "cuisineTagIds",
  "placeTypeTagIds",
  "imageRemovalRequest",
  "duplicateTargetPlaceId",
  "movedToCoordinates",
  "notes",
] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

// ---------------------------------------------------------------------------
// Part C — bukti
// ---------------------------------------------------------------------------

export const EVIDENCE_TYPES = [
  "photo",
  "receipt",
  "menu_photo",
  "storefront_photo",
  "certificate_photo",
  "map_screenshot",
  "website_link",
  "official_document",
  "user_observation",
  "merchant_statement",
  "community_statement",
  "other",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const EVIDENCE_STATUSES = [
  "submitted",
  "pending_review",
  "accepted",
  "rejected",
  "insufficient",
  "expired",
  "superseded",
] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

/**
 * Metadata fail SAHAJA dalam fasa ini — tiada muat naik Storage produksi.
 * `exifStripped` mesti true sebelum apa-apa metadata boleh keluar ke UI awam.
 */
export interface EvidenceFileMetadata {
  fileName: string;
  mimeType: string;
  byteSize: number;
  checksum?: string;
  /** true = metadata EXIF sensitif telah dibuang. */
  exifStripped: boolean;
  /** Rujukan tempatan/emulator sahaja — BUKAN URL Storage produksi. */
  localReference?: string;
}

export interface PlaceReportEvidence {
  evidenceId: string;
  evidenceType: EvidenceType;
  /** Siapa membekalkan bukti (pelapor, merchant, komuniti, admin). */
  source: "reporter" | "merchant" | "community" | "admin" | "provider";
  sourceReference?: string;
  fileMetadata?: EvidenceFileMetadata;
  textNote?: string;
  observedAt?: EpochMillis;
  capturedAt?: EpochMillis;
  location?: { lat: number; lng: number };
  /** 0..1 — keyakinan yang DILAPORKAN, bukan disahkan. */
  confidence: number;
  status: EvidenceStatus;
  createdAt: EpochMillis;
}

// ---------------------------------------------------------------------------
// Part D — snapshot asal yang IMMUTABLE
// ---------------------------------------------------------------------------

/**
 * Apa yang pengguna LIHAT semasa melapor. Dibekukan pada masa penghantaran dan
 * TIDAK PERNAH dibaca semula atau ditulis ganti kemudian.
 */
export interface PlaceReportOriginalSnapshot {
  placeId: string;
  publicationId?: string;
  publicationVersion?: number;
  title: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  phone?: string;
  website?: string;
  hoursState: string;
  priceState: string;
  ratingState: string;
  businessState: string;
  halalState: string;
  dietaryState: string;
  allergenState: string;
  imageReferences: readonly string[];
  tagIds: readonly string[];
  warnings: readonly string[];
  sourceMode: ReportSourceMode;
  capturedAt: EpochMillis;
  contentHash: string;
}

// ---------------------------------------------------------------------------
// Part E — cadangan pembetulan
// ---------------------------------------------------------------------------

/**
 * Nilai yang DICADANGKAN pengguna. Semuanya kekal TIDAK DISAHKAN sehingga
 * seorang penyemak dipercayai membuat keputusan. Pengguna TIDAK boleh
 * menetapkan keadaan kelulusan, penerbitan atau pengesahan.
 */
export interface PlaceCorrectionProposal {
  displayName?: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  phone?: string;
  website?: string;
  openingHours?: string;
  price?: string;
  businessStatus?: string;
  halalEvidence?: string;
  dietaryEvidence?: readonly string[];
  allergenEvidence?: readonly string[];
  cuisineTagIds?: readonly string[];
  placeTypeTagIds?: readonly string[];
  imageRemovalRequest?: { imageReference: string; reason: string };
  duplicateTargetPlaceId?: string;
  movedToCoordinates?: { lat: number; lng: number };
  notes?: string;
}

// ---------------------------------------------------------------------------
// Part F — status penghantaran
// ---------------------------------------------------------------------------

export const SUBMISSION_STATUSES = [
  "draft",
  "submitted",
  "validation_failed",
  "queued",
  "under_review",
  "needs_more_evidence",
  "duplicate_report",
  "accepted_for_staging",
  "rejected",
  "withdrawn",
  "resolved",
  "superseded",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Status yang dianggap "terbuka" untuk tujuan dedup & had kadar. */
export const OPEN_SUBMISSION_STATUSES: readonly SubmissionStatus[] = [
  "submitted",
  "queued",
  "under_review",
  "needs_more_evidence",
];

// ---------------------------------------------------------------------------
// Part U — audit
// ---------------------------------------------------------------------------

export const CORRECTION_AUDIT_ACTIONS = [
  "draft_created",
  "submitted",
  "validation_failed",
  "queued",
  "assigned",
  "review_started",
  "evidence_added",
  "more_evidence_requested",
  "duplicate_detected",
  "duplicate_confirmed",
  "field_accepted",
  "field_rejected",
  "accepted_for_staging",
  "rejected",
  "withdrawn",
  "resolved",
  "reopened",
  "staging_reference_created",
] as const;
export type CorrectionAuditAction = (typeof CORRECTION_AUDIT_ACTIONS)[number];

export const AUDIT_ACTOR_TYPES = ["reporter", "trusted_reviewer", "system"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

/**
 * Entri audit append-only. Identiti pelaku DIPERCAYAI hanya boleh dibekalkan
 * oleh pelayan — klien tidak pernah menulis `trustedActorId`.
 */
export interface PlaceCorrectionAuditEntry {
  auditId: string;
  submissionId: string;
  action: CorrectionAuditAction;
  actorType: AuditActorType;
  /** Diisi HANYA untuk pelaku dipercayai (Admin SDK). */
  trustedActorId?: string;
  /** Diisi untuk tindakan pelapor sendiri. */
  reporterUid?: string;
  previousStatus?: SubmissionStatus;
  nextStatus?: SubmissionStatus;
  changedFields: readonly string[];
  reasonCode: string;
  createdAt: EpochMillis;
}

// ---------------------------------------------------------------------------
// Metadata klien (tiada data peribadi sensitif)
// ---------------------------------------------------------------------------

export interface ReportClientMetadata {
  appVersion: string;
  platform: "android" | "ios" | "web" | "test";
  locale: string;
  /** Mod paparan semasa laporan dibuat (kad kanonikal / legasi). */
  surface: "canonical_detail" | "legacy_detail" | "card" | "image_viewer" | "history";
}

// ---------------------------------------------------------------------------
// Part A — rekod penghantaran penuh
// ---------------------------------------------------------------------------

export interface PlaceCorrectionSubmission {
  submissionId: string;
  placeId: string;
  publicationId?: string;
  publicationVersion?: number;
  sourceMode: ReportSourceMode;
  /** UID pelapor — TIDAK PERNAH didedahkan kepada paparan awam. */
  submittedBy: string;
  submittedAt: EpochMillis;
  submissionType: SubmissionType;
  category: ReportCategory;
  affectedFields: readonly CorrectableField[];
  originalSnapshot: PlaceReportOriginalSnapshot;
  proposedValues: PlaceCorrectionProposal;
  evidence: readonly PlaceReportEvidence[];
  description: string;
  severity: ReportSeverity;
  status: SubmissionStatus;
  duplicateOfSubmissionId?: string;
  assignedReviewer?: string;
  reviewedBy?: string;
  reviewedAt?: EpochMillis;
  decision?: string;
  decisionReason?: string;
  auditTrail: readonly PlaceCorrectionAuditEntry[];
  clientMetadata: ReportClientMetadata;
  algorithmVersion: string;
  schemaVersion: string;
  /** Rujukan cadangan staging yang dicipta oleh keputusan diterima. */
  stagingProposalId?: string;
  /** Hash identiti dedup (Part H). */
  dedupKey: string;
}

/**
 * Medan yang TIDAK PERNAH boleh datang daripada klien. Digunakan oleh
 * pengesahan untuk menolak penghantaran yang cuba menetapkan keadaan
 * dipercayai.
 */
export const CLIENT_FORBIDDEN_SUBMISSION_FIELDS = [
  "assignedReviewer",
  "reviewedBy",
  "reviewedAt",
  "decision",
  "decisionReason",
  "stagingProposalId",
  "duplicateOfSubmissionId",
  "auditTrail",
] as const;

/** Status yang boleh ditetapkan sendiri oleh pelapor. */
export const CLIENT_SETTABLE_STATUSES: readonly SubmissionStatus[] = [
  "draft",
  "submitted",
  "withdrawn",
];
