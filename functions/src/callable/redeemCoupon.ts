import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue, Timestamp} from "../config/firebase";

/**
 * PROMPT 12: tebus kod kupon → akses Pro sementara (cth. 30 hari).
 *
 * KESELAMATAN:
 * - Klien TIDAK PERNAH menulis users.plan atau mencipta coupon_redemptions.
 *   Semua tulisan berlaku di sini (Admin SDK memintas rules).
 * - Transaksi atomik: baca kupon + user + rekod tebusan, cipta rekod,
 *   naikkan redeemedCount, kemas kini plan — semua atau tiada.
 * - Kod dinormalisasi (trim/upper/buang ruang) supaya doc ID stabil.
 * - Pelan Pro BERBAYAR / manual (planSource != coupon) TIDAK ditimpa.
 */

interface RedeemInput {
  code?: string;
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export const redeemCoupon = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }
  const email = (request.auth?.token?.email as string | undefined) ?? "";

  const input = (request.data ?? {}) as RedeemInput;
  const code = normalizeCode(input.code ?? "");
  if (code.length === 0) {
    throw new HttpsError("invalid-argument", "Kod kupon tidak sah.");
  }

  const couponRef = db.collection("coupon_codes").doc(code);
  const userRef = db.collection("users").doc(uid);
  const redemptionRef = db
    .collection("coupon_redemptions")
    .doc(`${uid}_${code}`);

  const result = await db.runTransaction(async (tx) => {
    const couponSnap = await tx.get(couponRef);
    if (!couponSnap.exists) {
      throw new HttpsError("not-found", "Kod kupon tidak sah.");
    }
    const coupon = couponSnap.data() as Record<string, unknown>;

    if (coupon.active !== true) {
      throw new HttpsError("failed-precondition", "Kod kupon tidak sah.");
    }

    const now = Date.now();
    const validFrom = coupon.validFrom as
      | FirebaseFirestore.Timestamp
      | undefined;
    const validUntil = coupon.validUntil as
      | FirebaseFirestore.Timestamp
      | null
      | undefined;
    if (validFrom && now < validFrom.toMillis()) {
      throw new HttpsError("failed-precondition", "Kod kupon tidak sah.");
    }
    if (validUntil && now > validUntil.toMillis()) {
      throw new HttpsError(
        "failed-precondition",
        "Kod kupon ini sudah tamat tempoh.",
      );
    }

    const maxRedemptions = (coupon.maxRedemptions as number | undefined) ?? 0;
    const redeemedCount = (coupon.redeemedCount as number | undefined) ?? 0;
    if (maxRedemptions > 0 && redeemedCount >= maxRedemptions) {
      throw new HttpsError(
        "resource-exhausted",
        "Kod kupon ini sudah mencapai had penggunaan.",
      );
    }

    // Kelayakan email/uid tertentu (jika ditetapkan).
    const allowedEmails = (coupon.allowedEmails as string[] | undefined) ?? [];
    const allowedUids = (coupon.allowedUids as string[] | undefined) ?? [];
    if (
      allowedEmails.length > 0 &&
      !allowedEmails.map((e) => e.toLowerCase()).includes(email.toLowerCase())
    ) {
      throw new HttpsError(
        "permission-denied",
        "Kod ini tidak tersedia untuk akaun ini.",
      );
    }
    if (allowedUids.length > 0 && !allowedUids.includes(uid)) {
      throw new HttpsError(
        "permission-denied",
        "Kod ini tidak tersedia untuk akaun ini.",
      );
    }

    // Satu guna per pengguna.
    const oneUsePerUser = coupon.oneUsePerUser !== false; // lalai true
    const redemptionSnap = await tx.get(redemptionRef);
    if (oneUsePerUser && redemptionSnap.exists) {
      throw new HttpsError(
        "already-exists",
        "Kod ini sudah pernah digunakan oleh akaun ini.",
      );
    }

    const userSnap = await tx.get(userRef);
    const userData = (userSnap.data() ?? {}) as Record<string, unknown>;
    const currentPlan = (userData.plan as string | undefined) ?? "free";
    const currentSource =
      (userData.planSource as string | undefined) ?? "";

    // (11) Pro BERBAYAR/manual — jangan timpa. Hanya coupon/expired_coupon
    // /free/kosong boleh dinaik taraf oleh kupon.
    const isPaidLikePro =
      currentPlan === "pro" &&
      currentSource !== "coupon" &&
      currentSource !== "expired_coupon";
    if (isPaidLikePro) {
      throw new HttpsError(
        "failed-precondition",
        "Anda sudah ada akses Pro.",
      );
    }

    // (12) Sudah ada kupon aktif — tolak dengan mesej mesra (dasar
    // selamat: tiada tindih; suruh tunggu tamat).
    const existingExpiry = userData.couponExpiresAt as
      | FirebaseFirestore.Timestamp
      | undefined;
    if (
      currentSource === "coupon" &&
      existingExpiry &&
      existingExpiry.toMillis() > now
    ) {
      throw new HttpsError(
        "already-exists",
        "Anda sudah ada Pro Trial aktif.",
      );
    }

    const plan = (coupon.plan as string | undefined) ?? "pro";
    const durationDays = (coupon.durationDays as number | undefined) ?? 30;
    const expiresAtMs = now + durationDays * 24 * 60 * 60 * 1000;
    const expiresAt = Timestamp.fromMillis(expiresAtMs);

    // Pelan sebelum kupon: jika sudah pernah kupon/expired, guna
    // planBeforeCoupon lama supaya tamat kembali ke pelan asal.
    const planBeforeCoupon =
      currentSource === "coupon" || currentSource === "expired_coupon" ?
        ((userData.planBeforeCoupon as string | undefined) ?? "free") :
        currentPlan;

    // Cipta rekod tebusan.
    tx.set(redemptionRef, {
      uid,
      code,
      plan,
      durationDays,
      redeemedAt: FieldValue.serverTimestamp(),
      expiresAt,
      previousPlan: planBeforeCoupon,
      status: "active",
      source: "coupon",
    });

    // Naikkan kiraan tebusan.
    tx.update(couponRef, {
      redeemedCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Kemas kini pelan pengguna (server-only).
    tx.set(
      userRef,
      {
        plan,
        planSource: "coupon",
        couponCode: code,
        couponRedeemedAt: FieldValue.serverTimestamp(),
        couponExpiresAt: expiresAt,
        planBeforeCoupon,
        couponStatus: "active",
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    return {plan, expiresAtMs};
  });

  return {
    success: true,
    plan: result.plan,
    expiresAt: result.expiresAtMs,
    message: "Kod berjaya ditebus. Pro aktif selama 30 hari.",
  };
});
