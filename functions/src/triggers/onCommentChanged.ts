import {onDocumentWritten} from "firebase-functions/v2/firestore";

import {db, FieldValue} from "../config/firebase";
import {actorDisplaySnapshot, notifySafely, relationshipBlocked} from "../domain/notifications/notificationProducers";

/**
 * Komen ditambah/dipadam:
 * - kekalkan commentCount pada post
 * - push notifikasi kepada penulis post (bukan komen sendiri)
 */
/**
 * ISSUE 004/005 closeout: indeks aktiviti balasan awam (ID sahaja, TIADA
 * teks). Entri dicipta hanya bila induk SEMASA public & aktif; dibuang
 * bila komen dipadam. onPostVisibilityChanged menyegerak bila induk
 * bertukar visibility.
 */
async function syncReplyActivity(
  postId: string,
  commentId: string,
  comment: FirebaseFirestore.DocumentData | undefined,
  removed: boolean,
) {
  const entryRef = db
    .collection("public_reply_activity")
    .doc(`${postId}_${commentId}`);
  if (removed || !comment || comment.status === "deleted") {
    await entryRef.delete().catch(() => undefined);
    return;
  }
  const post = (await db.collection("feed_posts").doc(postId).get()).data();
  const parentPublic =
    !!post &&
    (post.visibility ?? "public") === "public" &&
    (post.status ?? "active") !== "deleted" &&
    (post.status ?? "active") !== "hidden";
  if (!parentPublic) {
    await entryRef.delete().catch(() => undefined);
    return;
  }
  await entryRef.set({
    authorUid: comment.authorUid ?? "",
    postId,
    commentId,
    // This mirror must never manufacture a publication time for legacy data.
    createdAt: comment.createdAt ?? null,
    active: true,
  });
}

export const onCommentChanged = onDocumentWritten(
  "feed_posts/{postId}/comments/{commentId}",
  async (event) => {
    const created = event.data?.after.exists && !event.data?.before.exists;
    const deleted = !event.data?.after.exists && event.data?.before.exists;
    if (!created && !deleted) return;
    await syncReplyActivity(
      event.params.postId,
      event.params.commentId,
      event.data?.after.data(),
      deleted === true,
    );
    const postRef = db.collection("feed_posts").doc(event.params.postId);
    await postRef.set(
      {
        commentCount: FieldValue.increment(created ? 1 : -1),
        // A comment changes aggregate metadata, not the post's publication.
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    if (created) {
      const comment = event.data?.after.data();
      const post = (await postRef.get()).data();
      const authorUid = post?.authorUid as string | undefined;
      const commenterUid = comment?.authorUid as string | undefined;
      if (authorUid && commenterUid && authorUid !== commenterUid) {
        const parentCommentId = comment?.parentCommentId as string | undefined;
        let recipientUid = authorUid;
        let type: "social_comment" | "social_reply" = "social_comment";
        if (parentCommentId) {
          const parent = await postRef.collection("comments").doc(parentCommentId).get();
          const parentAuthor = parent.data()?.authorUid as string | undefined;
          if (parentAuthor && parentAuthor !== commenterUid) {
            recipientUid = parentAuthor;
            type = "social_reply";
          }
        }
        if (recipientUid !== commenterUid &&
            !(await relationshipBlocked(commenterUid, recipientUid))) {
          await notifySafely({
            recipientUid,
            type,
            sourceEventId: `${type === "social_reply" ? "reply" : "comment"}:${event.params.commentId}`,
            actorUid: commenterUid,
            actorDisplaySnapshot: await actorDisplaySnapshot(commenterUid),
            entityType: "post",
            entityId: event.params.postId,
            parentEntityId: event.params.commentId,
            titleKey: type === "social_reply" ? "notificationSocialReplyTitle" : "notificationSocialCommentTitle",
            bodyKey: type === "social_reply" ? "notificationSocialReplyBody" : "notificationSocialCommentBody",
            deepLink: "/social",
          });
        }
      }
    }
  },
);
