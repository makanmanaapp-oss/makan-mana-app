/**
 * Wave 3B — PURE interpretation of the Control Center `merchant.authorize_place`
 * bridge response. Fail-closed: anything other than an explicit authorized
 * result with an allowed role is NOT authorized. The acting merchant UID is
 * never part of the returned public authorization.
 */
import {
  displayNameSnapshot,
  isAllowedMerchantRole,
  normalizeCanonicalPlaceId,
  type MerchantRole,
} from "./identity";

export interface PlaceAuthorization {
  authorized: boolean;
  canonicalPlaceId: string;
  role: MerchantRole | null;
  registryId: string | null;
  restaurantDisplayName: string;
  reason?: string;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function notAuthorized(reason: string): PlaceAuthorization {
  return {authorized: false, canonicalPlaceId: "", role: null, registryId: null, restaurantDisplayName: "", reason};
}

/** Interpret a bridge HTTP status + JSON body into a fail-closed authorization. */
export function interpretPlaceAuthorization(httpStatus: number, body: unknown): PlaceAuthorization {
  if (httpStatus < 200 || httpStatus >= 300) {
    const err = object(body).error;
    return notAuthorized(typeof err === "string" ? err : `bridge_status_${httpStatus}`);
  }
  const root = object(body);
  const auth = object(root.authorization);
  if (auth.authorized !== true) {
    const reason = auth.reason;
    return notAuthorized(typeof reason === "string" ? reason : "not_authorized");
  }
  const role = auth.role;
  if (!isAllowedMerchantRole(role)) return notAuthorized("role_not_allowed");
  const canonicalPlaceId = normalizeCanonicalPlaceId(auth.canonicalPlaceId);
  if (!canonicalPlaceId) return notAuthorized("canonical_place_id_invalid");
  const registryId = typeof auth.registryId === "string" && auth.registryId ? auth.registryId : null;
  return {
    authorized: true,
    canonicalPlaceId,
    role,
    registryId,
    restaurantDisplayName: displayNameSnapshot(auth.restaurantDisplayName),
  };
}
