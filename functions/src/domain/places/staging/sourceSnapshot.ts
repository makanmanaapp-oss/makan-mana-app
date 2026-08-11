/** Phase 1.3 — snapshot sumber tak-boleh-ubah (provenance peringkat rekod). */
import { EpochMillis } from "../common";
import { SourceType } from "../placeEnums";
import { SecureStorageRef } from "./importBatch";

/**
 * Snapshot sumber. IMMUTABLE selepas dicipta kecuali pembetulan metadata
 * terkawal. Satu snapshot TIDAK PERNAH mendakwa lebih daripada satu sourceType.
 * Payload mentah besar guna `rawPayloadRef` (Storage), bukan disimpan inline.
 * TIDAK PERNAH awam kepada klien mobile.
 */
export interface PlaceSourceSnapshot {
  snapshotId: string;
  importBatchId?: string;
  sourceType: SourceType;
  sourceRecordId: string;
  providerName?: string;
  providerPlaceId?: string;
  rawPayloadRef?: SecureStorageRef;
  /** Hash deterministik payload mentah (untuk idempotency/dedup sumber). */
  rawPayloadHash: string;
  normalizedPayloadHash?: string;
  fetchedAt?: EpochMillis;
  importedAt: EpochMillis;
  expiresAt?: EpochMillis;
  attribution?: string;
  licenseId?: string;
  termsMetadata?: Record<string, unknown>;
  createdBy: string;
  createdAt: EpochMillis;
}

/** Medan metadata yang DIBENARKAN diubah selepas cipta (pembetulan terkawal). */
export const SNAPSHOT_MUTABLE_METADATA_FIELDS = [
  "attribution",
  "licenseId",
  "termsMetadata",
  "expiresAt",
  "normalizedPayloadHash",
] as const;
export type SnapshotMutableField =
  (typeof SNAPSHOT_MUTABLE_METADATA_FIELDS)[number];
