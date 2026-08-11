/**
 * Algorithm 2 / Phase 2.5 — Perkhidmatan rollout (I/O). Baca keahlian allow-list
 * (server) + status owner + konfig env → keputusan rollout AUTHORITATIF.
 */
import { db } from "../config/firebase";
import { ADMIN_UIDS } from "../config/constants";
import { resolveCohortAuthorization } from "../domain/places/canonical/canonicalReadResolver";
import { getRolloutConfig } from "../config/rolloutConfig";
import {
  Algorithm2RolloutDecision, AllowlistMember, resolveRollout,
} from "../domain/rollout/rolloutResolver";

/** Resolusi rollout untuk satu permintaan. Fail-closed ke legasi pada ralat. */
export async function resolveRolloutForRequest(
  uid: string,
  token: Record<string, unknown> | undefined,
): Promise<{ decision: Algorithm2RolloutDecision; maskedIdentity: string; isOwner: boolean }> {
  const cohort = resolveCohortAuthorization({ uid, token }, { ownerAllowlist: ADMIN_UIDS });
  const isOwner = cohort.canonicalCohortEligible;
  const config = getRolloutConfig();

  let allowlistMember: AllowlistMember | null = null;
  try {
    // Hanya baca allow-list jika perlu (bukan owner) — jimat baca.
    if (!isOwner) {
      const snap = await db.collection("algorithm_rollout_members").doc(uid).get();
      if (snap.exists) {
        const d = snap.data() ?? {};
        allowlistMember = {
          cohort: (d.cohort as string | undefined) ?? null,
          enabled: d.enabled === true,
          expiresAt: (d.expiresAt as number | undefined) ?? null,
        };
      }
    }
  } catch {
    // Kegagalan baca allow-list → fail-closed (tiada keahlian).
    allowlistMember = null;
  }

  const decision = resolveRollout({ uid, isOwner, allowlistMember, now: Date.now(), config });
  return { decision, maskedIdentity: cohort.maskedIdentity, isOwner };
}
