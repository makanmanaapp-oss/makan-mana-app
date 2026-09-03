import {randomUUID} from "node:crypto";

import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";

const MERCHANT_BRIDGE_SECRET = defineSecret("MERCHANT_BRIDGE_SECRET");
const MERCHANT_BRIDGE_URL =
  "https://makanmana-control-center.vercel.app/api/internal/merchant";
const ENFORCE_APP_CHECK = process.env.MERCHANT_ENFORCE_APP_CHECK === "true";

type MerchantAction =
  | "merchant.get_state"
  | "merchant.register_account"
  | "merchant.submit_claim"
  | "merchant.submit_place";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function clientRequestId(value: unknown): string {
  if (typeof value === "string") {
    const clean = value.trim();
    if (clean && clean.length <= 120 && /^[A-Za-z0-9._:-]+$/.test(clean)) return clean;
  }
  return `merchant-${randomUUID()}`;
}

function requireAuth(request: {auth?: {uid?: string} | null; app?: unknown}) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "unauthenticated");
  if (ENFORCE_APP_CHECK && !request.app) {
    throw new HttpsError("failed-precondition", "app_check_required");
  }
  return uid;
}

function mapBridgeStatus(status: number, message: string): HttpsError {
  if (status === 400) return new HttpsError("invalid-argument", message);
  if (status === 401) return new HttpsError("permission-denied", "merchant_bridge_unauthorized");
  if (status === 403) return new HttpsError("permission-denied", message);
  if (status === 404) return new HttpsError("not-found", message);
  if (status === 503) return new HttpsError("unavailable", "merchant_bridge_unavailable");
  return new HttpsError("failed-precondition", message || "merchant_operation_failed");
}

async function callMerchantBridge(params: {
  action: MerchantAction;
  uid: string;
  requestId: string;
  payload: JsonObject;
}): Promise<unknown> {
  const secret = MERCHANT_BRIDGE_SECRET.value();
  if (!secret) throw new HttpsError("unavailable", "merchant_bridge_not_configured");

  const response = await fetch(MERCHANT_BRIDGE_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: params.action,
      actorFirebaseUid: params.uid,
      requestId: params.requestId,
      payload: params.payload,
    }),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = object(body).error;
    throw mapBridgeStatus(response.status, typeof message === "string" ? message : "merchant_operation_failed");
  }

  return body;
}

export const getMyMerchantState = onCall(
  {secrets: [MERCHANT_BRIDGE_SECRET], enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: 10},
  async (request) => {
    const uid = requireAuth(request);
    return callMerchantBridge({
      action: "merchant.get_state",
      uid,
      requestId: clientRequestId(object(request.data).requestId),
      payload: {},
    });
  },
);

export const registerMerchantAccount = onCall(
  {secrets: [MERCHANT_BRIDGE_SECRET], enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: 5},
  async (request) => {
    const uid = requireAuth(request);
    const data = object(request.data);
    return callMerchantBridge({
      action: "merchant.register_account",
      uid,
      requestId: clientRequestId(data.requestId),
      payload: data,
    });
  },
);

export const submitMerchantPlaceClaim = onCall(
  {secrets: [MERCHANT_BRIDGE_SECRET], enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: 5},
  async (request) => {
    const uid = requireAuth(request);
    const data = object(request.data);
    return callMerchantBridge({
      action: "merchant.submit_claim",
      uid,
      requestId: clientRequestId(data.requestId),
      payload: data,
    });
  },
);

export const submitMerchantPlace = onCall(
  {secrets: [MERCHANT_BRIDGE_SECRET], enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: 5},
  async (request) => {
    const uid = requireAuth(request);
    const data = object(request.data);
    return callMerchantBridge({
      action: "merchant.submit_place",
      uid,
      requestId: clientRequestId(data.requestId),
      payload: data,
    });
  },
);
