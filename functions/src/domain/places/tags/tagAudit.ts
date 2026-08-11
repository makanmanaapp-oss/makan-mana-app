/** Phase 1.5 — audit tag (append-only). */
import { EpochMillis } from "../common";
import { EvidenceLevel } from "../placeEnums";
import { TagFamily } from "../placeTags";

export const TAG_AUDIT_ACTION = [
  "tag_proposed",
  "tag_normalized",
  "alias_resolved",
  "tag_approved",
  "tag_rejected",
  "tag_expired",
  "conflict_detected",
  "conflict_resolved",
  "tag_superseded",
  "tag_set_merged",
] as const;
export type TagAuditAction = (typeof TAG_AUDIT_ACTION)[number];

export interface PlaceTagAuditEntry {
  auditId: string;
  placeId: string;
  tagId?: string;
  familyId?: TagFamily;
  action: TagAuditAction;
  /** Pelaku dibekalkan pelayan — identiti klien TIDAK dipercayai. */
  actorUid: string;
  actorRole: string;
  previousState?: string;
  nextState?: string;
  evidenceLevel?: EvidenceLevel;
  confidence?: number;
  reasonCode?: string;
  sourceRecordId?: string;
  createdAt: EpochMillis;
}
