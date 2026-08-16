import {createHash, timingSafeEqual} from "node:crypto";

import {getAuth} from "firebase-admin/auth";
import {FieldPath} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
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
const LEDGER = "control_center_admin_commands";
const BRAIN = "user_brain_profiles";
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const COMMAND_STALE_MS = 120_000;
const BRAIN_LOCK_MS = 60_000;

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

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function requiredText(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim()) throw new BridgeError(400, `${label} is required.`);
  return value.trim().slice(0, max);
}

function optionalText(value: unknown, max = 1000): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function objectValue(value: unknown): Plain {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Plain : {};
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

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function tokenFrom(header: string | undefined): string {
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function secretMatches(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
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
    const started = typeof old.startedAtMs === "number" ? old.startedAtMs : 0;
    if (old.status === "processing" && now - started < COMMAND_STALE_MS) {
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

async function userStatus(uid: string, payload: Plain, requestId: string): Promise<Plain> {
  const status = requiredText(payload.status, "payload.status", 40);
  if (!["active", "suspended", "banned", "deletion_pending"].includes(status)) {
    throw new BridgeError(400, "Unsupported user status.");
  }
  try {
    await getAuth().updateUser(uid, {disabled: status !== "active"});
  } catch (error) {
    if (((error as {code?: string}).code ?? "").includes("user-not-found")) {
      throw new BridgeError(404, "Firebase Auth user was not found.");
    }
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

async function userProfile(uid: string, payload: Plain, requestId: string): Promise<Plain> {
  const displayName = optionalText(payload.displayName, 30);
  const rawUsername = optionalText(payload.username, 20);
  const username = rawUsername ? normalizeUsernameLower(rawUsername) : null;
  if (!displayName && !username) throw new BridgeError(400, "At least one profile field is required.");
  if (username && !USERNAME_RE.test(username)) throw new BridgeError(400, "Invalid username format.");

  const userRef = db.collection("users").doc(uid);
  const publicRef = db.collection("public_profiles").doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new BridgeError(404, "User profile was not found.");
    const oldUsername = optionalText(snap.data()?.username, 20) ?? "";
    if (username && username !== oldUsername) {
      const newRef = db.collection("usernames").doc(username);
      const newSnap = await tx.get(newRef);
      if (newSnap.exists && newSnap.data()?.uid !== uid) throw new BridgeError(409, "Username is already taken.");
      tx.set(newRef, {uid, claimedAt: FieldValue.serverTimestamp()});
      if (oldUsername) tx.delete(db.collection("usernames").doc(oldUsername));
    }
    const shared: Plain = {
      ...(displayName ? {displayName} : {}),
      ...(username ? {username} : {}),
      controlCenterProfileRequestId: requestId,
      updatedAt: FieldValue.serverTimestamp(),
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

async function socialPost(postId: string, commandType: string, requestId: string): Promise<Plain> {
  const action = commandType.replace("social.post.", "");
  const ref = db.collection("feed_posts").doc(postId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new BridgeError(404, "Post was not found.");
    const data = (snap.data() ?? {}) as Plain;
    if (data.controlCenterModerationRequestId === requestId) return {action, idempotent: true};

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

    if (action !== "hide" && action !== "remove") throw new BridgeError(400, "Unsupported social action.");
    const update: Plain = {
      moderationStatus: action === "hide" ? "hidden" : "removed",
      controlCenterModerationAction: action,
      controlCenterModerationRequestId: requestId,
      controlCenterModeratedAt: FieldValue.serverTimestamp(),
      ...(data.controlCenterPreviousStatus === undefined ? {controlCenterPreviousStatus: data.status ?? "active"} : {}),
      ...(data.controlCenterPreviousVisibility === undefined ? {controlCenterPreviousVisibility: data.visibility ?? "public"} : {}),
    };
    if (action === "hide") update.visibility = "private";
    if (action === "remove") {
      update.status = "deleted";
      update.deletedAt = FieldValue.serverTimestamp();
    }
    tx.set(ref, update, {merge: true});
    return {action, restored: false};
  });
}

async function canonicalId(placeId: string): Promise<string> {
  if ((await db.collection("place_registry").doc(placeId).get()).exists) return placeId;
  const alias = await db.collection("place_migration_aliases").doc(placeId).get();
  const target = optionalText(alias.data()?.canonicalPlaceId, 240);
  if (!target) throw new BridgeError(404, "Canonical place was not found.");
  return target;
}

const ccPubId = (requestId: string) => `CCPUB-${hash(requestId).slice(0, 24)}`;

async function placeArchive(placeId: string, requestId: string): Promise<Plain> {
  const id = await canonicalId(placeId);
  const registryRef = db.collection("place_registry").doc(id);
  const headRef = db.collection("place_publication_heads").doc(id);
  const newId = ccPubId(requestId);
  await db.runTransaction(async (tx) => {
    const [registry, head] = await Promise.all([tx.get(registryRef), tx.get(headRef)]);
    if (!registry.exists || !head.exists) throw new BridgeError(404, "Active canonical place was not found.");
    const activeId = optionalText(head.data()?.activePublicationId, 240);
    if (!activeId) throw new BridgeError(409, "Place has no active publication.");
    const active = await tx.get(db.collection("place_publications").doc(activeId));
    if (!active.exists) throw new BridgeError(409, "Active publication was not found.");
    const old = (active.data() ?? {}) as Plain;
    tx.create(db.collection("place_publications").doc(newId), {
      ...old,
      publicationId: newId,
      placeId: id,
      versionNumber: typeof old.versionNumber === "number" ? old.versionNumber + 1 : 2,
      blocked: true,
      publicationStatus: "published",
      controlCenterLifecycleStatus: "archived",
      controlCenterRequestId: requestId,
      publishedAt: Date.now(),
      createdAt: Date.now(),
    });
    tx.set(headRef, {activePublicationId: newId, updatedAt: Date.now()}, {merge: true});
    tx.set(registryRef, {lifecycleStatus: "archived", archivedAt: Date.now(), controlCenterRequestId: requestId}, {merge: true});
    tx.set(db.collection("place_migration_audit").doc(`cc_archive_${hash(requestId).slice(0, 24)}`), {
      type: "control_center_archive",
      canonicalPlaceId: id,
      fromPublicationId: activeId,
      toPublicationId: newId,
      requestIdHash: hash(requestId),
      at: FieldValue.serverTimestamp(),
    });
  });
  return {canonicalPlaceId: id, archived: true, activePublicationId: newId};
}

async function placeMerge(sourceRaw: string, payload: Plain, requestId: string): Promise<Plain> {
  const targetRaw = requiredText(payload.targetPlaceId, "payload.targetPlaceId", 240);
  const [source, target] = await Promise.all([canonicalId(sourceRaw), canonicalId(targetRaw)]);
  if (source === target) throw new BridgeError(400, "Source and target cannot be the same.");
  const aliases = await db.collection("place_migration_aliases").where("canonicalPlaceId", "==", source).get();
  if (aliases.size > 450) throw new BridgeError(409, "Merge has too many aliases for one atomic operation.");
  const sourceRef = db.collection("place_registry").doc(source);
  const targetRef = db.collection("place_registry").doc(target);
  const sourceHeadRef = db.collection("place_publication_heads").doc(source);
  const targetHeadRef = db.collection("place_publication_heads").doc(target);
  const archivedPubId = ccPubId(requestId);

  await db.runTransaction(async (tx) => {
    const [sourceSnap, targetSnap, sourceHead, targetHead] = await Promise.all([
      tx.get(sourceRef), tx.get(targetRef), tx.get(sourceHeadRef), tx.get(targetHeadRef),
    ]);
    if (!sourceSnap.exists || !targetSnap.exists) throw new BridgeError(404, "Source or target place was not found.");
    if (sourceSnap.data()?.mergedIntoCanonicalPlaceId === target) return;
    const targetActiveId = optionalText(targetHead.data()?.activePublicationId, 240);
    if (!targetActiveId) throw new BridgeError(409, "Target place has no active publication.");
    const targetActive = await tx.get(db.collection("place_publications").doc(targetActiveId));
    if (!targetActive.exists || targetActive.data()?.blocked === true) throw new BridgeError(409, "Target place is not active.");

    const sourceActiveId = optionalText(sourceHead.data()?.activePublicationId, 240);
    if (sourceActiveId) {
      const sourceActive = await tx.get(db.collection("place_publications").doc(sourceActiveId));
      if (sourceActive.exists) {
        const old = (sourceActive.data() ?? {}) as Plain;
        tx.create(db.collection("place_publications").doc(archivedPubId), {
          ...old,
          publicationId: archivedPubId,
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
        tx.set(sourceHeadRef, {activePublicationId: archivedPubId, updatedAt: Date.now()}, {merge: true});
      }
    }
    for (const alias of aliases.docs) {
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
    tx.set(db.collection("place_migration_audit").doc(`cc_merge_${hash(requestId).slice(0, 24)}`), {
      type: "control_center_merge",
      sourceCanonicalPlaceId: source,
      targetCanonicalPlaceId: target,
      aliasesRepointed: aliases.size,
      requestIdHash: hash(requestId),
      at: FieldValue.serverTimestamp(),
    });
  });
  return {sourceCanonicalPlaceId: source, targetCanonicalPlaceId: target, aliasesRepointed: aliases.size};
}

async function placePublish(stagingId: string, payload: Plain, requestId: string): Promise<Plain> {
  const name = requiredText(payload.name, "payload.name", 240);
  const address = optionalText(payload.address, 1000);
  const lat = finite(payload.latitude);
  const lng = finite(payload.longitude);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new BridgeError(400, "Approved staging place requires valid coordinates.");
  }
  if (payload.reviewStatus !== "approved") throw new BridgeError(409, "Only approved staging records may be published.");
  const sourceType = optionalText(payload.sourceType, 80) ?? "admin_manual";
  const sourceReference = optionalText(payload.sourceReference, 500);
  const providerPlaceId = optionalText(payload.providerPlaceId, 240) ?? (sourceType.includes("google") ? sourceReference : null);
  const identity = providerPlaceId ? `provider:${providerPlaceId}` : `control_center_staging:${stagingId}`;
  const id = `CCP-${hash(identity).slice(0, 32)}`;
  const pubId = ccPubId(requestId);
  const now = Date.now();
  const registryRef = db.collection("place_registry").doc(id);

  await db.runTransaction(async (tx) => {
    const registry = await tx.get(registryRef);
    if (registry.exists && registry.data()?.controlCenterStagingId !== stagingId) {
      throw new BridgeError(409, "Canonical identity already exists from another source.");
    }
    const contentHash = hash(JSON.stringify({id, name, address, lat, lng, sourceType, sourceReference}));
    tx.set(registryRef, {
      canonicalPlaceId: id,
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
    tx.create(db.collection("place_publications").doc(pubId), {
      publicationId: pubId,
      placeId: id,
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
    tx.set(db.collection("place_publication_heads").doc(id), {placeId: id, activePublicationId: pubId, updatedAt: now}, {merge: true});
    if (providerPlaceId) {
      tx.set(db.collection("place_migration_aliases").doc(providerPlaceId), {
        canonicalPlaceId: id,
        aliasType: "provider_place_id",
        status: "active",
        createdAt: now,
        controlCenterRequestId: requestId,
      }, {merge: true});
    }
    tx.set(db.collection("place_migration_audit").doc(`cc_publish_${hash(requestId).slice(0, 24)}`), {
      type: "control_center_publish_from_staging",
      stagingId,
      canonicalPlaceId: id,
      publicationId: pubId,
      requestIdHash: hash(requestId),
      at: FieldValue.serverTimestamp(),
    });
  });
  return {stagingId, canonicalPlaceId: id, publicationId: pubId, published: true};
}

async function subscription(uid: string, commandType: string, requestId: string): Promise<Plain> {
  const action = commandType.replace("subscription.", "");
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new BridgeError(404, "Subscription user was not found.");
  const data = (snap.data() ?? {}) as Plain;
  const source = optionalText(data.planSource, 80) ?? "legacy";
  const plan = optionalText(data.plan, 40) ?? "free";
  if (source === "google_play") {
    throw new BridgeError(409, "Google Play mutation requires the authoritative raw purchase token, which the current backend intentionally does not retain.");
  }
  const now = Date.now();
  const expiry = toMs(data.couponExpiresAt, Number.MAX_SAFE_INTEGER);

  if (action === "force_sync") {
    if (source === "coupon" && expiry <= now) {
      const restored = optionalText(data.planBeforeCoupon, 40) ?? "free";
      await ref.set({
        plan: restored,
        planSource: "expired_coupon",
        couponStatus: "expired",
        controlCenterSubscriptionRequestId: requestId,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      const code = optionalText(data.couponCode, 100);
      if (code) await db.collection("coupon_redemptions").doc(`${uid}_${code}`).set({status: "expired"}, {merge: true});
      return {source: "coupon", changed: true, plan: restored, status: "expired"};
    }
    return {source, changed: false, plan, status: optionalText(data.couponStatus, 40) ?? "unknown"};
  }

  if (action === "cancel") {
    if (source === "coupon") {
      const restored = optionalText(data.planBeforeCoupon, 40) ?? "free";
      await ref.set({
        plan: restored,
        planSource: "expired_coupon",
        couponStatus: "cancelled",
        couponCancelledAt: FieldValue.serverTimestamp(),
        controlCenterSubscriptionRequestId: requestId,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      const code = optionalText(data.couponCode, 100);
      if (code) await db.collection("coupon_redemptions").doc(`${uid}_${code}`).set({status: "cancelled"}, {merge: true});
      return {source: "coupon", cancelled: true, plan: restored};
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
    throw new BridgeError(409, "This entitlement source cannot be cancelled authoritatively.");
  }

  if (action === "restore_entitlement") {
    if (source === "coupon" && expiry > now) return {source: "coupon", restored: false, alreadyActive: true, plan};
    throw new BridgeError(409, "Entitlement cannot be restored without a currently valid authoritative source.");
  }
  throw new BridgeError(400, "Unsupported subscription action.");
}

async function brainUid(userRef: string): Promise<string> {
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    let query = db.collection(BRAIN).orderBy(FieldPath.documentId()).limit(200);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    for (const doc of snapshot.docs) if (aiBrainUserRef(doc.id) === userRef) return doc.id;
    cursor = snapshot.docs[snapshot.docs.length - 1].id;
    if (snapshot.size < 200) break;
  }
  throw new BridgeError(404, "AI Brain user reference was not found.");
}

async function brainRecalculate(uid: string, requestId: string): Promise<Plain> {
  const now = Date.now();
  const ref = db.collection(BRAIN).doc(uid);
  const gate = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const old = (snap.data() ?? {}) as Plain;
    if (old.lastControlCenterRecalcRequestId === requestId) {
      return {done: true, version: typeof old.brainVersion === "number" ? old.brainVersion : 0};
    }
    const lockUntil = typeof old.recalcLockUntil === "number" ? old.recalcLockUntil : 0;
    if (now < lockUntil) throw new BridgeError(425, "AI Brain recalculation is locked; retry later.");
    tx.set(ref, {recalcLockUntil: now + BRAIN_LOCK_MS}, {merge: true});
    return {done: false, version: typeof old.brainVersion === "number" ? old.brainVersion : 0};
  });
  if (gate.done) return {idempotent: true, brainVersion: gate.version};

  try {
    const [eventsSnap, mealsSnap, profileSnap, brainSnap] = await Promise.all([
      db.collection("events").where("userId", "==", uid).limit(1000).get(),
      db.collection("users").doc(uid).collection("meals").orderBy("mealTime", "desc").limit(150).get(),
      db.collection("user_profiles").doc(uid).get(),
      ref.get(),
    ]);
    const profile = (profileSnap.data() ?? {}) as Plain;
    const oldBrain = (brainSnap.data() ?? {}) as Plain;
    const baseVersion = typeof oldBrain.brainVersion === "number" ? oldBrain.brainVersion : 0;
    const resetBoundaryMs = typeof oldBrain.resetBoundaryMs === "number" ? oldBrain.resetBoundaryMs : null;
    const events: BrainEvent[] = eventsSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        eventType: d.eventType as string,
        placeId: (d.placeId as string | undefined) ?? null,
        timeSlot: (d.timeSlot as string | undefined) ?? null,
        mood: (d.mood as string | undefined) ?? null,
        timestampMs: toMs(d.timestamp ?? d.clientTimestampMs, now),
        metadata: (d.metadata as Plain | undefined) ?? null,
        isSample: d.isSample === true,
        sourceMode: (d.sourceMode as string | undefined) ?? null,
        resultSource: (d.resultSource as string | undefined) ?? null,
      };
    });
    const meals: BrainMeal[] = mealsSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        cuisine: (d.cuisine as string | undefined) ?? null,
        cuisineTags: (d.cuisineTags as string[] | undefined) ?? null,
        mealTimeMs: toMs(d.mealTime, now),
        source: (d.source as string | undefined) ?? null,
        satisfactionRating: (d.satisfactionRating as number | undefined) ?? null,
        wouldRepeat: (d.wouldRepeat as boolean | undefined) ?? null,
        priceLevel: (d.priceLevel as number | undefined) ?? null,
        placeId: (d.placeId as string | undefined) ?? null,
        tags: (d.tags as string[] | undefined) ?? null,
        healthTags: (d.healthTags as string[] | undefined) ?? null,
      };
    });
    const result = computeBrain({uid, events, meals, profile, oldBrain, now, resetBoundaryMs});
    await db.runTransaction(async (tx) => {
      const latest = (await tx.get(ref)).data() ?? {};
      if (latest.lastControlCenterRecalcRequestId === requestId) return;
      if ((typeof latest.brainVersion === "number" ? latest.brainVersion : 0) !== baseVersion) {
        throw new BridgeError(425, "AI Brain changed during recalculation; retry.");
      }
      tx.set(ref, {
        ...result.brainDoc,
        lastCalculatedAt: FieldValue.serverTimestamp(),
        lastCalculatedAtMs: now,
        recalcLockUntil: 0,
        eventWindowDays: 30,
        mealWindowDays: 60,
        lastControlCenterRecalcRequestId: requestId,
      }, {merge: true});
      tx.set(ref.collection("brain_audit").doc(`cc_recalc_${requestId}`), {
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
    await ref.set({recalcLockUntil: 0}, {merge: true});
    throw error;
  }
}

async function brainReset(uid: string, requestId: string): Promise<Plain> {
  const now = Date.now();
  const ref = db.collection(BRAIN).doc(uid);
  return db.runTransaction(async (tx) => {
    const old = (await tx.get(ref)).data() ?? {};
    const oldVersion = typeof old.brainVersion === "number" ? old.brainVersion : 0;
    if (old.lastControlCenterResetRequestId === requestId) return {idempotent: true, brainVersion: oldVersion};
    const newVersion = oldVersion + 1;
    tx.set(ref, {
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
    tx.set(ref.collection("brain_audit").doc(`cc_reset_${requestId}`), {
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

async function execute(commandType: string, resourceType: string, resourceId: string, payload: Plain, requestId: string): Promise<Plain> {
  if (commandType === "user.status.change" && resourceType === "user") return userStatus(resourceId, payload, requestId);
  if (commandType === "user.profile.update" && resourceType === "user") return userProfile(resourceId, payload, requestId);
  if (commandType.startsWith("social.post.") && resourceType === "social_post") return socialPost(resourceId, commandType, requestId);
  if (commandType === "place.archive" && resourceType === "place") return placeArchive(resourceId, requestId);
  if (commandType === "place.merge" && resourceType === "place") return placeMerge(resourceId, payload, requestId);
  if (commandType === "place.publish_from_staging" && resourceType === "place_staging") return placePublish(resourceId, payload, requestId);
  if (commandType.startsWith("subscription.") && resourceType === "subscription") return subscription(resourceId, commandType, requestId);
  if ((commandType === "AI_BRAIN_RECALCULATE" || commandType === "AI_BRAIN_RESET_FOOD_MEMORY") && resourceType === "ai_brain_profile") {
    const uid = await brainUid(resourceId);
    return commandType === "AI_BRAIN_RECALCULATE" ? brainRecalculate(uid, requestId) : brainReset(uid, requestId);
  }
  throw new BridgeError(400, "Unsupported Control Center command/resource combination.");
}

/** Secret-gated server-only authority for Control Center operational commands. */
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
    const presented = tokenFrom(request.header("authorization"));
    if (!secret || !presented || !secretMatches(presented, secret)) {
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
      const payload = objectValue(body.payload);
      const replay = await acquire({requestId, commandType, resourceType, resourceId, reason});
      if (replay) {
        response.status(200).json({status: "OK", requestId, commandType, idempotent: true, ...replay});
        return;
      }
      const result = await execute(commandType, resourceType, resourceId, payload, requestId);
      await succeed(requestId, result);
      response.status(200).json({status: "OK", requestId, commandType, ...result});
    } catch (error) {
      if (requestId) await fail(requestId, error);
      const status = error instanceof BridgeError ? error.status : 500;
      console.error("Control Center admin bridge failed", {
        status,
        message: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      });
      response.status(status).json({message: error instanceof Error ? error.message : "Admin bridge failed."});
    }
  },
);
