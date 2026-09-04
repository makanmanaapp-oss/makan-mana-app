import {randomUUID} from "node:crypto";

import {defineSecret} from "firebase-functions/params";
import {HttpsError} from "firebase-functions/v2/https";

import {
  interpretPlaceAuthorization,
  notAuthorized,
  type PlaceAuthorization,
} from "../domain/restaurantEngagement/merchantAuthorization";

/**
 * Shared trusted Firebase → Control Center merchant bridge. Reused by the Wave 2
 * merchant proposal callables and the Wave 3 restaurant-engagement flows. The
 * bridge secret is only ever an Authorization header; it is never logged.
 */

export const MERCHANT_BRIDGE_SECRET = defineSecret("MERCHANT_BRIDGE_SECRET");
export const MERCHANT_BRIDGE_URL =
  "https://makanmana-control-center.vercel.app/api/internal/merchant";
export const MERCHANT_ENFORCE_APP_CHECK = process.env.MERCHANT_ENFORCE_APP_CHECK === "true";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

export function merchantClientRequestId(value: unknown): string {
  if (typeof value === "string") {
    const clean = value.trim();
    if (clean && clean.length <= 120 && /^[A-Za-z0-9._:-]+$/.test(clean)) return clean;
  }
  return `merchant-${randomUUID()}`;
}

function mapBridgeStatus(status: number, message: string): HttpsError {
  if (status === 400) return new HttpsError("invalid-argument", message);
  if (status === 401) return new HttpsError("permission-denied", "merchant_bridge_unauthorized");
  if (status === 403) return new HttpsError("permission-denied", message);
  if (status === 404) return new HttpsError("not-found", message);
  if (status === 503) return new HttpsError("unavailable", "merchant_bridge_unavailable");
  return new HttpsError("failed-precondition", message || "merchant_operation_failed");
}

/** Generic bridge call. Throws a mapped HttpsError on non-2xx (used by the
 * write-oriented merchant proposal callables). */
export async function callMerchantBridge(params: {
  action: string;
  uid: string;
  requestId: string;
  payload: JsonObject;
}): Promise<unknown> {
  const secret = MERCHANT_BRIDGE_SECRET.value();
  if (!secret) throw new HttpsError("unavailable", "merchant_bridge_not_configured");

  const response = await fetch(MERCHANT_BRIDGE_URL, {
    method: "POST",
    headers: {authorization: `Bearer ${secret}`, "content-type": "application/json"},
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

/**
 * READ-ONLY restaurant-place authorization. Fail-closed: any non-2xx response,
 * transport error, or missing/insufficient authorization returns an unauthorized
 * result (never throws for an auth rejection). It never mutates or publishes
 * merchant/registry data and is not blocked by the public-submission write gate
 * on the Control Center side.
 */
export async function authorizeMerchantPlace(
  uid: string,
  canonicalPlaceId: string,
  requestId?: string,
): Promise<PlaceAuthorization> {
  const secret = MERCHANT_BRIDGE_SECRET.value();
  if (!secret) return notAuthorized("merchant_bridge_not_configured");

  try {
    const response = await fetch(MERCHANT_BRIDGE_URL, {
      method: "POST",
      headers: {authorization: `Bearer ${secret}`, "content-type": "application/json"},
      body: JSON.stringify({
        action: "merchant.authorize_place",
        actorFirebaseUid: uid,
        requestId: merchantClientRequestId(requestId),
        payload: {canonicalPlaceId},
      }),
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return interpretPlaceAuthorization(response.status, body);
  } catch {
    return notAuthorized("merchant_bridge_unavailable");
  }
}
