import {onDocumentWritten} from "firebase-functions/v2/firestore";

import {db, FieldValue} from "../config/firebase";
import {pushToUser} from "../services/pushService";

/**
 * Komen ditambah/dipadam:
 * - kekalkan commentCount pada post
 * - push notifikasi kepada penulis post (bukan komen sendiri)
 */
export const onCommentChanged = onDocumentWritten(
  "feed_posts/{postId}/comments/{commentId}",
  async (event) => {
    const created = event.data?.after.exists && !event.data?.before.exists;
    const deleted = !event.data?.after.exists && event.data?.before.exists;
    if (!created && !deleted) return;
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
