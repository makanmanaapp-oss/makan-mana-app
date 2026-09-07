/**
 * WAVE 4 — Commercial Tools: merchant promotion write plane.
 *
 * Every write reuses the Wave 3 merchant primitives unchanged rather than
 * inventing a second authority:
 *
 *  - `readPublishedRestaurantProfileV2` resolves an alias to the canonical
 *    identity FIRST, so a merchant cannot address a restaurant by a stale id;
 *  - `authorizeMerchantPlace` decides membership+role against the resolved id,
 *    fail-closed, and echoes back the id it actually authorized — which is the
 *    only id we then write, so "change the id in the payload" cannot reach
 *    another restaurant's promotions;
 *  - the acting merchant uid stays in the server event, never in the document's
 *    public surface.
 *
 * Firestore rules keep `restaurant_promotions` server-write-only, so these
 * callables are the whole write surface.
 */
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {
  MERCHANT_BRIDGE_SECRET,
  MERCHANT_ENFORCE_APP_CHECK,
  authorizeMerchantPlace,
  merchantClientRequestId,
} from "../services/merchantBridge";
import {readPublishedRestaurantProfileV2} from "../services/restaurantProfileV2ReadService";
import {normalizeCanonicalPlaceId} from "../domain/restaurantEngagement/identity";
import {
  PROMOTION_COLLECTION,
  PROMOTION_STATUS_ARCHIVED,
  PROMOTION_STATUS_DRAFT,
  PROMOTION_STATUS_EXPIRED,
  isPromotionStatus,
  type PromotionStatus,
} from "../domain/promotions/promotionTypes";
import {
  decidePromotionTransition,
  effectivePromotionStatus,
  validateDescription,
  validateEligibility,
  validateMinSpend,
  validateOfferLabel,
  validateOfferType,
  validateTerms,
  validateTitle,
  validateWindow,
} from "../domain/promotions/promotionLifecycle";
import {
  buildPromotionDocument,
  toMerchantPromotion,
} from "../domain/promotions/promotionDocument";

const MAX_PROMOTIONS_PER_PLACE = 50;

function input(request: {data?: unknown}): Record<string, unknown> {
  return (request.data ?? {}) as Record<string, unknown>;
}

function requireUid(request: {auth?: {uid?: string}}): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "unauthenticated");
  return uid;
}

function requirePromotionId(value: unknown): string {
  if (typeof value !== "string") throw new HttpsError("invalid-argument", "promotion_id_required");
  const clean = value.trim();
  if (!clean || clean.length > 200 || clean.includes("/")) {
    throw new HttpsError("invalid-argument", "promotion_id_invalid");
  }
  return clean;
}

/**
 * Resolve + authorize in one step.
 *
 * Returns the AUTHORIZED canonical id and display name. Callers must use the
 * returned id and never the caller-supplied one.
 */
async function authorizeForPlace(uid: string, rawPlaceId: unknown, requestId: string) {
  const requested = normalizeCanonicalPlaceId(rawPlaceId);
  if (!requested) throw new HttpsError("invalid-argument", "canonical_place_id_required");

  const profile = await readPublishedRestaurantProfileV2(requested);
  if (!profile) throw new HttpsError("not-found", "restaurant_not_published");

  const auth = await authorizeMerchantPlace(uid, profile.canonicalPlaceId, requestId);
  if (!auth.authorized) {
    throw new HttpsError("permission-denied", "merchant_place_access_required");
  }
  return {canonicalPlaceId: auth.canonicalPlaceId, displayName: profile.name};
}

/** Load a promotion and prove it belongs to a place the caller may act for. */
async function loadOwnedPromotion(uid: string, promotionId: string, requestId: string) {
  const ref = db.collection(PROMOTION_COLLECTION).doc(promotionId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "promotion_not_found");
  const data = snap.data() ?? {};

  // Authorize against the promotion's OWN canonical id, not anything the
  // caller sent: this is what stops cross-restaurant edits by id swapping.
  const owner = typeof data.canonicalPlaceId === "string" ? data.canonicalPlaceId : "";
  if (!owner) throw new HttpsError("failed-precondition", "promotion_identity_invalid");

  const auth = await authorizeMerchantPlace(uid, owner, requestId);
  if (!auth.authorized) {
    throw new HttpsError("permission-denied", "merchant_place_access_required");
  }
  return {ref, data, canonicalPlaceId: owner};
}

// ── READ ───────────────────────────────────────────────────────────────────

export const listMerchantPromotions = onCall(
  {secrets: [MERCHANT_BRIDGE_SECRET], enforceAppCheck: MERCHANT_ENFORCE_APP_CHECK, maxInstances: 5},
  async (request) => {
    const uid = requireUid(request);
    const data = input(request);
    const requestId = merchantClientRequestId(data.requestId);
    const place = await authorizeForPlace(uid, data.canonicalPlaceId, requestId);

    const snap = await db.collection(PROMOTION_COLLECTION)
      .where("canonicalPlaceId", "==", place.canonicalPlaceId)
      .orderBy("startsAtMs", "desc")
      .limit(MAX_PROMOTIONS_PER_PLACE)
      .get();

    const now = Date.now();
    const promotions = snap.docs
      .map((doc) => toMerchantPromotion(doc.id, doc.data(), now))
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return {ok: true, canonicalPlaceId: place.canonicalPlaceId, promotions};
  },
);

// ── CREATE ─────────────────────────────────────────────────────────────────

export const createPromotion = onCall(
  {secrets: [MERCHANT_BRIDGE_SECRET], enforceAppCheck: MERCHANT_ENFORCE_APP_CHECK, maxInstances: 5},
  async (request) => {
    const uid = requireUid(request);
    const data = input(request);
    const requestId = merchantClientRequestId(data.requestId);
    const place = await authorizeForPlace(uid, data.canonicalPlaceId, requestId);

    const now = Date.now();
    const title = validateTitle(data.title);
    if (!title.ok) throw new HttpsError("invalid-argument", title.error);
    const description = validateDescription(data.description);
    if (!description.ok) throw new HttpsError("invalid-argument", description.error);
    const terms = validateTerms(data.terms);
    if (!terms.ok) throw new HttpsError("invalid-argument", terms.error);
    const offerType = validateOfferType(data.offerType);
    if (!offerType.ok) throw new HttpsError("invalid-argument", offerType.error);
    const offerLabel = validateOfferLabel(data.offerLabel);
    if (!offerLabel.ok) throw new HttpsError("invalid-argument", offerLabel.error);
    const minSpend = validateMinSpend(data.minSpendSen);
    if (!minSpend.ok) throw new HttpsError("invalid-argument", minSpend.error);
    const eligibility = validateEligibility(data.eligibility);
    if (!eligibility.ok) throw new HttpsError("invalid-argument", eligibility.error);
    const window = validateWindow(data.startsAt, data.endsAt, now);
    if (!window.ok || !window.value) throw new HttpsError("invalid-argument", window.error);

    // A new promotion is born draft or scheduled; going live is a separate,
    // audited transition so "created" and "published" are never the same act.
    const requested = data.status;
    let status: PromotionStatus = PROMOTION_STATUS_DRAFT;
    if (requested !== undefined) {
      if (!isPromotionStatus(requested) ||
          (requested !== PROMOTION_STATUS_DRAFT && requested !== "scheduled")) {
        throw new HttpsError("invalid-argument", "status_not_settable_on_create");
      }
      status = requested;
    }

    const ref = await db.collection(PROMOTION_COLLECTION).add({
      ...buildPromotionDocument({
        canonicalPlaceId: place.canonicalPlaceId,
        restaurantDisplayName: place.displayName,
        title: title.value!,
        description: description.value!,
        terms: terms.value!,
        offerType: offerType.value!,
        offerLabel: offerLabel.value!,
        minSpendSen: minSpend.value,
        eligibility: eligibility.value!,
        startsAtMs: window.value.startsAtMs,
        endsAtMs: window.value.endsAtMs,
        status,
        actorUid: uid,
        requestId,
      }),
      createdAtMs: now,
      updatedAtMs: now,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await logEvent({
      userId: uid,
      eventType: "merchant_promotion_created",
      placeId: place.canonicalPlaceId,
      metadata: {promotionId: ref.id, status, requestId},
    });

    return {ok: true, promotionId: ref.id, status};
  },
);

// ── UPDATE ─────────────────────────────────────────────────────────────────

export const updatePromotion = onCall(
  {secrets: [MERCHANT_BRIDGE_SECRET], enforceAppCheck: MERCHANT_ENFORCE_APP_CHECK, maxInstances: 5},
  async (request) => {
    const uid = requireUid(request);
    const data = input(request);
    const requestId = merchantClientRequestId(data.requestId);
    const promotionId = requirePromotionId(data.promotionId);
    const owned = await loadOwnedPromotion(uid, promotionId, requestId);

    const now = Date.now();
    const stored = (typeof owned.data.status === "string" ? owned.data.status : PROMOTION_STATUS_DRAFT) as PromotionStatus;
    const startsAtMs = typeof owned.data.startsAtMs === "number" ? owned.data.startsAtMs : null;
    const endsAtMs = typeof owned.data.endsAtMs === "number" ? owned.data.endsAtMs : null;
    const current = effectivePromotionStatus(stored, startsAtMs, endsAtMs, now);

    // Content is only editable while the offer has not run its course. Editing
    // an expired or archived record would rewrite what users were actually
    // shown, which the audit trail exists to prevent.
    if (current === PROMOTION_STATUS_EXPIRED || current === PROMOTION_STATUS_ARCHIVED) {
      throw new HttpsError("failed-precondition", `promotion_not_editable_${current}`);
    }

    const patch: Record<string, unknown> = {};

    if (data.title !== undefined) {
      const v = validateTitle(data.title);
      if (!v.ok) throw new HttpsError("invalid-argument", v.error);
      patch.title = v.value;
    }
    if (data.description !== undefined) {
      const v = validateDescription(data.description);
      if (!v.ok) throw new HttpsError("invalid-argument", v.error);
      patch.description = v.value;
    }
    if (data.terms !== undefined) {
      const v = validateTerms(data.terms);
      if (!v.ok) throw new HttpsError("invalid-argument", v.error);
      patch.terms = v.value;
    }
    if (data.offerType !== undefined) {
      const v = validateOfferType(data.offerType);
      if (!v.ok) throw new HttpsError("invalid-argument", v.error);
      patch.offerType = v.value;
    }
    if (data.offerLabel !== undefined) {
      const v = validateOfferLabel(data.offerLabel);
      if (!v.ok) throw new HttpsError("invalid-argument", v.error);
      patch.offerLabel = v.value;
    }
    if (data.minSpendSen !== undefined) {
      const v = validateMinSpend(data.minSpendSen);
      if (!v.ok) throw new HttpsError("invalid-argument", v.error);
      patch.minSpendSen = v.value;
    }
    if (data.eligibility !== undefined) {
      const v = validateEligibility(data.eligibility);
      if (!v.ok) throw new HttpsError("invalid-argument", v.error);
      patch.eligibility = {audience: v.value!.audience, plans: v.value!.plans};
    }
    if (data.startsAt !== undefined || data.endsAt !== undefined) {
      const v = validateWindow(
        data.startsAt ?? startsAtMs,
        data.endsAt ?? endsAtMs,
        now,
      );
      if (!v.ok || !v.value) throw new HttpsError("invalid-argument", v.error);
      patch.startsAtMs = v.value.startsAtMs;
      patch.endsAtMs = v.value.endsAtMs;
    }

    if (Object.keys(patch).length === 0) {
      throw new HttpsError("invalid-argument", "nothing_to_update");
    }

    patch.updatedByUid = uid;
    patch.updatedByRequestId = requestId;
    patch.updatedAtMs = now;
    patch.updatedAt = FieldValue.serverTimestamp();

    await owned.ref.set(patch, {merge: true});

    await logEvent({
      userId: uid,
      eventType: "merchant_promotion_updated",
      placeId: owned.canonicalPlaceId,
      metadata: {promotionId, fields: Object.keys(patch), requestId},
    });

    return {ok: true, promotionId};
  },
);

// ── STATUS ─────────────────────────────────────────────────────────────────

export const setPromotionStatus = onCall(
  {secrets: [MERCHANT_BRIDGE_SECRET], enforceAppCheck: MERCHANT_ENFORCE_APP_CHECK, maxInstances: 5},
  async (request) => {
    const uid = requireUid(request);
    const data = input(request);
    const requestId = merchantClientRequestId(data.requestId);
    const promotionId = requirePromotionId(data.promotionId);
    const requested = data.status;
    if (!isPromotionStatus(requested)) {
      throw new HttpsError("invalid-argument", "status_invalid");
    }

    const owned = await loadOwnedPromotion(uid, promotionId, requestId);
    const now = Date.now();
    const stored = (typeof owned.data.status === "string" ? owned.data.status : PROMOTION_STATUS_DRAFT) as PromotionStatus;
    const startsAtMs = typeof owned.data.startsAtMs === "number" ? owned.data.startsAtMs : null;
    const endsAtMs = typeof owned.data.endsAtMs === "number" ? owned.data.endsAtMs : null;

    const decision = decidePromotionTransition({
      stored, startsAtMs, endsAtMs, requested, nowMs: now,
    });
    if (!decision.ok || !decision.next) {
      throw new HttpsError("failed-precondition", decision.reason);
    }

    const patch: Record<string, unknown> = {
      status: decision.next,
      updatedByUid: uid,
      updatedByRequestId: requestId,
      updatedAtMs: now,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (decision.next === "active" && owned.data.publishedAtMs == null) {
      patch.publishedAtMs = now;
    }
    if (decision.next === PROMOTION_STATUS_ARCHIVED) {
      patch.archivedAtMs = now;
    }

    await owned.ref.set(patch, {merge: true});

    await logEvent({
      userId: uid,
      eventType: "merchant_promotion_status_changed",
      placeId: owned.canonicalPlaceId,
      metadata: {promotionId, from: stored, to: decision.next, requestId},
    });

    return {ok: true, promotionId, status: decision.next};
  },
);
