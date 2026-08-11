/**
 * Algorithm 2 — servis kelayakan BERSATU (I/O nipis).
 *
 * Membungkus `resolveRolloutForRequest` (baca allow-list + owner + konfig env →
 * keputusan rollout AUTHORITATIF) dan memetakannya kepada `Algorithm2Eligibility`
 * melalui formula tulen `resolveAlgorithm2Eligibility`. Digunakan oleh nextSuggestion
 * dan mana-mana callable operasi sesi Algorithm 2 supaya identiti permintaan yang
 * SAMA menyelesaikan kepada kelayakan yang SAMA seperti getSuggestions.
 */
import { resolveRolloutForRequest } from "./rolloutService";
import {
  Algorithm2Eligibility,
  resolveAlgorithm2Eligibility,
} from "../domain/rollout/algorithm2Eligibility";
import { Algorithm2RolloutDecision } from "../domain/rollout/rolloutResolver";

export interface Algorithm2EligibilityResult {
  eligibility: Algorithm2Eligibility;
  /** Keputusan rollout penuh (untuk pemanggil yang perlukan medan tambahan). */
  decision: Algorithm2RolloutDecision;
  /** Identiti audit BERTOPENG (bukan UID penuh). */
  maskedIdentity: string;
  isOwner: boolean;
}

/** Resolusi kelayakan Algorithm 2 untuk satu permintaan (fail-closed → legasi). */
export async function resolveAlgorithm2EligibilityForRequest(
  uid: string,
  token: Record<string, unknown> | undefined,
): Promise<Algorithm2EligibilityResult> {
  const { decision, maskedIdentity, isOwner } = await resolveRolloutForRequest(uid, token);
  return {
    eligibility: resolveAlgorithm2Eligibility(decision),
    decision,
    maskedIdentity,
    isOwner,
  };
}
