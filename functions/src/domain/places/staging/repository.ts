/**
 * Phase 1.3 — antara muka repository staging (selamat).
 * TIADA operasi publish / promosi place_registry / merge canonical / hard delete.
 * Operasi delete hanya wujud sebagai utiliti pembersihan ujian (berasingan).
 */
import { EpochMillis } from "../common";
import { SourceType } from "../placeEnums";
import { PlaceImportBatch } from "./importBatch";
import { PlaceSourceSnapshot } from "./sourceSnapshot";
import { PlaceStagingRecord } from "./stagingRecord";
import { PlaceStagingAuditEntry, TrustedActor } from "./stagingAudit";
import { PlaceReviewDecision } from "./reviewDecision";
import { PlaceValidationResult } from "./validationResult";
import { StagingReviewStatus } from "./stagingEnums";

export const MAX_PAGE_LIMIT = 100;

export interface Pagination {
  limit: number;
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export interface StagingListFilter {
  reviewStatus?: StagingReviewStatus;
  sourceType?: SourceType;
  importBatchId?: string;
  assignedReviewer?: string;
}

export interface SnapshotMetadataCorrection {
  attribution?: string;
  licenseId?: string;
  termsMetadata?: Record<string, unknown>;
  expiresAt?: EpochMillis;
  normalizedPayloadHash?: string;
}

export interface PlaceImportBatchRepository {
  createBatch(batch: PlaceImportBatch): Promise<PlaceImportBatch>;
  getBatch(id: string): Promise<PlaceImportBatch | null>;
  updateBatchStatus(
    id: string,
    status: PlaceImportBatch["processingStatus"],
    patch?: Partial<PlaceImportBatch>,
  ): Promise<void>;
}

export interface PlaceSourceSnapshotRepository {
  /** Cipta immutable — gagal jika ID sudah wujud. */
  createSnapshot(snapshot: PlaceSourceSnapshot): Promise<PlaceSourceSnapshot>;
  getSnapshot(id: string): Promise<PlaceSourceSnapshot | null>;
  /** Pembetulan metadata terkawal SAHAJA (medan yang dibenarkan). */
  correctMetadata(id: string, patch: SnapshotMetadataCorrection): Promise<void>;
}

export interface PlaceStagingRepository {
  createStagingRecord(
    record: PlaceStagingRecord,
    actor: TrustedActor,
  ): Promise<PlaceStagingRecord>;
  getStagingRecord(id: string): Promise<PlaceStagingRecord | null>;
  listStagingRecords(
    filter: StagingListFilter,
    page: Pagination,
  ): Promise<Page<PlaceStagingRecord>>;
  /** Peralihan status DIKAWAL mesin keadaan. */
  transitionReviewStatus(
    id: string,
    to: StagingReviewStatus,
    actor: TrustedActor,
    reasonCode?: string,
  ): Promise<PlaceStagingRecord>;
  assignReviewer(
    id: string,
    reviewerUid: string,
    actor: TrustedActor,
  ): Promise<void>;
  recordReviewDecision(
    id: string,
    decision: PlaceReviewDecision,
    actor: TrustedActor,
  ): Promise<PlaceStagingRecord>;
  setValidationResult(
    id: string,
    result: PlaceValidationResult,
    actor: TrustedActor,
  ): Promise<void>;
}

export interface PlaceStagingAuditRepository {
  /** Append-only — tiada update/delete. */
  appendAudit(entry: PlaceStagingAuditEntry): Promise<PlaceStagingAuditEntry>;
  listAudit(stagingRecordId: string): Promise<PlaceStagingAuditEntry[]>;
}
