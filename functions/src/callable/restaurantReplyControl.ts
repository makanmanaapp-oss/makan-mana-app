import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {
  MERCHANT_BRIDGE_SECRET,
  MERCHANT_ENFORCE_APP_CHECK,
  authorizeMerchantPlace,
} from "../services/merchantBridge";
import {readPublishedRestaurantProfileV2} from "../services/restaurantProfileV2ReadService";
import {normalizeCanonicalPlaceId, normalizeMenuItemId, normalizeCommentId, validateBodyText, RESTAURANT_REPLY_TEXT_MAX} from "../domain/restaurantEngagement/identity";
import {
  buildRestaurantReplyDocument,
  validateReplyTarget,
} from "../domain/restaurantEngagement/restaurantReply";

/**
 * Wave 3B — official restaurant reply to a menu comment. The restaurant is the
 * PUBLIC author; the acting merchant UID never appears publicly. Reuses the
 * shared merchant authorization primitive: the merchant must be authorized for
 * the PARENT comment's place, so a merchant of another restaurant can never
 * reply across restaurants.
 */
export const replyToRestaurantMenuComment = onCall(
  {secrets: [MERCHANT_BRIDGE_SECRET], enforceAppCheck: MERCHANT_ENFORCE_APP_CHECK, maxInstances: 5},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "unauthenticated");

    const input = (request.data ?? {}) as Record<string, unknown>;
    const parentCommentId = normalizeCommentId(input.parentCommentId);
    if (!parentCommentId) throw new HttpsError("invalid-argument", "parent_comment_id_required");
    const canonicalPlaceId = normalizeCanonicalPlaceId(input.canonicalPlaceId);
    if (!canonicalPlaceId) throw new HttpsError("invalid-argument", "canonical_place_id_required");
    const menuItemId = normalizeMenuItemId(input.menuItemId);
    if (!menuItemId) throw new HttpsError("invalid-argument", "menu_item_id_required");
    const body = validateBodyText(input.text, RESTAURANT_REPLY_TEXT_MAX);
    if (!body.ok) throw new HttpsError("invalid-argument", body.error === "too_long" ? "text_too_long" : "text_required");

    // Load parent menu comment (must exist).
    const parentSnap = await db.collection("menu_comments").doc(parentCommentId).get();
    const parent = parentSnap.exists ? parentSnap.data() ?? null : null;
    if (!parent) throw new HttpsError("not-found", "parent_not_found");

    // Resolve the caller's identifier to the active canonical publication FIRST.
    // The resolved id is the ONLY authoritative engagement identity — an alias
    // must never be used for authorization or for parent matching.
    const profile = await readPublishedRestaurantProfileV2(canonicalPlaceId);
    if (!profile) throw new HttpsError("not-found", "restaurant_not_published");

    // Authorize the merchant for the RESOLVED place. The authorization echoes
    // the authorized canonicalPlaceId, which validateReplyTarget requires to
    // equal the parent's — cross-restaurant replies are therefore impossible.
    const auth = await authorizeMerchantPlace(uid, profile.canonicalPlaceId);
    if (!auth.authorized) throw new HttpsError("permission-denied", "merchant_place_access_required");

    const targetCheck = validateReplyTarget(parent, auth.canonicalPlaceId, menuItemId);
    if (!targetCheck.ok) {
      const code = targetCheck.error === "parent_not_visible" ? "parent_unavailable"
        : targetCheck.error === "menu_item_mismatch" ? "menu_item_mismatch"
          : "restaurant_mismatch";
      throw new HttpsError("failed-precondition", code);
    }

    const ref = await db.collection("menu_comments").add({
      ...buildRestaurantReplyDocument({
        canonicalPlaceId: auth.canonicalPlaceId,
        menuItemId,
        parentCommentId,
        restaurantDisplayName: profile.name,
        text: body.value,
      }),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Acting merchant UID retained in the server event only (internal audit).
    await logEvent({
      userId: uid,
      eventType: "restaurant_menu_reply_created",
      metadata: {commentId: ref.id, parentCommentId, canonicalPlaceId: auth.canonicalPlaceId, menuItemId, role: auth.role ?? ""},
    });

    return {status: "OK", commentId: ref.id};
  },
);
