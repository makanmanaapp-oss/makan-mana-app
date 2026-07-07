import {HttpsError, onCall} from "firebase-functions/v2/https";

import {
  ALGORITHM_VERSION,
  DEFAULT_ALGO_CONFIG_ID,
  DEFAULT_WEIGHTS,
} from "../config/constants";
import {db, FieldValue} from "../config/firebase";

/** Dev sahaja: cipta algo_configs/default_v1 jika belum wujud. */
export const seedDefaultAlgoConfig = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }
  const ref = db.collection("algo_configs").doc(DEFAULT_ALGO_CONFIG_ID);
  const snap = await ref.get();
  if (snap.exists) {
    return {status: "EXISTS"};
  }
  await ref.set({
    weights: DEFAULT_WEIGHTS,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: uid,
    isActive: true,
    algorithmVersion: ALGORITHM_VERSION,
  });
  return {status: "CREATED"};
});
