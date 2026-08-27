import {createHash, timingSafeEqual} from "node:crypto";

import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

import {db, FieldValue, Timestamp} from "../config/firebase";

const COUPON_ADMIN_BRIDGE_SECRET = defineSecret("COUPON_ADMIN_BRIDGE_SECRET");
const REQUEST_COLLECTION = "control_center_coupon_admin_requests";

type CommandBody = {
  requestId?: unknown;
  commandType?: unknown;
  resourceType?: unknown;
  resourceId?: unknown;
  payload?: unknown;
  reason?: unknown;
};

type PlainObject = Record<string, unknown>;

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

function payloadObject(value: unknown): PlainObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as PlainObject;
}

function normalizeCode(value: unknown): string {
  const code = requiredText(value, "coupon code", 40)
    .toUpperCase()
    .replace(/\s+/g, "");
  if (code.length < 3 || code.length > 40 || !/^[A-Z0-9_-]+$/.test(code)) {
    throw new BridgeError(400, "Coupon code is invalid.");
  }
  return code;
}

function stableKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BridgeError(400, `${label} must be a number.`);
  }
  const result = Math.trunc(value);
  if (result < minimum || result > maximum) {
    throw new BridgeError(400, `${label} is outside the allowed range.`);
  }
  return result;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new BridgeError(400, `${label} must be boolean.`);
  }
  return value;
}

function optionalNote(value: unknown): string {
  if (value === undefined || value === null) return "Control Center coupon";
  if (typeof value !== "string") throw new BridgeError(400, "note must be text.");
  return value.trim().slice(0, 1000);
}

function validUntilTimestamp(value: unknown): Timestamp | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BridgeError(400, "validUntilMs must be a timestamp in milliseconds.");
  }
  const now = Date.now();
  if (value <= now) throw new BridgeError(400, "validUntilMs must be in the future.");
  return Timestamp.fromMillis(value);
}

function markerResult(data: PlainObject): PlainObject {
  const result = data.result;
  return result && typeof result === "object" && !Array.isArray(result)
    ? result as PlainObject
    : {};
}

async function createCoupon(
  requestId: string,
  resourceId: string,
  payload: PlainObject,
  reason: string,
) {
  const code = normalizeCode(resourceId);
  const plan = payload.plan === "plus" ? "plus" : payload.plan === "pro" ? "pro" : null;
  if (!plan) throw new BridgeError(400, "plan must be plus or pro.");
  const durationDays = boundedInteger(payload.durationDays, "durationDays", 1, 365);
  const maxRedemptions = boundedInteger(payload.maxRedemptions, "maxRedemptions", 1, 1_000_000);
  const validUntil = validUntilTimestamp(payload.validUntilMs);
  const oneUsePerUser = payload.oneUsePerUser === undefined
    ? true
    : requiredBoolean(payload.oneUsePerUser, "oneUsePerUser");
  const active = payload.active === undefined ? true : requiredBoolean(payload.active, "active");
  const note = optionalNote(payload.note);

  const couponRef = db.collection("coupon_codes").doc(code);
  const markerRef = db.collection(REQUEST_COLLECTION).doc(requestId);

  return db.runTransaction(async (tx) => {
    const markerSnap = await tx.get(markerRef);
    if (markerSnap.exists) return {...markerResult(markerSnap.data() as PlainObject), idempotent: true};

    const couponSnap = await tx.get(couponRef);
    if (couponSnap.exists) throw new BridgeError(409, "Coupon code already exists.");

    const result = {
      idempotent: false,
      code,
      couponKey: stableKey(code),
      plan,
      durationDays,
      maxRedemptions,
      active,
      validUntilMs: validUntil?.toMillis() ?? null,
    };

    tx.create(couponRef, {
      code,
      active,
      plan,
      durationDays,
      maxRedemptions,
      redeemedCount: 0,
      validFrom: FieldValue.serverTimestamp(),
      validUntil,
      oneUsePerUser,
      allowedEmails: [],
      allowedUids: [],
      note,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: "control_center",
      lastControlCenterRequestId: requestId,
    });
    tx.create(markerRef, {
      requestId,
      commandType: "coupon.create",
      resourceType: "coupon",
      resourceId: code,
      reason,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
}

async function setCouponActive(
  requestId: string,
  resourceId: string,
  payload: PlainObject,
  reason: string,
) {
  const code = normalizeCode(resourceId);
  const active = requiredBoolean(payload.active, "active");
  const couponRef = db.collection("coupon_codes").doc(code);
  const markerRef = db.collection(REQUEST_COLLECTION).doc(requestId);

  return db.runTransaction(async (tx) => {
    const markerSnap = await tx.get(markerRef);
    if (markerSnap.exists) return {...markerResult(markerSnap.data() as PlainObject), idempotent: true};

    const couponSnap = await tx.get(couponRef);
    if (!couponSnap.exists) throw new BridgeError(404, "Coupon was not found.");

    const current = couponSnap.data() as PlainObject;
    const result = {
      idempotent: false,
      code,
      couponKey: stableKey(code),
      active,
      previousActive: current.active === true,
    };

    tx.update(couponRef, {
      active,
      updatedAt: FieldValue.serverTimestamp(),
      lastControlCenterRequestId: requestId,
    });
    tx.create(markerRef, {
      requestId,
      commandType: "coupon.set_active",
      resourceType: "coupon",
      resourceId: code,
      reason,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
}

async function extendCouponValidity(
  requestId: string,
  resourceId: string,
  payload: PlainObject,
  reason: string,
) {
  const code = normalizeCode(resourceId);
  const newValidUntil = validUntilTimestamp(payload.validUntilMs);
  if (!newValidUntil) throw new BridgeError(400, "validUntilMs is required.");
  const couponRef = db.collection("coupon_codes").doc(code);
  const markerRef = db.collection(REQUEST_COLLECTION).doc(requestId);

  return db.runTransaction(async (tx) => {
    const markerSnap = await tx.get(markerRef);
    if (markerSnap.exists) return {...markerResult(markerSnap.data() as PlainObject), idempotent: true};

    const couponSnap = await tx.get(couponRef);
    if (!couponSnap.exists) throw new BridgeError(404, "Coupon was not found.");
    const current = couponSnap.data() as PlainObject;
    const oldValidUntil = current.validUntil as Timestamp | null | undefined;
    if (!oldValidUntil) {
      throw new BridgeError(409, "Coupon has no expiry and cannot be extended to a finite date.");
    }
    if (newValidUntil.toMillis() <= oldValidUntil.toMillis()) {
      throw new BridgeError(409, "New validity must be later than the current expiry.");
    }

    const result = {
      idempotent: false,
      code,
      couponKey: stableKey(code),
      previousValidUntilMs: oldValidUntil.toMillis(),
      validUntilMs: newValidUntil.toMillis(),
    };

    tx.update(couponRef, {
      validUntil: newValidUntil,
      updatedAt: FieldValue.serverTimestamp(),
      lastControlCenterRequestId: requestId,
    });
    tx.create(markerRef, {
      requestId,
      commandType: "coupon.extend_validity",
      resourceType: "coupon",
      resourceId: code,
      reason,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
}

async function revokeTrial(
  requestId: string,
  resourceId: string,
  payload: PlainObject,
  reason: string,
) {
  const uid = requiredText(payload.firebaseUid, "firebaseUid", 200);
  const code = normalizeCode(payload.couponCode);
  const expectedKey = stableKey(`${uid}_${code}`);
  if (resourceId !== expectedKey) {
    throw new BridgeError(400, "Redemption reference does not match the supplied user and coupon.");
  }

  const redemptionRef = db.collection("coupon_redemptions").doc(`${uid}_${code}`);
  const userRef = db.collection("users").doc(uid);
  const markerRef = db.collection(REQUEST_COLLECTION).doc(requestId);

  return db.runTransaction(async (tx) => {
    const markerSnap = await tx.get(markerRef);
    if (markerSnap.exists) return {...markerResult(markerSnap.data() as PlainObject), idempotent: true};

    const redemptionSnap = await tx.get(redemptionRef);
    const userSnap = await tx.get(userRef);
    if (!redemptionSnap.exists) throw new BridgeError(404, "Coupon redemption was not found.");
    if (!userSnap.exists) throw new BridgeError(404, "User was not found.");

    const redemption = redemptionSnap.data() as PlainObject;
    if (redemption.status === "revoked") throw new BridgeError(409, "Coupon trial is already revoked.");
    if (redemption.status !== "active") {
      throw new BridgeError(409, "Only an active coupon trial can be revoked.");
    }

    const user = userSnap.data() as PlainObject;
    if (user.planSource !== "coupon" || user.couponCode !== code) {
      throw new BridgeError(409, "User no longer has this coupon trial as the active entitlement.");
    }

    const previousPlan = typeof redemption.previousPlan === "string" && redemption.previousPlan.trim()
      ? redemption.previousPlan.trim()
      : typeof user.planBeforeCoupon === "string" && user.planBeforeCoupon.trim()
        ? user.planBeforeCoupon.trim()
        : "free";

    const result = {
      idempotent: false,
      redemptionKey: expectedKey,
      firebaseUid: uid,
      couponKey: stableKey(code),
      code,
      restoredPlan: previousPlan,
      redeemedCountChanged: false,
    };

    tx.set(redemptionRef, {
      status: "revoked",
      revokedAt: FieldValue.serverTimestamp(),
      revokedReason: reason,
      updatedAt: FieldValue.serverTimestamp(),
      lastControlCenterRequestId: requestId,
    }, {merge: true});
    tx.set(userRef, {
      plan: previousPlan,
      planSource: "revoked_coupon",
      couponStatus: "revoked",
      updatedAt: FieldValue.serverTimestamp(),
      lastControlCenterCouponRequestId: requestId,
    }, {merge: true});
    tx.create(markerRef, {
      requestId,
      commandType: "coupon.trial.revoke",
      resourceType: "coupon_redemption",
      resourceId,
      reason,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
}

/**
 * Trusted Control Center bridge for coupon administration only.
 * Browser clients never call this endpoint directly. The server-side Control
 * Center command runner authenticates with COUPON_ADMIN_BRIDGE_SECRET.
 * All supported operations are requestId-idempotent and leave redemption
 * history intact; revoke never decrements redeemedCount.
 */
export const controlCenterCouponAdminBridge = onRequest(
  {
    secrets: [COUPON_ADMIN_BRIDGE_SECRET],
    timeoutSeconds: 120,
    memory: "512MiB",
    maxInstances: 2,
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({message: "POST required."});
      return;
    }

    const secret = COUPON_ADMIN_BRIDGE_SECRET.value();
    const presented = bearerToken(request.header("authorization"));
    if (!secret || !presented || !safeEqual(presented, secret)) {
      response.status(401).json({message: "Unauthorized coupon admin bridge request."});
      return;
    }

    try {
      const body = (request.body ?? {}) as CommandBody;
      const requestId = requiredText(body.requestId, "requestId", 160);
      const commandType = requiredText(body.commandType, "commandType", 120);
      const resourceType = requiredText(body.resourceType, "resourceType", 120);
      const resourceId = requiredText(body.resourceId, "resourceId", 200);
      const reason = requiredText(body.reason, "reason", 1000);
      if (reason.length < 8) throw new BridgeError(400, "reason must contain at least 8 characters.");
      const payload = payloadObject(body.payload);

      let result: PlainObject;
      if (commandType === "coupon.create" && resourceType === "coupon") {
        result = await createCoupon(requestId, resourceId, payload, reason);
      } else if (commandType === "coupon.set_active" && resourceType === "coupon") {
        result = await setCouponActive(requestId, resourceId, payload, reason);
      } else if (commandType === "coupon.extend_validity" && resourceType === "coupon") {
        result = await extendCouponValidity(requestId, resourceId, payload, reason);
      } else if (commandType === "coupon.trial.revoke" && resourceType === "coupon_redemption") {
        result = await revokeTrial(requestId, resourceId, payload, reason);
      } else {
        throw new BridgeError(400, "Unsupported coupon admin command.");
      }

      response.status(200).json({
        status: "OK",
        requestId,
        commandType,
        resourceType,
        resourceId,
        ...result,
      });
    } catch (error) {
      const status = error instanceof BridgeError ? error.status : 500;
      console.error("Control Center coupon admin bridge failed", {
        status,
        message: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      });
      response.status(status).json({
        message: error instanceof Error ? error.message : "Coupon admin bridge failed.",
      });
    }
  },
);
