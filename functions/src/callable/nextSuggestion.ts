import {createHash} from "node:crypto";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {db} from "../config/firebase";
import {consumeRecommendationQueue, recordRecommendationReject, runRecommendationRequest} from "../services/recommendationDeliveryService";
import {RECOMMENDATION_POLICY_VERSION} from "../domain/algorithm2/recommendationPolicy";

interface NextInput {
  action?: string; placeId?: string; contextHash?: string;
  actionId?: string; reason?: string; suggestionId?: string; sessionId?: string;
}
/** Server queue for EVERY account. No legacy-local/rollout fallback. */
export const nextSuggestion = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  const input = (request.data ?? {}) as NextInput;
  const contextHash = input.contextHash;
  if (typeof contextHash !== "string" || !/^[a-f0-9]{24}$/.test(contextHash)) throw new HttpsError("invalid-argument", "contextHash_required");
  if (input.action !== "reject" && input.action !== "next") throw new HttpsError("invalid-argument", "invalid_action");
  const fingerprint = createHash("sha256").update(JSON.stringify({contextHash, action: input.action, placeId: input.placeId ?? null, reason: input.reason ?? null})).digest("hex");
  return runRecommendationRequest(uid, input.actionId, fingerprint, async () => {
    const queue = await db.collection("users").doc(uid).collection("recommendation_queues").doc(contextHash).get();
    // Queue ownership is established by its user-scoped path. No arbitrary
    // caller-supplied suggestion_sessions document is ever updated.
    if (!queue.exists) {
      // An old app can still hold a pre-upgrade Algorithm 2 card. Preserve its
      // reject, but never advance the legacy local list or resurrect its pool.
      const legacy = await db.collection("users").doc(uid).collection("algo2_sessions").doc(contextHash).get();
      const candidates = (legacy.data()?.candidates ?? []) as Array<{placeId: string}>;
      if (input.action === "reject" && input.placeId && candidates.some((p) => p.placeId === input.placeId)) {
        await recordRecommendationReject(uid, input.placeId, `reject:${input.actionId}`, input.reason);
        return {actionAccepted: true, nextPlace: null, responseSource: "session_expired", poolExhausted: true};
      }
      return {actionAccepted: false, nextPlace: null, responseSource: "session_expired", poolExhausted: true};
    }
    if (input.action === "reject") {
      const candidates = queue.data()?.candidates as Array<{placeId: string; canonicalPlaceId?: string}>;
      if (!input.placeId || !candidates.some((p) => p.placeId === input.placeId || p.canonicalPlaceId === input.placeId)) {
        throw new HttpsError("permission-denied", "place_not_in_owned_queue");
      }
      const suggestionId = input.suggestionId ?? queue.data()?.lastSuggestionId;
      if (typeof suggestionId !== "string" || suggestionId.includes("/")) throw new HttpsError("invalid-argument", "suggestionId_required");
      const shown = await db.collection("users").doc(uid).collection("suggestions").doc(suggestionId).get();
      if (!shown.exists || shown.data()?.placeId !== input.placeId || shown.data()?.sessionId !== contextHash) {
        throw new HttpsError("permission-denied", "suggestion_not_owned_or_mismatched");
      }
      await recordRecommendationReject(uid, input.placeId, `reject:${input.actionId}`, input.reason);
    }
    const delivery = await consumeRecommendationQueue(uid, contextHash);
    return {actionId: input.actionId, actionAccepted: true, nextPlace: delivery?.primary ?? null,
      suggestionId: delivery?.suggestionId ?? null, sessionId: contextHash, contextHash,
      responseSource: delivery ? "session_alternative" : "alternatives_exhausted",
      reasonCode: delivery ? "authoritative_26h" : "no_eligible_new_recommendations",
      poolExhausted: !delivery, hasMoreAuthoritative: (delivery?.remainingCount ?? 0) > 0,
      alternativesRemaining: delivery?.remainingCount ?? 0, authoritativeRemaining: delivery?.remainingCount ?? 0,
      providerQueryCount: 0, rankingExecuted: true, policyVersion: RECOMMENDATION_POLICY_VERSION};
  });
});
