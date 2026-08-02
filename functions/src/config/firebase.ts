import * as admin from "firebase-admin";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const db = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
// PROMPT 12: Timestamp RUNTIME (FirebaseFirestore.* ialah namespace jenis
// sahaja — undefined masa runtime → ReferenceError).
export const Timestamp = admin.firestore.Timestamp;
