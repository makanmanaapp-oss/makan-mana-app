import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";

/**
 * Group Hub: peranan owner/admin/member/viewer, keahlian, tetapan, pin.
 * Semua tulisan peranan melalui pelayan supaya tidak boleh dipalsukan.
 */

const ROLES = ["owner", "admin", "member", "viewer"];

/** Dapatkan peranan pengguna dalam grup, atau null jika bukan ahli. */
async function roleOf(groupId: string, uid: string): Promise<string | null> {
  const snap = await db
    .collection("groups")
    .doc(groupId)
    .collection("members")
    .doc(uid)
    .get();
  return snap.exists ? ((snap.data()?.role as string) ?? "member") : null;
}

function assertManager(role: string | null) {
  if (role !== "owner" && role !== "admin") {
    throw new HttpsError("permission-denied", "Owner/admin sahaja.");
  }
}

/** Cipta grup baru; pencipta jadi owner. */
export const createGroupV2 = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {name, emoji, description, privacy} = (request.data ?? {}) as {
    name?: string;
    emoji?: string;
    description?: string;
    privacy?: string;
  };
  const trimmed = (name ?? "").trim();
  if (trimmed.length < 2 || trimmed.length > 40) {
    throw new HttpsError("invalid-argument", "Nama grup 2-40 aksara.");
  }
  const priv = privacy === "private" ? "private" : "public";

  const userSnap = await db.collection("users").doc(uid).get();
  const displayName =
    (userSnap.data()?.displayName as string | undefined) || "Foodie";
  const photoUrl = (userSnap.data()?.photoUrl as string | undefined) ?? null;

  const groupRef = db.collection("groups").doc();
  const batch = db.batch();
  batch.set(groupRef, {
    name: trimmed,
    emoji: (emoji ?? "🍜").trim() || "🍜",
    description: (description ?? "").trim().slice(0, 200),
    privacy: priv,
    ownerUid: uid,
    createdBy: uid,
    memberCount: 1,
    pinnedPlaceId: null,
    pinnedPlaceName: null,
    pinnedAnnouncement: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(groupRef.collection("members").doc(uid), {
    uid,
    role: "owner",
    displayName,
    photoUrl,
    joinedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  await logEvent({
    userId: uid,
    eventType: "group_created",
    metadata: {groupId: groupRef.id},
  });
  return {status: "OK", groupId: groupRef.id};
});

/** Sertai grup awam sendiri (jadi member). */
export const joinGroupV2 = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {groupId} = (request.data ?? {}) as {groupId?: string};
  if (!groupId) throw new HttpsError("invalid-argument", "groupId perlu.");

  const groupRef = db.collection("groups").doc(groupId);
  const gSnap = await groupRef.get();
  if (!gSnap.exists) throw new HttpsError("not-found", "Grup tiada.");
  if ((gSnap.data()?.privacy as string) === "private") {
    throw new HttpsError("permission-denied", "Grup peribadi - perlu jemputan.");
  }

  const memberRef = groupRef.collection("members").doc(uid);
  const userSnap = await db.collection("users").doc(uid).get();
  await db.runTransaction(async (tx) => {
    const mSnap = await tx.get(memberRef);
    if (mSnap.exists) return;
    tx.set(memberRef, {
      uid,
      role: "member",
      displayName:
        (userSnap.data()?.displayName as string | undefined) || "Foodie",
      photoUrl: (userSnap.data()?.photoUrl as string | undefined) ?? null,
      joinedAt: FieldValue.serverTimestamp(),
    });
    tx.set(groupRef, {memberCount: FieldValue.increment(1)}, {merge: true});
  });
  return {status: "OK"};
});

/** Owner/admin tambah ahli ikut uid. */
export const addGroupMember = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {groupId, targetUid, role} = (request.data ?? {}) as {
    groupId?: string;
    targetUid?: string;
    role?: string;
  };
  if (!groupId || !targetUid) {
    throw new HttpsError("invalid-argument", "groupId & targetUid perlu.");
  }
  assertManager(await roleOf(groupId, uid));
  const newRole = ROLES.includes(role ?? "") && role !== "owner" ? role! : "member";

  const groupRef = db.collection("groups").doc(groupId);
  const memberRef = groupRef.collection("members").doc(targetUid);
  const userSnap = await db.collection("users").doc(targetUid).get();
  if (!userSnap.exists) throw new HttpsError("not-found", "Pengguna tiada.");
  await db.runTransaction(async (tx) => {
    const mSnap = await tx.get(memberRef);
    if (mSnap.exists) return;
    tx.set(memberRef, {
      uid: targetUid,
      role: newRole,
      displayName:
        (userSnap.data()?.displayName as string | undefined) || "Foodie",
      photoUrl: (userSnap.data()?.photoUrl as string | undefined) ?? null,
      joinedAt: FieldValue.serverTimestamp(),
    });
    tx.set(groupRef, {memberCount: FieldValue.increment(1)}, {merge: true});
  });
  return {status: "OK"};
});

/** Owner/admin buang ahli. Owner tidak boleh dibuang. */
export const removeGroupMember = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {groupId, targetUid} = (request.data ?? {}) as {
    groupId?: string;
    targetUid?: string;
  };
  if (!groupId || !targetUid) {
    throw new HttpsError("invalid-argument", "groupId & targetUid perlu.");
  }
  // Boleh buang diri sendiri (leave) tanpa jadi manager.
  const myRole = await roleOf(groupId, uid);
  if (targetUid !== uid) assertManager(myRole);

  const targetRole = await roleOf(groupId, targetUid);
  if (targetRole === "owner") {
    throw new HttpsError("permission-denied", "Owner tidak boleh dibuang.");
  }
  if (targetRole === null) return {status: "OK"};

  const groupRef = db.collection("groups").doc(groupId);
  await db.runTransaction(async (tx) => {
    tx.delete(groupRef.collection("members").doc(targetUid));
    tx.set(groupRef, {memberCount: FieldValue.increment(-1)}, {merge: true});
  });
  return {status: "OK"};
});

/** Owner tukar peranan ahli (admin/member/viewer). */
export const changeGroupRole = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {groupId, targetUid, role} = (request.data ?? {}) as {
    groupId?: string;
    targetUid?: string;
    role?: string;
  };
  if (!groupId || !targetUid || !role) {
    throw new HttpsError("invalid-argument", "Data tidak lengkap.");
  }
  if (!["admin", "member", "viewer"].includes(role)) {
    throw new HttpsError("invalid-argument", "Peranan tidak sah.");
  }
  const myRole = await roleOf(groupId, uid);
  if (myRole !== "owner") {
    throw new HttpsError("permission-denied", "Owner sahaja tukar peranan.");
  }
  if (targetUid === uid) {
    throw new HttpsError("invalid-argument", "Tak boleh tukar peranan sendiri.");
  }
  const targetRole = await roleOf(groupId, targetUid);
  if (targetRole === null) throw new HttpsError("not-found", "Bukan ahli.");

  await db
    .collection("groups")
    .doc(groupId)
    .collection("members")
    .doc(targetUid)
    .set({role}, {merge: true});
  return {status: "OK"};
});

/** Owner/admin kemas kini tetapan grup. */
export const updateGroupSettings = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {groupId, name, emoji, description, privacy} = (request.data ??
    {}) as {
    groupId?: string;
    name?: string;
    emoji?: string;
    description?: string;
    privacy?: string;
  };
  if (!groupId) throw new HttpsError("invalid-argument", "groupId perlu.");
  assertManager(await roleOf(groupId, uid));

  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (typeof name === "string" && name.trim().length >= 2) {
    update.name = name.trim().slice(0, 40);
  }
  if (typeof emoji === "string" && emoji.trim().length > 0) {
    update.emoji = emoji.trim();
  }
  if (typeof description === "string") {
    update.description = description.trim().slice(0, 200);
  }
  if (privacy === "public" || privacy === "private") {
    update.privacy = privacy;
  }
  await db.collection("groups").doc(groupId).set(update, {merge: true});
  return {status: "OK"};
});

/** Owner/admin pin restoran atau pengumuman. */
export const pinGroupItem = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {groupId, placeId, placeName, announcement} = (request.data ??
    {}) as {
    groupId?: string;
    placeId?: string;
    placeName?: string;
    announcement?: string;
  };
  if (!groupId) throw new HttpsError("invalid-argument", "groupId perlu.");
  assertManager(await roleOf(groupId, uid));

  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (typeof placeId === "string") {
    update.pinnedPlaceId = placeId.trim() || null;
    update.pinnedPlaceName = (placeName ?? "").trim() || null;
  }
  if (typeof announcement === "string") {
    update.pinnedAnnouncement = announcement.trim().slice(0, 200) || null;
  }
  await db.collection("groups").doc(groupId).set(update, {merge: true});
  await logEvent({
    userId: uid,
    eventType: "group_pin_updated",
    metadata: {groupId},
  });
  return {status: "OK"};
});
