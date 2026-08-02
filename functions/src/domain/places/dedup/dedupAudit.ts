/** Phase 1.4 — audit merge/dedup (append-only). */
import { EpochMillis } from "../common";

export const MERGE_AUDIT_ACTION = [
  "duplicate_detected",
  "auto_linked",
  "review_requested",
  "confirmed_duplicate",
  "confirmed_separate",
  "confirmed_branch",
  "merge_plan_created",
  "merge_plan_approved",
  "merge_cancelled",
  "alias_created",
  "rollback_recorded",
] as const;
export type MergeAuditAction = (typeof MERGE_AUDIT_ACTION)[number];

export interface PlaceMergeAuditEntry {
  auditId: string;
  action: MergeAuditAction;
  /** Pelaku dibekalkan pelayan — identiti klien TIDAK dipercayai. */
  actorUid: string;
  actorRole: string;
  sourceIds: string[];
  targetId?: string;
  score?: number;
  decision?: string;
  configVersion: string;
  algorithmVersion: string;
  createdAt: EpochMillis;
}
