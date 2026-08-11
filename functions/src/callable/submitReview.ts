import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {
  haversineMeters,
  recomputePlaceRating,
} from "../services/reviewService";
import {currentTimeSlot} from "../utils/timeSlot";

type ReviewSource = "meal" | "checkin" | "delivery";

interface SubmitReviewInput {
  placeId?: string;
  placeName?: string;
  emoji?: string;
  cuisine?: string;
  rating?: number;
  text?: string;
  imageUrl?: string;
  source?: ReviewSource;
  mealId?: string;
  lat?: number;
  lng?: number;
  shareToFeed?: boolean;
}

const MAX_TEXT = 500;
const MAX_REVIEWS_PER_DAY = 5;
const CHECKIN_MIN_MINUTES = 5;
const CHECKIN_MAX_DRIFT_METERS = 250;

/**
 * Hantar rating kedai. Tiga laluan kelayakan:
 * - meal: rekod makan via app (verified, terus approved)
 * - checkin: check-in lokasi >= 5 minit + masih berdekatan (approved)
 * - delivery: tiada bukti fizikal -> status pending (kelulusan admin)
 * Satu ulasan per kedai per pengguna (hantar semula = kemas kini).
 */
export const submitReview = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }
  const input = (request.data ?? {}) as SubmitReviewInput;
  const placeId = (input.placeId ?? "").trim();
  const rating = input.rating ?? 0;
  const text = (input.text ?? "").trim();
  const imageUrl = (input.imageUrl ?? "").trim();
  const source = input.source;

  if (placeId.length === 0) {
    throw new HttpsError("invalid-argument", "placeId diperlukan.");
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpsError("invalid-argument", "Rating mesti 1 hingga 5.");
  }
  if (text.length > MAX_TEXT) {
    throw new HttpsError("invalid-argument", "Ulasan terlalu panjang.");
  }
  if (
    imageUrl.length > 0 &&
    !imageUrl.startsWith("https://firebasestorage.googleapis.com/")
  ) {
    throw new HttpsError("invalid-argument", "URL gambar tidak sah.");
  }
  if (!source || !["meal", "checkin", "delivery"].includes(source)) {
    throw new HttpsError("invalid-argument", "source tidak sah.");
  }

  // Had kelajuan anti-spam: maks 5 ulasan sehari.
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const recent = await db
    .collection("place_reviews")
    .where("authorUid", "==", uid)
    .where("updatedAt", ">=", dayAgo)
    .limit(MAX_REVIEWS_PER_DAY)
    .get();
  const reviewId = `${placeId}_${uid}`;
  const isUpdate =
    recent.docs.some((d) => d.id === reviewId) ||
    (await db.collection("place_reviews").doc(reviewId).get()).exists;
  if (!isUpdate && recent.size >= MAX_REVIEWS_PER_DAY) {
    throw new HttpsError(
      "resource-exhausted",
      "Had ulasan harian dicapai. Cuba esok.",
    );
  }

  // Sahkan kelayakan mengikut laluan.
  let status = "pending";
  if (source === "meal") {
    const mealId = (input.mealId ?? "").trim();
    if (mealId.length === 0) {
      throw new HttpsError("invalid-argument", "mealId diperlukan.");
    }
    const meal = await db
      .collection("users")
      .doc(uid)
      .collection("meals")
      .doc(mealId)
      .get();
    if (!meal.exists || meal.data()?.placeId !== placeId) {
      throw new HttpsError(
        "permission-denied",
        "Rekod makan tidak sepadan.",
      );
    }
    status = "approved";
    await meal.ref.set(
      {satisfactionRating: rating},
      {merge: true},
    );
  } else if (source === "checkin") {
    if (input.lat == null || input.lng == null) {
      throw new HttpsError("invalid-argument", "Lokasi diperlukan.");
    }
    const checkin = await db
      .collection("checkins")
      .doc(`${uid}_${placeId}`)
      .get();
    const startedAt = checkin.data()?.startedAt?.toDate?.() as
      | Date
      | undefined;
    if (!checkin.exists || !startedAt) {
      throw new HttpsError(
        "failed-precondition",
        "Check-in dahulu di kedai.",
      );
    }
    const minutes = (Date.now() - startedAt.getTime()) / 60000;
    if (minutes < CHECKIN_MIN_MINUTES) {
      throw new HttpsError(
        "failed-precondition",
        "Belum cukup 5 minit di lokasi.",
      );
    }
    const drift = haversineMeters(
      checkin.data()?.lat as number,
      checkin.data()?.lng as number,
      input.lat,
      input.lng,
    );
    if (drift > CHECKIN_MAX_DRIFT_METERS) {
      throw new HttpsError(
        "failed-precondition",
        "Anda sudah jauh dari lokasi check-in.",
      );
    }
    status = "approved";
  }
  // source === "delivery" kekal pending.

  const userSnap = await db.collection("users").doc(uid).get();
  const email = (userSnap.data()?.email as string | undefined) ?? "";
  const displayName =
    (userSnap.data()?.displayName as string | undefined) ||
    (email.includes("@") ? email.split("@")[0] : "Foodie");
  const photoUrl =
    (userSnap.data()?.photoUrl as string | undefined) ?? null;

  const shareToFeed = input.shareToFeed ?? true;
  await db.collection("place_reviews").doc(reviewId).set(
    {
      placeId,
      placeName: input.placeName ?? null,
      emoji: input.emoji ?? "🍽️",
      cuisine: input.cuisine ?? null,
      authorUid: uid,
      displayName,
      rating,
      text: text.length > 0 ? text : null,
      imageUrl: imageUrl.length > 0 ? imageUrl : null,
      source,
      status,
      shareToFeed,
      editCount: FieldValue.increment(1),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  if (status === "approved") {
    await recomputePlaceRating(placeId);
    if (shareToFeed) {
      await db.collection("feed_posts").add({
        type: "review",
        authorUid: uid,
        displayName,
        photoUrl,
        text: text.length > 0 ? text : null,
        imageUrl: imageUrl.length > 0 ? imageUrl : null,
        groupId: null,
        // Social 1.1: setiap post baharu WAJIB ada visibility eksplisit.
        // Review dikongsi hanya bila shareToFeed=true (persetujuan jelas).
        visibility: "public",
        placeId,
        placeName: input.placeName ?? null,
        cuisine: input.cuisine ?? null,
        emoji: input.emoji ?? "🍽️",
        reviewRating: rating,
        timeSlot: currentTimeSlot(),
        likeCount: 0,
        likedBy: [],
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  await logEvent({
    userId: uid,
    eventType: "meal_rated",
    placeId,
    metadata: {rating, source, status},
  });

  return {status: "OK", reviewStatus: status};
});
