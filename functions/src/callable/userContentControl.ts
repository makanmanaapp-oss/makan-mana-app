import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";

const MAX_TEXT_LENGTH = 500;
const MAX_COMMENT_LENGTH = 300;

/** Sahkan pemilik dokumen sebelum benarkan edit/padam. */
async function assertOwner(
  ref: FirebaseFirestore.DocumentReference,
  uid: string,
  ownerField: string,
): Promise<FirebaseFirestore.DocumentSnapshot> {
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Kandungan tidak dijumpai.");
  }
  if (snap.data()?.[ownerField] !== uid) {
    throw new HttpsError("permission-denied", "Bukan milik anda.");
  }
  return snap;
}

/** Edit kapsyen + tetapan post sendiri. */
export const editUserPost = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {postId, text, visibility, commentEnabled} = (request.data ??
    {}) as {
    postId?: string;
    text?: string;
    visibility?: string;
    commentEnabled?: boolean;
  };
  if (!postId) throw new HttpsError("invalid-argument", "postId perlu.");

  const ref = db.collection("feed_posts").doc(postId);
  await assertOwner(ref, uid, "authorUid");

  const update: Record<string, unknown> = {
    editedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    editHistoryCount: FieldValue.increment(1),
  };
  if (typeof text === "string") {
    if (text.trim().length > MAX_TEXT_LENGTH) {
      throw new HttpsError("invalid-argument", "Teks terlalu panjang.");
    }
    update.text = text.trim();
  }
  if (
    typeof visibility === "string" &&
    ["public", "followers", "private"].includes(visibility)
  ) {
    update.visibility = visibility;
  }
  if (typeof commentEnabled === "boolean") {
    update.commentEnabled = commentEnabled;
  }

  await ref.update(update);
  await logEvent({userId: uid, eventType: "post_edited", metadata: {postId}});
  if (typeof visibility === "string") {
    await logEvent({
      userId: uid,
      eventType: "visibility_changed",
      metadata: {postId, visibility},
    });
  }
  return {status: "OK"};
});

/** Soft delete post sendiri (kekal untuk moderasi V5). */
export const deleteUserPost = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {postId} = (request.data ?? {}) as {postId?: string};
  if (!postId) throw new HttpsError("invalid-argument", "postId perlu.");

  const ref = db.collection("feed_posts").doc(postId);
  await assertOwner(ref, uid, "authorUid");
  await ref.update({
    status: "deleted",
    deletedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await logEvent({userId: uid, eventType: "post_deleted", metadata: {postId}});
  return {status: "OK"};
});

/** Edit komen sendiri. */
export const editUserComment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {postId, commentId, body} = (request.data ?? {}) as {
    postId?: string;
    commentId?: string;
    body?: string;
  };
  if (!postId || !commentId || typeof body !== "string") {
    throw new HttpsError("invalid-argument", "Data tidak lengkap.");
  }
  if (body.trim().length === 0 || body.trim().length > MAX_COMMENT_LENGTH) {
    throw new HttpsError("invalid-argument", "Komen tidak sah.");
  }
  const ref = db
    .collection("feed_posts")
    .doc(postId)
    .collection("comments")
    .doc(commentId);
  await assertOwner(ref, uid, "authorUid");
  await ref.update({
    text: body.trim(),
    editedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await logEvent({
    userId: uid,
    eventType: "comment_edited",
    metadata: {postId, commentId},
  });
  return {status: "OK"};
});

/** Soft delete komen sendiri. */
export const deleteUserComment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {postId, commentId} = (request.data ?? {}) as {
    postId?: string;
    commentId?: string;
  };
  if (!postId || !commentId) {
    throw new HttpsError("invalid-argument", "Data tidak lengkap.");
  }
  const ref = db
    .collection("feed_posts")
    .doc(postId)
    .collection("comments")
    .doc(commentId);
  await assertOwner(ref, uid, "authorUid");
  await ref.update({
    status: "deleted",
    deletedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await logEvent({
    userId: uid,
    eventType: "comment_deleted",
    metadata: {postId, commentId},
  });
  return {status: "OK"};
});
