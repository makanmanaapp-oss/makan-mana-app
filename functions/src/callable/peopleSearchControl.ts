// HOTFIX 4.6 — server-authoritative people search for group invites.
// Manager-gated. Empty query → caller's Following (suggestions). Text query →
// bounded prefix search on public_profiles usernameLower/displayNameLower.
// Returns public identity + member/invited/invite state + following hint only.
// NOT deployed in this task — see REPORT.

import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db} from "../config/firebase";
import {normalizeLower} from "../domain/peopleSearch/normalize";
import {
  buildPeopleResults,
  Candidate,
} from "../domain/peopleSearch/peopleSearchV2";

const LIMIT = 20;

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function managerRole(groupId: string, uid: string): Promise<void> {
  const g = await db.collection("groups").doc(groupId).get();
  if (!g.exists) throw new HttpsError("not-found", "Grup tiada.");
  if ((g.data() ?? {}).status === "deleted") {
    throw new HttpsError("failed-precondition", "Grup telah dipadam.");
  }
  const m = await db.collection("groups").doc(groupId).collection("members").doc(uid).get();
  const role = m.exists ? s(m.data()?.role) : "";
  const ownerUid = s(g.data()?.ownerUid);
  if (!(role === "owner" || role === "admin" || ownerUid === uid)) {
    throw new HttpsError("permission-denied", "Owner/admin sahaja.");
  }
}

function toCandidate(uid: string, d: Record<string, unknown>): Candidate {
  return {
    uid,
    displayName: s(d.displayName) || "Foodie",
    username: (d.username as string) ?? null,
    photoUrl: (d.photoUrl as string) ?? null,
    avatarPreset: (d.avatarPreset as string) ?? null,
  };
}

export const searchPeopleV2 = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const {groupId, query} = (req.data ?? {}) as {groupId?: string; query?: string};
  if (!groupId) throw new HttpsError("invalid-argument", "groupId perlu.");
  await managerRole(groupId, uid);

  const q = normalizeLower((query ?? "").replace(/^@+/, ""));

  // Context sets (bounded reads).
  const [membersSnap, invitesSnap, followsSnap, blkA, blkB] = await Promise.all([
    db.collection("groups").doc(groupId).collection("members").limit(500).get(),
    // Single-equality (auto single-field index); filter status in code to avoid
    // needing a composite index (Part: no Firestore index change).
    db.collection("group_invites").where("groupId", "==", groupId).limit(500).get(),
    db.collection("follows").where("followerUid", "==", uid).limit(200).get(),
    db.collection("blocks").where("blockerUid", "==", uid).limit(500).get(),
    db.collection("blocks").where("blockedUid", "==", uid).limit(500).get(),
  ]);
  const memberUids = new Set(membersSnap.docs.map((d) => d.id));
  const pendingUids = new Set(
    invitesSnap.docs
      .filter((d) => s(d.data().status) === "pending")
      .map((d) => s(d.data().inviteeUid))
  );
  const followingUids = new Set(followsSnap.docs.map((d) => s(d.data().followingUid)));
  const blockedUids = new Set<string>();
  blkA.docs.forEach((d) => blockedUids.add(s(d.data().blockedUid)));
  blkB.docs.forEach((d) => blockedUids.add(s(d.data().blockerUid)));

  // Candidate profiles.
  const byUid = new Map<string, Candidate>();
  const add = (uidX: string, d: Record<string, unknown>) => {
    if (uidX && !byUid.has(uidX)) byUid.set(uidX, toCandidate(uidX, d));
  };
  if (!q) {
    // Suggestions = caller's Following.
    const ids = [...followingUids].slice(0, 30);
    if (ids.length) {
      const refs = ids.map((id) => db.collection("public_profiles").doc(id));
      const snaps = await db.getAll(...refs);
      snaps.forEach((sn) => { if (sn.exists) add(sn.id, sn.data() ?? {}); });
    }
  } else {
    const end = q + "";
    const [byName, byUser] = await Promise.all([
      db.collection("public_profiles").orderBy("usernameLower").startAt(q).endAt(end).limit(LIMIT).get(),
      db.collection("public_profiles").orderBy("displayNameLower").startAt(q).endAt(end).limit(LIMIT).get(),
    ]);
    byName.docs.forEach((d) => add(d.id, d.data() ?? {}));
    byUser.docs.forEach((d) => add(d.id, d.data() ?? {}));
    // Ensure a followed user matching the query is present even if lower fields lag.
  }

  const rows = buildPeopleResults({
    candidates: [...byUid.values()],
    selfUid: uid,
    memberUids,
    pendingUids,
    followingUids,
    blockedUids,
    query: q,
  }).slice(0, LIMIT);

  return {people: rows};
});
