import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {currentTimeSlot} from "../utils/timeSlot";

interface CreateFeedPostInput {
  text?: string;
  imageUrl?: string;
  // Social Prompt 8: multi-gambar (1-6). imageUrl kekal = gambar pertama
  // untuk keserasian ke belakang.
  imageUrls?: string[];
  groupId?: string;
  placeId?: string;
  placeName?: string;
  emoji?: string;
  visibility?: string;
  postType?: string;
  payload?: Record<string, unknown>;
  // Social Prompt 4: medan check-in (semua pilihan; disahkan di bawah).
  areaLabel?: string;
  menuName?: string;
  totalSpend?: number;
  userRating?: number;
  moodTags?: string[];
}

const MAX_TEXT_LENGTH = 500;
const MAX_IMAGES = 6;

const STORAGE_URL_PREFIX = "https://firebasestorage.googleapis.com/";

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
  "checkin",
];

/**
 * Social Prompt 4: sahkan medan check-in dari composer.
 * PRIVASI: hanya teks yang pengguna taip sendiri — TIADA lat/lng,
 * TIADA data alahan/kesihatan. Nilai luar julat dibuang senyap (null).
 */
function sanitizeCheckinFields(input: CreateFeedPostInput) {
  const areaLabel = (input.areaLabel ?? "").trim().slice(0, 60);
  const menuName = (input.menuName ?? "").trim().slice(0, 80);
  const spendRaw = input.totalSpend;
  const totalSpend =
    typeof spendRaw === "number" && isFinite(spendRaw) && spendRaw >= 0
      ? Math.round(spendRaw * 100) / 100
      : null;
  const ratingRaw = input.userRating;
  const userRating =
    typeof ratingRaw === "number" &&
    Number.isInteger(ratingRaw) &&
    ratingRaw >= 1 &&
    ratingRaw <= 5
      ? ratingRaw
      : null;
  const moodTags = Array.isArray(input.moodTags)
    ? input.moodTags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 24)
        .slice(0, 6)
    : [];
  return {
    areaLabel: areaLabel.length > 0 ? areaLabel : null,
    menuName: menuName.length > 0 ? menuName : null,
    totalSpend,
    userRating,
    moodTags,
  };
}

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
  // SP8: gabungkan imageUrls[] baharu dengan imageUrl lama (serasi dua
  // arah); sahkan setiap URL; had 6.
  const rawUrls = Array.isArray(input.imageUrls) ? input.imageUrls : [];
  const singleUrl = (input.imageUrl ?? "").trim();
  const imageUrls = [
    ...rawUrls
      .filter((u): u is string => typeof u === "string")
      .map((u) => u.trim())
      .filter((u) => u.length > 0),
    ...(singleUrl.length > 0 && !rawUrls.includes(singleUrl) ?
      [singleUrl] :
      []),
  ]
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, MAX_IMAGES);
  const imageUrl = imageUrls[0] ?? "";
  const groupId = (input.groupId ?? "").trim();
  const payload = input.payload ?? null;

  const postType = POST_TYPES.includes(input.postType ?? "")
    ? input.postType!
    : "food_post";
  const isCheckin = postType === "checkin";
  const isShareCard =
    postType !== "food_post" && postType !== "status" && !isCheckin;

  const checkin = isCheckin ? sanitizeCheckinFields(input) : null;
  const placeName = (input.placeName ?? "").trim();

  // Check-in: mesti ada nama tempat ATAU cerita ringkas.
  if (isCheckin && placeName.length === 0 && text.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "Masukkan nama kedai atau cerita ringkas dulu.",
    );
  }
  // Siaran biasa perlu ada kandungan; kad kongsi (payload) boleh tanpa teks.
  if (
    text.length === 0 &&
    imageUrl.length === 0 &&
    !isShareCard &&
    !isCheckin
  ) {
    throw new HttpsError("invalid-argument", "Post kosong.");
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new HttpsError("invalid-argument", "Teks terlalu panjang.");
  }
  for (const u of imageUrls) {
    if (!u.startsWith(STORAGE_URL_PREFIX)) {
      throw new HttpsError("invalid-argument", "URL gambar tidak sah.");
    }
  }

  // Post grup: mesti ahli grup tersebut DAN grup belum dipadam (FIX 3).
  if (groupId.length > 0) {
    const gRef = db.collection("groups").doc(groupId);
    const [gSnap, member] = await Promise.all([
      gRef.get(),
      gRef.collection("members").doc(uid).get(),
    ]);
    if ((gSnap.data()?.status as string | undefined) === "deleted") {
      throw new HttpsError("failed-precondition", "Grup telah dipadam.");
    }
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
  // SP9.2B: followers_only DIMATIKAN untuk public beta — tolak cubaan
  // cipta (client tidak menawarkannya; ini kuat kuasa pelayan).
  if (visibility === "followers_only") {
    throw new HttpsError(
      "failed-precondition",
      "Perkongsian pengikut-sahaja tidak tersedia buat sementara semasa beta.",
    );
  }

  const userSnap = await db.collection("users").doc(uid).get();
  const email = (userSnap.data()?.email as string | undefined) ?? "";
  const displayName =
    (userSnap.data()?.displayName as string | undefined) ||
    (email.includes("@") ? email.split("@")[0] : "Foodie");
  const photoUrl =
    (userSnap.data()?.photoUrl as string | undefined) ?? null;
  const username =
    (userSnap.data()?.username as string | undefined) ?? null;
  // SP10: avatar preset bertema (fallback bila tiada photoUrl).
  const avatarPreset =
    (userSnap.data()?.avatarPreset as string | undefined) ?? null;

  const ref = await db.collection("feed_posts").add({
    avatarPreset,
    type: postType === "meal_review" ?
      "review" :
      isCheckin ? "checkin" : "status",
    postType,
    authorUid: uid,
    displayName,
    username,
    photoUrl,
    text,
    imageUrl: imageUrl.length > 0 ? imageUrl : null,
    // SP8: senarai penuh + kiraan media (imageUrl = pertama, serasi lama).
    imageUrls: imageUrls.length > 0 ? imageUrls : null,
    mediaCount: imageUrls.length,
    groupId: groupId.length > 0 ? groupId : null,
    visibility,
    payload: isShareCard ? payload : null,
    placeId: input.placeId ?? null,
    placeName: placeName.length > 0 ? placeName : null,
    emoji: input.emoji ?? "😋",
    likeCount: 0,
    likedBy: [],
    commentCount: 0,
    timeSlot: currentTimeSlot(),
    createdAt: FieldValue.serverTimestamp(),
    // Social Prompt 4: metadata check-in (null jika bukan check-in).
    // PRIVASI: tiada lat/lng — areaLabel teks kasar sahaja.
    ...(isCheckin && checkin ?
      {
        areaLabel: checkin.areaLabel,
        menuName: checkin.menuName,
        totalSpend: checkin.totalSpend,
        currency: "MYR",
        userRating: checkin.userRating,
        moodTags: checkin.moodTags,
        source: "composer_checkin",
        commentEnabled: true,
        updatedAt: FieldValue.serverTimestamp(),
      } :
      {}),
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
