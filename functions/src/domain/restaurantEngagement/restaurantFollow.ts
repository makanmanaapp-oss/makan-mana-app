/**
 * Wave 3B — PURE restaurant-follow primitives. A first-class follow, SEPARATE
 * from the user↔user `follows` collection and NOT coupled to
 * public_profiles.followersCount. Follower count is a server-authoritative
 * aggregate that can never go negative.
 */

export const RESTAURANT_FOLLOW_ID_PREFIX = "rf";

/** Base64URL (RFC 4648 §5) of the UTF-8 bytes, padding stripped. */
function encodeIdComponent(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url").replace(/=+$/, "");
}
function decodeIdComponent(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

/**
 * Deterministic, collision-proof, byte-bounded follow doc id:
 *
 *   rf.<base64url(UTF8(followerUid))>.<base64url(UTF8(canonicalPlaceId))>
 *
 * Why Base64URL rather than percent-encoding: a valid Firebase UID is up to 128
 * CHARACTERS and is not restricted to ASCII, so percent-encoding could expand a
 * 4-byte UTF-8 code point to 12 characters and overflow Firestore's 1500-byte
 * document-id limit. Base64URL expands by a fixed 4/3 of the UTF-8 byte length,
 * which keeps the worst supported input far inside the limit.
 *
 * Safety properties:
 *  - alphabet is A-Z a-z 0-9 - _ only, so no "/" can ever appear;
 *  - "." cannot occur inside a Base64URL component, so it is an unambiguous
 *    delimiter — ("a__b","c") and ("a","b__c") can never collapse;
 *  - the constant "rf." prefix means the id is never "." / ".." and never
 *    matches Firestore's reserved `__.*__` pattern;
 *  - reversible (see decodeRestaurantFollowDocId) — no hashing involved.
 *
 * Flutter reproduces this exactly with:
 *   String enc(String v) =>
 *       base64Url.encode(utf8.encode(v)).replaceAll('=', '');
 *   'rf.${enc(uid)}.${enc(canonicalPlaceId)}'
 */
export function restaurantFollowDocId(followerUid: string, canonicalPlaceId: string): string {
  return `${RESTAURANT_FOLLOW_ID_PREFIX}.${encodeIdComponent(followerUid)}.${encodeIdComponent(canonicalPlaceId)}`;
}

/** Reverse of restaurantFollowDocId. Returns null for a malformed id. */
export function decodeRestaurantFollowDocId(
  docId: string,
): {followerUid: string; canonicalPlaceId: string} | null {
  if (typeof docId !== "string") return null;
  const parts = docId.split(".");
  if (parts.length !== 3 || parts[0] !== RESTAURANT_FOLLOW_ID_PREFIX) return null;
  if (!/^[A-Za-z0-9_-]*$/.test(parts[1]) || !/^[A-Za-z0-9_-]*$/.test(parts[2])) return null;
  try {
    return {
      followerUid: decodeIdComponent(parts[1]),
      canonicalPlaceId: decodeIdComponent(parts[2]),
    };
  } catch {
    return null;
  }
}

/** Clamp a follower-count mutation so it can never drop below zero. */
export function nextFollowerCount(current: unknown, delta: number): number {
  const base = typeof current === "number" && Number.isFinite(current) && current > 0
    ? Math.floor(current)
    : 0;
  const next = base + delta;
  return next > 0 ? next : 0;
}

/** Idempotent decision for follow: apply only when not already following. */
export function shouldApplyFollow(existingFollowExists: boolean): boolean {
  return !existingFollowExists;
}

/** Idempotent decision for unfollow: apply only when currently following. */
export function shouldApplyUnfollow(existingFollowExists: boolean): boolean {
  return existingFollowExists;
}

export interface RestaurantFollowDocument {
  followerUid: string;
  canonicalPlaceId: string;
  restaurantId: string;
}

export function buildRestaurantFollowDocument(followerUid: string, canonicalPlaceId: string): RestaurantFollowDocument {
  return {followerUid, canonicalPlaceId, restaurantId: canonicalPlaceId};
}
