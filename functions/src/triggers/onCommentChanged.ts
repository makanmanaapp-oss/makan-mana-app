import {onDocumentWritten} from "firebase-functions/v2/firestore";

import {db, FieldValue} from "../config/firebase";
import {pushToUser} from "../services/pushService";

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
    createdAt: comment.createdAt ?? FieldValue.serverTimestamp(),
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
      {commentCount: FieldValue.increment(created ? 1 : -1)},
      {merge: true},
    );

    if (created) {
      const comment = event.data?.after.data();
      const post = (await postRef.get()).data();
      const authorUid = post?.authorUid as string | undefined;
      const commenterUid = comment?.authorUid as string | undefined;
      if (authorUid && commenterUid && authorUid !== commenterUid) {
        const name = (comment?.displayName as string) ?? "Seseorang";
        const text = (comment?.text as string) ?? "";
        await pushToUser(
          authorUid,
          "Komen baru pada post anda",
          `${name}: ${text.length > 80 ? text.slice(0, 77) + "..." : text}`,
        );
      }
    }
  },
);
