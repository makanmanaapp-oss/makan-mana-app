import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {normalizeLower, normalizeUsernameLower} from "../domain/peopleSearch/normalize";

interface UpdateProfileInput {
  displayName?: string;
  username?: string;
  photoUrl?: string;
  // SP10: avatar default bertema. '' = kosongkan preset.
  avatarPreset?: string;
  // SP10: buang gambar dimuat naik (guna preset/fallback).
  removePhoto?: boolean;
}

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

// SP10: id preset sah (mesti padan client kAvatarPresets).
const AVATAR_PRESETS = ["sambalBowl", "magicPlate", "foodieMascot"];

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
  const removePhoto = input.removePhoto === true;
  // undefined = tak sentuh; '' = kosongkan; id sah = set.
  const avatarPresetRaw = input.avatarPreset;
  if (
    avatarPresetRaw !== undefined &&
    avatarPresetRaw !== "" &&
    !AVATAR_PRESETS.includes(avatarPresetRaw)
  ) {
    throw new HttpsError("invalid-argument", "Avatar tidak sah.");
  }

  if (displayName.length > 30) {
    throw new HttpsError("invalid-argument", "Nama terlalu panjang.");
  }
  if (username.length > 0 && !USERNAME_RE.test(username)) {
    throw new HttpsError(
      "invalid-argument",
      "Username: 3-20 aksara, huruf kecil/nombor/titik/garis bawah.",
    );
  }
  // SP10.1B: gambar Google Sign-In dihoskan di lh3.googleusercontent.com
  // — dibenarkan supaya foto akaun Google boleh dicermin ke profil awam.
  if (
    photoUrl.length > 0 &&
    !photoUrl.startsWith("https://firebasestorage.googleapis.com/") &&
    !photoUrl.startsWith("https://lh3.googleusercontent.com/")
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

    // SP10: photoUrl baharu ATAU buang gambar; preset avatar bertema.
    const photoField = photoUrl.length > 0 ?
      {photoUrl} :
      removePhoto ? {photoUrl: FieldValue.delete()} : {};
    const presetField = avatarPresetRaw === undefined ?
      {} :
      avatarPresetRaw === "" ?
        {avatarPreset: FieldValue.delete()} :
        {avatarPreset: avatarPresetRaw};

    tx.set(
      userRef,
      {
        ...(displayName.length > 0 ? {displayName} : {}),
        ...(username.length > 0 ? {username} : {}),
        ...photoField,
        ...presetField,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    // Cerminkan ke profil makanan awam (denormalisasi untuk feed & profil).
    // HOTFIX 4.6: usernameLower/displayNameLower = medan carian awalan (people
    // search) — HANYA identiti awam yang memang boleh ditemui, bukan medan peribadi.
    tx.set(
      db.collection("public_profiles").doc(uid),
      {
        uid,
        ...(displayName.length > 0 ? {displayName, displayNameLower: normalizeLower(displayName)} : {}),
        ...(username.length > 0 ? {username, usernameLower: normalizeUsernameLower(username)} : {}),
        ...photoField,
        ...presetField,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });

  return {status: "OK"};
});
