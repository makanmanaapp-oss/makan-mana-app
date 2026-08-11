import {onDocumentUpdated} from "firebase-functions/v2/firestore";

import {db} from "../config/firebase";

/**
 * ISSUE 004/005 closeout: bila visibility/status post berubah, segerakkan
 * indeks public_reply_activity anak (ID sahaja) supaya senarai balasan
 * profil tidak pernah bergantung pada snapshot basi. Kandungan komen
 * sendiri kekal di sebalik sempadan GET rules (induk semasa disemak).
 */
export const onPostVisibilityChanged = onDocumentUpdated(
  "feed_posts/{postId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    const visBefore = before.visibility ?? "public";
    const visAfter = after.visibility ?? "public";
    const stBefore = before.status ?? "active";
    const stAfter = after.status ?? "active";
    if (visBefore === visAfter && stBefore === stAfter) return;

    const postId = event.params.postId;
    const nowPublic =
      visAfter === "public" && stAfter !== "deleted" && stAfter !== "hidden";

    const entries = await db
      .collection("public_reply_activity")
      .where("postId", "==", postId)
      .limit(500)
      .get();

    const batch = db.batch();
    if (nowPublic) {
      // Kembali public: entri sedia ada kekal; komen tanpa entri
      // (dicipta semasa bukan-public tidak wujud) - tiada tindakan lain.
      entries.docs.forEach((d) => batch.update(d.ref, {active: true}));
    } else {
      entries.docs.forEach((d) => batch.delete(d.ref));
    }
    await batch.commit();

    // Post kembali public: bina semula entri daripada komen aktif.
    if (nowPublic) {
      const comments = await db
        .collection("feed_posts")
        .doc(postId)
        .collection("comments")
        .limit(500)
        .get();
      const rebuild = db.batch();
      comments.docs.forEach((c) => {
        const data = c.data();
        if ((data.status ?? "active") === "deleted") return;
        rebuild.set(
          db.collection("public_reply_activity").doc(`${postId}_${c.id}`),
          {
            authorUid: data.authorUid ?? "",
            postId,
            commentId: c.id,
            createdAt: data.createdAt ?? null,
            active: true,
          },
        );
      });
      await rebuild.commit();
    }
  },
);
