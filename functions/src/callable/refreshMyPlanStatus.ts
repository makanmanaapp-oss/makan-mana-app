import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";

/**
 * PROMPT 12: semak & luputkan Pro Trial pengguna semasa (dipanggil bila
 * app dibuka). Jika kupon sudah tamat, kembalikan pelan ke asal
 * (planBeforeCoupon / free) — server-side, klien tidak menulis plan.
 * Selamat dipanggil bila-bila masa: no-op jika tiada kupon aktif tamat.
 */
export const refreshMyPlanStatus = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }

  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();
  const data = (snap.data() ?? {}) as Record<string, unknown>;

  const planSource = (data.planSource as string | undefined) ?? "";
  const plan = (data.plan as string | undefined) ?? "free";
  const expiresAt = data.couponExpiresAt as
    | FirebaseFirestore.Timestamp
    | undefined;

  const now = Date.now();
  const expired =
    planSource === "coupon" &&
    expiresAt !== undefined &&
    expiresAt.toMillis() <= now;

  if (!expired) {
    return {plan, planSource, changed: false};
  }

  const restorePlan = (data.planBeforeCoupon as string | undefined) ?? "free";
  await userRef.set(
    {
      plan: restorePlan,
      planSource: "expired_coupon",
      couponStatus: "expired",
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  // Tandakan rekod tebusan tamat (jika ada).
  const code = data.couponCode as string | undefined;
  if (code) {
    await db
      .collection("coupon_redemptions")
      .doc(`${uid}_${code}`)
      .set({status: "expired"}, {merge: true})
      .catch(() => undefined);
  }

  return {plan: restorePlan, planSource: "expired_coupon", changed: true};
});
