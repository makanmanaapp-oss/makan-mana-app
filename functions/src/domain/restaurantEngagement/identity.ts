/**
 * Wave 3B — shared restaurant-engagement identity + validation primitives.
 *
 * Public restaurant identity is `canonicalPlaceId`; menu-comment identity is
 * `canonicalPlaceId + menuItemId`. The acting merchant's Firebase UID is NEVER
 * part of any public identity produced here — it is passed separately for
 * internal audit only.
 */

export const AUTHOR_TYPE_USER = "user";
export const AUTHOR_TYPE_RESTAURANT = "restaurant";

/** Active merchant roles allowed to act as a restaurant (Wave 3B). */
export const ALLOWED_MERCHANT_ROLES = ["owner", "manager", "editor"] as const;
export type MerchantRole = (typeof ALLOWED_MERCHANT_ROLES)[number];

export function isAllowedMerchantRole(value: unknown): value is MerchantRole {
  return typeof value === "string"
    && (ALLOWED_MERCHANT_ROLES as readonly string[]).includes(value);
}

// Length contracts. Feed text stays 500 (parity with createFeedPost); menu
// comments + restaurant replies use 300 (the authoritative comment limit proven
// by firestore.rules feed_posts/comments: text.size() <= 300).
export const RESTAURANT_POST_TEXT_MAX = 500;
export const MENU_COMMENT_TEXT_MAX = 300;
export const RESTAURANT_REPLY_TEXT_MAX = 300;
export const DISPLAY_NAME_SNAPSHOT_MAX = 160;

const CANONICAL_PLACE_ID_RE = /^[A-Za-z0-9_:.\-]{1,300}$/;
const MENU_ITEM_ID_RE = /^[A-Za-z0-9_:.\-]{1,120}$/;
const COMMENT_ID_RE = /^[A-Za-z0-9_:.\-]{1,200}$/;

export function normalizeCanonicalPlaceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return CANONICAL_PLACE_ID_RE.test(clean) ? clean : null;
}

export function normalizeMenuItemId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return MENU_ITEM_ID_RE.test(clean) ? clean : null;
}

export function normalizeCommentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return COMMENT_ID_RE.test(clean) ? clean : null;
}

/** Trim + collapse a display name snapshot to a safe bounded string. */
export function displayNameSnapshot(value: unknown): string {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean.slice(0, DISPLAY_NAME_SNAPSHOT_MAX);
}

export interface TextValidation {
  ok: boolean;
  value: string;
  error?: "empty" | "too_long";
}

/** Required, trimmed, length-bounded body text. Empty → error "empty". */
export function validateBodyText(value: unknown, max: number): TextValidation {
  const clean = typeof value === "string" ? value.trim() : "";
  if (clean.length === 0) return {ok: false, value: "", error: "empty"};
  if (clean.length > max) return {ok: false, value: clean, error: "too_long"};
  return {ok: true, value: clean};
}

/** Whether a menu item id exists in a published restaurant profile's menu. */
export function menuItemExists(
  profileMenuItems: ReadonlyArray<{id: string}> | undefined,
  menuItemId: string,
): boolean {
  if (!Array.isArray(profileMenuItems)) return false;
  return profileMenuItems.some((item) => item && item.id === menuItemId);
}
