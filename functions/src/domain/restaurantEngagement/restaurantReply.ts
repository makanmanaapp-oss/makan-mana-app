/**
 * Wave 3B — PURE official-restaurant-reply domain for menu comments. The
 * restaurant is the PUBLIC author; the acting merchant UID never appears in the
 * document. Reuses the same authorization primitive future post-comment
 * restaurant replies will use (authorize the merchant for the PARENT's place).
 */
import {AUTHOR_TYPE_RESTAURANT, displayNameSnapshot} from "./identity";
import {MENU_COMMENT_STATUS_VISIBLE} from "./menuComment";

/** Minimal parent menu-comment shape needed to validate a reply target. */
export interface ParentMenuComment {
  canonicalPlaceId?: unknown;
  menuItemId?: unknown;
  status?: unknown;
}

export interface ReplyTargetValidation {
  ok: boolean;
  error?: "parent_missing" | "parent_not_visible" | "restaurant_mismatch" | "menu_item_mismatch";
}

/**
 * A reply is valid only when the acting restaurant (the place the merchant is
 * authorized for) matches the parent's place AND menu item, and the parent is
 * still active. `authorizedCanonicalPlaceId` comes from merchant authorization —
 * a merchant of another restaurant can never match, so cross-restaurant replies
 * are impossible.
 */
export function validateReplyTarget(
  parent: ParentMenuComment | null | undefined,
  authorizedCanonicalPlaceId: string,
  menuItemId: string,
): ReplyTargetValidation {
  if (!parent) return {ok: false, error: "parent_missing"};
  // Fail closed on status: ONLY an explicitly visible parent is replyable. A
  // missing, unknown, removed, hidden or deleted status all reject.
  if (parent.status !== MENU_COMMENT_STATUS_VISIBLE) {
    return {ok: false, error: "parent_not_visible"};
  }
  if (parent.canonicalPlaceId !== authorizedCanonicalPlaceId) {
    return {ok: false, error: "restaurant_mismatch"};
  }
  if (parent.menuItemId !== menuItemId) {
    return {ok: false, error: "menu_item_mismatch"};
  }
  return {ok: true};
}

export interface RestaurantReplyDocument {
  canonicalPlaceId: string;
  menuItemId: string;
  authorType: typeof AUTHOR_TYPE_RESTAURANT;
  authorUid: null;
  restaurantId: string;
  displayNameSnapshot: string;
  text: string;
  parentCommentId: string;
  status: typeof MENU_COMMENT_STATUS_VISIBLE;
}

export function buildRestaurantReplyDocument(params: {
  canonicalPlaceId: string;
  menuItemId: string;
  parentCommentId: string;
  restaurantDisplayName: unknown;
  text: string;
}): RestaurantReplyDocument {
  return {
    canonicalPlaceId: params.canonicalPlaceId,
    menuItemId: params.menuItemId,
    authorType: AUTHOR_TYPE_RESTAURANT,
    authorUid: null,
    restaurantId: params.canonicalPlaceId,
    displayNameSnapshot: displayNameSnapshot(params.restaurantDisplayName) || "Restoran",
    text: params.text,
    parentCommentId: params.parentCommentId,
    status: MENU_COMMENT_STATUS_VISIBLE,
  };
}
