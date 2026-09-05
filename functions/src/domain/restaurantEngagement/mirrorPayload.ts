/**
 * Wave 3C — PURE Firebase → Control Center mirror payloads.
 *
 * Firestore stays authoritative; these produce the NARROW operational read-model
 * records the Control Center mirror accepts (migration 0038 schema). They never
 * emit merchant account internals, a merchant actor UID, follower identity, or
 * unrelated private user data.
 */
import {AUTHOR_TYPE_RESTAURANT, AUTHOR_TYPE_USER} from "./identity";
import {RESTAURANT_POST_TYPE} from "../feed/postTypes";

export const MIRROR_EXCERPT_MAX = 500;

/** social_posts_mirror record (0038 adds the four restaurant columns). */
export interface SocialPostMirrorRecord {
  firebase_post_id: string;
  author_uid: string | null;
  author_type: string;
  post_type: string | null;
  canonical_place_id: string | null;
  restaurant_display_name: string | null;
  visibility: string | null;
  moderation_status: string;
  content_excerpt: string | null;
  created_at: string | null;
  firebase_updated_at: string | null;
  removed_at: string | null;
}

/** menu_comments_mirror record (0038). NOTE: there is deliberately NO author_uid
 * column — moderator-facing identity stays with the authoritative Firestore doc. */
export interface MenuCommentMirrorRecord {
  firebase_comment_id: string;
  canonical_place_id: string;
  menu_item_id: string;
  author_type: string;
  restaurant_id: string | null;
  parent_comment_id: string | null;
  excerpt: string | null;
  moderation_status: string;
  firebase_created_at: string | null;
  firebase_updated_at: string | null;
  removed_at: string | null;
}

/** The three operational states the Control Center mirror understands. */
export type MirrorModerationStatus = "visible" | "hidden" | "removed";

/**
 * SINGLE shared mapping from the AUTHORITATIVE feed_posts status to the mirror's
 * moderation status. Both the event-driven trigger and the manual/scheduled
 * reconciler go through this — there is no divergent per-producer logic.
 *
 *   absent / "" / "active" → visible
 *   "hidden"               → hidden
 *   "deleted"              → removed   (moderator removal OR user self-delete)
 *   anything else          → null      → FAIL CLOSED (record rejected)
 *
 * An unknown state must NEVER be silently published as visible.
 */
export function mapPostStatusToMirrorModeration(status: unknown): MirrorModerationStatus | null {
  if (status === undefined || status === null || status === "") return "visible";
  if (status === "active") return "visible";
  if (status === "hidden") return "hidden";
  if (status === "deleted") return "removed";
  return null;
}

/** Same fail-closed contract for menu comments (statuses are already the mirror
 * vocabulary, and 0038 CHECK-constrains them). */
export function mapMenuCommentStatusToMirrorModeration(status: unknown): MirrorModerationStatus | null {
  if (status === undefined || status === null || status === "") return "visible";
  if (status === "visible" || status === "hidden" || status === "removed") return status;
  return null;
}

function nullableText(value: unknown, max = 240): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, max) : null;
}

function excerpt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, MIRROR_EXCERPT_MAX) : null;
}

/** ISO-8601 for a Firestore Timestamp-like, Date, or epoch-millis value. */
export function mirrorTimestamp(value: unknown): string | null {
  if (!value) return null;
  const candidate = value as {toDate?: () => Date};
  if (typeof candidate.toDate === "function") {
    const date = candidate.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return new Date(value).toISOString();
  return null;
}

/**
 * feed_posts document → social_posts_mirror record.
 *
 * A restaurant post mirrors its PUBLIC restaurant identity (author_type
 * "restaurant" + canonical place + display name) and carries NO author uid.
 * An ordinary user post keeps its existing shape and defaults to author_type
 * "user" when the field is absent (legacy backward compatibility).
 */
export function buildSocialPostMirrorRecord(
  postId: string,
  data: Record<string, unknown>,
): SocialPostMirrorRecord | null {
  const id = nullableText(postId, 200);
  if (!id) return null;

  const postType = nullableText(data.postType, 60);
  const isRestaurantPost = postType === RESTAURANT_POST_TYPE
    || nullableText(data.authorType, 40) === AUTHOR_TYPE_RESTAURANT;

  // Authoritative moderation state. Fail closed: an unrecognised status is
  // rejected outright rather than mirrored as visible.
  const moderationStatus = mapPostStatusToMirrorModeration(data.status);
  if (!moderationStatus) return null;

  return {
    firebase_post_id: id,
    // Restaurant posts never expose an author uid (the merchant actor lives only
    // in the server event/audit, never in the mirror).
    author_uid: isRestaurantPost ? null : nullableText(data.authorUid, 200),
    author_type: isRestaurantPost ? AUTHOR_TYPE_RESTAURANT : AUTHOR_TYPE_USER,
    post_type: postType,
    canonical_place_id: isRestaurantPost
      ? nullableText(data.canonicalPlaceId ?? data.restaurantId, 300)
      : null,
    restaurant_display_name: isRestaurantPost ? nullableText(data.displayName, 160) : null,
    visibility: nullableText(data.visibility, 40),
    moderation_status: moderationStatus,
    content_excerpt: excerpt(data.text),
    created_at: mirrorTimestamp(data.createdAt),
    firebase_updated_at: mirrorTimestamp(data.updatedAt),
    // Moderator removal time only — never fabricated, and cleared on restore.
    removed_at: moderationStatus === "removed" ? mirrorTimestamp(data.moderationRemovedAt) : null,
  };
}

/**
 * menu_comments document → menu_comments_mirror record. Official restaurant
 * replies mirror as author_type "restaurant" with the restaurant identity; the
 * acting merchant UID is never present in the source document nor here.
 */
export function buildMenuCommentMirrorRecord(
  commentId: string,
  data: Record<string, unknown>,
): MenuCommentMirrorRecord | null {
  const id = nullableText(commentId, 200);
  const canonicalPlaceId = nullableText(data.canonicalPlaceId, 300);
  const menuItemId = nullableText(data.menuItemId, 120);
  if (!id || !canonicalPlaceId || !menuItemId) return null;

  const authorType = nullableText(data.authorType, 40) === AUTHOR_TYPE_RESTAURANT
    ? AUTHOR_TYPE_RESTAURANT
    : AUTHOR_TYPE_USER;

  // Fail closed on an unrecognised moderation state (never mirror as visible).
  const moderationStatus = mapMenuCommentStatusToMirrorModeration(data.status);
  if (!moderationStatus) return null;

  return {
    firebase_comment_id: id,
    canonical_place_id: canonicalPlaceId,
    menu_item_id: menuItemId,
    author_type: authorType,
    restaurant_id: authorType === AUTHOR_TYPE_RESTAURANT
      ? nullableText(data.restaurantId, 300) ?? canonicalPlaceId
      : null,
    parent_comment_id: nullableText(data.parentCommentId, 200),
    excerpt: excerpt(data.text),
    moderation_status: moderationStatus,
    firebase_created_at: mirrorTimestamp(data.createdAt),
    firebase_updated_at: mirrorTimestamp(data.updatedAt),
    // Current-state marker only: cleared whenever the comment is not removed.
    removed_at: moderationStatus === "removed" ? mirrorTimestamp(data.removedAt) : null,
  };
}
