import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";

interface CheckInInput {
  placeId?: string;
  placeName?: string;
  lat?: number;
  lng?: number;
}

/**
 * Check-in di kedai (bukti dine-in untuk rating walk-in).
 * Lokasi + masa direkod; submitReview akan sahkan pengguna
 * masih berdekatan selepas >= 5 minit.
 */
export const checkIn = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }
  const input = (request.data ?? {}) as CheckInInput;
  const placeId = (input.placeId ?? "").trim();
  if (placeId.length === 0 || input.lat == null || input.lng == null) {
    throw new HttpsError(
      "invalid-argument",
      "placeId dan lokasi diperlukan.",
    );
  }

  await db.collection("checkins").doc(`${uid}_${placeId}`).set({
    uid,
    placeId,
    placeName: input.placeName ?? null,
    lat: input.lat,
    lng: input.lng,
    startedAt: FieldValue.serverTimestamp(),
  });

  return {status: "OK"};
});
