/**
 * Wave 3C corrective — PURE feed-post moderation contract.
 *
 * Firestore `feed_posts/{postId}` is authoritative. Moderation is a SOFT state
 * change that stays compatible with existing app semantics:
 *
 *   active   → status "active"   (WAVE 3C: every new post is BORN active; see
 *                                 postLifecycle.ts. firestore.rules now requires
 *                                 exactly "active" for a non-author read, so an
 *                                 absent status is no longer a readable state.)
 *   hidden   → status "hidden"   (already treated as non-public by rules/readers)
 *   deleted  → status "deleted"  (already suppressed by existing clients)
 *
 * `currentPostStatus` below still treats an ABSENT status as active. That is
 * deliberate and is NOT the consumer contract: a moderator must remain able to
 * hide a legacy document that the backfill has not normalized yet. Moderation
 * fails OPEN so the moderator keeps control; consumer reads fail CLOSED.
 *
 * FIELD OWNERSHIP (critical):
 *   `deletedAt`  is written ONLY by the user self-delete path (deleteUserPost).
 *   `moderationRemovedAt` / `hiddenAt` / `moderationAction` are written ONLY by
 *   moderation. This separation is what lets restore prove *who* caused the
 *   current non-public state.
 *
 * A post is NEVER hard-deleted here.
 */

export const POST_MODERATION_ACTIONS = ["hide", "remove", "restore"] as const;
export type PostModerationAction = (typeof POST_MODERATION_ACTIONS)[number];

export const POST_STATUS_ACTIVE = "active";
export const POST_STATUS_HIDDEN = "hidden";
export const POST_STATUS_DELETED = "deleted";
export const POST_STATUSES = [POST_STATUS_ACTIVE, POST_STATUS_HIDDEN, POST_STATUS_DELETED] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Fields a moderation command may write. Nothing else may ever be touched. */
export const POST_MODERATION_WRITABLE_FIELDS = [
  "status",
  "moderationAction",
  "moderationRequestId",
  "moderationReason",
  "moderatedAt",
  "hiddenAt",
  "moderationRemovedAt",
  "updatedAt",
] as const;

/**
 * Identity/content fields moderation must never change. `deletedAt` is included
 * deliberately: it belongs to the user self-delete path and moderation must not
 * write or clear it.
 */
export const POST_IMMUTABLE_FIELDS = [
  "authorUid", "authorType", "restaurantId", "canonicalPlaceId",
  "displayName", "username", "photoUrl", "avatarPreset",
  "text", "imageUrl", "imageUrls", "mediaCount",
  "placeId", "placeName", "groupId", "visibility", "postType", "type",
  "createdAt", "deletedAt", "likeCount", "likedBy", "commentCount",
] as const;

export function isPostModerationAction(value: unknown): value is PostModerationAction {
  return typeof value === "string" && (POST_MODERATION_ACTIONS as readonly string[]).includes(value);
}

/** Absent status means active (matches firestore.rules get('status','active')). */
export function currentPostStatus(stored: Record<string, unknown>): PostStatus | null {
  const raw = stored.status;
  if (raw === undefined || raw === null || raw === "") return POST_STATUS_ACTIVE;
  return typeof raw === "string" && (POST_STATUSES as readonly string[]).includes(raw)
    ? raw as PostStatus
    : null; // unknown status → fail closed
}

export function targetStatusForPost(action: PostModerationAction): PostStatus {
  if (action === "hide") return POST_STATUS_HIDDEN;
  if (action === "remove") return POST_STATUS_DELETED;
  return POST_STATUS_ACTIVE;
}

export type PostModerationDecision =
  | {ok: true; action: PostModerationAction; from: PostStatus; to: PostStatus; changed: boolean}
  | {
      ok: false;
      error: "unknown_action" | "post_missing" | "invalid_status"
        | "transition_not_allowed" | "restore_not_moderated";
    };

/**
 * Was the CURRENT non-public state caused by Control Center moderation?
 *
 * The marker must MATCH the current status, so a stale marker cannot be reused:
 *   hidden  requires moderationAction === "hide"
 *   deleted requires moderationAction === "remove" AND no user `deletedAt`
 *
 * If `deletedAt` exists the user deleted the post themselves (the only writer of
 * that field), so restore is refused even if a moderation marker is also present.
 */
export function isModerationCausedState(status: PostStatus, stored: Record<string, unknown>): boolean {
  const marker = typeof stored.moderationAction === "string" ? stored.moderationAction : null;
  if (status === POST_STATUS_HIDDEN) return marker === "hide";
  if (status === POST_STATUS_DELETED) {
    const userDeleted = stored.deletedAt !== undefined && stored.deletedAt !== null;
    return marker === "remove" && !userDeleted;
  }
  return false;
}

/**
 * Explicit transitions:
 *   active  -> hidden | deleted
 *   hidden  -> deleted | active(restore, moderation-caused only)
 *   deleted -> active(restore, moderation-caused only)
 *   deleted -> hidden  REJECTED (must be restored first)
 *   user-self-deleted -> restore REJECTED
 */
export function decidePostModeration(
  action: unknown,
  storedPost: Record<string, unknown> | null | undefined,
): PostModerationDecision {
  if (!isPostModerationAction(action)) return {ok: false, error: "unknown_action"};
  if (!storedPost) return {ok: false, error: "post_missing"};

  const from = currentPostStatus(storedPost);
  if (!from) return {ok: false, error: "invalid_status"};

  if (action === "hide" && from === POST_STATUS_DELETED) {
    return {ok: false, error: "transition_not_allowed"};
  }

  if (action === "restore" && from !== POST_STATUS_ACTIVE && !isModerationCausedState(from, storedPost)) {
    // e.g. a post the USER deleted themselves must never be resurrected.
    return {ok: false, error: "restore_not_moderated"};
  }

  const to = targetStatusForPost(action);
  return {ok: true, action, from, to, changed: from !== to};
}

export interface PostModerationUpdate {
  status: PostStatus;
  moderationAction: PostModerationAction;
  moderationReason: string;
  moderationRequestId: string;
  [key: string]: unknown;
}

/**
 * Build the moderation update. Only POST_MODERATION_WRITABLE_FIELDS are produced;
 * timestamp tokens are injected so this stays pure. Restore clears only the
 * moderation-owned visibility/removal markers and keeps the audit trail
 * (action/reason/requestId/moderatedAt). `deletedAt` is never written.
 */
export function buildPostModerationUpdate(params: {
  action: PostModerationAction;
  to: PostStatus;
  reason: string;
  requestId: string;
  serverTimestamp: unknown;
}): PostModerationUpdate {
  const update: PostModerationUpdate = {
    status: params.to,
    moderationAction: params.action,
    moderationReason: params.reason.trim().slice(0, 500),
    moderationRequestId: params.requestId,
    moderatedAt: params.serverTimestamp,
    updatedAt: params.serverTimestamp,
  };
  if (params.to === POST_STATUS_HIDDEN) update.hiddenAt = params.serverTimestamp;
  if (params.to === POST_STATUS_DELETED) update.moderationRemovedAt = params.serverTimestamp;
  if (params.to === POST_STATUS_ACTIVE) {
    // moderation-owned visibility markers no longer apply
    update.hiddenAt = null;
    update.moderationRemovedAt = null;
  }
  return update;
}

export function postUpdateTouchesOnlyModerationFields(update: Record<string, unknown>): boolean {
  const allowed = new Set<string>(POST_MODERATION_WRITABLE_FIELDS);
  return Object.keys(update).every((key) => allowed.has(key));
}
