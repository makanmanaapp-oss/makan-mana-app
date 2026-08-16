import {createHash, timingSafeEqual} from "node:crypto";

import {getAuth} from "firebase-admin/auth";
import {FieldPath} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

import {db, FieldValue, Timestamp} from "../config/firebase";
import {
  BRAIN_SCHEMA_VERSION,
  BrainEvent,
  BrainMeal,
  computeBrain,
  PRIVACY_VERSION,
} from "../domain/aiBrain/brainCalculator";
import {aiBrainUserRef} from "../domain/aiBrain/controlCenterSanitizer";
import {normalizeLower, normalizeUsernameLower} from "../domain/peopleSearch/normalize";

const FIREBASE_ADMIN_BRIDGE_SECRET = defineSecret("FIREBASE_ADMIN_BRIDGE_SECRET");

const COMMAND_LEDGER = "control_center_admin_commands";
const BRAIN_COLLECTION = "user_brain_profiles";
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const EVENT_WINDOW_DAYS = 30;
const MEAL_WINDOW_DAYS = 60;
const BRAIN_LOCK_MS = 60_000;
const COMMAND_STALE_MS = 120_000;
const UID_LOOKUP_PAGE_SIZE = 200;
const UID_LOOKUP_MAX_PAGES = 100;

type CommandBody = {
  requestId?: unknown;
  commandType?: unknown;
  resourceType?: unknown;
  resourceId?: unknown;
  payload?: unknown;
  reason?: unknown;
};

type Plain = Record<string, unknown>;

class BridgeError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "BridgeError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bearerToken(header: string | undefined): string {
  if (!header?.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requiredText(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BridgeError(400, `${label} is required.`);
  }
  return value.trim().slice(0, max);
}

function optionalText(value: unknown, max = 1000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function plainObject(value: unknown): Plain {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Plain;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toMs(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof (value as {toMillis?: () => number}).toMillis === "function") {
    return (value as {toMillis: () => number}).toMillis();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function commandLedgerId(requestId: string): string {
  return sha256(requestId);
}

async function acquireCommand(params: {
  requestId: string;
  commandType: string;
  resourceType: string;
  resourceId: string;
  reason: string;
}): Promise<Plain | null> {
  const now = Date.now();
  const ref = db.collection(COMMAND_LEDGER).doc(commandLedgerId(params.requestId));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = (snap.data() ?? {}) as Plain;
    if (snap.exists && existing.status === "succeeded") {
      return plainObject(existing.result);
    }
    const startedAtMs = typeof existing.startedAtMs === "number" ? existing.startedAtMs : 0;
    if (snap.exists && existing.status === "processing" && now - startedAtMs < COMMAND_STALE_MS) {
      throw new BridgeError(425, "Command is already processing; retry later.");
    }
    tx.set(ref, {
      requestIdHash: sha256(params.requestId),
      commandType: params.commandType,
      resourceType: params.resourceType,
      resourceIdHash: sha256(params.resourceId),
      reasonHash: sha256(params.reason),
      status: "processing",
      startedAtMs: now,
      startedAt: FieldValue.serverTimestamp(),
      attemptCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return null;
  });
}

async function markCommandSucceeded(requestId: string, result: Plain): Promise<void> {
  await db.collection(COMMAND_LEDGER).doc(commandLedgerId(requestId)).set({
    status: "succeeded",
    result,
    completedAtMs: Date.now(),
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
}

async function markCommandFailed(requestId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 500) : "unknown";
  await db.collection(COMMAND_LEDGER).doc(commandLedgerId(requestId)).set({
    status: "failed",
    errorMessage: message,
    failedAtMs: Date.now(),
    failedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true}).catch(() => undefined);
}

async function changeUserStatus(uid: string, payload: Plain, requestId: string): Promise<Plain> {
  const status = requiredText(payload.status, "payload.status", 40);
  if (!["active", "suspended", "banned", "deletion_pending"].includes(status)) {
    throw new BridgeError(400, "Unsupported user status.");
  }
  try {
    await getAuth().updateUser(uid, {disabled: status !== "active"});
  } catch (error) {
    const code = (error as {code?: string}).code ?? "";
    if (code.includes("user-not-found")) throw new BridgeError(404, "Firebase Auth user was not found.");
    throw error;
  }
  await db.collection("users").doc(uid).set({
    accountStatus: status,
    controlCenterStatus: status,
    controlCenterStatusRequestId: requestId,
    controlCenterStatusUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  return {status, authDisabled: status !== "active"};
}

async function updateUserProfile(uid: string, payload: Plain, requestId: string): Promise<Plain> {
  const displayName = optionalText(payload.displayName, 30);
  const usernameRaw = optionalText(payload.username, 20);
  const username = usernameRaw ? normalizeUsernameLower(usernameRaw) : null;
  if (!displayName && !username) throw new BridgeError(400, "At least one profile field is required.");
  if (username && !USERNAME_RE.test(username)) {
    throw new BridgeError(400, "Username must be 3-20 lowercase letters, numbers, dots or underscores.");
  }

  const userRef = db.collection("users").doc(uid);
  const publicRef = db.collection("public_profiles").doc(uid);
  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new BridgeError(404, "User profile was not found.");
    const oldUsername = optionalText(userSnap.data()?.username, 20) ?? "";
    if (username && username !== oldUsername) {
      const usernameRef = db.collection("usernames").doc(username);
      const usernameSnap = await tx.get(usernameRef);
      if (usernameSnap.exists && usernameSnap.data()?.uid !== uid) {
        throw new BridgeError(409, "Username is already taken.");
      }
      tx.set(usernameRef, {uid, claimedAt: FieldValue.serverTimestamp()});
      if (oldUsername) tx.delete(db.collection("usernames").doc(oldUsername));
    }
    const shared: Plain = {
      ...(displayName ? {displayName} : {}),
      ...(username ? {username} : {}),
      updatedAt: FieldValue.serverTimestamp(),
      controlCenterProfileRequestId: requestId,
    };
    tx.set(userRef, shared, {merge: true});
    tx.set(publicRef, {
      uid,
      ...shared,
      ...(displayName ? {displayNameLower: normalizeLower(displayName)} : {}),
      ...(username ? {usernameLower: normalizeUsernameLower(username)} : {}),
    }, {merge: true});
  });
  return {displayNameUpdated: Boolean(displayName), usernameUpdated: Boolean(username)};
}

async function moderatePost(postId: string, commandType: string, requestId: string): Promise<Plain> {
  const action = commandType.replace("social.post.", "");
  if (!["hide", "remove", "restore"].includes(action)) throw new BridgeError(400, "Unsupported social action.");
  const ref = db.collection("feed_posts").doc(postId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new BridgeError(404, "Post was not found.");
    const data = (snap.data() ?? {}) as Plain;
    if (data.controlCenterModerationRequestId === requestId) {
      return {action, idempotent: true};
    }
    if (action === "restore") {
      const previousStatus = data.controlCenterPreviousStatus;
      const previousVisibility = data.controlCenterPreviousVisibility;
      if (previousStatus === undefined && previousVisibility === undefined) {
        throw new BridgeError(409, "Post has no Control Center moderation snapshot to restore.");
      }
      const update: Plain = {
        moderationStatus: "visible",
        controlCenterModerationRequestId: requestId,
        controlCenterModeratedAt: FieldValue.serverTimestamp(),
        controlCenterPreviousStatus: FieldValue.delete(),
        controlCenterPreviousVisibility: FieldValue.delete(),
        controlCenterModerationAction: FieldValue.delete(),
      };
      if (previousStatus !== undefined) update.status = previousStatus;
      if (previousVisibility !== undefined) update.visibility = previousVisibility;
      tx.set(ref, update, {merge: true});
      return {action, restored: true};
    }

    const update: Plain = {
      moderationStatus: action === "hide" ? "hidden" : "removed",
      controlCenterModerationAction: action,
      controlCenterModerationRequestId: requestId,
      controlCenterModeratedAt: FieldValue.serverTimestamp(),
    };
    if (data.controlCenterPreviousStatus === undefined) update.controlCenterPreviousStatus = data.status ?? "active";
    if (data.controlCenterPreviousVisibility === undefined) update.controlCenterPreviousVisibility = data.visibility ?? "public";
    if (action === "hide") {
      update.visibility = "private";
    } else {
      update.status = "deleted";
      update.deletedAt = FieldValue.serverTimestamp();
    }
    tx.set(ref, update, {merge: true});
    return {action, restored: false};
  });
}

async function resolveCanonicalId(placeId: string): Promise<string> {
  const registry = await db.collection("place_registry").doc(placeId).get();
  if (registry.exists) return placeId;
  const alias = await db.collection("place_migration_aliases").doc(placeId).get();
  const canonical = optionalText(alias.data()?.canonicalPlaceId, 240);
  if (canonical) return canonical;
  throw new BridgeError(404, "Canonical place was not found.");
}

function publicationId(requestId: string): string {
  return `CCPUB-${sha256(requestId).slice(0, 24)}`;
}

async function archiveCanonicalPlace(placeId: string, requestId: string): Promise<Plain> {
  const canonicalId = await resolveCanonicalId(placeId);
  const registryRef = db.collection("place_registry").doc(canonicalId);
  const headRef = db.collection("place_publication_heads").doc(canonicalId);
  const newPublicationId = publicationId(requestId);
  const newPubRef = db.collection("place_publications").doc(newPublicationId);
  await db.runTransaction(async (tx) => {
    const [registrySnap, headSnap] = await Promise.all([tx.get(registryRef), tx.get(headRef)]);
    if (!registrySnap.exists || !headSnap.exists) throw new BridgeError(404, "Active canonical place was not found.");
    const activePublicationId = optionalText(headSnap.data()?.activePublicationId, 240);
    if (!activePublicationId) throw new BridgeError(409, "Place has no active publication.");
    const activeRef = db.collection("place_publications").doc(activePublicationId);
    const activeSnap = await tx.get(activeRef);
    if (!activeSnap.exists) throw new BridgeError(409, "Active publication was not found.");
    const active = (activeSnap.data() ?? {}) as Plain;
    const version = typeof active.versionNumber === "number" ? active.versionNumber + 1 : 2;
    tx.create(newPubRef, {
      ...active,
      publicationId: newPublicationId,
      placeId: canonicalId,
      versionNumber: version,
      blocked: true,
      publicationStatus: "published",
      controlCenterLifecycleStatus: "archived",
      controlCenterRequestId: requestId,
      publishedAt: Date.now(),
      createdAt: Date.now(),
    });
    tx.set(headRef, {activePublicationId: newPublicationId, updatedAt: Date.now()}, {merge: true});
    tx.set(registryRef, {
      lifecycleStatus: "archived",
      archivedAt: Date.now(),
      controlCenterRequestId: requestId,
    }, {merge: true});
    tx.set(db.collection("place_migration_audit").doc(`cc_archive_${sha256(requestId).slice(0, 24)}`), {
      type: "control_center_archive",
      canonicalPlaceId: canonicalId,
      fromPublicationId: activePublicationId,
      toPublicationId: newPublicationId,
      requestIdHash: sha256(requestId),
      at: FieldValue.serverTimestamp(),
    });
  });
  return {canonicalPlaceId: canonicalId, archived: true, activePublicationId: newPublicationId};
}

async function mergeCanonicalPlaces(sourceId: string, payload: Plain, requestId: string): Promise<Plain> {
  const targetRaw = requiredText(payload.targetPlaceId, "payload.targetPlaceId", 240);
  const [source, target] = await Promise.all([resolveCanonicalId(sourceId), resolveCanonicalId(targetRaw)]);
  if (source === target) throw new BridgeError(400, "Source and target canonical place cannot be the same.");

  const sourceRef = db.collection("place_registry").doc(source);
  const targetRef = db.collection("place_registry").doc(target);
  const sourceHeadRef = db.collection("place_publication_heads").doc(source);
  const targetHeadRef = db.collection("place_publication_heads").doc(target);
  const aliasesQuery = db.collection("place_migration_aliases").where("canonicalPlaceId", "==", source);
  const aliasesSnap = await aliasesQuery.get();
  if (aliasesSnap.size > 450) throw new BridgeError(409, "Merge has too many aliases for one atomic operation.");
  const archivedPublicationId = publicationId(requestId);

  await db.runTransaction(async (tx) => {
    const [sourceSnap, targetSnap, sourceHeadSnap, targetHeadSnap] = await Promise.all([
      tx.get(sourceRef), tx.get(targetRef), tx.get(sourceHeadRef), tx.get(targetHeadRef),
    ]);
    if (!sourceSnap.exists || !targetSnap.exists) throw new BridgeError(404, "Source or target place was not found.");
    if (sourceSnap.data()?.mergedIntoCanonicalPlaceId === target) return;
    const targetActiveId = optionalText(targetHeadSnap.data()?.activePublicationId, 240);
    if (!targetActiveId) throw new BridgeError(409, "Target place has no active publication.");
    const targetActive = await tx.get(db.collection("place_publications").doc(targetActiveId));
    if (!targetActive.exists || targetActive.data()?.blocked === true) throw new BridgeError(409, "Target place is not active.");

    const sourceActiveId = optionalText(sourceHeadSnap.data()?.activePublicationId, 240);
    if (sourceActiveId) {
      const sourceActiveRef = db.collection("place_publications").doc(sourceActiveId);
      const sourceActive = await tx.get(sourceActiveRef);
      if (sourceActive.exists) {
        const old = (sourceActive.data() ?? {}) as Plain;
        tx.create(db.collection("place_publications").doc(archivedPublicationId), {
          ...old,
          publicationId: archivedPublicationId,
          placeId: source,
          versionNumber: typeof old.versionNumber === "number" ? old.versionNumber + 1 : 2,
          blocked: true,
          publicationStatus: "published",
          controlCenterLifecycleStatus: "merged",
          mergedIntoCanonicalPlaceId: target,
          controlCenterRequestId: requestId,
          publishedAt: Date.now(),
          createdAt: Date.now(),
        });
        tx.set(sourceHeadRef, {activePublicationId: archivedPublicationId, updatedAt: Date.now()}, {merge: true});
      }
    }

    for (const alias of aliasesSnap.docs) {
      tx.set(alias.ref, {canonicalPlaceId: target, mergedFromCanonicalPlaceId: source, updatedAt: Date.now()}, {merge: true});
    }
    tx.set(db.collection("place_migration_aliases").doc(source), {
      canonicalPlaceId: target,
      aliasType: "merged_canonical_place_id",
      status: "active",
      createdAt: Date.now(),
      controlCenterRequestId: requestId,
    }, {merge: true});
    tx.set(sourceRef, {
      lifecycleStatus: "merged",
      mergedIntoCanonicalPlaceId: target,
      mergedAt: Date.now(),
      controlCenterRequestId: requestId,
    }, {merge: true});
    tx.set(db.collection("place_migration_audit").doc(`cc_merge_${sha256(requestId).slice(0, 24)}`), {
      type: "control_center_merge",
      sourceCanonicalPlaceId: source,
      targetCanonicalPlaceId: target,
      aliasesRepointed: aliasesSnap.size,
      requestIdHash: sha256(requestId),
      at: FieldValue.serverTimestamp(),
    });
  });

  return {sourceCanonicalPlaceId: source, targetCanonicalPlaceId: target, aliasesRepointed: aliasesSnap.size};
}

async function publishFromStaging(stagingId: string, payload: Plain, requestId: string): Promise<Plain> {
  const name = requiredText(payload.name, "payload.name", 240);
  const address = optionalText(payload.address, 1000);
  const lat = finiteNumber(payload.latitude);
  const lng = finiteNumber(payload.longitude);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new BridgeError(400, "Approved staging place requires valid latitude and longitude.");
  }
  if (payload.reviewStatus !== "approved") throw new BridgeError(409, "Only approved staging records may be published.");

  const sourceType = optionalText(payload.sourceType, 80) ?? "admin_manual";
  const sourceReference = optionalText(payload.sourceReference, 500);
  const providerPlaceId = optionalText(payload.providerPlaceId, 240) ??
    (sourceType.includes("google") ? sourceReference : null);
  const identityKey = providerPlaceId ? `provider:${providerPlaceId}` : `control_center_staging:${stagingId}`;
  const canonicalId = `CCP-${sha256(identityKey).slice(0, 32)}`;
  const pubId = publicationId(requestId);
  const now = Date.now();
  const registryRef = db.collection("place_registry").doc(canonicalId);
  const pubRef = db.collection("place_publications").doc(pubId);
  const headRef = db.collection("place_publication_heads").doc(canonicalId);

  await db.runTransaction(async (tx) => {
    const registrySnap = await tx.get(registryRef);
    if (registrySnap.exists) {
      const existingSource = optionalText(registrySnap.data()?.controlCenterStagingId, 120);
      if (existingSource !== stagingId) throw new BridgeError(409, "Canonical identity already exists from another source.");
    }
    const contentHash = sha256(JSON.stringify({canonicalId, name, address, lat, lng, sourceType, sourceReference}));
    tx.set(registryRef, {
      canonicalPlaceId: canonicalId,
      ...(providerPlaceId ? {providerPlaceId} : {}),
      displayName: name,
      lat,
      lng,
      address,
      canonicalVersion: "control-center-v1",
      ratingKnown: false,
      priceKnown: false,
      hoursKnown: false,
      provenanceSource: sourceType,
      controlCenterStagingId: stagingId,
      publicScope: "internal_cohort_only",
      lifecycleStatus: "active",
      createdAt: now,
      updatedAt: now,
    }, {merge: true});
    tx.create(pubRef, {
      publicationId: pubId,
      placeId: canonicalId,
      versionNumber: 1,
      title: name,
      address,
      ratingState: "rating_hidden",
      priceState: "price_unknown",
      hoursState: "hours_unknown",
      businessState: "status_unknown",
      halalState: "halal_unknown",
      dietaryState: "dietary_unknown",
      allergenState: "allergen_unknown",
      lat,
      lng,
      publicationStatus: "published",
      blocked: false,
      contentHash,
      sourceCanonicalVersion: "control-center-v1",
      publishedAt: now,
      createdAt: now,
      controlCenterRequestId: requestId,
    });
    tx.set(headRef, {placeId: canonicalId, activePublicationId: pubId, updatedAt: now}, {merge: true});
    if (providerPlaceId) {
      tx.set(db.collection("place_migration_aliases").doc(providerPlaceId), {
        canonicalPlaceId: canonicalId,
        aliasType: "provider_place_id",
        status: "active",
        createdAt: now,
        controlCenterRequestId: requestId,
      }, {merge: true});
    }
    tx.set(db.collection("place_migration_audit").doc(`cc_publish_${sha256(requestId).slice(0, 24)}`), {
      type: "control_center_publish_from_staging",
      stagingId,
      canonicalPlaceId: canonicalId,
      publicationId: pubId,
      requestIdHash: sha256(requestId),
      at: FieldValue.serverTimestamp(),
    });
  });
  return {stagingId, canonicalPlaceId: canonicalId, publicationId: pubId, published: true};
}

async function subscriptionAction(uid: string, commandType: string, requestId: string): Promise<Plain> {
  const action = commandType.replace("subscription.", "");
  if (!["force_sync", "cancel", "restore_entitlement"].includes(action)) {
    throw new BridgeError(400, "Unsupported subscription action.");
  }
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new BridgeError(404, "Subscription user was not found.");
  const data = (snap.data() ?? {}) as Plain;
  const source = optionalText(data.planSource, 80) ?? "legacy";
  const plan = optionalText(data.plan, 40) ?? "free";

  if (source === "google_play") {
    throw new BridgeError(409, "Google Play admin mutation requires an authoritative purchase token; no raw token is retained by the current backend.");
  }

  const now = Date.now();
  const expiresAtMs = toMs(data.couponExpiresAt, Number.MAX_SAFE_INTEGER);
  if (action === "force_sync") {
    if (source === "coupon" && expiresAtMs <= now) {
      const restorePlan = optionalText(data.planBeforeCoupon, 40) ?? "free";
      await ref.set({
        plan: restorePlan,
        planSource: "expired_coupon",
        couponStatus: "expired",
        controlCenterSubscriptionRequestId: requestId,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      const code = optionalText(data.couponCode, 100);
      if (code) await db.collection("coupon_redemptions").doc(`${uid}_${code}`).set({status: "expired"}, {merge: true});
      return {source: "coupon", changed: true, plan: restorePlan, status: "expired"};
    }
    return {source, changed: false, plan, status: optionalText(data.couponStatus, 40) ?? "unknown"};
  }

  if (action === "cancel") {
    if (source === "coupon") {
      const restorePlan = optionalText(data.planBeforeCoupon, 40) ?? "free";
      await ref.set({
        plan: restorePlan,
        planSource: "expired_coupon",
        couponStatus: "cancelled",
        couponCancelledAt: FieldValue.serverTimestamp(),
        controlCenterSubscriptionRequestId: requestId,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      const code = optionalText(data.couponCode, 100);
      if (code) await db.collection("coupon_redemptions").doc(`${uid}_${code}`).set({status: "cancelled"}, {merge: true});
      return {source: "coupon", cancelled: true, plan: restorePlan};
    }
    if (source === "mock") {
      await ref.set({
        plan: "free",
        planSource: "admin_cancelled_mock",
        planStatus: "cancelled",
        controlCenterSubscriptionRequestId: requestId,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {source: "mock", cancelled: true, plan: "free"};
    }
    throw new BridgeError(409, "This entitlement source cannot be cancelled authoritatively by Control Center.");
  }

  if (source === "coupon" && expiresAtMs > now) {
    return {source: "coupon", restored: false, alreadyActive: true, plan};
  }
  throw new BridgeError(409, "Entitlement cannot be restored without a currently valid authoritative source.");
}

async function resolveAiBrainUid(userRef: string): Promise<string> {
  let cursor: string | undefined;
  for (let page = 0; page < UID_LOOKUP_MAX_PAGES; page++) {
    let query = db.collection(BRAIN_COLLECTION).orderBy(FieldPath.documentId()).limit(UID_LOOKUP_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    for (const doc of snapshot.docs) if (aiBrainUserRef(doc.id) === userRef) return doc.id;
    cursor = snapshot.docs[snapshot.docs.length - 1].id;
    if (snapshot.size < UID_LOOKUP_PAGE_SIZE) break;
  }
  throw new BridgeError(404, "AI Brain user reference was not found.");
}

async function recalculateAiBrain(uid: string, requestId: string): Promise<Plain> {
  const now = Date.now();
  const brainRef = db.collection(BRAIN_COLLECTION).doc(uid);
  const gate = await db.runTransaction(async (tx) => {
    const snap = await tx.get(brainRef);
    const old = (snap.data() ?? {}) as Plain;
    if (old.lastControlCenterRecalcRequestId === requestId) {
      return {idempotent: true, brainVersion: typeof old.brainVersion === "number" ? old.brainVersion : 0};
    }
    const lockUntil = typeof old.recalcLockUntil === "number" ? old.recalcLockUntil : 0;
    if (now < lockUntil) throw new BridgeError(425, "AI Brain recalculation is currently locked; retry later.");
    tx.set(brainRef, {recalcLockUntil: now + BRAIN_LOCK_MS}, {merge: true});
    return {idempotent: false, brainVersion: typeof old.brainVersion === "number" ? old.brainVersion : 0};
  });
  if (gate.idempotent) return gate;

  try {
    const [eventsSnap, mealsSnap, profileSnap, brainSnap] = await Promise.all([
      db.collection("events").where("userId", "==", uid).limit(1000).get(),
      db.collection("users").doc(uid).collection("meals").orderBy("mealTime", "desc").limit(150).get(),
      db.collection("user_profiles").doc(uid).get(),
      brainRef.get(),
    ]);
    const profile = (profileSnap.data() ?? {}) as Plain;
    const oldBrain = (brainSnap.data() ?? {}) as Plain;
    const baseVersion = typeof oldBrain.brainVersion === "number" ? oldBrain.brainVersion : 0;
    const resetBoundaryMs = typeof oldBrain.resetBoundaryMs === "number" ? oldBrain.resetBoundaryMs : null;
    const events: BrainEvent[] = eventsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        eventType: data.eventType as string,
        placeId: (data.placeId as string | undefined) ?? null,
        timeSlot: (data.timeSlot as string | undefined) ?? null,
        mood: (data.mood as string | undefined) ?? null,
        timestampMs: toMs(data.timestamp ?? data.clientTimestampMs, now),
        metadata: (data.metadata as Plain | undefined) ?? null,
        isSample: data.isSample === true,
        sourceMode: (data.sourceMode as string | undefined) ?? null,
        resultSource: (data.resultSource as string | undefined) ?? null,
      };
    });
    const meals: BrainMeal[] = mealsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        cuisine: (data.cuisine as string | undefined) ?? null,
        cuisineTags: (data.cuisineTags as string[] | undefined) ?? null,
        mealTimeMs: toMs(data.mealTime, now),
        source: (data.source as string | undefined) ?? null,
        satisfactionRating: (data.satisfactionRating as number | undefined) ?? null,
        wouldRepeat: (data.wouldRepeat as boolean | undefined) ?? null,
        priceLevel: (data.priceLevel as number | undefined) ?? null,
        placeId: (data.placeId as string | undefined) ?? null,
        tags: (data.tags as string[] | undefined) ?? null,
        healthTags: (data.healthTags as string[] | undefined) ?? null,
      };
    });
    const result = computeBrain({uid, events, meals, profile, oldBrain, now, resetBoundaryMs});
    await db.runTransaction(async (tx) => {
      const latestSnap = await tx.get(brainRef);
      const latest = (latestSnap.data() ?? {}) as Plain;
      if (latest.lastControlCenterRecalcRequestId === requestId) return;
      const latestVersion = typeof latest.brainVersion === "number" ? latest.brainVersion : 0;
      if (latestVersion !== baseVersion) throw new BridgeError(425, "AI Brain changed during recalculation; retry.");
      tx.set(brainRef, {
        ...result.brainDoc,
        lastCalculatedAt: FieldValue.serverTimestamp(),
        lastCalculatedAtMs: now,
        recalcLockUntil: 0,
        eventWindowDays: EVENT_WINDOW_DAYS,
        mealWindowDays: MEAL_WINDOW_DAYS,
        lastControlCenterRecalcRequestId: requestId,
      }, {merge: true});
      tx.set(brainRef.collection("brain_audit").doc(`cc_recalc_${requestId}`), {
        type: "control_center_recalculate",
        at: FieldValue.serverTimestamp(),
        atMs: now,
        fromBrainVersion: baseVersion,
        toBrainVersion: result.diagnostics.newBrainVersion,
        requestId,
      });
    });
    return {
      brainVersion: result.diagnostics.newBrainVersion,
      confidence: result.diagnostics.confidenceAfter,
      signals: result.diagnostics.totalRealSignals,
      insufficientData: result.insufficientData,
    };
  } catch (error) {
    await brainRef.set({recalcLockUntil: 0}, {merge: true});
    throw error;
  }
}

async function resetAiBrain(uid: string, requestId: string): Promise<Plain> {
  const now = Date.now();
  const brainRef = db.collection(BRAIN_COLLECTION).doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(brainRef);
    const old = (snap.data() ?? {}) as Plain;
    const oldVersion = typeof old.brainVersion === "number" ? old.brainVersion : 0;
    if (old.lastControlCenterResetRequestId === requestId) return {idempotent: true, brainVersion: oldVersion};
    const newVersion = oldVersion + 1;
    tx.set(brainRef, {
      userId: uid,
      schemaVersion: BRAIN_SCHEMA_VERSION,
      brainVersion: newVersion,
      supersededBrainVersion: oldVersion,
      privacyVersion: PRIVACY_VERSION,
      insufficientData: true,
      confidence: {overall: 0, cuisine: 0, distance: 0, budget: 0, timeSlot: 0},
      resetBoundaryMs: now,
      resetAt: FieldValue.serverTimestamp(),
      resetAtMs: now,
      learnedTopCuisines: {},
      learnedAvoidedCuisines: {},
      topCuisines: {},
      avoidedCuisines: {},
      preferredPriceLevel: null,
      preferredDistanceKm: null,
      preferredTimeSlots: {},
      repeatTolerance: null,
      explorationLevel: null,
      acceptRate: 0,
      rejectRate: 0,
      skipRate: 0,
      commonRejectReasons: {},
      skipReasons: {},
      recentAcceptedPlaceIds: [],
      recentRejectedPlaceIds: [],
      recentSkippedPlaceIds: [],
      recentCuisineTags: [],
      recentMoodTags: [],
      sourceEventCount: 0,
      sourceMealCount: 0,
      recalcLockUntil: 0,
      lastCalculatedAtMs: 0,
      lastControlCenterResetRequestId: requestId,
      privacy: {personalizationEnabled: true, excludedSensitiveFields: ["allergies", "gps", "health", "receipt", "tokens"]},
    }, {merge: true});
    tx.set(brainRef.collection("brain_audit").doc(`cc_reset_${requestId}`), {
      type: "control_center_reset",
      at: FieldValue.serverTimestamp(),
      atMs: now,
      fromBrainVersion: oldVersion,
      toBrainVersion: newVersion,
      requestId,
    });
    return {idempotent: false, brainVersion: newVersion};
  });
}

async function executeCommand(params: {
  requestId: string;
  commandType: string;
  resourceType: string;
  resourceId: string;
  payload: Plain;
}): Promise<Plain> {
  const {requestId, commandType, resourceType, resourceId, payload} = params;
  switch (commandType) {
    case "user.status.change":
      if (resourceType !== "user") throw new BridgeError(400, "Invalid resource type.");
      return changeUserStatus(resourceId, payload, requestId);
    case "user.profile.update":
      if (resourceType !== "user") throw new BridgeError(400, "Invalid resource type.");
      return updateUserProfile(resourceId, payload, requestId);
    case "social.post.hide":
    case "social.post.remove":
    case "social.post.restore":
      if (resourceType !== "social_post") throw new BridgeError(400, "Invalid resource type.");
      return moderatePost(resourceId, commandType, requestId);
    case "place.archive":
      if (resourceType !== "place") throw new BridgeError(400, "Invalid resource type.");
      return archiveCanonicalPlace(resourceId, requestId);
    case "place.merge":
      if (resourceType !== "place") throw new BridgeError(400, "Invalid resource type.");
      return mergeCanonicalPlaces(resourceId, payload, requestId);
    case "place.publish_from_staging":
      if (resourceType !== "place_staging") throw new BridgeError(400, "Invalid resource type.");
      return publishFromStaging(resourceId, payload, requestId);
    case "subscription.force_sync":
    case "subscription.cancel":
    case "subscription.restore_entitlement":
      if (resourceType !== "subscription") throw new BridgeError(400, "Invalid resource type.");
      return subscriptionAction(resourceId, commandType, requestId);
    case "AI_BRAIN_RECALCULATE":
    case "AI_BRAIN_RESET_FOOD_MEMORY": {
      if (resourceType !== "ai_brain_profile") throw new BridgeError(400, "Invalid resource type.");
      const uid = await resolveAiBrainUid(resourceId);
      return commandType === "AI_BRAIN_RECALCULATE" ? recalculateAiBrain(uid, requestId) : resetAiBrain(uid, requestId);
    }
    default:
      throw new BridgeError(400, "Unsupported Control Center command type.");
  }
}

/**
 * Production Control Center command bridge.
 * One secret-gated endpoint handles Firebase operational commands, AI Brain
 * controls and only those subscription mutations that can be performed from an
 * authoritative backend state. It never writes recommendation/session data.
 */
export const controlCenterAdminBridge = onRequest(
  {
    invoker: "public",
    secrets: [FIREBASE_ADMIN_BRIDGE_SECRET],
    timeoutSeconds: 540,
    memory: "1GiB",
    maxInstances: 2,
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({message: "POST required."});
      return;
    }
    const secret = FIREBASE_ADMIN_BRIDGE_SECRET.value();
    const presented = bearerToken(request.header("authorization"));
    if (!secret || !presented || !safeEqual(presented, secret)) {
      response.status(401).json({message: "Unauthorized admin bridge request."});
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
      if (reason.length < 8) throw new BridgeError(400, "reason must contain at least 8 characters.");
      const payload = plainObject(body.payload);

      const replay = await acquireCommand({requestId, commandType, resourceType, resourceId, reason});
      if (replay) {
        response.status(200).json({status: "OK", requestId, commandType, idempotent: true, ...replay});
        return;
      }

      const result = await executeCommand({requestId, commandType, resourceType, resourceId, payload});
      await markCommandSucceeded(requestId, result);
      response.status(200).json({status: "OK", requestId, commandType, ...result});
    } catch (error) {
      if (requestId) await markCommandFailed(requestId, error);
      const status = error instanceof BridgeError ? error.status : 500;
      console.error("Control Center admin bridge failed", {
        status,
        message: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      });
      response.status(status).json({message: error instanceof Error ? error.message : "Admin bridge failed."});
    }
  },
);
