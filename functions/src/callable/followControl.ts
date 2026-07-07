import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";

/**
 * Sistem sosial makan: follow / unfollow / mute / block / report.
 * Kiraan followersCount & followingCount diselenggara secara transaksi
 * dalam public_profiles (server-write sahaja supaya tidak boleh dipalsukan).
 */

const followId = (a: string, b: string) => `${a}_${b}`;

/** Pastikan dokumen public_profiles wujud (untuk kiraan). */
function profileRef(uid: string) {
  return db.collection("public_profiles").doc(uid);
}

/** Ikut seseorang. Idempotent. Disekat jika ada blok mana-mana arah. */
export const followUser = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {targetUid} = (request.data ?? {}) as {targetUid?: string};
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "targetUid perlu.");
  }
  if (targetUid === uid) {
    throw new HttpsError("invalid-argument", "Tak boleh ikut diri sendiri.");
  }

  // Sekat jika salah satu pihak menyekat.
  const blockA = await db.collection("blocks").doc(followId(uid, targetUid)).get();
  const blockB = await db.collection("blocks").doc(followId(targetUid, uid)).get();
  if (blockA.exists || blockB.exists) {
    throw new HttpsError("permission-denied", "Tidak dibenarkan.");
  }

  const fRef = db.collection("follows").doc(followId(uid, targetUid));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(fRef);
    if (snap.exists) return; // sudah ikut
    tx.set(fRef, {
      followerUid: uid,
      followingUid: targetUid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      profileRef(uid),
      {followingCount: FieldValue.increment(1)},
      {merge: true},
    );
    tx.set(
      profileRef(targetUid),
      {followersCount: FieldValue.increment(1)},
      {merge: true},
    );
  });

  await logEvent({
    userId: uid,
    eventType: "user_followed",
    metadata: {targetUid},
  });
  return {status: "OK", following: true};
});

/** Berhenti ikut. Idempotent. */
export const unfollowUser = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {targetUid} = (request.data ?? {}) as {targetUid?: string};
  if (!targetUid) throw new HttpsError("invalid-argument", "targetUid perlu.");

  const fRef = db.collection("follows").doc(followId(uid, targetUid));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(fRef);
    if (!snap.exists) return;
    tx.delete(fRef);
    tx.set(
      profileRef(uid),
      {followingCount: FieldValue.increment(-1)},
      {merge: true},
    );
    tx.set(
      profileRef(targetUid),
      {followersCount: FieldValue.increment(-1)},
      {merge: true},
    );
  });

  await logEvent({
    userId: uid,
    eventType: "user_unfollowed",
    metadata: {targetUid},
  });
  return {status: "OK", following: false};
});

/** Senyapkan (mute) - sembunyi dari feed tanpa unfollow. */
export const muteUser = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {targetUid, mute} = (request.data ?? {}) as {
    targetUid?: string;
    mute?: boolean;
  };
  if (!targetUid) throw new HttpsError("invalid-argument", "targetUid perlu.");

  const mRef = db.collection("mutes").doc(followId(uid, targetUid));
  if (mute === false) {
    await mRef.delete();
    return {status: "OK", muted: false};
  }
  await mRef.set({
    muterUid: uid,
    mutedUid: targetUid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return {status: "OK", muted: true};
});

/** Blok pengguna: buang follow dua hala + halang interaksi. */
export const blockUser = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {targetUid, block} = (request.data ?? {}) as {
    targetUid?: string;
    block?: boolean;
  };
  if (!targetUid) throw new HttpsError("invalid-argument", "targetUid perlu.");
  if (targetUid === uid) {
    throw new HttpsError("invalid-argument", "Tak boleh blok diri sendiri.");
  }

  const bRef = db.collection("blocks").doc(followId(uid, targetUid));
  if (block === false) {
    await bRef.delete();
    return {status: "OK", blocked: false};
  }

  const fwd = db.collection("follows").doc(followId(uid, targetUid));
  const rev = db.collection("follows").doc(followId(targetUid, uid));
  await db.runTransaction(async (tx) => {
    const fwdSnap = await tx.get(fwd);
    const revSnap = await tx.get(rev);
    tx.set(bRef, {
      blockerUid: uid,
      blockedUid: targetUid,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (fwdSnap.exists) {
      tx.delete(fwd);
      tx.set(profileRef(uid), {followingCount: FieldValue.increment(-1)}, {merge: true});
      tx.set(profileRef(targetUid), {followersCount: FieldValue.increment(-1)}, {merge: true});
    }
    if (revSnap.exists) {
      tx.delete(rev);
      tx.set(profileRef(targetUid), {followingCount: FieldValue.increment(-1)}, {merge: true});
      tx.set(profileRef(uid), {followersCount: FieldValue.increment(-1)}, {merge: true});
    }
  });

  await logEvent({
    userId: uid,
    eventType: "user_blocked",
    metadata: {targetUid},
  });
  return {status: "OK", blocked: true};
});

/** Lapor kandungan/pengguna untuk moderasi (server-write, admin baca). */
export const reportContent = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {targetType, targetId, targetUid, reason} = (request.data ?? {}) as {
    targetType?: string;
    targetId?: string;
    targetUid?: string;
    reason?: string;
  };
  const type = (targetType ?? "").trim();
  if (!["post", "comment", "user", "group", "bill"].includes(type)) {
    throw new HttpsError("invalid-argument", "Jenis laporan tidak sah.");
  }
  const trimmed = (reason ?? "").trim().slice(0, 300);

  await db.collection("reports").add({
    reporterUid: uid,
    targetType: type,
    targetId: (targetId ?? "").trim() || null,
    targetUid: (targetUid ?? "").trim() || null,
    reason: trimmed,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });
  await logEvent({
    userId: uid,
    eventType: "content_reported",
    metadata: {targetType: type, targetId: targetId ?? ""},
  });
  return {status: "OK"};
});
