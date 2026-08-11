import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {assertAdmin} from "../utils/adminAuth";

interface AdminActionInput {
  reviewId?: string;
  action?: "approve" | "reject";
}

/**
 * Tindakan admin pada ulasan delivery pending.
 * SP9.2A: admin disahkan via custom claim / ADMIN_UIDS (BUKAN lagi
 * users/{uid}.isAdmin yang pernah client-writable).
 * approve -> trigger onReviewApproved uruskan skor + feed + push.
 */
export const adminReviewAction = onCall(async (request) => {
  const uid = assertAdmin(request);

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
