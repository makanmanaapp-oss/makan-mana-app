import {HttpsError, CallableRequest} from "firebase-functions/v2/https";

import {ADMIN_UIDS} from "../config/constants";

/**
 * SP9.2A: pengesahan admin yang DIPERCAYAI.
 *
 * TIDAK bergantung pada users/{uid}.isAdmin (pernah client-writable →
 * privilege escalation). Sumber kebenaran:
 *   1. custom claim `request.auth.token.admin === true` (masa depan), ATAU
 *   2. UID dalam senarai putih ADMIN_UIDS (fallback kecemasan owner).
 *
 * Melempar unauthenticated/permission-denied jika bukan admin.
 */
export function assertAdmin(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }
  const claims = (request.auth?.token ?? {}) as Record<string, unknown>;
  const claimAdmin =
    claims.admin === true || claims.role === "owner";
  const allowlisted = ADMIN_UIDS.includes(uid);
  if (!claimAdmin && !allowlisted) {
    throw new HttpsError("permission-denied", "Akses admin sahaja.");
  }
  return uid;
}
