import * as admin from "firebase-admin";

import {db} from "../config/firebase";

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
    await admin.messaging().send({
      topic,
      notification: {title, body},
      android: {priority: "high"},
    });
  } catch (e) {
    console.error(`push topik ${topic} gagal:`, e);
  }
}
