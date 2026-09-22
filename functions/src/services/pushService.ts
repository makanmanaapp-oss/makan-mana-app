import * as admin from "firebase-admin";

import {db} from "../config/firebase";
import {decideEgress} from "../domain/security/egressGuard";
import {firebaseAdminTargetProject} from "./egressTargets";

/** Hantar push ke seorang pengguna (senyap gagal - UX tak terjejas). */
export async function pushToUser(
  uid: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    const snap = await db.collection("users").doc(uid).get();
    const token = snap.data()?.fcmToken as string | undefined;
    if (!token) return;
    // Wave 3D: projek yang klien FCM SEBENARNYA sasarkan, bukan hanya runtime.
    const egress = decideEgress({kind: "fcm_push", targetProjectId: firebaseAdminTargetProject()});
    if (!egress.allowed) throw new Error(egress.reason);
    await admin.messaging().send({
      token,
      notification: {title, body},
      android: {priority: "high"},
    });
  } catch (e) {
    console.error(`push ke ${uid} gagal:`, e);
  }
}

/** Hantar push ke topik (cth. meal_reminders). */
export async function pushToTopic(
  topic: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    // Wave 3D: projek yang klien FCM SEBENARNYA sasarkan, bukan hanya runtime.
    const egress = decideEgress({kind: "fcm_push", targetProjectId: firebaseAdminTargetProject()});
    if (!egress.allowed) throw new Error(egress.reason);
    await admin.messaging().send({
      topic,
      notification: {title, body},
      android: {priority: "high"},
    });
  } catch (e) {
    console.error(`push topik ${topic} gagal:`, e);
  }
}
