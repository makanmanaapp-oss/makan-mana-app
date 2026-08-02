/** Phase 1.6 — entri audit status kedai (append-only). */
import { EpochMillis } from "../common";
import { PlaceStatus, PublicationStatus, VerificationStatus } from "../placeEnums";
import { hashCanonical } from "../staging/hashing";

export const PLACE_STATUS_AUDIT_ACTIONS = [
  "business_status_changed",
  "verification_status_changed",
  "publication_status_changed",
  "publication_created",
  "publication_superseded",
  "publication_head_moved",
  "rollback_requested",
  "rollback_approved",
  "rollback_executed",
  "rollback_rejected",
] as const;
export type PlaceStatusAuditAction = (typeof PLACE_STATUS_AUDIT_ACTIONS)[number];

/**
 * Entri audit. Append-only — repository TIDAK mendedahkan update/delete.
 * `reasonCode` WAJIB untuk semua peralihan dipercayai (Part D).
 */
export interface PlaceStatusAuditEntry {
  auditId: string;
  placeId: string;
  action: PlaceStatusAuditAction;
  actorUid: string;
  actorRole: string;
  previousState?: PlaceStatus | VerificationStatus | PublicationStatus | string;
  nextState?: PlaceStatus | VerificationStatus | PublicationStatus | string;
  reasonCode: string;
  publicationId?: string;
  metadata?: Record<string, unknown>;
  createdAt: EpochMillis;
}

/** ID audit deterministik (elak pendua bagi peristiwa yang sama). */
export function statusAuditId(
  placeId: string,
  action: PlaceStatusAuditAction,
  createdAt: EpochMillis,
  discriminator?: string,
): string {
  const digest = hashCanonical({ placeId, action, createdAt, discriminator });
  return `aud_${digest.slice(0, 32)}`;
}
