import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {DUMMY_PLACES} from "../data/dummyPlaces";
import {logEvent} from "../services/eventService";
import {currentTimeSlot} from "../utils/timeSlot";

type FeedbackAction = "accept" | "reject" | "view_details" | "open_map";

interface PlaceSnapshot {
  name?: string;
  cuisine?: string;
  emoji?: string;
  priceLevel?: number;
  priceEstimate?: string;
  matchScore?: number;
}

interface SubmitFeedbackInput {
  suggestionId?: string;
  placeId?: string;
  sessionId?: string;
  action?: FeedbackAction;
  reason?: string;
  /** Snapshot tempat dari client (untuk tempat Google Places sebenar). */
  place?: PlaceSnapshot;
}

/** Terima maklum balas pengguna dan kemas kini AI Brain. */
export const submitFeedback = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }
  const input = (request.data ?? {}) as SubmitFeedbackInput;
  const action = input.action;
  if (!action || !["accept", "reject", "view_details", "open_map"].includes(action)) {
    throw new HttpsError("invalid-argument", "action tidak sah.");
  }
  const placeId = input.placeId ?? null;
  // Snapshot client diutamakan (tempat Google Places sebenar);
  // fallback ke senarai dummy pelayan.
  const dummy = DUMMY_PLACES.find((p) => p.placeId === placeId) ?? null;
  const snapshot = input.place ?? null;
  const place = snapshot || dummy ?
    {
      placeId: placeId ?? "",
      name: snapshot?.name ?? dummy?.name ?? "Tempat Makan",
      cuisine: snapshot?.cuisine ?? dummy?.cuisine ?? "Restoran",
      emoji: snapshot?.emoji ?? dummy?.emoji ?? "🍽️",
      priceLevel: snapshot?.priceLevel ?? dummy?.priceLevel ?? 1,
      priceEstimate: snapshot?.priceEstimate ?? dummy?.priceEstimate ?? "",
      matchScore: snapshot?.matchScore ?? dummy?.matchScore ?? null,
    } :
    null;

  // Kemas kini rekod cadangan.
  if (input.suggestionId) {
    const statusByAction: Record<FeedbackAction, string | null> = {
      accept: "accepted",
      reject: "rejected",
      view_details: null,
      open_map: null,
    };
    const status = statusByAction[action];
    if (status) {
      await db
        .collection("users")
        .doc(uid)
        .collection("suggestions")
        .doc(input.suggestionId)
        .set(
          {
            status,
            ...(input.reason ? {reason: input.reason} : {}),
            updatedAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
    }
  }

  // Kemas kini sesi.
  if (input.sessionId) {
    const sessionRef = db
      .collection("suggestion_sessions")
      .doc(input.sessionId);
    if (action === "accept") {
      await sessionRef.set(
        {
          acceptedPlaceId: placeId,
          finalAction: "accept",
          endedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    } else if (action === "reject" && placeId) {
      await sessionRef.set(
        {rejectedPlaceIds: FieldValue.arrayUnion(placeId)},
        {merge: true},
      );
    }
  }

  // Accept => rekod makan + siaran Feed Makan komuniti.
  if (action === "accept" && place && place.placeId) {
    await db.collection("users").doc(uid).collection("meals").add({
      placeId: place.placeId,
      placeNameSnapshot: place.name,
      cuisineTags: [place.cuisine],
      emoji: place.emoji,
      timeSlot: currentTimeSlot(),
      mealTime: new Date().toISOString(),
      source: "suggestion",
      matchScore: place.matchScore,
      priceLevel: place.priceLevel,
      priceEstimate: place.priceEstimate,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Feed komuniti: nama paparan sahaja, tiada uid didedahkan ke client.
    try {
      const userSnap = await db.collection("users").doc(uid).get();
      const email = (userSnap.data()?.email as string | undefined) ?? "";
      const displayName =
        (userSnap.data()?.displayName as string | undefined) ||
        (email.includes("@") ? email.split("@")[0] : "Foodie");
      const photoUrl =
        (userSnap.data()?.photoUrl as string | undefined) ?? null;
      await db.collection("feed_posts").add({
        type: "auto",
        authorUid: uid,
        displayName,
        photoUrl,
        text: null,
        imageUrl: null,
        groupId: null,
        placeId: place.placeId,
        placeName: place.name,
        cuisine: place.cuisine,
        emoji: place.emoji,
        timeSlot: currentTimeSlot(),
        matchScore: place.matchScore,
        likeCount: 0,
        likedBy: [],
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error("feed_posts gagal:", e);
    }
  }

  await logEvent({
    userId: uid,
    eventType: action,
    placeId,
    suggestionId: input.suggestionId ?? null,
    sessionId: input.sessionId ?? null,
    metadata: input.reason ? {reason: input.reason} : {},
  });

  return {status: "OK"};
});
