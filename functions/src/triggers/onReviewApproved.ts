import {onDocumentUpdated} from "firebase-functions/v2/firestore";

import {db, FieldValue} from "../config/firebase";
import {pushToUser} from "../services/pushService";
import {recomputePlaceRating} from "../services/reviewService";
import {currentTimeSlot} from "../utils/timeSlot";

/**
 * Bila admin meluluskan ulasan delivery (pending -> approved di Console):
 * kira semula skor komuniti + siarkan ke feed jika pengguna pilih kongsi.
 */
export const onReviewApproved = onDocumentUpdated(
  "place_reviews/{reviewId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.status === "pending" && after.status === "approved") {
      await recomputePlaceRating(after.placeId as string);
      await pushToUser(
        after.authorUid as string,
        "Rating anda diluluskan",
        `Ulasan anda untuk ${after.placeName ?? "kedai"} kini dipaparkan.`,
      );
      if (after.shareToFeed === true) {
        await db.collection("feed_posts").add({
          type: "review",
          authorUid: after.authorUid,
          displayName: after.displayName,
          text: after.text ?? null,
          imageUrl: after.imageUrl ?? null,
          groupId: null,
          // Social 1.1: visibility eksplisit; dikongsi atas persetujuan
          // pengguna (shareToFeed=true semasa hantar review).
          visibility: "public",
          placeId: after.placeId,
          placeName: after.placeName ?? null,
          cuisine: after.cuisine ?? null,
          emoji: after.emoji ?? "🍽️",
          reviewRating: after.rating,
          timeSlot: currentTimeSlot(),
          likeCount: 0,
          likedBy: [],
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }
  },
);
