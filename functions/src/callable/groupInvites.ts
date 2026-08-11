import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";

/**
 * FIX 3 — Jemputan grup PERIBADI + pemadaman grup selamat (SOFT DELETE).
 *
 * Semua tulisan sensitif melalui pelayan (server-authoritative) supaya tidak
 * boleh dipalsukan dari klien:
 *  - hanya owner/admin boleh menjemput,
 *  - hanya PENERIMA sah boleh terima/tolak jemputannya sendiri (tiada
 *    pemalsuan UID),
 *  - terima berganda = idempotent (tiada keahlian pendua),
 *  - jemputan grup dipadam TIDAK boleh diterima,
 *  - hanya OWNER boleh memadam grup (soft delete: status='deleted').
 */

const INVITES = "group_invites";

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

/** Owner/admin menjemput seorang pengguna ke grup. */
export const inviteToGroup = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {groupId, targetUid} = (request.data ?? {}) as {
    groupId?: string;
    targetUid?: string;
  };
  if (!groupId || !targetUid) {
    throw new HttpsError("invalid-argument", "groupId & targetUid perlu.");
  }
  if (targetUid === uid) {
    throw new HttpsError("invalid-argument", "Tak boleh jemput diri sendiri.");
  }

  const groupRef = db.collection("groups").doc(groupId);
  const gSnap = await groupRef.get();
  if (!gSnap.exists) throw new HttpsError("not-found", "Grup tiada.");
  const g = gSnap.data() ?? {};
  if (g.status === "deleted") {
    throw new HttpsError("failed-precondition", "Grup telah dipadam.");
  }
  // Hanya owner/admin grup boleh menjemput.
  assertManager(await roleOf(groupId, uid));

  // Sudah jadi ahli? tiada jemputan diperlukan.
  if ((await roleOf(groupId, targetUid)) !== null) {
    throw new HttpsError("already-exists", "Pengguna sudah ahli.");
  }
  // Sasaran wujud.
  const targetSnap = await db.collection("users").doc(targetUid).get();
  if (!targetSnap.exists) throw new HttpsError("not-found", "Pengguna tiada.");

  // Nyah-dup: jemputan 'pending' sedia ada untuk (group,invitee) → guna semula.
  const existing = await db
    .collection(INVITES)
    .where("groupId", "==", groupId)
    .where("inviteeUid", "==", targetUid)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!existing.empty) {
    return {status: "OK", inviteId: existing.docs[0].id, deduped: true};
  }

  const inviteRef = db.collection(INVITES).doc();
  await inviteRef.set({
    groupId,
    // Snapshot nama/emoji supaya penerima boleh papar "Dijemput ke {nama}"
    // TANPA membaca dokumen grup peribadi (rules: grup peribadi = ahli sahaja).
    groupName: (g.name as string | undefined) ?? "",
    groupEmoji: (g.emoji as string | undefined) ?? "🍜",
    inviterUid: uid,
    inviteeUid: targetUid,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await logEvent({
    userId: uid,
    eventType: "group_invite_sent",
    metadata: {groupId, inviteId: inviteRef.id},
  });
  return {status: "OK", inviteId: inviteRef.id};
});

/** Penerima menerima/menolak jemputannya SENDIRI. */
export const respondGroupInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {inviteId, accept} = (request.data ?? {}) as {
    inviteId?: string;
    accept?: boolean;
  };
  if (!inviteId || typeof accept !== "boolean") {
    throw new HttpsError("invalid-argument", "inviteId & accept perlu.");
  }

  const inviteRef = db.collection(INVITES).doc(inviteId);
  const iSnap = await inviteRef.get();
  if (!iSnap.exists) throw new HttpsError("not-found", "Jemputan tiada.");
  const inv = iSnap.data() ?? {};

  // KRITIKAL: hanya penerima sah boleh bertindak (tiada pemalsuan UID).
  if (inv.inviteeUid !== uid) {
    throw new HttpsError(
      "permission-denied",
      "Hanya penerima jemputan boleh bertindak."
    );
  }
  // Idempotent: jemputan bukan 'pending' → tiada tindakan ulangan.
  if (inv.status !== "pending") {
    return {status: "OK", already: inv.status};
  }

  if (!accept) {
    await inviteRef.set(
      {status: "declined", updatedAt: FieldValue.serverTimestamp()},
      {merge: true}
    );
    return {status: "OK", result: "declined"};
  }

  // Terima: grup mesti wujud & belum dipadam.
  const groupRef = db.collection("groups").doc(inv.groupId as string);
  const memberRef = groupRef.collection("members").doc(uid);
  const userSnap = await db.collection("users").doc(uid).get();

  await db.runTransaction(async (tx) => {
    const gSnap = await tx.get(groupRef);
    if (!gSnap.exists) throw new HttpsError("not-found", "Grup tiada.");
    if ((gSnap.data()?.status as string) === "deleted") {
      throw new HttpsError("failed-precondition", "Grup telah dipadam.");
    }
    // Semak semula status jemputan DALAM transaksi (elak terima serentak).
    const freshInvite = await tx.get(inviteRef);
    if ((freshInvite.data()?.status as string) !== "pending") return;

    const mSnap = await tx.get(memberRef);
    if (!mSnap.exists) {
      tx.set(memberRef, {
        uid,
        role: "member",
        displayName:
          (userSnap.data()?.displayName as string | undefined) || "Foodie",
        photoUrl: (userSnap.data()?.photoUrl as string | undefined) ?? null,
        joinedAt: FieldValue.serverTimestamp(),
      });
      tx.set(groupRef, {memberCount: FieldValue.increment(1)}, {merge: true});
    }
    tx.set(
      inviteRef,
      {status: "accepted", updatedAt: FieldValue.serverTimestamp()},
      {merge: true}
    );
  });
  await logEvent({
    userId: uid,
    eventType: "group_invite_accepted",
    metadata: {groupId: inv.groupId as string, inviteId},
  });
  return {status: "OK", result: "accepted"};
});

/** Inviter atau owner/admin membatalkan jemputan tertunda. */
export const cancelGroupInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {inviteId} = (request.data ?? {}) as {inviteId?: string};
  if (!inviteId) throw new HttpsError("invalid-argument", "inviteId perlu.");

  const inviteRef = db.collection(INVITES).doc(inviteId);
  const iSnap = await inviteRef.get();
  if (!iSnap.exists) return {status: "OK"};
  const inv = iSnap.data() ?? {};
  const isInviter = inv.inviterUid === uid;
  const manager = ["owner", "admin"].includes(
    (await roleOf(inv.groupId as string, uid)) ?? ""
  );
  if (!isInviter && !manager) {
    throw new HttpsError("permission-denied", "Tiada kebenaran.");
  }
  if (inv.status === "pending") {
    await inviteRef.set(
      {status: "cancelled", updatedAt: FieldValue.serverTimestamp()},
      {merge: true}
    );
  }
  return {status: "OK"};
});

/**
 * Padam grup — OWNER SAHAJA — SOFT DELETE.
 *
 * status='deleted' + deletedAt/deletedBy. TIDAK memadam ahli/siaran/Tong-Tong
 * secara rekursif (rekod sejarah/audit dikekalkan; siaran grup kekal
 * 'group_only' — TIDAK bertukar awam). Grup dipadam hilang dari discovery,
 * tidak menerima ahli/jemputan/siaran baharu (dikuatkuasa di sini + rules +
 * penapis discovery klien).
 */
export const deleteGroupV2 = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {groupId} = (request.data ?? {}) as {groupId?: string};
  if (!groupId) throw new HttpsError("invalid-argument", "groupId perlu.");

  // OWNER SAHAJA (admin/member/bukan-ahli ditolak).
  if ((await roleOf(groupId, uid)) !== "owner") {
    throw new HttpsError("permission-denied", "Owner grup sahaja boleh padam.");
  }
  const groupRef = db.collection("groups").doc(groupId);
  const gSnap = await groupRef.get();
  if (!gSnap.exists) throw new HttpsError("not-found", "Grup tiada.");
  if ((gSnap.data()?.status as string) === "deleted") {
    return {status: "OK", already: "deleted"};
  }
  await groupRef.set(
    {
      status: "deleted",
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true}
  );
  await logEvent({
    userId: uid,
    eventType: "group_deleted",
    metadata: {groupId},
  });
  return {status: "OK", result: "deleted"};
});
