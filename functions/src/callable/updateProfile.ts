import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";

interface UpdateProfileInput {
  displayName?: string;
  username?: string;
  photoUrl?: string;
}

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

/**
 * Kemas kini profil sosial: nama paparan, username unik (@handle), gambar.
 * Username direzab dalam koleksi usernames/{username} secara transaksi
 * supaya tiada pertindihan (macam social media sebenar).
 */
export const updateProfile = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }
  const input = (request.data ?? {}) as UpdateProfileInput;
  const displayName = (input.displayName ?? "").trim();
  const username = (input.username ?? "").trim().toLowerCase();
  const photoUrl = (input.photoUrl ?? "").trim();

  if (displayName.length > 30) {
    throw new HttpsError("invalid-argument", "Nama terlalu panjang.");
  }
  if (username.length > 0 && !USERNAME_RE.test(username)) {
    throw new HttpsError(
      "invalid-argument",
      "Username: 3-20 aksara, huruf kecil/nombor/titik/garis bawah.",
    );
  }
  if (
    photoUrl.length > 0 &&
    !photoUrl.startsWith("https://firebasestorage.googleapis.com/")
  ) {
    throw new HttpsError("invalid-argument", "URL gambar tidak sah.");
  }

  const userRef = db.collection("users").doc(uid);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const oldUsername =
      (userSnap.data()?.username as string | undefined) ?? "";

    if (username.length > 0 && username !== oldUsername) {
      const unameRef = db.collection("usernames").doc(username);
      const unameSnap = await tx.get(unameRef);
      if (unameSnap.exists && unameSnap.data()?.uid !== uid) {
        throw new HttpsError(
          "already-exists",
          "Username ini sudah diambil.",
        );
      }
      tx.set(unameRef, {uid, claimedAt: FieldValue.serverTimestamp()});
      if (oldUsername.length > 0) {
        tx.delete(db.collection("usernames").doc(oldUsername));
      }
    }

    tx.set(
      userRef,
      {
        ...(displayName.length > 0 ? {displayName} : {}),
        ...(username.length > 0 ? {username} : {}),
        ...(photoUrl.length > 0 ? {photoUrl} : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    // Cerminkan ke profil makanan awam (denormalisasi untuk feed & profil).
    tx.set(
      db.collection("public_profiles").doc(uid),
      {
        uid,
        ...(displayName.length > 0 ? {displayName} : {}),
        ...(username.length > 0 ? {username} : {}),
        ...(photoUrl.length > 0 ? {photoUrl} : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });

  return {status: "OK"};
});
