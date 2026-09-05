/**
 * Wave 3B — PURE restaurant-post validation + feed_posts document builder.
 *
 * The document identifies the RESTAURANT (authorType=restaurant,
 * restaurantId=canonicalPlaceId, displayName=restaurant name). It carries NO
 * authorUid and NO merchant Firebase UID — the acting merchant UID is recorded
 * only in the server event/audit, never in this public document.
 */
import {AUTHOR_TYPE_RESTAURANT, RESTAURANT_POST_TEXT_MAX, displayNameSnapshot} from "./identity";
import {RESTAURANT_POST_TYPE} from "../feed/postTypes";
import {NEW_POST_STATUS, PostStatus} from "../feed/postLifecycle";

const STORAGE_URL_PREFIX = "https://firebasestorage.googleapis.com/";
const MAX_IMAGES = 6;

export interface RestaurantPostInput {
  text?: unknown;
  imageUrl?: unknown;
  imageUrls?: unknown;
}

export interface RestaurantPostValidation {
  ok: boolean;
  error?: "empty" | "too_long" | "invalid_image_url";
  text: string;
  imageUrls: string[];
}

export function validateRestaurantPostInput(input: RestaurantPostInput): RestaurantPostValidation {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const rawUrls = Array.isArray(input.imageUrls) ? input.imageUrls : [];
  const single = typeof input.imageUrl === "string" ? input.imageUrl.trim() : "";
  const imageUrls = [
    ...rawUrls.filter((u): u is string => typeof u === "string").map((u) => u.trim()).filter((u) => u.length > 0),
    ...(single.length > 0 && !rawUrls.includes(single) ? [single] : []),
  ].filter((u, i, arr) => arr.indexOf(u) === i).slice(0, MAX_IMAGES);

  if (text.length === 0 && imageUrls.length === 0) return {ok: false, error: "empty", text, imageUrls};
  if (text.length > RESTAURANT_POST_TEXT_MAX) return {ok: false, error: "too_long", text, imageUrls};
  for (const u of imageUrls) {
    if (!u.startsWith(STORAGE_URL_PREFIX)) return {ok: false, error: "invalid_image_url", text, imageUrls};
  }
  return {ok: true, text, imageUrls};
}

export interface RestaurantPostDocument {
  type: "status";
  postType: typeof RESTAURANT_POST_TYPE;
  authorType: typeof AUTHOR_TYPE_RESTAURANT;
  /** Wave 3C read boundary — a new restaurant post is born active. */
  status: PostStatus;
  authorUid: null;
  restaurantId: string;
  canonicalPlaceId: string;
  displayName: string;
  username: null;
  photoUrl: null;
  text: string;
  imageUrl: string | null;
  imageUrls: string[] | null;
  mediaCount: number;
  groupId: null;
  visibility: "public";
  payload: null;
  placeId: string;
  placeName: string;
  emoji: string;
  likeCount: 0;
  likedBy: never[];
  commentCount: 0;
}

/** Build the public restaurant feed_posts document (no createdAt/timeSlot — the
 * server callable injects those with real FieldValue tokens). */
export function buildRestaurantPostDocument(params: {
  canonicalPlaceId: string;
  restaurantDisplayName: string;
  text: string;
  imageUrls: string[];
  emoji?: string;
}): RestaurantPostDocument {
  const name = displayNameSnapshot(params.restaurantDisplayName) || "Restoran";
  return {
    type: "status",
    postType: RESTAURANT_POST_TYPE,
    authorType: AUTHOR_TYPE_RESTAURANT,
    status: NEW_POST_STATUS,
    authorUid: null,
    restaurantId: params.canonicalPlaceId,
    canonicalPlaceId: params.canonicalPlaceId,
    displayName: name,
    username: null,
    photoUrl: null,
    text: params.text,
    imageUrl: params.imageUrls[0] ?? null,
    imageUrls: params.imageUrls.length > 0 ? params.imageUrls : null,
    mediaCount: params.imageUrls.length,
    groupId: null,
    visibility: "public",
    payload: null,
    placeId: params.canonicalPlaceId,
    placeName: name,
    emoji: typeof params.emoji === "string" && params.emoji ? params.emoji.slice(0, 8) : "🍽️",
    likeCount: 0,
    likedBy: [],
    commentCount: 0,
  };
}
