/**
 * PROMPT 12 — Seed kod kupon Pro Trial (ADMIN/OWNER SAHAJA).
 *
 * Tiga cara cipta kupon MAKANBETA30 (pilih satu):
 *
 * ── CARA A: Firebase Console (paling mudah, tiada kredensial) ──
 *   Firestore → Start collection: coupon_codes
 *   Document ID: MAKANBETA30
 *   Fields:
 *     code            (string)    MAKANBETA30
 *     active          (boolean)   true
 *     plan            (string)    pro
 *     durationDays    (number)    30
 *     maxRedemptions  (number)    100
 *     redeemedCount   (number)    0
 *     oneUsePerUser   (boolean)   true
 *     allowedEmails   (array)     [] (kosong)
 *     allowedUids     (array)     [] (kosong)
 *     validFrom       (timestamp) now
 *     validUntil      (null)      null
 *     note            (string)    Internal beta 30-day Pro trial
 *     createdAt       (timestamp) now
 *     updatedAt       (timestamp) now
 *     createdBy       (string)    owner
 *
 * ── CARA B: callable createCoupon (log masuk sebagai owner) ──
 *   Panggil dari app/klien admin sebagai UID owner (allowlist):
 *     createCoupon({ code: "MAKANBETA30", plan: "pro",
 *                    durationDays: 30, maxRedemptions: 100 })
 *
 * ── CARA C: skrip ini (perlu service account / ADC owner) ──
 *   1. Set GOOGLE_APPLICATION_CREDENTIALS ke kunci service account, atau
 *      `gcloud auth application-default login` sebagai pemilik projek.
 *   2. cd functions && npx ts-node ../scripts/create_coupon.ts
 */
import * as admin from "firebase-admin";

if (admin.apps.length === 0) {
  admin.initializeApp({projectId: "makanmana-c59f3"});
}
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

async function main() {
  const code = "MAKANBETA30";
  await db.collection("coupon_codes").doc(code).set({
    code,
    active: true,
    plan: "pro",
    durationDays: 30,
    maxRedemptions: 100,
    redeemedCount: 0,
    oneUsePerUser: true,
    allowedEmails: [],
    allowedUids: [],
    validFrom: FieldValue.serverTimestamp(),
    validUntil: null,
    note: "Internal beta 30-day Pro trial",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: "owner",
  });
  console.log(`Kupon ${code} dicipta / dikemas kini.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
