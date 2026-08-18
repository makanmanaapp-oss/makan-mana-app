import {timingSafeEqual} from "node:crypto";

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

const FIREBASE_AI_BRAIN_ADMIN_BRIDGE_SECRET = defineSecret("FIREBASE_AI_BRAIN_ADMIN_BRIDGE_SECRET");
const BRAIN_COLLECTION = "user_brain_profiles";
const EVENT_WINDOW_DAYS = 30;
const MEAL_WINDOW_DAYS = 60;
const LOCK_MS = 60_000;
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

class BridgeError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BridgeError";
  }
}

function bearerToken(header: string | undefined): string {
  if (!header?.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function requiredText(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BridgeError(400, `${label} is required.`);
  }
  return value.trim().slice(0, max);
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

async function resolveUid(userRef: string): Promise<string> {
  let cursor: string | undefined;
  for (let page = 0; page < UID_LOOKUP_MAX_PAGES; page++) {
    let query = db.collection(BRAIN_COLLECTION)
      .orderBy(FieldPath.documentId())
      .limit(UID_LOOKUP_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    for (const doc of snapshot.docs) {
      if (aiBrainUserRef(doc.id) === userRef) return doc.id;
    }
    cursor = snapshot.docs[snapshot.docs.length - 1].id;
    if (snapshot.size < UID_LOOKUP_PAGE_SIZE) break;
  }
  throw new BridgeError(404, "AI Brain user reference was not found.");
}

async function recalculateForAdmin(uid: string, requestId: string) {
  const now = Date.now();
  const brainRef = db.collection(BRAIN_COLLECTION).doc(uid);
  const gate = await db.runTransaction(async (tx) => {
    const snap = await tx.get(brainRef);
    const old = (snap.data() ?? {}) as Record<string, unknown>;
    if (old.lastControlCenterRecalcRequestId === requestId) {
      return {
        idempotent: true,
        brainVersion: typeof old.brainVersion === "number" ? old.brainVersion : 0,
      };
    }
    const lockUntil = typeof old.recalcLockUntil === "number" ? old.recalcLockUntil : 0;
    if (now < lockUntil) throw new BridgeError(425, "AI Brain recalculation is currently locked; retry later.");
    tx.set(brainRef, {recalcLockUntil: now + LOCK_MS}, {merge: true});
    return {
      idempotent: false,
      brainVersion: typeof old.brainVersion === "number" ? old.brainVersion : 0,
    };
  });
  if (gate.idempotent) {
    return {idempotent: true, brainVersion: gate.brainVersion};
  }

  try {
    const [eventsSnap, mealsSnap, profileSnap, brainSnap] = await Promise.all([
      db.collection("events").where("userId", "==", uid).limit(1000).get(),
      db.collection("users").doc(uid).collection("meals").orderBy("mealTime", "desc").limit(150).get(),
      db.collection("user_profiles").doc(uid).get(),
      brainRef.get(),
    ]);
    const profile = (profileSnap.data() ?? {}) as Record<string, unknown>;
    const oldBrain = (brainSnap.data() ?? {}) as Record<string, unknown>;
    if (oldBrain.lastControlCenterRecalcRequestId === requestId) {
      await brainRef.set({recalcLockUntil: 0}, {merge: true});
      return {
        idempotent: true,
        brainVersion: typeof oldBrain.brainVersion === "number" ? oldBrain.brainVersion : 0,
      };
    }
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
        metadata: (data.metadata as Record<string, unknown> | undefined) ?? null,
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

    const committed = await db.runTransaction(async (tx) => {
      const latestSnap = await tx.get(brainRef);
      const latest = (latestSnap.data() ?? {}) as Record<string, unknown>;
      if (latest.lastControlCenterRecalcRequestId === requestId) {
        return {
          idempotent: true,
          brainVersion: typeof latest.brainVersion === "number" ? latest.brainVersion : 0,
        };
      }
      const latestVersion = typeof latest.brainVersion === "number" ? latest.brainVersion : 0;
      if (latestVersion !== baseVersion) {
        throw new BridgeError(425, "AI Brain changed during admin recalculation; retry with fresh state.");
      }
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
      return {idempotent: false, brainVersion: result.diagnostics.newBrainVersion};
    });

    return {
      ...committed,
      confidence: result.diagnostics.confidenceAfter,
      signals: result.diagnostics.totalRealSignals,
      insufficientData: result.insufficientData,
    };
  } catch (error) {
    await brainRef.set({recalcLockUntil: 0}, {merge: true});
    throw error;
  }
}

async function resetForAdmin(uid: string, requestId: string) {
  const now = Date.now();
  const brainRef = db.collection(BRAIN_COLLECTION).doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(brainRef);
    const old = (snap.data() ?? {}) as Record<string, unknown>;
    const oldVersion = typeof old.brainVersion === "number" ? old.brainVersion : 0;
    if (old.lastControlCenterResetRequestId === requestId) {
      return {idempotent: true, brainVersion: oldVersion};
    }
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
      privacy: {
        personalizationEnabled: true,
        excludedSensitiveFields: ["allergies", "gps", "health", "receipt", "tokens"],
      },
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

/**
 * Trusted Control Center command bridge for AI Brain only.
 * Browser never calls this endpoint directly. The Control Center command runner
 * authenticates with FIREBASE_AI_BRAIN_ADMIN_BRIDGE_SECRET and supplies the stable masked
 * user reference. Operations are idempotent by requestId and auditable per brain.
 */
export const controlCenterAiBrainAdminBridge = onRequest(
  {
    secrets: [FIREBASE_AI_BRAIN_ADMIN_BRIDGE_SECRET],
    timeoutSeconds: 540,
    memory: "1GiB",
    maxInstances: 2,
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({message: "POST required."});
      return;
    }
    const secret = FIREBASE_AI_BRAIN_ADMIN_BRIDGE_SECRET.value();
    const presented = bearerToken(request.header("authorization"));
    if (!secret || !presented || !safeEqual(presented, secret)) {
      response.status(401).json({message: "Unauthorized admin bridge request."});
      return;
    }

    try {
      const body = (request.body ?? {}) as CommandBody;
      const requestId = requiredText(body.requestId, "requestId", 160);
      const commandType = requiredText(body.commandType, "commandType", 120);
      const resourceType = requiredText(body.resourceType, "resourceType", 120);
      const userRef = requiredText(body.resourceId, "resourceId", 160);
      const reason = requiredText(body.reason, "reason", 1000);
      if (reason.length < 8) throw new BridgeError(400, "reason must contain at least 8 characters.");
      if (resourceType !== "ai_brain_profile") {
        throw new BridgeError(400, "Unsupported AI Brain resource type.");
      }
      if (!["AI_BRAIN_RECALCULATE", "AI_BRAIN_RESET_FOOD_MEMORY"].includes(commandType)) {
        throw new BridgeError(400, "Unsupported AI Brain command type.");
      }

      const uid = await resolveUid(userRef);
      const result = commandType === "AI_BRAIN_RECALCULATE"
        ? await recalculateForAdmin(uid, requestId)
        : await resetForAdmin(uid, requestId);

      response.status(200).json({
        status: "OK",
        requestId,
        commandType,
        userRef,
        ...result,
      });
    } catch (error) {
      const status = error instanceof BridgeError ? error.status : 500;
      console.error("Control Center AI Brain admin bridge failed", {
        status,
        message: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      });
      response.status(status).json({
        message: error instanceof Error ? error.message : "AI Brain admin bridge failed.",
      });
    }
  },
);
