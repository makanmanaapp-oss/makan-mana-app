import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {actorDisplaySnapshot, notifySafely, relationshipBlocked} from "../domain/notifications/notificationProducers";

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
      // Deliberately not createdAt: reactions must not rewrite publication age.
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {liked: !liked, ownerUid: (snap.data()?.authorUid as string | undefined) ?? ""};
  });

  if (result.liked && result.ownerUid && result.ownerUid !== uid &&
      !(await relationshipBlocked(uid, result.ownerUid))) {
    await notifySafely({
      recipientUid: result.ownerUid,
      type: "social_reaction",
      sourceEventId: `reaction:${postId}:${uid}`,
      actorUid: uid,
      actorDisplaySnapshot: await actorDisplaySnapshot(uid),
      entityType: "post",
      entityId: postId,
      titleKey: "notificationSocialReactionTitle",
      bodyKey: "notificationSocialReactionBody",
      deepLink: `/social`,
      metadata: {reaction: "like"},
    });
  }

  return {status: "OK", liked: result.liked};
});
