/**
 * Wave 3C corrective — PURE helpers for the event-driven Firebase → Control
 * Center mirror.
 *
 * Event delivery is AT-LEAST-ONCE, so the mirror event id must be derived
 * deterministically from the Firebase event id: a redelivery of the same event
 * produces the same eventId and the migration 0038 receipt contract then treats
 * it as a duplicate (identical payload) or fails closed (conflicting payload).
 */
import {createHash} from "node:crypto";

import {AUTHOR_TYPE_RESTAURANT} from "./identity";
import {RESTAURANT_POST_TYPE} from "../feed/postTypes";
import type {MenuCommentMirrorRecord, SocialPostMirrorRecord} from "./mirrorPayload";

export type MirrorEntityType = "social_post" | "menu_comment";

/**
 * Relevance gate for the feed_posts trigger. ONLY restaurant posts are mirrored —
 * this must never become a broad ordinary-user-feed mirror.
 */
export function isRestaurantPostDocument(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  return data.postType === RESTAURANT_POST_TYPE || data.authorType === AUTHOR_TYPE_RESTAURANT;
}

/**
 * Deterministic, collision-resistant mirror event id.
 *
 * The EXACT raw Firebase event id is hashed with SHA-256 (node:crypto only, no
 * package) and namespaced by entity type:
 *
 *     `${entityType}-event-${sha256hex(rawEventId)}`
 *
 * Hashing the exact raw value means no character stripping and no prefix
 * truncation can ever collapse two different event ids onto one mirror event id,
 * and a redelivery of the same event always produces the same result. Output is
 * lowercase hex → receipt-safe alphabet, and at most 64 + 20 = 84 chars, well
 * inside the 240-character receipt limit.
 *
 * FAIL CLOSED: a missing/blank event id returns null (never a time-based
 * fallback), so the caller must reject rather than mirror under a bogus id.
 */
export function mirrorEventId(entityType: MirrorEntityType, firebaseEventId: unknown): string | null {
  if (typeof firebaseEventId !== "string") return null;
  const raw = firebaseEventId.trim();
  if (raw.length === 0) return null;
  const digest = createHash("sha256").update(raw, "utf8").digest("hex");
  return `${entityType}-event-${digest}`;
}

/**
 * Fail-safe tombstone for an UNEXPECTED hard delete.
 *
 * Both domains are soft-delete by contract (moderation only moves status and
 * never deletes), so this does not invent hard-delete semantics: it reuses the
 * fields the 0038 mirror schema already has — moderation_status "removed" plus
 * removed_at — so the Control Center stops showing the row as live.
 */
export function tombstoneSocialPostRecord(
  record: SocialPostMirrorRecord,
  removedAtIso: string,
): SocialPostMirrorRecord {
  return {...record, moderation_status: "removed", removed_at: record.removed_at ?? removedAtIso};
}

export function tombstoneMenuCommentRecord(
  record: MenuCommentMirrorRecord,
  removedAtIso: string,
): MenuCommentMirrorRecord {
  return {...record, moderation_status: "removed", removed_at: record.removed_at ?? removedAtIso};
}
