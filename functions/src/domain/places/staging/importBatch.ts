/** Phase 1.3 — kontrak batch import. */
import { EpochMillis } from "../common";
import { SourceType } from "../placeEnums";
import { BatchProcessingStatus } from "./stagingEnums";

/** Ringkasan pengesahan bagi satu batch. */
export interface BatchValidationSummary {
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  warningRecords: number;
  duplicateCandidateRecords: number;
}

/**
 * Rujukan storan selamat untuk payload mentah yang besar — payload besar TIDAK
 * disimpan dalam dokumen batch (guna rujukan Storage/koleksi terkawal).
 */
export interface SecureStorageRef {
  bucket?: string;
  path: string;
  contentHash: string;
  sizeBytes?: number;
}

export interface PlaceImportBatch {
  importBatchId: string;
  sourceType: SourceType;
  sourceName: string;
  sourceFileName?: string;
  sourceReference?: SecureStorageRef;
  importedBy: string;
  importedAt: EpochMillis;
  recordCount: number;
  processingStatus: BatchProcessingStatus;
  validationSummary: BatchValidationSummary;
  duplicateSummary?: { candidates: number; autoLinked: number };
  errorSummary?: { total: number; codes: Record<string, number> };
  metadata?: Record<string, unknown>;
  createdAt: EpochMillis;
  updatedAt: EpochMillis;
}
