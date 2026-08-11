import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue, Timestamp} from "../config/firebase";
import {assertAdmin} from "../utils/adminAuth";

/**
 * PROMPT 12: cipta/kemas kini kod kupon — ADMIN/OWNER SAHAJA.
 * Guna assertAdmin (custom claim / allowlist UID) — BUKAN users.isAdmin.
 * Pengguna biasa tidak boleh cipta kupon.
 */

interface CreateCouponInput {
  code?: string;
  plan?: string;
  durationDays?: number;
  maxRedemptions?: number;
  validUntilMs?: number | null;
  oneUsePerUser?: boolean;
  allowedEmails?: string[];
  allowedUids?: string[];
  note?: string;
  active?: boolean;
}

export const createCoupon = onCall(async (request) => {
  const adminUid = assertAdmin(request);

  const input = (request.data ?? {}) as CreateCouponInput;
  const code = (input.code ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (code.length < 3 || code.length > 40) {
    throw new HttpsError("invalid-argument", "Kod kupon tidak sah.");
  }

  const plan = input.plan === "plus" ? "plus" : "pro";
  const durationDays =
    typeof input.durationDays === "number" && input.durationDays > 0 ?
      Math.min(365, Math.floor(input.durationDays)) :
      30;
  const maxRedemptions =
    typeof input.maxRedemptions === "number" && input.maxRedemptions > 0 ?
      Math.floor(input.maxRedemptions) :
      100;
  const validUntil =
    typeof input.validUntilMs === "number" ?
      Timestamp.fromMillis(input.validUntilMs) :
      null;

  const ref = db.collection("coupon_codes").doc(code);
  const existing = await ref.get();

  await ref.set(
    {
      code,
      active: input.active !== false,
      plan,
      durationDays,
      maxRedemptions,
      // Jangan reset kiraan jika kupon sudah wujud.
      redeemedCount: existing.exists ?
        (existing.data()?.redeemedCount ?? 0) :
        0,
      validFrom: existing.exists ?
        (existing.data()?.validFrom ?? FieldValue.serverTimestamp()) :
        FieldValue.serverTimestamp(),
      validUntil,
      oneUsePerUser: input.oneUsePerUser !== false,
      allowedEmails: input.allowedEmails ?? [],
      allowedUids: input.allowedUids ?? [],
      note: input.note ?? "Internal beta Pro trial",
      createdAt: existing.exists ?
        (existing.data()?.createdAt ?? FieldValue.serverTimestamp()) :
        FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: adminUid,
    },
    {merge: true},
  );

  return {success: true, code, plan, durationDays, maxRedemptions};
});
