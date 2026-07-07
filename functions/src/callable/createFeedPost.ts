import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {currentTimeSlot} from "../utils/timeSlot";

interface CreateFeedPostInput {
  text?: string;
  imageUrl?: string;
  groupId?: string;
  placeId?: string;
  placeName?: string;
  emoji?: string;
  visibility?: string;
  postType?: string;
  payload?: Record<string, unknown>;
}

const MAX_TEXT_LENGTH = 500;

const VISIBILITIES = [
  "public",
  "followers_only",
  "group_only",
  "private",
  "unlisted",
];

const POST_TYPES = [
  "food_post",
  "meal_review",
  "suggestion_result",
  "budget_insight",
  "group_poll",
  "group_result",
  "meal_wallet_share",
  "status",
];

/**
 * Siaran ke Feed Makan (awam/pengikut/grup/peribadi) dengan pemilih
 * keterlihatan dan jenis siaran. Melalui pelayan untuk sahkan & moderate.
 */
export const createFeedPost = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }
  const input = (request.data ?? {}) as CreateFeedPostInput;
  const text = (input.text ?? "").trim();
  const imageUrl = (input.imageUrl ?? "").trim();
  const groupId = (input.groupId ?? "").trim();
  const payload = input.payload ?? null;

  const postType = POST_TYPES.includes(input.postType ?? "")
    ? input.postType!
    : "food_post";
  const isShareCard = postType !== "food_post" && postType !== "status";

  // Siaran biasa perlu ada kandungan; kad kongsi (payload) boleh tanpa teks.
  if (text.length === 0 && imageUrl.length === 0 && !isShareCard) {
    throw new HttpsError("invalid-argument", "Post kosong.");
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new HttpsError("invalid-argument", "Teks terlalu panjang.");
  }
  if (
    imageUrl.length > 0 &&
    !imageUrl.startsWith("https://firebasestorage.googleapis.com/")
  ) {
    throw new HttpsError("invalid-argument", "URL gambar tidak sah.");
  }

  // Post grup: mesti ahli grup tersebut.
  if (groupId.length > 0) {
    const member = await db
      .collection("groups")
      .doc(groupId)
      .collection("members")
      .doc(uid)
      .get();
    if (!member.exists) {
      throw new HttpsError(
        "permission-denied",
        "Sertai grup dahulu untuk post.",
      );
    }
  }

  // Keterlihatan: grup memaksa group_only; jika tidak ikut pilihan pengguna.
  let visibility = VISIBILITIES.includes(input.visibility ?? "")
    ? input.visibility!
    : "public";
  if (groupId.length > 0) visibility = "group_only";

  const userSnap = await db.collection("users").doc(uid).get();
  const email = (userSnap.data()?.email as string | undefined) ?? "";
  const displayName =
    (userSnap.data()?.displayName as string | undefined) ||
    (email.includes("@") ? email.split("@")[0] : "Foodie");
  const photoUrl =
    (userSnap.data()?.photoUrl as string | undefined) ?? null;
  const username =
    (userSnap.data()?.username as string | undefined) ?? null;

  const ref = await db.collection("feed_posts").add({
    type: postType === "meal_review" ? "review" : "status",
    postType,
    authorUid: uid,
    displayName,
    username,
    photoUrl,
    text,
    imageUrl: imageUrl.length > 0 ? imageUrl : null,
    groupId: groupId.length > 0 ? groupId : null,
    visibility,
    payload: isShareCard ? payload : null,
    placeId: input.placeId ?? null,
    placeName: input.placeName ?? null,
    emoji: input.emoji ?? "😋",
    likeCount: 0,
    likedBy: [],
    commentCount: 0,
    timeSlot: currentTimeSlot(),
    createdAt: FieldValue.serverTimestamp(),
  });

  // Kiraan postsCount hanya untuk siaran awam/pengikut (bukan grup/peribadi).
  if (
    groupId.length === 0 &&
    (visibility === "public" || visibility === "followers_only")
  ) {
    await db
      .collection("public_profiles")
      .doc(uid)
      .set({postsCount: FieldValue.increment(1)}, {merge: true});
  }

  await logEvent({
    userId: uid,
    eventType: "feed_post_created",
    metadata: {postId: ref.id, postType, visibility, groupId},
  });

  return {status: "OK", postId: ref.id};
});
