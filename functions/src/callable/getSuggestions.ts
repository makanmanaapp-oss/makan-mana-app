import {createHash, randomUUID} from "node:crypto";
import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";
import {db} from "../config/firebase";
import {planForSubscriptionUser} from "../domain/billing/appleAccess";
import {computeContextHash} from "../domain/algorithm2/sessionEngine";
import {RECOMMENDATION_POLICY_VERSION} from "../domain/algorithm2/recommendationPolicy";
import {getAreaCandidatePool} from "../services/areaCandidatePoolService";
import {searchNearby} from "../services/placesService";
import {prepareRecommendationSource} from "../services/recommendationSourceService";
import {consumeRecommendationQueue, deliverRecommendation, runRecommendationRequest, type RecommendationDelivery} from "../services/recommendationDeliveryService";
import {reserveSpin, releaseSpin, incrementPaywallShown, spinLimitForPlan} from "../services/usageService";
import {logEvent} from "../services/eventService";
import {currentTimeSlot} from "../utils/timeSlot";
import {buildSyntheticPlaces, decideSyntheticPlaces, QA_SYNTHETIC_ALGORITHM_VERSION, SYNTHETIC_PLACE_SOURCE} from "../domain/security/qaSurfaces";
import {PlaceCandidate} from "../types/place";
import {truthfulPlacesOutcome, PLACES_STATUS_OK} from "../domain/places/truthfulPlacesOutcome";

const mapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");
interface Input {
  lat?: number; lng?: number; radius?: number; radiusMeters?: number;
  mood?: string; selectedMood?: string; languageCode?: string;
  mode?: string; requestId?: string; forceLegacy?: boolean;
}

/** One delivery boundary for Home and Spin, regardless of ranking rollout.
 * Only the primary is delivered. The server owns the entire Next queue; a client
 * can no longer resurrect a locally prefetched/rejected outlet. */
export const getSuggestions = onCall({secrets: [mapsApiKey]}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  const input = (request.data ?? {}) as Input;
  const mode = input.mode === "preview" ? "preview" : "spin";
  const lat = input.lat;
  const lng = input.lng;
  const radiusMeters = input.radiusMeters ?? input.radius ?? 3000;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90 ||
      typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180 ||
      !Number.isFinite(radiusMeters) || radiusMeters < 100 || radiusMeters > 50000) {
    return {status: "PLACES_UNAVAILABLE", mode, source: "location_unavailable", reason: "location_unavailable", primary: null, alternatives: [], candidates: [], retryable: true};
  }
  const rawMood = input.selectedMood ?? input.mood;
  const mood = typeof rawMood === "string" ? rawMood.slice(0, 80) : null;
  const languageCode = typeof input.languageCode === "string" ? input.languageCode.slice(0, 10) : "ms";
  // Old clients get a server-generated logical id; upgraded clients retain their
  // request id on network retry. Neither path bypasses the outlet cooldown.
  const requestId = input.requestId ?? randomUUID();
  const fingerprint = createHash("sha256").update(JSON.stringify({mode, lat, lng, radiusMeters, mood, languageCode})).digest("hex");
  return runRecommendationRequest(uid, requestId, fingerprint, async () => {
    const user = await db.collection("users").doc(uid).get();
    const plan = planForSubscriptionUser(user.data());
    const contextHash = computeContextHash({uid, lat, lng, radiusMeters, mood, plan, timeSegment: currentTimeSlot()});
    const context = {lat, lng, radiusMeters, mood, languageCode, contextHash, source: "makanmana_pool"};
    let spinUsed = 0;
    let spinLimit = spinLimitForPlan(plan);
    let reserved = false;
    let delivered = false;
    const base = {userId: uid, mood, languageCode, plan};
    if (mode === "spin") {
      const usage = await reserveSpin(uid, plan);
      spinUsed = usage.spinUsed; spinLimit = usage.spinLimit;
      if (!usage.allowed) {
        await incrementPaywallShown(uid);
        return {status: "PAYWALL_REQUIRED", spinUsed, spinLimit, requiredPlan: "plus", featureId: "unlimited_spin"};
      }
      reserved = true;
    }
    const success = (delivery: RecommendationDelivery, algorithmVersion: string) => {
      delivered = true;
      return {status: "OK", mode, ...delivery, candidates: [delivery.primary],
        selectedMood: mood, radiusMeters, algorithmVersion,
        ...(mode === "spin" ? {spinUsed, spinLimit} : {}),
        canonicalDiagnostics: {contextHash, policyVersion: RECOMMENDATION_POLICY_VERSION}};
    };
    try {
      const queued = await consumeRecommendationQueue(uid, contextHash);
      if (queued) return success(queued, "profile_memory_26h_queue_v1");
      let candidates: PlaceCandidate[] = [];
      let providerError = false;
      const synthetic = decideSyntheticPlaces({env: process.env});
      const apiKey = mapsApiKey.value();
      if (synthetic.active) {
        candidates = buildSyntheticPlaces({lat, lng, count: 20});
        context.source = SYNTHETIC_PLACE_SOURCE;
      } else if (apiKey) {
        try {
          if (process.env.AREA_COVERAGE_POOL_ENABLED !== "false" && input.forceLegacy !== true) {
            const area = await getAreaCandidatePool({lat, lng, radiusMeters, languageCode, apiKey, now: Date.now()});
            candidates = area.pool.candidates;
          } else {
            candidates = await searchNearby({lat, lng, radiusMeters, languageCode, apiKey});
          }
        } catch {
          providerError = true;
          logger.warn("getSuggestions.providerUnavailable");
        }
      }
      if (!synthetic.active) {
        const provider = truthfulPlacesOutcome({apiKeyPresent: true, providerError, candidates});
        candidates = provider.status === PLACES_STATUS_OK ? provider.places : [];
      }
      // Supabase approved publications are a source in their own right. A missing
      // Google key must not suppress otherwise valid merchant publications.
      const source = await prepareRecommendationSource(candidates, context, Date.now(), !synthetic.active);
      const delivery = await deliverRecommendation(uid, source, context);
      if (delivery) {
        // Learning telemetry is best-effort after the authoritative transaction.
        try {
          await logEvent({...base, eventType: "suggestion_shown", placeId: delivery.primary.placeId,
            sessionId: delivery.sessionId, suggestionId: delivery.suggestionId,
            metadata: {mode, source: context.source, policyVersion: RECOMMENDATION_POLICY_VERSION}});
        } catch { logger.warn("getSuggestions.telemetryDeferred"); }
        return success(delivery, synthetic.active ? QA_SYNTHETIC_ALGORITHM_VERSION : "profile_memory_26h_v1");
      }
      if (reserved) { spinUsed = await releaseSpin(uid); reserved = false; }
      const unavailable = source.candidates.length === 0 && (providerError || !apiKey);
      logger.info("getSuggestions.noPlaces", {mode, spinRefunded: mode === "spin",
        status: unavailable ? "PLACES_UNAVAILABLE" : "OK_EMPTY"});
      return {status: unavailable ? "PLACES_UNAVAILABLE" : "OK_EMPTY", mode,
        source: unavailable ? "unavailable" : "makanmana_pool",
        reason: unavailable ? "provider_unavailable" : "no_eligible_new_recommendations",
        primary: null, alternatives: [], candidates: [], retryable: unavailable,
        policyVersion: RECOMMENDATION_POLICY_VERSION,
        ...(mode === "spin" ? {spinUsed, spinLimit, spinRefunded: true} : {})};
    } finally {
      if (reserved && !delivered) await releaseSpin(uid);
    }
  });
});
