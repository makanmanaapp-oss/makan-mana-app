import {createHash, timingSafeEqual} from "node:crypto";

import {getAuth} from "firebase-admin/auth";
import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {currentTimeSlot} from "../utils/timeSlot";

const CONTROL_CENTER_ADMIN_BRIDGE_SECRET = defineSecret(
  "CONTROL_CENTER_ADMIN_BRIDGE_SECRET",
);
const LEDGER = "control_center_social_admin_commands";
const MAX_TEXT_LENGTH = 500;
const MAX_IMAGES = 6;
const COMMAND_STALE_MS = 120_000;
const VISIBILITIES = new Set(["public", "private", "unlisted"]);
const POST_TYPES = new Set(["status", "food_post", "checkin", "meal_review"]);

type Plain = Record<string, unknown>;
type CommandBody = {
  requestId?: unknown;
  commandType?: unknown;
  resourceType?: unknown;
  resourceId?: unknown;
  payload?: unknown;
  reason?: unknown;
};

class BridgeError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "BridgeError";
  }
}

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function requiredText(value: unknown, label: string, max = 240): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BridgeError(400, `${label} is required.`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new BridgeError(400, `${label} exceeds ${max} characters.`);
  }
  return text;
}

function optionalText(value: unknown, max = 1000): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function objectValue(value: unknown): Plain {
  return value && typeof value === "object" && !Array.isArray(value) ?
    value as Plain :
    {};
}

function tokenFrom(header: string | undefined): string {
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function secretMatches(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= maxLength)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, maxItems);
}

function safeImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1"
    ) return false;
    return true;
  } catch {
    return false;
  }
}

function imageUrls(value: unknown): string[] {
  const urls = stringArray(value, MAX_IMAGES, 2000);
  if (urls.some((url) => !safeImageUrl(url))) {
    throw new BridgeError(400, "One or more image URLs are invalid.");
  }
  return urls;
}

function sanitizeCheckin(payload: Plain) {
  const areaLabel = optionalText(payload.areaLabel, 60);
  const menuName = optionalText(payload.menuName, 80);
  const spend = finiteNumber(payload.totalSpend);
  const totalSpend = spend !== null && spend >= 0 ?
    Math.round(spend * 100) / 100 :
    null;
  const rating = finiteNumber(payload.userRating);
  const userRating = rating !== null &&
    Number.isInteger(rating) &&
    rating >= 1 &&
    rating <= 5 ?
    rating :
    null;
  const moodTags = stringArray(payload.moodTags, 6, 24);
  return {areaLabel, menuName, totalSpend, userRating, moodTags};
}

async function acquire(body: {
  requestId: string;
  commandType: string;
  resourceType: string;
  resourceId: string;
  reason: string;
}): Promise<Plain | null> {
  const now = Date.now();
  const ref = db.collection(LEDGER).doc(hash(body.requestId));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const old = (snap.data() ?? {}) as Plain;
    if (old.status === "succeeded") return objectValue(old.result);
    const startedAtMs = typeof old.startedAtMs === "number" ?
      old.startedAtMs :
      0;
    if (old.status === "processing" && now - startedAtMs < COMMAND_STALE_MS) {
      throw new BridgeError(425, "Command is already processing; retry later.");
    }
    tx.set(ref, {
      requestIdHash: hash(body.requestId),
      commandType: body.commandType,
      resourceType: body.resourceType,
      resourceIdHash: hash(body.resourceId),
      reasonHash: hash(body.reason),
      status: "processing",
      startedAtMs: now,
      startedAt: FieldValue.serverTimestamp(),
      attemptCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return null;
  });
}

async function succeed(requestId: string, result: Plain) {
  await db.collection(LEDGER).doc(hash(requestId)).set({
    status: "succeeded",
    result,
    completedAtMs: Date.now(),
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
}

async function fail(requestId: string, error: unknown) {
  await db.collection(LEDGER).doc(hash(requestId)).set({
    status: "failed",
    errorMessage: error instanceof Error ? error.message.slice(0, 500) : "unknown",
    failedAtMs: Date.now(),
    failedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true}).catch(() => undefined);
}

async function authoritativeIdentity(uid: string) {
  let authUser;
  try {
    authUser = await getAuth().getUser(uid);
  } catch (error) {
    if (((error as {code?: string}).code ?? "").includes("user-not-found")) {
      throw new BridgeError(404, "Publishing identity was not found in Firebase Auth.");
    }
    throw error;
  }
  if (authUser.disabled) {
    throw new BridgeError(409, "Publishing identity is disabled.");
  }

  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) {
    throw new BridgeError(404, "Publishing identity profile was not found.");
  }
  const user = userSnap.data() ?? {};
  const accountStatus = optionalText(user.accountStatus, 40) ?? "active";
  if (["suspended", "banned", "deletion_pending"].includes(accountStatus)) {
    throw new BridgeError(409, "Publishing identity is not active.");
  }
  const email = optionalText(user.email, 320) ?? authUser.email ?? "";
  const displayName = optionalText(user.displayName, 80) ??
    optionalText(authUser.displayName, 80) ??
    (email.includes("@") ? email.split("@")[0] : "Foodie");
  return {
    displayName,
    username: optionalText(user.username, 40),
    photoUrl: optionalText(user.photoUrl, 2000),
    avatarPreset: optionalText(user.avatarPreset, 100),
  };
}

function normalizedPostInput(payload: Plain) {
  const text = optionalText(payload.text, MAX_TEXT_LENGTH) ?? "";
  const urls = imageUrls(payload.imageUrls);
  const postTypeCandidate = optionalText(payload.postType, 40) ?? "status";
  const postType = POST_TYPES.has(postTypeCandidate) ? postTypeCandidate : "status";
  const visibilityCandidate = optionalText(payload.visibility, 40) ?? "public";
  if (!VISIBILITIES.has(visibilityCandidate)) {
    throw new BridgeError(400, "Unsupported social post visibility.");
  }
  const placeName = optionalText(payload.placeName, 160);
  if (postType === "checkin" && !placeName && !text) {
    throw new BridgeError(400, "Check-in requires a place name or text.");
  }
  if (!text && urls.length === 0 && postType !== "checkin") {
    throw new BridgeError(400, "Post cannot be empty.");
  }
  return {
    text,
    urls,
    postType,
    visibility: visibilityCandidate,
    placeId: optionalText(payload.placeId, 240),
    placeName,
    emoji: optionalText(payload.emoji, 16) ?? "😋",
    checkin: sanitizeCheckin(payload),
  };
}

async function createPost(payload: Plain, requestId: string): Promise<Plain> {
  const authorUid = requiredText(payload.authorUid, "payload.authorUid", 240);
  const identityId = requiredText(
    payload.publishingIdentityId,
    "payload.publishingIdentityId",
    100,
  );
  const author = await authoritativeIdentity(authorUid);
  const input = normalizedPostInput(payload);
  const isCheckin = input.postType === "checkin";

  const ref = db.collection("feed_posts").doc();
  await ref.set({
    avatarPreset: author.avatarPreset,
    type: input.postType === "meal_review" ?
      "review" :
      isCheckin ? "checkin" : "status",
    postType: input.postType,
    authorUid,
    displayName: author.displayName,
    username: author.username,
    photoUrl: author.photoUrl,
    text: input.text,
    imageUrl: input.urls[0] ?? null,
    imageUrls: input.urls.length > 0 ? input.urls : null,
    mediaCount: input.urls.length,
    groupId: null,
    visibility: input.visibility,
    payload: null,
    placeId: input.placeId,
    placeName: input.placeName,
    emoji: input.emoji,
    likeCount: 0,
    likedBy: [],
    commentCount: 0,
    commentEnabled: true,
    timeSlot: currentTimeSlot(),
    createdAt: FieldValue.serverTimestamp(),
    controlCenterManaged: true,
    controlCenterPublisherIdentityId: identityId,
    controlCenterRequestId: requestId,
    controlCenterPublishedAt: FieldValue.serverTimestamp(),
    source: "control_center_social_studio",
    ...(isCheckin ? {
      areaLabel: input.checkin.areaLabel,
      menuName: input.checkin.menuName,
      totalSpend: input.checkin.totalSpend,
      currency: "MYR",
      userRating: input.checkin.userRating,
      moodTags: input.checkin.moodTags,
      updatedAt: FieldValue.serverTimestamp(),
    } : {}),
  });

  if (input.visibility === "public") {
    await db.collection("public_profiles").doc(authorUid).set({
      postsCount: FieldValue.increment(1),
    }, {merge: true});
  }

  await logEvent({
    userId: authorUid,
    eventType: "feed_post_created",
    metadata: {
      postId: ref.id,
      postType: input.postType,
      visibility: input.visibility,
      source: "control_center_social_studio",
    },
  });

  return {
    postId: ref.id,
    authorUid,
    postType: input.postType,
    visibility: input.visibility,
    mediaCount: input.urls.length,
    published: true,
  };
}

async function updatePost(
  postId: string,
  payload: Plain,
  requestId: string,
): Promise<Plain> {
  const ref = db.collection("feed_posts").doc(postId);
  const snap = await ref.get();
  if (!snap.exists) throw new BridgeError(404, "Post was not found.");
  const old = snap.data() ?? {};
  if (old.controlCenterManaged !== true) {
    throw new BridgeError(409, "Only Control Center-managed posts can be edited here.");
  }
  if (old.status === "deleted") {
    throw new BridgeError(409, "Deleted post cannot be edited.");
  }

  const merged: Plain = {
    ...old,
    ...payload,
    postType: payload.postType ?? old.postType,
    visibility: payload.visibility ?? old.visibility,
    imageUrls: payload.imageUrls ?? old.imageUrls,
    text: payload.text ?? old.text,
    placeId: payload.placeId ?? old.placeId,
    placeName: payload.placeName ?? old.placeName,
    emoji: payload.emoji ?? old.emoji,
  };
  const input = normalizedPostInput(merged);
  const isCheckin = input.postType === "checkin";
  const update: Plain = {
    type: input.postType === "meal_review" ?
      "review" :
      isCheckin ? "checkin" : "status",
    postType: input.postType,
    text: input.text,
    imageUrl: input.urls[0] ?? null,
    imageUrls: input.urls.length > 0 ? input.urls : null,
    mediaCount: input.urls.length,
    visibility: input.visibility,
    placeId: input.placeId,
    placeName: input.placeName,
    emoji: input.emoji,
    editedAt: FieldValue.serverTimestamp(),
    editHistoryCount: FieldValue.increment(1),
    controlCenterLastEditRequestId: requestId,
    controlCenterUpdatedAt: FieldValue.serverTimestamp(),
  };
  if (isCheckin) {
    Object.assign(update, {
      areaLabel: input.checkin.areaLabel,
      menuName: input.checkin.menuName,
      totalSpend: input.checkin.totalSpend,
      currency: "MYR",
      userRating: input.checkin.userRating,
      moodTags: input.checkin.moodTags,
    });
  }
  await ref.set(update, {merge: true});

  await logEvent({
    userId: String(old.authorUid ?? "control_center"),
    eventType: "post_edited",
    metadata: {postId, source: "control_center_social_studio"},
  });
  return {postId, updated: true};
}

async function deletePost(postId: string, requestId: string): Promise<Plain> {
  const ref = db.collection("feed_posts").doc(postId);
  const snap = await ref.get();
  if (!snap.exists) throw new BridgeError(404, "Post was not found.");
  const old = snap.data() ?? {};
  if (old.controlCenterManaged !== true) {
    throw new BridgeError(409, "Only Control Center-managed posts can be deleted here.");
  }
  if (old.status === "deleted") return {postId, deleted: true, idempotent: true};
  await ref.set({
    status: "deleted",
    deletedAt: FieldValue.serverTimestamp(),
    controlCenterDeleteRequestId: requestId,
    controlCenterUpdatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  await logEvent({
    userId: String(old.authorUid ?? "control_center"),
    eventType: "post_deleted",
    metadata: {postId, source: "control_center_social_studio"},
  });
  return {postId, deleted: true};
}

async function execute(
  commandType: string,
  resourceType: string,
  resourceId: string,
  payload: Plain,
  requestId: string,
): Promise<Plain> {
  if (commandType === "social.admin_post.create" && resourceType === "social_publisher") {
    return createPost(payload, requestId);
  }
  if (commandType === "social.admin_post.update" && resourceType === "social_admin_post") {
    return updatePost(resourceId, payload, requestId);
  }
  if (commandType === "social.admin_post.delete" && resourceType === "social_admin_post") {
    return deletePost(resourceId, requestId);
  }
  throw new BridgeError(400, "Unsupported Social Studio command/resource combination.");
}

export const controlCenterSocialAdminBridge = onRequest(
  {
    invoker: "public",
    secrets: [CONTROL_CENTER_ADMIN_BRIDGE_SECRET],
    timeoutSeconds: 120,
    memory: "512MiB",
    maxInstances: 2,
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({message: "POST required."});
      return;
    }
    const secret = CONTROL_CENTER_ADMIN_BRIDGE_SECRET.value();
    const presented = tokenFrom(request.header("authorization"));
    if (!secret || !presented || !secretMatches(presented, secret)) {
      response.status(401).json({message: "Unauthorized Social Studio bridge request."});
      return;
    }

    let requestId = "";
    try {
      const body = (request.body ?? {}) as CommandBody;
      requestId = requiredText(body.requestId, "requestId", 160);
      const commandType = requiredText(body.commandType, "commandType", 120);
      const resourceType = requiredText(body.resourceType, "resourceType", 120);
      const resourceId = requiredText(body.resourceId, "resourceId", 240);
      const reason = requiredText(body.reason, "reason", 1000);
      if (reason.length < 8) {
        throw new BridgeError(400, "reason must contain at least 8 characters.");
      }
      const payload = objectValue(body.payload);
      const replay = await acquire({
        requestId,
        commandType,
        resourceType,
        resourceId,
        reason,
      });
      if (replay) {
        response.status(200).json({
          status: "OK",
          requestId,
          commandType,
          idempotent: true,
          ...replay,
        });
        return;
      }
      const result = await execute(
        commandType,
        resourceType,
        resourceId,
        payload,
        requestId,
      );
      await succeed(requestId, result);
      response.status(200).json({status: "OK", requestId, commandType, ...result});
    } catch (error) {
      if (requestId) await fail(requestId, error);
      const status = error instanceof BridgeError ? error.status : 500;
      console.error("Control Center Social Studio bridge failed", {
        status,
        message: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      });
      response.status(status).json({
        message: error instanceof Error ? error.message : "Social Studio bridge failed.",
      });
    }
  },
);
