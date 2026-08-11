import {onSchedule} from "firebase-functions/v2/scheduler";

import {db, FieldValue, Timestamp} from "../config/firebase";

/**
 * PROMPT 12: luputkan Pro Trial kupon yang sudah tamat (harian 03:30 MYT).
 * Cari users dengan planSource=='coupon' && couponExpiresAt <= now, dan
 * kembalikan pelan ke planBeforeCoupon / free. Simpan medan sejarah
 * kupon untuk audit. Refresh callable menjadi sandaran masa-nyata.
 */
export const expireCouponTrials = onSchedule(
  {schedule: "30 3 * * *", timeZone: "Asia/Kuala_Lumpur"},
  async () => {
    const now = Timestamp.now();
    const snap = await db
      .collection("users")
      .where("planSource", "==", "coupon")
      .where("couponExpiresAt", "<=", now)
      .limit(500)
      .get();

    if (snap.empty) {
      console.log("expireCouponTrials: tiada trial tamat.");
      return;
    }

    let batch = db.batch();
    let ops = 0;
    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      const restorePlan =
        (data.planBeforeCoupon as string | undefined) ?? "free";
      batch.set(
        doc.ref,
        {
          plan: restorePlan,
          planSource: "expired_coupon",
          couponStatus: "expired",
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      ops++;

      const code = data.couponCode as string | undefined;
      if (code) {
        batch.set(
          db.collection("coupon_redemptions").doc(`${doc.id}_${code}`),
          {status: "expired"},
          {merge: true},
        );
        ops++;
      }

      // Firestore batch had 500 tulisan.
      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
    console.log(`expireCouponTrials: ${snap.size} trial diluputkan.`);
  },
);
