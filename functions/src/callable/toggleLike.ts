import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";

interface ToggleLikeInput {
  postId?: string;
}

/** Like/unlike siaran Feed Makan. */
export const toggleLike = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }
  const postId = ((request.data ?? {}) as ToggleLikeInput).postId ?? "";
  if (postId.length === 0) {
    throw new HttpsError("invalid-argument", "postId diperlukan.");
  }

  const ref = db.collection("feed_posts").doc(postId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Post tidak wujud.");
    }
    const likedBy = (snap.data()?.likedBy as string[] | undefined) ?? [];
    const liked = likedBy.includes(uid);
    tx.update(ref, {
      likedBy: liked ?
        FieldValue.arrayRemove(uid) :
        FieldValue.arrayUnion(uid),
      likeCount: FieldValue.increment(liked ? -1 : 1),
    });
    return !liked;
  });

  return {status: "OK", liked: result};
});
