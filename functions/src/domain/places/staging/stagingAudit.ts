/** Phase 1.3 — entri audit staging (append-only). */
import { EpochMillis } from "../common";
import { StagingAuditAction, StagingReviewStatus } from "./stagingEnums";

/**
 * Entri audit. Sejarah audit MESTI append-only (repository tidak mendedahkan
 * update/delete). Identiti pelaku (actorUid/actorRole) MESTI dibekalkan
 * pelayan — TIDAK dipercayai daripada klien.
 */
export interface PlaceStagingAuditEntry {
  auditId: string;
  stagingRecordId: string;
  action: StagingAuditAction;
  actorUid: string;
  actorRole: string;
  previousState?: StagingReviewStatus;
  nextState?: StagingReviewStatus;
  changedFields: string[];
  reasonCode?: string;
  metadata?: Record<string, unknown>;
  createdAt: EpochMillis;
}

/** Konteks pelaku dipercayai (disuntik pelayan/Admin SDK). */
export interface TrustedActor {
  actorUid: string;
  actorRole: string;
}
