import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";

interface AdminActionInput {
  reviewId?: string;
  action?: "approve" | "reject";
}

/**
 * Tindakan admin pada ulasan delivery pending.
 * Hanya pengguna dengan users/{uid}.isAdmin == true.
 * approve -> trigger onReviewApproved uruskan skor + feed + push.
 */
export const adminReviewAction = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }
  const userSnap = await db.collection("users").doc(uid).get();
  if (userSnap.data()?.isAdmin !== true) {
    throw new HttpsError("permission-denied", "Akses admin sahaja.");
  }

  const input = (request.data ?? {}) as AdminActionInput;
  const reviewId = (input.reviewId ?? "").trim();
  const action = input.action;
  if (reviewId.length === 0 ||
      (action !== "approve" && action !== "reject")) {
    throw new HttpsError("invalid-argument", "Input tidak sah.");
  }

  await db.collection("place_reviews").doc(reviewId).set(
    {
      status: action === "approve" ? "approved" : "rejected",
      moderatedBy: uid,
      moderatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  return {status: "OK"};
});
