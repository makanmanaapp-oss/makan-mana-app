import {createHash, randomUUID} from "node:crypto";
import {HttpsError} from "firebase-functions/v2/https";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {db} from "../config/firebase";
import {PlaceCandidate} from "../types/place";
import {planForSubscriptionUser} from "../domain/billing/appleAccess";
import {applyCuisineDiversity, sessionSeededRotation, seedFromString} from "../domain/algorithm2/sessionEngine";
import {rankUnified} from "../domain/algorithm2/unifiedRanking";
import {
  RECOMMENDATION_COOLDOWN_MS, RECOMMENDATION_POLICY_VERSION,
  OutletMemory, mergeOutletMemory, enforceRecommendationPolicy, outletKey,
} from "../domain/algorithm2/recommendationPolicy";
import {normalizeRejectReason, rejectTtlMs} from "../domain/algorithm2/rejectPolicy";
import {buildRecCtxFromHydration} from "./recommendationContextBuilder";
import {RecommendationLocation, RecommendationSource, prepareRecommendationSource} from "./recommendationSourceService";

const key = (v: string): string => createHash("sha256").update(v).digest("hex");
const safeId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("/");
export interface DeliveryContext extends RecommendationLocation {
  mood: string | null;
  languageCode: string;
  contextHash: string;
  source?: string;
}
export interface RecommendationDelivery {
  primary: PlaceCandidate;
  alternatives: PlaceCandidate[];
  sessionId: string;
  suggestionId: string;
  contextHash: string;
  policyVersion: string;
  source: string;
  remainingCount: number;
}

/** Request retry != a new recommendation or another quota charge. */
export async function runRecommendationRequest<T>(
  uid: string, requestId: unknown, fingerprint: string, work: () => Promise<T>,
  store: Firestore = db,
): Promise<T> {
  if (!safeId(requestId)) throw new HttpsError("invalid-argument", "requestId_required");
  const ref = store.collection("users").doc(uid).collection("recommendation_requests").doc(key(requestId));
  const owner = randomUUID();
  const claim = await store.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (data && data.fingerprint !== fingerprint) throw new HttpsError("invalid-argument", "requestId_payload_mismatch");
    if (data?.status === "done") {
      const result = data.result as Record<string, unknown>;
      const place = (result?.primary ?? result?.nextPlace) as PlaceCandidate | null | undefined;
      if (place?.placeId) {
        const memory = await tx.get(store.collection("users").doc(uid).collection("recommendation_memory").doc(key(outletKey(place))));
        const row = memory.data();
        if (row && (row.permanentAvoid === true ||
            (typeof row.lastRejectedAt === "number" && row.lastRejectedAt >= row.lastShownAt) ||
            (row.lastDeliveryId && row.lastDeliveryId !== result.suggestionId))) {
          throw new HttpsError("failed-precondition", "recommendation_replay_no_longer_current");
        }
      }
      return {replay: true, result: data.result as T};
    }
    if (data?.status === "processing") throw new HttpsError("aborted", "recommendation_request_pending");
    tx.set(ref, {fingerprint, status: "processing", owner, createdAt: Date.now()});
    return {replay: false};
  });
  if (claim.replay) return claim.result!;
  try {
    const result = await work();
    await ref.update({status: "done", result, completedAt: Date.now()});
    return result;
  } catch (error) {
    // Do not rerun an ambiguous operation automatically. A fresh logical request
    // can try again; outlet memory still prevents duplicate delivery.
    await ref.set({status: "failed", failedAt: Date.now()}, {merge: true});
    throw error;
  }
}

/** All reads needed for selection occur before writes in one transaction. The
 * per-outlet memory documents are the cross-context/cross-device conflict keys.
 * Primary delivery is conservatively counted as shown; prefetched alternatives
 * are never counted. There is no session-expiry or rollout bypass. */
export async function deliverRecommendation(
  uid: string, source: RecommendationSource, context: DeliveryContext,
  now = Date.now(), store: Firestore = db,
): Promise<RecommendationDelivery | null> {
  if (source.candidates.length === 0) return null;
  if (Buffer.byteLength(JSON.stringify(source.candidates)) > 700000) throw new HttpsError("resource-exhausted", "recommendation_pool_too_large");
  const user = store.collection("users").doc(uid);
  const aliasesFor = (p: PlaceCandidate): string[] => [...new Set([
    outletKey(p), p.placeId, ...(source.aliases[outletKey(p)] ?? []),
  ])];
  const identities = [...new Set(source.candidates.flatMap(aliasesFor))];
  const memoryRefs = identities.map((id) => user.collection("recommendation_memory").doc(key(id)));
  const rejectRefs = identities.map((id) => user.collection("place_reject_memory").doc(id));
  const sessionRef = user.collection("recommendation_queues").doc(context.contextHash);
  const suggestionRef = user.collection("suggestions").doc();
  return store.runTransaction(async (tx) => {
    const [profile, brain, fitness, wallet, userSnap, memorySnaps, rejectSnaps, oldShown, meals, versions] = await Promise.all([
      tx.get(store.collection("user_profiles").doc(uid)),
      tx.get(store.collection("user_brain_profiles").doc(uid)),
      tx.get(store.collection("fitness_profiles").doc(uid)),
      tx.get(user.collection("meal_wallet").doc("current")), tx.get(user),
      tx.getAll(...memoryRefs), tx.getAll(...rejectRefs),
      // Bootstrap previously deployed spin/client-written records. A capped
      // query must fail closed, never silently forget recent history.
      tx.get(user.collection("suggestions").where("createdAt", ">=", Timestamp.fromMillis(now - RECOMMENDATION_COOLDOWN_MS)).limit(2001)),
      tx.get(user.collection("meals").orderBy("mealTime", "desc").limit(5)),
      source.versionChecks?.length ? tx.getAll(...source.versionChecks.map((check) => store.doc(check.path))) : Promise.resolve([]),
    ]);
    if (versions.some((snapshot, i) => (snapshot.updateTime?.valueOf() ?? null) !== source.versionChecks![i].version)) {
      throw new HttpsError("aborted", "recommendation_source_changed_retry");
    }
    if (oldShown.size > 2000) throw new HttpsError("resource-exhausted", "recommendation_history_truncated");
    const recent = new Map<string, number>();
    for (const doc of oldShown.docs) {
      const row = doc.data();
      const at = row.createdAt && typeof row.createdAt.toMillis === "function" ? row.createdAt.toMillis() : null;
      if (typeof row.placeId === "string" && typeof at === "number") recent.set(row.placeId, Math.max(recent.get(row.placeId) ?? 0, at));
    }
    const memory = new Map<string, OutletMemory>();
    identities.forEach((id, i) => memory.set(id, mergeOutletMemory([
      (memorySnaps[i].data() ?? {}) as OutletMemory,
      (rejectSnaps[i].data() ?? {}) as OutletMemory,
      ...(recent.has(id) ? [{lastShownAt: recent.get(id)!}] : []),
    ])));
    const memoryFor = (p: PlaceCandidate) => mergeOutletMemory(aliasesFor(p).map((id) => memory.get(id) ?? {}));
    const recCtx = buildRecCtxFromHydration({uid, plan: planForSubscriptionUser(userSnap.data()),
      language: context.languageCode, lat: context.lat, lng: context.lng, radiusMeters: context.radiusMeters,
      mood: context.mood, localHour: new Date(now + 8 * 3600000).getUTCHours(),
      profile: profile.data() ?? {}, brain: brain.data() ?? {}, fitness: fitness.data() ?? {}, wallet: wallet.data() ?? {}, meals: meals.docs.map((d) => d.data())});
    // Profile, Food Memory, fit, budget and mood are hydrated from server records
    // for EVERY user, including legacy/non-cohort. Never trust client profiles.
    const ranked = rankUnified(source.candidates, recCtx).ranked;
    const diversified = applyCuisineDiversity(sessionSeededRotation(ranked,
      seedFromString(`${uid}:${suggestionRef.id}`)), {cuisineCap: 2, window: 12});
    const allowed = enforceRecommendationPolicy(diversified, memoryFor, now);
    const primary = allowed[0];
    if (!primary) return null;
    const merged = memoryFor(primary);
    const data = {...merged, lastShownAt: now, lastDeliveryId: suggestionRef.id,
      canonicalPlaceId: outletKey(primary), policyVersion: RECOMMENDATION_POLICY_VERSION};
    for (const id of aliasesFor(primary)) tx.set(user.collection("recommendation_memory").doc(key(id)), data, {merge: true});
    // Store the full eligible source pool, not just the first five/top-30. Each
    // use revalidates publication, profile and global memory before selecting.
    tx.set(sessionRef, {candidates: source.candidates, context, updatedAt: now,
      lastPlaceId: primary.placeId, lastSuggestionId: suggestionRef.id,
      expiresAt: now + RECOMMENDATION_COOLDOWN_MS, policyVersion: RECOMMENDATION_POLICY_VERSION});
    tx.create(suggestionRef, {placeId: primary.placeId, canonicalPlaceId: outletKey(primary),
      sessionId: context.contextHash, status: "shown", matchScore: primary.matchScore,
      createdAt: Timestamp.fromMillis(now), policyVersion: RECOMMENDATION_POLICY_VERSION});
    return {primary, alternatives: [], sessionId: context.contextHash,
      suggestionId: suggestionRef.id, contextHash: context.contextHash,
      policyVersion: RECOMMENDATION_POLICY_VERSION, source: context.source ?? "makanmana_pool", remainingCount: allowed.length - 1};
  });
}

export async function consumeRecommendationQueue(uid: string, contextHash: string, now = Date.now()): Promise<RecommendationDelivery | null> {
  const snapshot = await db.collection("users").doc(uid).collection("recommendation_queues").doc(contextHash).get();
  const data = snapshot.data();
  if (!data || data.expiresAt <= now || !Array.isArray(data.candidates)) return null;
  const context = data.context as DeliveryContext;
  const fresh = await prepareRecommendationSource(data.candidates, context, now, false);
  return deliverRecommendation(uid, fresh, context, now);
}

/** Shared by Next and submitFeedback. Event receipt + every alias memory update
 * are atomic. Retrying the same feedback cannot increase rejectCount twice. */
export async function recordRecommendationReject(
  uid: string, placeId: string, eventId: string, rawReason?: string,
  now = Date.now(), store: Firestore = db,
): Promise<void> {
  if (!safeId(placeId) || !safeId(eventId)) throw new HttpsError("invalid-argument", "invalid_feedback_identity");
  const alias = await store.collection("place_migration_aliases").doc(placeId).get();
  const canonical = typeof alias.data()?.canonicalPlaceId === "string" ? alias.data()!.canonicalPlaceId as string : placeId;
  const reverse = await store.collection("place_migration_aliases").where("canonicalPlaceId", "==", canonical).limit(2001).get();
  if (reverse.size > 2000) throw new HttpsError("resource-exhausted", "recommendation_aliases_truncated");
  const identities = [...new Set([placeId, canonical, ...reverse.docs.map((d) => d.id)])];
  const user = store.collection("users").doc(uid);
  const receipt = user.collection("recommendation_feedback").doc(key(eventId));
  const refs = identities.map((id) => user.collection("recommendation_memory").doc(key(id)));
  const legacyRefs = identities.map((id) => user.collection("place_reject_memory").doc(id));
  const reason = normalizeRejectReason(rawReason);
  await store.runTransaction(async (tx) => {
    const [existing, snapshots, legacy] = await Promise.all([tx.get(receipt), tx.getAll(...refs), tx.getAll(...legacyRefs)]);
    if (existing.exists) {
      if (existing.data()?.placeId !== placeId) throw new HttpsError("invalid-argument", "feedback_id_mismatch");
      return;
    }
    const previous = mergeOutletMemory([...snapshots, ...legacy].map((s) => (s.data() ?? {}) as OutletMemory));
    const count = (previous.rejectCount ?? 0) + 1;
    const permanent = previous.permanentAvoid === true || reason === "do_not_suggest_again";
    const until = Math.max(now + RECOMMENDATION_COOLDOWN_MS, now + rejectTtlMs(reason, count), previous.suppressedUntil ?? 0, previous.expiresAt ?? 0);
    const record = {...previous, lastRejectedAt: now, rejectedAt: now, rejectCount: count,
      permanentAvoid: permanent, suppressedUntil: until, expiresAt: until};
    for (const ref of refs) tx.set(ref, record, {merge: true});
    identities.forEach((id, i) => tx.set(legacyRefs[i], {...record, placeId: id, canonicalPlaceId: canonical, reason}, {merge: true}));
    tx.create(receipt, {placeId, eventId, reason, createdAt: now});
    tx.create(store.collection("events").doc(key(`${uid}:${eventId}`)), {
      schemaVersion: 1, userId: uid, eventType: "suggestion_reject", placeId,
      source: "backend", deviceType: "backend", timestamp: Timestamp.fromMillis(now),
      isSample: false, metadata: {reason, policyVersion: RECOMMENDATION_POLICY_VERSION},
    });
  });
}
