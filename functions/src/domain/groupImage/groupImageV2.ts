// HOTFIX 4.5C — SERVER-MEDIATED GROUP IMAGE V2 (domain core).
//
// PUNCA (4.5B): Storage rules cross-service firestore.get()/exists() ditolak di
// runtime produksi walaupun IAM firebaserules.firestoreServiceAgent lengkap
// pada KEDUA-DUA service agent. Kebenaran imej grup TIDAK boleh bergantung pada
// Storage rules yang menyoal Firestore.
//
// SENI BINA V2: Firestore kekal AUTORITI (owner/admin/keahlian/privasi/status).
// Cloud Functions (Admin SDK) menilai kuasa itu, kemudian mengeluarkan SIGNED
// URL jangka-pendek untuk PUT (upload) / GET (baca) terus ke objek yang tepat.
// Storage rules untuk group_images = read,write:false (signed URL memintas
// rules pada lapisan GCS). TIADA firestore.get dalam Storage rules.
//
// Fail ini PURE + deps disuntik (db/bucket/sign/now/randomId) supaya boleh diuji
// terhadap Firestore + Storage emulator TANPA menandatangani URL sebenar.

import type {FieldValue, Firestore} from "firebase-admin/firestore";

// ---- Ambang & pemalar kanonik ----
export const CONTENT_TYPE = "image/jpeg";
export const MAX_BYTES = 5 * 1024 * 1024; // 5MB
export const UPLOAD_TTL_MS = 10 * 60 * 1000; // PUT URL jangka pendek (10 min)
export const READ_TTL_MS = 30 * 60 * 1000; // GET URL jangka pendek (30 min)
export const MAX_BATCH = 30; // had resolver kelompok (elak N+1 storm)
const PREFIX = "group_images";
const ASSET_RE = /^group_images\/([^/]+)\/([A-Za-z0-9_-]+)\.jpg$/;

// ---- Antara muka Storage minimum (structural — boleh mock/emulator) ----
export interface StorageFileLike {
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[{size?: string | number; contentType?: string}]>;
  delete(): Promise<unknown>;
}
export interface StorageBucketLike {
  file(path: string): StorageFileLike;
}

export interface GroupImageDeps {
  db: Firestore;
  bucket: StorageBucketLike;
  fieldDelete: () => FieldValue;
  serverTimestamp: () => FieldValue;
  randomId: () => string;
  now: () => number;
  signUploadUrl: (
    objectPath: string,
    contentType: string,
    expiresAtMs: number
  ) => Promise<string>;
  signReadUrl: (objectPath: string, expiresAtMs: number) => Promise<string>;
}

/** Ralat domain berkod — dipetakan ke HttpsError oleh pembalut callable. */
export class GroupImageError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "GroupImageError";
  }
}
function err(code: string, message: string): GroupImageError {
  return new GroupImageError(code, message);
}
function requireAuth(uid: string | null | undefined): string {
  if (!uid) throw err("unauthenticated", "Sila log masuk.");
  return uid;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function objectPathFor(groupId: string, assetId: string): string {
  return `${PREFIX}/${groupId}/${assetId}.jpg`;
}

/**
 * Sahkan objectPath milik TEPAT groupId ini + format assetId server. Halang
 * pilihan path sewenang-wenang / silang-grup.
 */
export function parseObjectPath(objectPath: string, groupId: string): string {
  const m = ASSET_RE.exec(objectPath);
  if (!m || m[1] !== groupId) {
    throw err("invalid-argument", "objectPath tidak sah untuk grup ini.");
  }
  return m[2];
}

type GroupDoc = Record<string, unknown>;

async function roleOf(
  db: Firestore,
  groupId: string,
  uid: string
): Promise<string | null> {
  const snap = await db
    .collection("groups")
    .doc(groupId)
    .collection("members")
    .doc(uid)
    .get();
  return snap.exists ? (str(snap.data()?.role) || "member") : null;
}

/** Muat grup + kuatkuasa: wujud, bukan dipadam, pemanggil owner/admin. */
async function loadManager(
  db: Firestore,
  groupId: string,
  uid: string
): Promise<{group: GroupDoc}> {
  const snap = await db.collection("groups").doc(groupId).get();
  if (!snap.exists) throw err("not-found", "Grup tiada.");
  const group = (snap.data() ?? {}) as GroupDoc;
  if (group.status === "deleted") {
    throw err("failed-precondition", "Grup telah dipadam.");
  }
  const role = await roleOf(db, groupId, uid);
  const isManager =
    role === "owner" || role === "admin" || group.ownerUid === uid;
  if (!isManager) throw err("permission-denied", "Owner/admin sahaja.");
  return {group};
}

async function safeDelete(file: StorageFileLike): Promise<void> {
  try {
    await file.delete();
  } catch (_) {
    /* best-effort */
  }
}

// ---- PREPARE: authz → assetId → signed PUT URL jangka pendek ----
export interface PrepareResult {
  uploadUrl: string;
  objectPath: string;
  assetId: string;
  expiresAt: number;
  contentType: string;
}
export async function prepareGroupImageUpload(
  uidIn: string | null | undefined,
  data: {groupId?: string},
  deps: GroupImageDeps
): Promise<PrepareResult> {
  const uid = requireAuth(uidIn);
  const groupId = str(data?.groupId);
  if (!groupId) throw err("invalid-argument", "groupId perlu.");
  await loadManager(deps.db, groupId, uid);

  const assetId = deps.randomId();
  const objectPath = objectPathFor(groupId, assetId);
  const expiresAt = deps.now() + UPLOAD_TTL_MS;
  const uploadUrl = await deps.signUploadUrl(objectPath, CONTENT_TYPE, expiresAt);

  // Part 8 (pilihan A): penanda pending ringkas untuk pembersihan upload
  // terbengkalai kelak (sweep berjadual — TIDAK dilaksana V1, didokumentasi).
  await deps.db
    .collection("groups")
    .doc(groupId)
    .collection("image_uploads")
    .doc(assetId)
    .set({uid, status: "pending", createdAt: deps.serverTimestamp()});

  return {uploadUrl, objectPath, assetId, expiresAt, contentType: CONTENT_TYPE};
}

// ---- FINALIZE: re-authz → sahkan objek → commit metadata → padam lama ----
export interface FinalizeResult {
  status: "OK";
  imagePath: string;
  imageVersion: string;
}
export async function finalizeGroupImageUpload(
  uidIn: string | null | undefined,
  data: {groupId?: string; objectPath?: string},
  deps: GroupImageDeps
): Promise<FinalizeResult> {
  const uid = requireAuth(uidIn);
  const groupId = str(data?.groupId);
  const objectPath = str(data?.objectPath);
  if (!groupId) throw err("invalid-argument", "groupId perlu.");
  if (!objectPath) throw err("invalid-argument", "objectPath perlu.");
  const assetId = parseObjectPath(objectPath, groupId);

  const {group} = await loadManager(deps.db, groupId, uid);

  // Periksa objek yang dimuat naik melalui Admin SDK (BUKAN firestore.get).
  const file = deps.bucket.file(objectPath);
  const [exists] = await file.exists();
  if (!exists) {
    throw err("failed-precondition", "Objek imej tiada / belum dimuat naik.");
  }
  const [meta] = await file.getMetadata();
  const size = Number(meta?.size ?? 0);
  const contentType = String(meta?.contentType ?? "");
  if (contentType !== CONTENT_TYPE) {
    await safeDelete(file);
    throw err("invalid-argument", "Jenis fail imej tidak sah.");
  }
  if (!(size > 0) || size > MAX_BYTES) {
    await safeDelete(file);
    throw err("invalid-argument", "Saiz imej tidak sah.");
  }

  const prevPath = str(group.imagePath) || null;
  const groupRef = deps.db.collection("groups").doc(groupId);
  await deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(groupRef);
    if (!snap.exists) throw err("not-found", "Grup tiada.");
    if ((snap.data() ?? {}).status === "deleted") {
      throw err("failed-precondition", "Grup telah dipadam.");
    }
    tx.set(
      groupRef,
      {
        imagePath: objectPath,
        imageVersion: assetId,
        imageUpdatedAt: deps.serverTimestamp(),
        // Bersih medan legasi 4.5 (URL kekal) jika ada — JANGAN simpan URL kekal.
        imageUrl: deps.fieldDelete(),
        updatedAt: deps.serverTimestamp(),
      },
      {merge: true}
    );
  });

  // Selepas commit: buang penanda pending + imej LAMA (best-effort).
  try {
    await groupRef.collection("image_uploads").doc(assetId).delete();
  } catch (_) {
    /* best-effort */
  }
  if (prevPath && prevPath !== objectPath) {
    await safeDelete(deps.bucket.file(prevPath));
  }
  return {status: "OK", imagePath: objectPath, imageVersion: assetId};
}

// ---- RESOLVER: authz baca → signed GET URL jangka pendek ----
export interface ResolveResult {
  imageUrl: string | null;
  expiresAt: number | null;
  imageVersion: string | null;
}
export async function getGroupImageUrl(
  uidIn: string | null | undefined,
  groupId: string,
  deps: GroupImageDeps
): Promise<ResolveResult> {
  const uid = requireAuth(uidIn);
  if (!groupId) throw err("invalid-argument", "groupId perlu.");
  const snap = await deps.db.collection("groups").doc(groupId).get();
  if (!snap.exists) throw err("not-found", "Grup tiada.");
  const group = (snap.data() ?? {}) as GroupDoc;
  if (group.status === "deleted") {
    throw err("failed-precondition", "Grup telah dipadam.");
  }
  const privacy = group.privacy === "private" ? "private" : "public";
  if (privacy === "private") {
    const role = await roleOf(deps.db, groupId, uid);
    const member = role !== null || group.ownerUid === uid;
    if (!member) throw err("permission-denied", "Grup peribadi — bukan ahli.");
  }
  const imagePath = str(group.imagePath) || null;
  if (!imagePath) return {imageUrl: null, expiresAt: null, imageVersion: null};
  const expiresAt = deps.now() + READ_TTL_MS;
  const imageUrl = await deps.signReadUrl(imagePath, expiresAt);
  return {imageUrl, expiresAt, imageVersion: str(group.imageVersion) || null};
}

// ---- RESOLVER KELOMPOK: had MAX_BATCH; kegagalan per-grup DIABAIKAN ----
export interface BatchResult {
  images: Record<
    string,
    {imageUrl: string; expiresAt: number; imageVersion: string | null}
  >;
}
export async function getGroupImageUrls(
  uidIn: string | null | undefined,
  groupIds: unknown,
  deps: GroupImageDeps
): Promise<BatchResult> {
  const uid = requireAuth(uidIn);
  const ids = Array.from(
    new Set(
      (Array.isArray(groupIds) ? groupIds : [])
        .filter((g): g is string => typeof g === "string" && g.length > 0)
    )
  ).slice(0, MAX_BATCH);
  const images: BatchResult["images"] = {};
  await Promise.all(
    ids.map(async (gid) => {
      try {
        const r = await getGroupImageUrl(uid, gid, deps);
        if (r.imageUrl && r.expiresAt != null) {
          images[gid] = {
            imageUrl: r.imageUrl,
            expiresAt: r.expiresAt,
            imageVersion: r.imageVersion,
          };
        }
      } catch (_) {
        // tanpa-kebenaran / tiada imej → ditinggalkan (tiada kebocoran).
      }
    })
  );
  return {images};
}

// ---- REMOVE: authz → kosongkan metadata → padam objek (best-effort) ----
export async function removeGroupImage(
  uidIn: string | null | undefined,
  groupId: string,
  deps: GroupImageDeps
): Promise<{status: "OK"}> {
  const uid = requireAuth(uidIn);
  if (!groupId) throw err("invalid-argument", "groupId perlu.");
  const {group} = await loadManager(deps.db, groupId, uid);
  const prevPath = str(group.imagePath) || null;
  await deps.db.collection("groups").doc(groupId).set(
    {
      imagePath: deps.fieldDelete(),
      imageVersion: deps.fieldDelete(),
      imageUrl: deps.fieldDelete(), // legasi
      imageUpdatedAt: deps.serverTimestamp(),
      updatedAt: deps.serverTimestamp(),
    },
    {merge: true}
  );
  if (prevPath) await safeDelete(deps.bucket.file(prevPath));
  return {status: "OK"};
}
