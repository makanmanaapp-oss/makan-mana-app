import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {readPublishedRestaurantProfileV2} from "../services/restaurantProfileV2ReadService";
import {menuItemExists} from "../domain/restaurantEngagement/identity";
import {
  buildMenuCommentDocument,
  validateMenuCommentInput,
} from "../domain/restaurantEngagement/menuComment";

/**
 * Wave 3B — normal customer menu comment (first-class, SEPARATE from feed_posts
 * comments). Identity = canonicalPlaceId + menuItemId, validated against the
 * published Restaurant Profile V2 via the trusted server-only helper. Written
 * server-mediated into the flat `menu_comments` collection.
 */
export const createMenuComment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "unauthenticated");

  const validation = validateMenuCommentInput((request.data ?? {}) as Record<string, unknown>);
  if (!validation.ok) {
    const map: Record<string, string> = {
      canonical_place_id_invalid: "canonical_place_id_required",
      menu_item_id_invalid: "menu_item_id_required",
      text_empty: "text_required",
      text_too_long: "text_too_long",
      parent_invalid: "parent_invalid",
    };
    throw new HttpsError("invalid-argument", map[validation.error ?? ""] ?? "invalid_argument");
  }

  // Validate restaurant + menu item against the published profile (no spoofing).
  // The caller may pass an alias/provider identifier: the reader resolves it to
  // the active canonical publication. From here on, profile.canonicalPlaceId is
  // the ONLY authoritative restaurant engagement identity — an alias id must
  // never be persisted, or one restaurant's comments would fragment across ids.
  const profile = await readPublishedRestaurantProfileV2(validation.canonicalPlaceId);
  if (!profile) throw new HttpsError("not-found", "restaurant_not_published");
  const canonicalPlaceId = profile.canonicalPlaceId;
  if (!menuItemExists(profile.menuItems, validation.menuItemId)) {
    throw new HttpsError("not-found", "menu_item_not_found");
  }

  // If threaded, the parent must exist and share the exact RESOLVED place + item.
  if (validation.parentCommentId) {
    const parent = await db.collection("menu_comments").doc(validation.parentCommentId).get();
    const p = parent.data();
    if (!parent.exists || !p) throw new HttpsError("not-found", "parent_not_found");
    if (p.status !== "visible") throw new HttpsError("failed-precondition", "parent_unavailable");
    if (p.canonicalPlaceId !== canonicalPlaceId || p.menuItemId !== validation.menuItemId) {
      throw new HttpsError("invalid-argument", "parent_mismatch");
    }
  }

  const userSnap = await db.collection("users").doc(uid).get();
  const displayName = (userSnap.data()?.displayName as string | undefined)
    ?? (userSnap.data()?.username as string | undefined)
    ?? "Foodie";

  const ref = await db.collection("menu_comments").add({
    ...buildMenuCommentDocument({
      canonicalPlaceId,
      menuItemId: validation.menuItemId,
      authorUid: uid,
      authorDisplayName: displayName,
      text: validation.text,
      parentCommentId: validation.parentCommentId,
    }),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logEvent({
    userId: uid,
    eventType: "menu_comment_created",
    metadata: {commentId: ref.id, canonicalPlaceId, menuItemId: validation.menuItemId},
  });

  return {status: "OK", commentId: ref.id};
});
