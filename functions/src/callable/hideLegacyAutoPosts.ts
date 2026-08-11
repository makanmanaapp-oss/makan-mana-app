import {onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {assertAdmin} from "../utils/adminAuth";

/**
 * Social Prompt 9: pembersihan SEKALI post auto lama.
 *
 * Isu lama: aliran "terima cadangan" dahulu mencipta feed_posts
 * type:"auto" AWAM tanpa persetujuan (dibaiki di SP1). Post lama itu
 * masih wujud & boleh dibaca terus (client menyorok, tetapi bacaan
 * dokumen langsung masih terdedah).
 *
 * Fungsi ini menanda post auto lama sebagai PERIBADI (pemilik sahaja)
 * + legacyAutoHidden:true. TIDAK memadam apa-apa (boleh balik semula).
 * Admin sahaja. Jalankan SEKALI selepas deploy (lihat laporan SP9.1).
 *
 * Idempotent: post yang sudah legacyAutoHidden dilangkau.
 */
export const hideLegacyAutoPosts = onCall(async (request) => {
  // SP9.2A: admin dipercayai via claim / ADMIN_UIDS (bukan isAdmin doc).
  assertAdmin(request);

  const dryRun = (request.data as {dryRun?: boolean} | undefined)?.dryRun
    === true;

  let scanned = 0;
  let updated = 0;
  let lastId: string | null = null;

  // Halaman 300 setiap pusingan supaya tidak melebihi had memori/masa.
  for (;;) {
    let q = db
      .collection("feed_posts")
      .where("type", "==", "auto")
      .orderBy("__name__")
      .limit(300);
    if (lastId) q = q.startAfter(lastId);
    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    let batchCount = 0;
    for (const doc of snap.docs) {
      scanned++;
      lastId = doc.id;
      const data = doc.data();
      if (data.legacyAutoHidden === true) continue;
      if (!dryRun) {
        batch.set(
          doc.ref,
          {
            visibility: "private",
            legacyAutoHidden: true,
            legacyHiddenAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
        batchCount++;
      }
      updated++;
    }
    if (!dryRun && batchCount > 0) await batch.commit();
    if (snap.size < 300) break;
  }

  return {status: "OK", dryRun, scanned, updated};
});
