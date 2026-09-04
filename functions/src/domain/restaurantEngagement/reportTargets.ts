/**
 * Wave 3B — canonical report target vocabulary. Extends the existing set
 * (post/comment/user/group/bill) with `menu_comment` so Wave 3 menu comments
 * (and restaurant replies, which are menu comments) can be reported through the
 * SAME existing reporting pipeline. Existing targets are unchanged.
 */

export const REPORT_TARGET_TYPES = [
  "post",
  "comment",
  "user",
  "group",
  "bill",
  "menu_comment",
] as const;

export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export function isValidReportTarget(value: unknown): value is ReportTargetType {
  return typeof value === "string"
    && (REPORT_TARGET_TYPES as readonly string[]).includes(value);
}

/**
 * Moderation context for a menu-comment report. Every field is derived from the
 * SERVER-LOADED target document — client-supplied restaurant/menu context is
 * never used, so a reporter cannot mislabel which restaurant/menu item (or
 * author) a report belongs to.
 */
export interface MenuCommentReportContext {
  targetId: string;
  canonicalPlaceId: string | null;
  menuItemId: string | null;
  authorType: string | null;
  authorUid: string | null;
  restaurantId: string | null;
  parentCommentId: string | null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Returns null when the target document does not exist (report must be rejected). */
export function buildMenuCommentReportContext(
  targetId: string,
  stored: Record<string, unknown> | null | undefined,
): MenuCommentReportContext | null {
  if (!stored) return null;
  return {
    targetId,
    canonicalPlaceId: str(stored.canonicalPlaceId),
    menuItemId: str(stored.menuItemId),
    authorType: str(stored.authorType),
    authorUid: str(stored.authorUid),
    restaurantId: str(stored.restaurantId),
    parentCommentId: str(stored.parentCommentId),
  };
}
