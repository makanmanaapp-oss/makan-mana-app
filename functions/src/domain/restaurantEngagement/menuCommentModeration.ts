/**
 * Wave 3C — PURE menu-comment moderation contract.
 *
 * Firestore `menu_comments/{commentId}` is authoritative. A Control Center
 * moderation command may only move the comment between explicit states and may
 * only touch moderation fields — identity/content fields are immutable and
 * comments are NEVER hard-deleted.
 */

export const MENU_COMMENT_MODERATION_ACTIONS = ["hide", "remove", "restore"] as const;
export type MenuCommentModerationAction = (typeof MENU_COMMENT_MODERATION_ACTIONS)[number];

export const MENU_COMMENT_STATUSES = ["visible", "hidden", "removed"] as const;
export type MenuCommentStatus = (typeof MENU_COMMENT_STATUSES)[number];

/** Fields a moderation command may write. Nothing else may ever be touched. */
export const MENU_COMMENT_MODERATION_WRITABLE_FIELDS = [
  "status",
  "moderationReason",
  "moderationRequestId",
  "moderatedAt",
  "hiddenAt",
  "removedAt",
  "updatedAt",
] as const;

/** Identity/content fields that must never change through moderation. */
export const MENU_COMMENT_IMMUTABLE_FIELDS = [
  "canonicalPlaceId",
  "menuItemId",
  "authorType",
  "authorUid",
  "restaurantId",
  "parentCommentId",
  "text",
  "displayNameSnapshot",
  "createdAt",
] as const;

export function isMenuCommentModerationAction(value: unknown): value is MenuCommentModerationAction {
  return typeof value === "string"
    && (MENU_COMMENT_MODERATION_ACTIONS as readonly string[]).includes(value);
}

function normalizeStatus(value: unknown): MenuCommentStatus | null {
  return typeof value === "string" && (MENU_COMMENT_STATUSES as readonly string[]).includes(value)
    ? value as MenuCommentStatus
    : null;
}

/**
 * Explicit allowed transitions:
 *   visible -> hidden | removed
 *   hidden  -> visible (restore) | removed
 *   removed -> visible (restore) — the existing social model already supports
 *              restore, and removal here is soft (never a hard delete).
 * Re-applying the state a comment is already in is a no-op success (idempotent).
 */
const ALLOWED: Record<MenuCommentStatus, Record<MenuCommentModerationAction, boolean>> = {
  visible: {hide: true, remove: true, restore: true},
  hidden: {hide: true, remove: true, restore: true},
  removed: {hide: false, remove: true, restore: true},
};

export function targetStatusFor(action: MenuCommentModerationAction): MenuCommentStatus {
  if (action === "hide") return "hidden";
  if (action === "remove") return "removed";
  return "visible";
}

export type ModerationDecision =
  | {ok: true; action: MenuCommentModerationAction; from: MenuCommentStatus; to: MenuCommentStatus; changed: boolean}
  | {ok: false; error: "unknown_action" | "comment_missing" | "invalid_status" | "transition_not_allowed"};

/**
 * Decide a moderation transition from the CURRENT stored document.
 * Fail-closed: unknown action, missing document, or unknown stored status reject.
 */
export function decideMenuCommentModeration(
  action: unknown,
  storedComment: Record<string, unknown> | null | undefined,
): ModerationDecision {
  if (!isMenuCommentModerationAction(action)) return {ok: false, error: "unknown_action"};
  if (!storedComment) return {ok: false, error: "comment_missing"};

  const from = normalizeStatus(storedComment.status);
  if (!from) return {ok: false, error: "invalid_status"};

  if (!ALLOWED[from][action]) return {ok: false, error: "transition_not_allowed"};

  const to = targetStatusFor(action);
  return {ok: true, action, from, to, changed: from !== to};
}

export interface MenuCommentModerationUpdate {
  status: MenuCommentStatus;
  moderationReason: string;
  moderationRequestId: string;
  [key: string]: unknown;
}

/**
 * Build the moderation update. Only fields in
 * MENU_COMMENT_MODERATION_WRITABLE_FIELDS are ever produced; timestamp tokens are
 * injected by the caller so this stays pure.
 */
export function buildMenuCommentModerationUpdate(params: {
  to: MenuCommentStatus;
  reason: string;
  requestId: string;
  serverTimestamp: unknown;
}): MenuCommentModerationUpdate {
  // `hiddenAt` / `removedAt` are CURRENT-STATE markers, never history: exactly
  // one may be set and the other is always cleared, so a stale marker can never
  // survive a transition. The historical trail lives in moderationReason /
  // moderationRequestId / moderatedAt and the server event log.
  const update: MenuCommentModerationUpdate = {
    status: params.to,
    moderationReason: params.reason.trim().slice(0, 500),
    moderationRequestId: params.requestId,
    moderatedAt: params.serverTimestamp,
    updatedAt: params.serverTimestamp,
    hiddenAt: params.to === "hidden" ? params.serverTimestamp : null,
    removedAt: params.to === "removed" ? params.serverTimestamp : null,
  };
  return update;
}

/** True when every key of an update is a permitted moderation field. */
export function updateTouchesOnlyModerationFields(update: Record<string, unknown>): boolean {
  const allowed = new Set<string>(MENU_COMMENT_MODERATION_WRITABLE_FIELDS);
  return Object.keys(update).every((key) => allowed.has(key));
}
