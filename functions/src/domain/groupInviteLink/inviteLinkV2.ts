// HOTFIX 4.6 — SECURE GROUP INVITE LINKS (domain core).
//
// Capability-token model: the shareable link carries an OPAQUE high-entropy
// token. Firestore stores only sha256(token) as the doc id — plaintext token is
// NEVER persisted. Redemption hashes the presented token and looks up by doc id
// (no field index needed). Authorization is server-authoritative: a valid,
// non-revoked, non-expired, under-limit token lets an authenticated user join
// as `member` ONLY — never owner/admin. Private-group privacy is unchanged;
// the token is the only capability that permits joining/previewing a private
// group, and private search behavior is untouched.
//
// Pure + deps injected (db/now/randomToken/hashToken/signReadUrl) → emulator
// testable without real crypto/signing.

import type {FieldValue, Firestore} from "firebase-admin/firestore";

export const LINKS = "group_invite_links";
export const RATE = "invite_link_rate";
export const DEFAULT_EXPIRY_DAYS = 7;
export const MAX_EXPIRY_DAYS = 30;
// HOTFIX 4.6A: server-side create-link rate limit — max 5 creations per
// (user, group) per 10-minute fixed window. Counts creations regardless of
// later revoke (revoking does not reset the window → no rapid bypass).
export const RATE_MAX = 5;
export const RATE_WINDOW_MS = 10 * 60 * 1000;

export interface InviteLinkDeps {
  db: Firestore;
  serverTimestamp: () => FieldValue;
  increment: (n: number) => FieldValue;
  now: () => number; // epoch ms
  randomToken: () => string; // opaque high-entropy token (link secret)
  hashToken: (token: string) => string; // sha256 hex → doc id
  // Optional: sign a short-lived GET url for link-scoped image preview.
  signReadUrl?: (objectPath: string, expiresAtMs: number) => Promise<string>;
}

export class InviteLinkError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "InviteLinkError";
  }
}
function err(code: string, message: string) {
  return new InviteLinkError(code, message);
}
function requireAuth(uid: string | null | undefined): string {
  if (!uid) throw err("unauthenticated", "Sila log masuk.");
  return uid;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

type Doc = Record<string, unknown>;

async function roleOf(db: Firestore, groupId: string, uid: string): Promise<string | null> {
  const s = await db.collection("groups").doc(groupId).collection("members").doc(uid).get();
  return s.exists ? (str(s.data()?.role) || "member") : null;
}
async function loadManager(db: Firestore, groupId: string, uid: string): Promise<Doc> {
  const s = await db.collection("groups").doc(groupId).get();
  if (!s.exists) throw err("not-found", "Grup tiada.");
  const g = (s.data() ?? {}) as Doc;
  if (g.status === "deleted") throw err("failed-precondition", "Grup telah dipadam.");
  const role = await roleOf(db, groupId, uid);
  if (!(role === "owner" || role === "admin" || g.ownerUid === uid)) {
    throw err("permission-denied", "Owner/admin sahaja.");
  }
  return g;
}
async function isBlockedBetween(db: Firestore, a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([
    db.collection("blocks").doc(`${a}_${b}`).get(),
    db.collection("blocks").doc(`${b}_${a}`).get(),
  ]);
  return x.exists || y.exists;
}

// ---- RATE LIMIT (fixed window per user+group; transactional) ----
async function enforceCreateRate(
  deps: InviteLinkDeps,
  uid: string,
  groupId: string
): Promise<void> {
  const ref = deps.db.collection(RATE).doc(`${uid}_${groupId}`);
  await deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = deps.now();
    const d = (snap.exists ? snap.data() : {}) as Doc;
    const windowStart = typeof d.windowStart === "number" ? d.windowStart : 0;
    const count = typeof d.count === "number" ? d.count : 0;
    if (now - windowStart >= RATE_WINDOW_MS) {
      tx.set(ref, {windowStart: now, count: 1});
    } else if (count >= RATE_MAX) {
      throw err(
        "resource-exhausted",
        "Terlalu banyak pautan dicipta. Cuba lagi sebentar."
      );
    } else {
      tx.set(ref, {count: count + 1}, {merge: true});
    }
  });
}

// ---- LIST (manager-only metadata; NEVER returns the token) ----
export interface LinkMeta {
  linkId: string;
  createdAt: number | null;
  expiresAt: number | null;
  usageCount: number;
  maxUses: number | null;
  status: string;
}
export async function listGroupInviteLinks(
  uidIn: string | null | undefined,
  groupId: string,
  deps: InviteLinkDeps
): Promise<{links: LinkMeta[]}> {
  const uid = requireAuth(uidIn);
  if (!groupId) throw err("invalid-argument", "groupId perlu.");
  await loadManager(deps.db, groupId, uid);
  const snap = await deps.db
    .collection(LINKS)
    .where("groupId", "==", groupId)
    .limit(50)
    .get();
  const now = deps.now();
  const links: LinkMeta[] = snap.docs
    .map((d) => {
      const x = d.data() as Doc;
      const expiresAt = typeof x.expiresAt === "number" ? x.expiresAt : null;
      let status = str(x.status) || "active";
      if (status === "active" && expiresAt != null && expiresAt < now) {
        status = "expired";
      }
      return {
        linkId: d.id, // = sha256(token); safe management handle, NOT the token
        createdAt:
          x.createdAt && typeof (x.createdAt as {toMillis?: () => number}).toMillis === "function"
            ? (x.createdAt as {toMillis: () => number}).toMillis()
            : null,
        expiresAt,
        usageCount: Number(x.usageCount ?? 0),
        maxUses: typeof x.maxUses === "number" ? x.maxUses : null,
        status,
      };
    })
    .filter((m) => m.status !== "revoked"); // hide already-revoked
  return {links};
}

// ---- CREATE ----
export interface CreateResult {
  token: string;
  linkId: string;
  groupId: string;
  expiresAt: number;
  maxUses: number | null;
}
export async function createGroupInviteLink(
  uidIn: string | null | undefined,
  data: {groupId?: string; expiresInDays?: number; maxUses?: number | null},
  deps: InviteLinkDeps
): Promise<CreateResult> {
  const uid = requireAuth(uidIn);
  const groupId = str(data?.groupId);
  if (!groupId) throw err("invalid-argument", "groupId perlu.");
  // Authorization FIRST (Part 11), then rate limit.
  await loadManager(deps.db, groupId, uid);
  await enforceCreateRate(deps, uid, groupId);

  let days = Number(data?.expiresInDays ?? DEFAULT_EXPIRY_DAYS);
  if (!Number.isFinite(days) || days <= 0) days = DEFAULT_EXPIRY_DAYS;
  if (days > MAX_EXPIRY_DAYS) days = MAX_EXPIRY_DAYS;
  const rawMax = data?.maxUses;
  const maxUses =
    rawMax === null || rawMax === undefined
      ? null
      : Number.isFinite(Number(rawMax)) && Number(rawMax) > 0
        ? Math.floor(Number(rawMax))
        : null;

  const token = deps.randomToken();
  const linkId = deps.hashToken(token);
  const expiresAt = deps.now() + days * 24 * 60 * 60 * 1000;

  await deps.db.collection(LINKS).doc(linkId).set({
    groupId,
    createdBy: uid,
    createdAt: deps.serverTimestamp(),
    expiresAt,
    status: "active",
    usageCount: 0,
    maxUses, // null = unlimited until expiry
    revokedAt: null,
  });
  return {token, linkId, groupId, expiresAt, maxUses};
}

// ---- Shared validation (returns the link doc + group doc) ----
async function resolveActiveLink(
  db: Firestore,
  linkRef: FirebaseFirestore.DocumentReference,
  nowMs: number
): Promise<{link: Doc; group: Doc; groupId: string}> {
  const snap = await linkRef.get();
  if (!snap.exists) throw err("not-found", "Pautan jemputan tidak sah.");
  const link = (snap.data() ?? {}) as Doc;
  if (link.status === "revoked") throw err("failed-precondition", "Pautan jemputan telah dibatalkan.");
  if (typeof link.expiresAt === "number" && link.expiresAt < nowMs) {
    throw err("failed-precondition", "Pautan jemputan telah tamat tempoh.");
  }
  const maxUses = link.maxUses;
  if (typeof maxUses === "number" && Number(link.usageCount ?? 0) >= maxUses) {
    throw err("failed-precondition", "Had penggunaan pautan telah dicapai.");
  }
  const groupId = str(link.groupId);
  const gsnap = await db.collection("groups").doc(groupId).get();
  if (!gsnap.exists) throw err("not-found", "Grup tiada.");
  const group = (gsnap.data() ?? {}) as Doc;
  if (group.status === "deleted") throw err("failed-precondition", "Grup telah dipadam.");
  return {link, group, groupId};
}

// ---- INFO (link-scoped preview; token is the capability) ----
export interface InfoResult {
  groupId: string;
  name: string;
  privacy: string;
  description: string;
  memberCount: number;
  imageUrl: string | null;
  alreadyMember: boolean;
}
export async function getGroupInviteLinkInfo(
  uidIn: string | null | undefined,
  token: string,
  deps: InviteLinkDeps
): Promise<InfoResult> {
  const uid = requireAuth(uidIn);
  if (!token) throw err("invalid-argument", "token perlu.");
  const linkRef = deps.db.collection(LINKS).doc(deps.hashToken(token));
  const {group, groupId} = await resolveActiveLink(deps.db, linkRef, deps.now());
  const already = (await roleOf(deps.db, groupId, uid)) !== null;
  let imageUrl: string | null = null;
  const imagePath = str(group.imagePath);
  if (imagePath && deps.signReadUrl) {
    // Link-scoped preview: the valid token authorizes seeing the group image,
    // independent of public-search authorization (Part 23).
    imageUrl = await deps.signReadUrl(imagePath, deps.now() + 30 * 60 * 1000);
  }
  return {
    groupId,
    name: str(group.name),
    privacy: group.privacy === "private" ? "private" : "public",
    description: str(group.description),
    memberCount: Number(group.memberCount ?? 0),
    imageUrl,
    alreadyMember: already,
  };
}

// ---- JOIN (transactional; idempotent; member-only) ----
export interface JoinResult {
  status: "OK";
  groupId: string;
  already: boolean;
}
export async function joinGroupByInviteLink(
  uidIn: string | null | undefined,
  token: string,
  deps: InviteLinkDeps
): Promise<JoinResult> {
  const uid = requireAuth(uidIn);
  if (!token) throw err("invalid-argument", "token perlu.");
  const linkRef = deps.db.collection(LINKS).doc(deps.hashToken(token));

  // Pre-check outside tx for friendly errors + block policy.
  const pre = await resolveActiveLink(deps.db, linkRef, deps.now());
  if (await isBlockedBetween(deps.db, uid, str(pre.group.ownerUid))) {
    throw err("permission-denied", "Tidak dibenarkan menyertai grup ini.");
  }
  const groupId = pre.groupId;
  const groupRef = deps.db.collection("groups").doc(groupId);
  const memberRef = groupRef.collection("members").doc(uid);

  return deps.db.runTransaction(async (tx) => {
    // Re-read link + group + membership INSIDE tx for concurrency safety.
    const [lSnap, gSnap, mSnap] = await Promise.all([
      tx.get(linkRef),
      tx.get(groupRef),
      tx.get(memberRef),
    ]);
    if (!lSnap.exists) throw err("not-found", "Pautan jemputan tidak sah.");
    const link = (lSnap.data() ?? {}) as Doc;
    if (link.status === "revoked") throw err("failed-precondition", "Pautan jemputan telah dibatalkan.");
    if (typeof link.expiresAt === "number" && link.expiresAt < deps.now()) {
      throw err("failed-precondition", "Pautan jemputan telah tamat tempoh.");
    }
    if (!gSnap.exists) throw err("not-found", "Grup tiada.");
    if ((gSnap.data() ?? {}).status === "deleted") {
      throw err("failed-precondition", "Grup telah dipadam.");
    }
    // Idempotent: already a member → no duplicate, no counter change.
    if (mSnap.exists) return {status: "OK" as const, groupId, already: true};

    const maxUses = link.maxUses;
    const used = Number(link.usageCount ?? 0);
    if (typeof maxUses === "number" && used >= maxUses) {
      throw err("failed-precondition", "Had penggunaan pautan telah dicapai.");
    }
    tx.set(memberRef, {
      uid,
      role: "member", // NEVER owner/admin from a link
      joinedAt: deps.serverTimestamp(),
      joinedVia: "invite_link",
    });
    tx.set(groupRef, {memberCount: deps.increment(1)}, {merge: true});
    tx.set(linkRef, {usageCount: deps.increment(1)}, {merge: true});
    return {status: "OK" as const, groupId, already: false};
  });
}

// ---- REVOKE ----
export async function revokeGroupInviteLink(
  uidIn: string | null | undefined,
  linkId: string,
  deps: InviteLinkDeps
): Promise<{status: "OK"}> {
  const uid = requireAuth(uidIn);
  if (!linkId) throw err("invalid-argument", "linkId perlu.");
  const linkRef = deps.db.collection(LINKS).doc(linkId);
  const snap = await linkRef.get();
  if (!snap.exists) throw err("not-found", "Pautan tiada.");
  const groupId = str((snap.data() ?? {}).groupId);
  await loadManager(deps.db, groupId, uid); // owner/admin of that group
  await linkRef.set(
    {status: "revoked", revokedAt: deps.serverTimestamp()},
    {merge: true}
  );
  return {status: "OK"};
}
