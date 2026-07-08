import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";

/**
 * Group Poll + status dikongsi ahli grup.
 * Undian: satu undi per pengguna, kiraan diselenggara secara transaksi.
 */

const POLL_TYPES = [
  "restaurant",
  "cuisine",
  "time",
  "budget",
  "menu",
  "location",
  "health_friendly",
];

async function isMember(groupId: string, uid: string): Promise<boolean> {
  const snap = await db
    .collection("groups")
    .doc(groupId)
    .collection("members")
    .doc(uid)
    .get();
  return snap.exists;
}

async function roleOf(groupId: string, uid: string): Promise<string | null> {
  const snap = await db
    .collection("groups")
    .doc(groupId)
    .collection("members")
    .doc(uid)
    .get();
  return snap.exists ? ((snap.data()?.role as string) ?? "member") : null;
}

/** Cipta undian dalam grup (owner/admin/member; bukan viewer). */
// Memori rendah (128MiB) untuk jimat kuota CPU Cloud Run region.
export const createGroupPoll = onCall({memory: "128MiB"}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {groupId, question, type, options} = (request.data ?? {}) as {
    groupId?: string;
    question?: string;
    type?: string;
    options?: string[];
  };
  if (!groupId) throw new HttpsError("invalid-argument", "groupId perlu.");
  const role = await roleOf(groupId, uid);
  if (role === null || role === "viewer") {
    throw new HttpsError("permission-denied", "Ahli sahaja boleh cipta undian.");
  }
  const q = (question ?? "").trim();
  if (q.length < 2 || q.length > 120) {
    throw new HttpsError("invalid-argument", "Soalan 2-120 aksara.");
  }
  const pollType = POLL_TYPES.includes(type ?? "") ? type! : "restaurant";
  const opts = (options ?? [])
    .map((o) => (typeof o === "string" ? o.trim() : ""))
    .filter((o) => o.length > 0)
    .slice(0, 8);
  if (opts.length < 2) {
    throw new HttpsError("invalid-argument", "Perlu sekurang-kurangnya 2 pilihan.");
  }

  const pollRef = db
    .collection("groups")
    .doc(groupId)
    .collection("polls")
    .doc();
  await pollRef.set({
    question: q,
    type: pollType,
    options: opts.map((label, i) => ({key: `o${i}`, label, votes: 0})),
    createdBy: uid,
    status: "open",
    totalVotes: 0,
    createdAt: FieldValue.serverTimestamp(),
  });
  await logEvent({
    userId: uid,
    eventType: "group_poll_created",
    metadata: {groupId, pollId: pollRef.id, type: pollType},
  });
  return {status: "OK", pollId: pollRef.id};
});

/** Undi pilihan (satu undi per pengguna; boleh tukar undi). */
export const voteGroupPoll = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {groupId, pollId, optionKey} = (request.data ?? {}) as {
    groupId?: string;
    pollId?: string;
    optionKey?: string;
  };
  if (!groupId || !pollId || !optionKey) {
    throw new HttpsError("invalid-argument", "Data tidak lengkap.");
  }
  if (!(await isMember(groupId, uid))) {
    throw new HttpsError("permission-denied", "Ahli grup sahaja.");
  }

  const pollRef = db
    .collection("groups")
    .doc(groupId)
    .collection("polls")
    .doc(pollId);
  const voteRef = pollRef.collection("votes").doc(uid);

  await db.runTransaction(async (tx) => {
    const pollSnap = await tx.get(pollRef);
    if (!pollSnap.exists) throw new HttpsError("not-found", "Undian tiada.");
    if ((pollSnap.data()?.status as string) !== "open") {
      throw new HttpsError("failed-precondition", "Undian sudah ditutup.");
    }
    const options = (pollSnap.data()?.options as Array<{key: string; votes: number}>) ?? [];
    if (!options.some((o) => o.key === optionKey)) {
      throw new HttpsError("invalid-argument", "Pilihan tidak sah.");
    }
    const voteSnap = await tx.get(voteRef);
    const prevKey = voteSnap.exists
      ? (voteSnap.data()?.optionKey as string)
      : null;
    if (prevKey === optionKey) return; // tiada perubahan

    const updated = options.map((o) => {
      let votes = o.votes ?? 0;
      if (o.key === optionKey) votes += 1;
      if (o.key === prevKey) votes -= 1;
      return {...o, votes: Math.max(0, votes)};
    });
    tx.set(pollRef, {
      options: updated,
      totalVotes: prevKey
        ? pollSnap.data()?.totalVotes ?? 0
        : FieldValue.increment(1),
    }, {merge: true});
    tx.set(voteRef, {
      uid,
      optionKey,
      votedAt: FieldValue.serverTimestamp(),
    });
  });
  return {status: "OK"};
});

/** Tutup undian (pencipta atau owner/admin). */
export const closeGroupPoll = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {groupId, pollId} = (request.data ?? {}) as {
    groupId?: string;
    pollId?: string;
  };
  if (!groupId || !pollId) {
    throw new HttpsError("invalid-argument", "Data tidak lengkap.");
  }
  const pollRef = db
    .collection("groups")
    .doc(groupId)
    .collection("polls")
    .doc(pollId);
  const pollSnap = await pollRef.get();
  if (!pollSnap.exists) throw new HttpsError("not-found", "Undian tiada.");
  const role = await roleOf(groupId, uid);
  const isCreator = pollSnap.data()?.createdBy === uid;
  if (!isCreator && role !== "owner" && role !== "admin") {
    throw new HttpsError("permission-denied", "Tak dibenarkan tutup undian.");
  }
  await pollRef.set(
    {status: "closed", closedAt: FieldValue.serverTimestamp()},
    {merge: true},
  );
  return {status: "OK"};
});

/**
 * Kongsi status makan dalam grup (mood/bajet/alahan/dll).
 * Status kesihatan/fitness peribadi secara lalai - hanya dikongsi
 * jika pengguna sendiri menghantarnya.
 */
export const setGroupStatus = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {groupId, status} = (request.data ?? {}) as {
    groupId?: string;
    status?: Record<string, unknown>;
  };
  if (!groupId) throw new HttpsError("invalid-argument", "groupId perlu.");
  if (!(await isMember(groupId, uid))) {
    throw new HttpsError("permission-denied", "Ahli grup sahaja.");
  }
  const s = status ?? {};
  const clean = (v: unknown) =>
    typeof v === "string" ? v.trim().slice(0, 60) : null;

  const userSnap = await db.collection("users").doc(uid).get();
  await db
    .collection("groups")
    .doc(groupId)
    .collection("status")
    .doc(uid)
    .set({
      uid,
      displayName:
        (userSnap.data()?.displayName as string | undefined) || "Foodie",
      mood: clean(s.mood),
      budget: clean(s.budget),
      allergyWarning: clean(s.allergyWarning),
      dietPreference: clean(s.dietPreference),
      hungerLevel: clean(s.hungerLevel),
      cuisine: clean(s.cuisine),
      locationArea: clean(s.locationArea),
      fitnessGoal: clean(s.fitnessGoal), // hanya jika user hantar sendiri
      updatedAt: FieldValue.serverTimestamp(),
    });
  return {status: "OK"};
});
