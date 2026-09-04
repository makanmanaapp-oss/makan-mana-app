import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {
  readPublishedRestaurantProfileV2,
  resolveCanonicalRestaurantPlaceId,
} from "../services/restaurantProfileV2ReadService";
import {normalizeCanonicalPlaceId, displayNameSnapshot} from "../domain/restaurantEngagement/identity";
import {
  buildRestaurantFollowDocument,
  nextFollowerCount,
  restaurantFollowDocId,
  shouldApplyFollow,
  shouldApplyUnfollow,
} from "../domain/restaurantEngagement/restaurantFollow";

/**
 * Wave 3B — first-class restaurant follow (SEPARATE from user↔user `follows`).
 * Follow docs live in `restaurant_follows`; the server-authoritative follower
 * COUNT lives in `restaurant_public/{canonicalPlaceId}` (never coupled to
 * public_profiles.followersCount). Idempotent; count never goes negative.
 */

function followRef(uid: string, canonicalPlaceId: string) {
  return db.collection("restaurant_follows").doc(restaurantFollowDocId(uid, canonicalPlaceId));
}
function aggregateRef(canonicalPlaceId: string) {
  return db.collection("restaurant_public").doc(canonicalPlaceId);
}

export const followRestaurant = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "unauthenticated");
  const canonicalPlaceId = normalizeCanonicalPlaceId((request.data as Record<string, unknown>)?.canonicalPlaceId);
  if (!canonicalPlaceId) throw new HttpsError("invalid-argument", "canonical_place_id_required");

  // Validate public restaurant identity via the trusted published-profile helper.
  const profile = await readPublishedRestaurantProfileV2(canonicalPlaceId);
  if (!profile) throw new HttpsError("not-found", "restaurant_not_published");

  const fRef = followRef(uid, profile.canonicalPlaceId);
  const aRef = aggregateRef(profile.canonicalPlaceId);
  const applied = await db.runTransaction(async (tx) => {
    const [fSnap, aSnap] = await Promise.all([tx.get(fRef), tx.get(aRef)]);
    if (!shouldApplyFollow(fSnap.exists)) return false; // idempotent
    tx.set(fRef, {...buildRestaurantFollowDocument(uid, profile.canonicalPlaceId), createdAt: FieldValue.serverTimestamp()});
    tx.set(aRef, {
      canonicalPlaceId: profile.canonicalPlaceId,
      displayNameSnapshot: displayNameSnapshot(profile.name),
      followerCount: nextFollowerCount(aSnap.data()?.followerCount, 1),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return true;
  });

  if (applied) {
    await logEvent({userId: uid, eventType: "restaurant_followed", metadata: {canonicalPlaceId: profile.canonicalPlaceId}});
  }
  return {status: "OK", following: true, changed: applied};
});

export const unfollowRestaurant = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "unauthenticated");
  const canonicalPlaceId = normalizeCanonicalPlaceId((request.data as Record<string, unknown>)?.canonicalPlaceId);
  if (!canonicalPlaceId) throw new HttpsError("invalid-argument", "canonical_place_id_required");

  // followRestaurant stores the RESOLVED canonical id, so unfollow MUST target
  // that same identity. It therefore resolves through the SERVER canonical
  // resolver (alias → canonical), which does NOT require an active publication —
  // an unpublished restaurant must still be unfollowable, and falling back to the
  // caller's alias would orphan the real canonical follow document.
  //
  // If resolution genuinely fails (blocked or cyclic alias chain) we perform a
  // safe idempotent NO-OP: no follow document is touched and NO alias-scoped
  // restaurant_public aggregate is ever created or mutated.
  const resolvedId = await resolveCanonicalRestaurantPlaceId(canonicalPlaceId);
  if (!resolvedId) {
    return {status: "OK", following: false, changed: false};
  }

  const fRef = followRef(uid, resolvedId);
  const aRef = aggregateRef(resolvedId);
  const applied = await db.runTransaction(async (tx) => {
    const [fSnap, aSnap] = await Promise.all([tx.get(fRef), tx.get(aRef)]);
    if (!shouldApplyUnfollow(fSnap.exists)) return false; // idempotent
    tx.delete(fRef);
    tx.set(aRef, {
      canonicalPlaceId: resolvedId,
      followerCount: nextFollowerCount(aSnap.data()?.followerCount, -1),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return true;
  });

  if (applied) {
    await logEvent({userId: uid, eventType: "restaurant_unfollowed", metadata: {canonicalPlaceId: resolvedId}});
  }
  return {status: "OK", following: false, changed: applied};
});
