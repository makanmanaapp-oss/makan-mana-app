/**
 * Wave 3B — PURE menu-comment domain (first-class, SEPARATE from feed_posts
 * comments). Identity = canonicalPlaceId + menuItemId. Flat collection.
 */
import {
  AUTHOR_TYPE_USER,
  MENU_COMMENT_TEXT_MAX,
  displayNameSnapshot,
  normalizeCanonicalPlaceId,
  normalizeCommentId,
  normalizeMenuItemId,
  validateBodyText,
} from "./identity";

export const MENU_COMMENT_STATUS_VISIBLE = "visible";

export interface MenuCommentValidation {
  ok: boolean;
  error?: "canonical_place_id_invalid" | "menu_item_id_invalid" | "text_empty" | "text_too_long" | "parent_invalid";
  canonicalPlaceId: string;
  menuItemId: string;
  text: string;
  parentCommentId: string | null;
}

export function validateMenuCommentInput(input: {
  canonicalPlaceId?: unknown;
  menuItemId?: unknown;
  text?: unknown;
  parentCommentId?: unknown;
}): MenuCommentValidation {
  const empty = {canonicalPlaceId: "", menuItemId: "", text: "", parentCommentId: null as string | null};
  const canonicalPlaceId = normalizeCanonicalPlaceId(input.canonicalPlaceId);
  if (!canonicalPlaceId) return {ok: false, error: "canonical_place_id_invalid", ...empty};
  const menuItemId = normalizeMenuItemId(input.menuItemId);
  if (!menuItemId) return {ok: false, error: "menu_item_id_invalid", ...empty, canonicalPlaceId};

  let parentCommentId: string | null = null;
  if (input.parentCommentId !== undefined && input.parentCommentId !== null && input.parentCommentId !== "") {
    parentCommentId = normalizeCommentId(input.parentCommentId);
    if (!parentCommentId) return {ok: false, error: "parent_invalid", ...empty, canonicalPlaceId, menuItemId};
  }

  const body = validateBodyText(input.text, MENU_COMMENT_TEXT_MAX);
  if (!body.ok) {
    return {
      ok: false,
      error: body.error === "empty" ? "text_empty" : "text_too_long",
      canonicalPlaceId, menuItemId, text: body.value, parentCommentId,
    };
  }
  return {ok: true, canonicalPlaceId, menuItemId, text: body.value, parentCommentId};
}

export interface MenuCommentDocument {
  canonicalPlaceId: string;
  menuItemId: string;
  authorType: typeof AUTHOR_TYPE_USER;
  authorUid: string;
  restaurantId: null;
  displayNameSnapshot: string;
  text: string;
  parentCommentId: string | null;
  status: typeof MENU_COMMENT_STATUS_VISIBLE;
}

/** Build a normal customer menu comment (author = the user). */
export function buildMenuCommentDocument(params: {
  canonicalPlaceId: string;
  menuItemId: string;
  authorUid: string;
  authorDisplayName: unknown;
  text: string;
  parentCommentId: string | null;
}): MenuCommentDocument {
  return {
    canonicalPlaceId: params.canonicalPlaceId,
    menuItemId: params.menuItemId,
    authorType: AUTHOR_TYPE_USER,
    authorUid: params.authorUid,
    restaurantId: null,
    displayNameSnapshot: displayNameSnapshot(params.authorDisplayName) || "Foodie",
    text: params.text,
    parentCommentId: params.parentCommentId,
    status: MENU_COMMENT_STATUS_VISIBLE,
  };
}
