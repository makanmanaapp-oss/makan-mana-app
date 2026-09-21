import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {appleAccountTokenFor} from "../domain/billing/appleAccountToken";

/**
 * Pengikatan pra-pembelian yang disahkan untuk App Store.
 *
 * Cerminan `prepareGooglePlayBilling`. Memulangkan UUID legap sahaja — tiada
 * rahsia bil didedahkan, dan UID tidak pernah meninggalkan pelayan.
 *
 * Klien menyerahkan nilai ini kepada StoreKit sebagai `appAccountToken`. Apple
 * MENGHENDAKI medan itu menjadi UUID RFC 4122, jadi UID Firebase tidak boleh
 * digunakan secara langsung; lihat `appleAccountToken.ts`.
 *
 * Pengikatan disimpan SEBELUM pembelian supaya notifikasi pelayan yang tiba
 * sebelum pengesahan klien masih boleh menyelesaikan pemiliknya.
 */
export const prepareAppleBilling = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }

  const appAccountToken = appleAccountTokenFor(uid);
  const ref = db.collection("subscription_account_links").doc(appAccountToken);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existingUid = (snap.data()?.uid as string | undefined) ?? "";

    if (existingUid && existingUid !== uid) {
      // Token diterbitkan daripada UID, jadi ini sepatutnya mustahil. Jika ia
      // berlaku, sesuatu yang lebih teruk sedang berlaku dan kita berhenti.
      throw new HttpsError(
        "permission-denied",
        "Token akaun App Store tidak sepadan dengan pengguna ini.",
      );
    }

    tx.set(
      ref,
      {
        uid,
        platform: "app_store",
        appAccountToken,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });

  return {status: "OK", appAccountToken};
});
