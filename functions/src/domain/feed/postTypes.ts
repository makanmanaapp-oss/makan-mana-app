/**
 * Wave 3B — canonical feed post-type + author-type vocabulary.
 *
 * SECURITY BOUNDARY: `restaurant_post` and author type `restaurant` are NOT in
 * the ordinary set. The ordinary `createFeedPost` path resolves any unknown
 * postType (including "restaurant_post") down to "food_post" and always writes
 * author type `user`, so an ordinary authenticated user can never manufacture a
 * restaurant-authored post. Restaurant posts are produced ONLY by the separate
 * server-authorized `createRestaurantPost` flow.
 */

export const AUTHOR_TYPE_USER = "user";
export const AUTHOR_TYPE_RESTAURANT = "restaurant";

export const RESTAURANT_POST_TYPE = "restaurant_post";

/** The exact set an ordinary user may choose (unchanged from Wave 2). */
export const ORDINARY_POST_TYPES = [
  "food_post",
  "meal_review",
  "suggestion_result",
  "budget_insight",
  "group_poll",
  "group_result",
  "meal_wallet_share",
  "status",
  "checkin",
] as const;

export type OrdinaryPostType = (typeof ORDINARY_POST_TYPES)[number];

export function isOrdinaryPostType(value: unknown): value is OrdinaryPostType {
  return typeof value === "string"
    && (ORDINARY_POST_TYPES as readonly string[]).includes(value);
}

/** Fail-closed: anything not in the ordinary allowlist becomes "food_post".
 * `restaurant_post` therefore can never survive the ordinary path. */
export function resolveOrdinaryPostType(value: unknown): OrdinaryPostType {
  return isOrdinaryPostType(value) ? value : "food_post";
}
