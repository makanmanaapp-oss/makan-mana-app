import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {currentTimeSlot} from "../utils/timeSlot";
import {
  MERCHANT_BRIDGE_SECRET,
  MERCHANT_ENFORCE_APP_CHECK,
  authorizeMerchantPlace,
} from "../services/merchantBridge";
import {readPublishedRestaurantProfileV2} from "../services/restaurantProfileV2ReadService";
import {normalizeCanonicalPlaceId} from "../domain/restaurantEngagement/identity";
import {
  buildRestaurantPostDocument,
  validateRestaurantPostInput,
} from "../domain/restaurantEngagement/restaurantPost";

/**
 * Wave 3B — server-authorized restaurant post publishing.
 *
 * Separate from ordinary createFeedPost: it REQUIRES a published Restaurant
 * Profile V2 and an active merchant membership (owner/manager/editor) proven by
 * the trusted read-only merchant authorization bridge. The stored feed_posts
 * document carries only the PUBLIC restaurant identity — the acting merchant
 * Firebase UID is recorded only in the server event, never in the document.
 */
export const createRestaurantPost = onCall(
  {secrets: [MERCHANT_BRIDGE_SECRET], enforceAppCheck: MERCHANT_ENFORCE_APP_CHECK, maxInstances: 5},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "unauthenticated");

    const input = (request.data ?? {}) as Record<string, unknown>;
    const canonicalPlaceId = normalizeCanonicalPlaceId(input.canonicalPlaceId);
    if (!canonicalPlaceId) throw new HttpsError("invalid-argument", "canonical_place_id_required");

    // Public restaurant identity must exist (published Restaurant Profile V2).
    const profile = await readPublishedRestaurantProfileV2(canonicalPlaceId);
    if (!profile) throw new HttpsError("not-found", "restaurant_not_published");

    // Server-side merchant authorization (fail-closed).
    const auth = await authorizeMerchantPlace(uid, profile.canonicalPlaceId);
    if (!auth.authorized) throw new HttpsError("permission-denied", "merchant_place_access_required");

    const validation = validateRestaurantPostInput(input);
    if (!validation.ok) {
      const code = validation.error === "too_long" ? "text_too_long"
        : validation.error === "invalid_image_url" ? "invalid_image_url"
          : "post_empty";
      throw new HttpsError("invalid-argument", code);
    }

    const doc = buildRestaurantPostDocument({
      canonicalPlaceId: profile.canonicalPlaceId,
      restaurantDisplayName: profile.name,
      text: validation.text,
      imageUrls: validation.imageUrls,
      emoji: typeof input.emoji === "string" ? input.emoji : undefined,
    });

    const ref = await db.collection("feed_posts").add({
      ...doc,
      timeSlot: currentTimeSlot(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Internal audit only — the acting merchant UID lives in the server event,
    // never in the public feed_posts document.
    await logEvent({
      userId: uid,
      eventType: "restaurant_post_created",
      metadata: {postId: ref.id, canonicalPlaceId: profile.canonicalPlaceId, role: auth.role ?? ""},
    });

    return {status: "OK", postId: ref.id, restaurantId: profile.canonicalPlaceId};
  },
);
