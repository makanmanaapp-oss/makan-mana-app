/**
 * Phase 1.6 Part I — KONTRAK ROLLBACK.
 *
 * Rollback TIDAK PERNAH memadam versi yang lebih baharu. Ia mencipta versi
 * AKTIF baharu (atau menukar penunjuk secara terkawal) sambil mengekalkan
 * SELURUH sejarah. Semua rollback meninggalkan jejak audit.
 */
import { EpochMillis } from "../common";

export const ROLLBACK_STATUSES = [
  "requested",
  "approved",
  "executed_in_emulator",
  "rejected",
  "cancelled",
  "failed",
] as const;
export type RollbackStatus = (typeof ROLLBACK_STATUSES)[number];

/** Sebab rollback kanonikal (bebas bahasa). */
export const ROLLBACK_REASON_CODES = [
  "incorrect_data_published",
  "safety_data_incorrect",
  "wrong_place_merged",
  "premature_publication",
  "expired_evidence_published",
  "admin_request",
] as const;
export type RollbackReasonCode = (typeof ROLLBACK_REASON_CODES)[number];

export interface RollbackAuditEntry {
  auditId: string;
  rollbackId: string;
  action: string;
  actorUid: string;
  actorRole: string;
  previousStatus?: RollbackStatus;
  nextStatus?: RollbackStatus;
  notes?: string;
  createdAt: EpochMillis;
}

export interface PlacePublicationRollback {
  rollbackId: string;
  placeId: string;
  /** Versi yang sedang aktif ketika rollback diminta. */
  fromPublicationId: string;
  /** Versi lama yang hendak dipulihkan. */
  targetPublicationId: string;
  requestedBy: string;
  approvedBy?: string;
  reasonCode: RollbackReasonCode;
  notes?: string;
  requestedAt: EpochMillis;
  executedAt?: EpochMillis;
  status: RollbackStatus;
  auditEntries: RollbackAuditEntry[];
  /** Versi BAHARU yang dihasilkan oleh pelaksanaan rollback (bukan padam). */
  resultingPublicationId?: string;
}

/** Peralihan status rollback yang dibenarkan. */
const ROLLBACK_ALLOWED: Record<RollbackStatus, RollbackStatus[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["executed_in_emulator", "failed", "cancelled"],
  executed_in_emulator: [],
  rejected: [],
  cancelled: [],
  failed: ["approved", "cancelled"],
};

export function canTransitionRollbackStatus(
  from: RollbackStatus,
  to: RollbackStatus,
): boolean {
  if (from === to) return false;
  return (ROLLBACK_ALLOWED[from] ?? []).includes(to);
}

export function assertValidRollbackTransition(
  from: RollbackStatus,
  to: RollbackStatus,
): void {
  if (!canTransitionRollbackStatus(from, to)) {
    throw new Error(`invalid rollback transition: ${from} -> ${to}`);
  }
}

/** Rollback yang telah dilaksanakan ialah TERMINAL (idempoten pada ulangan). */
export function isRollbackTerminal(status: RollbackStatus): boolean {
  return (
    status === "executed_in_emulator" || status === "rejected" || status === "cancelled"
  );
}
