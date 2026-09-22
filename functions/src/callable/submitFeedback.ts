import {HttpsError, onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";

import {algorithm2FlagActive} from "../config/algorithm2Flags";
import {ADMIN_UIDS} from "../config/constants";
import {db, FieldValue} from "../config/firebase";
import {resolveCohortAuthorization} from "../domain/places/canonical/canonicalReadResolver";
import {isRealPlaceId} from "../domain/places/realPlaceIdentity";
import {writeRejectMemory} from "../services/algorithm2SessionService";
import {logEvent} from "../services/eventService";
import {currentTimeSlot} from "../utils/timeSlot";

type FeedbackAction = "accept" | "reject" | "view_details" | "open_map";

interface PlaceSnapshot {
  name?: string;
  cuisine?: string;
  emoji?: string;
  priceLevel?: number;
  priceEstimate?: string;
  matchScore?: number;
}

interface SubmitFeedbackInput {
  suggestionId?: string;
  placeId?: string;
  sessionId?: string;
  action?: FeedbackAction;
  reason?: string;
  /** Snapshot tempat dari client (untuk tempat Google Places sebenar). */
  place?: PlaceSnapshot;
  // Prompt 7: konteks tambahan (PILIHAN) untuk event AI Brain yang lebih kaya.
  source?: string;
  mood?: string;
  radiusMeters?: number;
  negativeSignals?: string[];
  metadata?: Record<string, unknown>;
}

/** Terima maklum balas pengguna dan kemas kini AI Brain. */
export const submitFeedback = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }
  const input = (request.data ?? {}) as SubmitFeedbackInput;
  const action = input.action;
  if (!action || !["accept", "reject", "view_details", "open_map"].includes(action)) {
    throw new HttpsError("invalid-argument", "action tidak sah.");
  }
  const placeId = input.placeId ?? null;
  // Prompt 8: mod tindakan (spin/preview/nearby) dari metadata client.
  const originMode = (input.metadata?.origin as string | undefined) ?? null;

  // WAVE 4A — tindakan pada tempat BUKAN-SEBENAR (rekaan legasi atau sintetik
  // QA) tidak pernah menjadi isyarat citarasa sebenar: tiada rekod makan, tiada
  // status cadangan, tiada reject-memory, tiada event pembelajaran. Ia diterima
  // dengan jujur supaya klien lama tidak melihat ralat, dan tidak melakukan apa-apa.
  if (!isRealPlaceId(placeId)) {
    logger.info("submitFeedback.nonRealPlaceIgnored", {action, hasSnapshot: Boolean(input.place)});
    return {status: "IGNORED_NON_REAL_PLACE", action};
  }

  // Snapshot client (tempat Google Places sebenar). WAVE 4A: tiada lagi
  // carian nama daripada senarai rekaan pelayan.
  const snapshot = input.place ?? null;
  const place = snapshot ?
    {
      placeId: placeId ?? "",
      name: snapshot.name ?? "Tempat Makan",
      cuisine: snapshot.cuisine ?? "Restoran",
      emoji: snapshot.emoji ?? "🍽️",
      priceLevel: snapshot.priceLevel ?? 1,
      priceEstimate: snapshot.priceEstimate ?? "",
      matchScore: snapshot.matchScore ?? null,
    } :
    null;

  // Kemas kini rekod cadangan.
  if (input.suggestionId) {
    const statusByAction: Record<FeedbackAction, string | null> = {
      accept: "accepted",
      reject: "rejected",
      view_details: null,
      open_map: null,
    };
    const status = statusByAction[action];
    if (status) {
      await db
        .collection("users")
        .doc(uid)
        .collection("suggestions")
        .doc(input.suggestionId)
        .set(
          {
            status,
            ...(input.reason ? {reason: input.reason} : {}),
            ...(input.source ? {source: input.source} : {}),
            ...(input.mood ? {mood: input.mood} : {}),
            ...(input.radiusMeters != null ?
              {radiusMeters: input.radiusMeters} :
              {}),
            updatedAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
    }
  }

  // Kemas kini sesi.
  if (input.sessionId) {
    const sessionRef = db
      .collection("suggestion_sessions")
      .doc(input.sessionId);
    if (action === "accept") {
      await sessionRef.set(
        {
          acceptedPlaceId: placeId,
          finalAction: "accept",
          endedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    } else if (action === "reject" && placeId) {
      await sessionRef.set(
        {rejectedPlaceIds: FieldValue.arrayUnion(placeId)},
        {merge: true},
      );
    }
  }

  // Phase 2.2 — reject-memory 24 jam (kohort + bendera sahaja; awam tidak terjejas).
  if (action === "reject" && placeId) {
    const cohort = resolveCohortAuthorization(
      {uid, token: request.auth?.token as Record<string, unknown> | undefined},
      {ownerAllowlist: ADMIN_UIDS},
    );
    if (algorithm2FlagActive("rejectMemory", cohort.canonicalCohortEligible)) {
      await writeRejectMemory(uid, placeId, Date.now(), {reason: input.reason ?? null});
    }
  }

  // Accept => rekod makan + siaran Feed Makan komuniti.
  if (action === "accept" && place && place.placeId) {
    const mealRef = await db
      .collection("users")
      .doc(uid)
      .collection("meals")
      .add({
        placeId: place.placeId,
        placeNameSnapshot: place.name,
        cuisineTags: [place.cuisine],
        emoji: place.emoji,
        timeSlot: currentTimeSlot(),
        mealTime: new Date().toISOString(),
        source: "suggestion",
        matchScore: place.matchScore,
        priceLevel: place.priceLevel,
        priceEstimate: place.priceEstimate,
        createdAt: FieldValue.serverTimestamp(),
      });

    // Prompt 8: meal_logged dimiliki oleh backend bila backend cipta meal.
    await logEvent({
      userId: uid,
      eventType: "meal_logged",
      placeId: place.placeId,
      placeNameSnapshot: place.name,
      suggestionId: input.suggestionId ?? null,
      sessionId: input.sessionId ?? null,
      mood: input.mood ?? null,
      sourceMode: originMode ?? undefined,
      resultSource: input.source ?? null,
      matchScore: place.matchScore ?? null,
      metadata: {mealId: mealRef.id, source: "suggestion", fromSuggestion: true},
    });

    // PRIVASI (Social 1.1): auto-post feed "makan kat <kedai>" DIBUANG.
    // Ia mendedahkan lokasi/tabiat makan secara awam tanpa persetujuan.
    // Perkongsian ke feed kini HANYA melalui tindakan eksplisit pengguna
    // (createFeedPost / shareToFeed review; check-in ber-visibility akan
    // dibina dalam Social Prompt 4). Meal, event AI Brain dan status
    // suggestion di atas tidak terjejas.
  }

  // Prompt 8: nama event kanonik (snake_case). accept -> suggestion_accept,
  // reject -> suggestion_reject. view_details/open_map kekal (jika dipanggil).
  const canonicalType =
    action === "accept" ?
      "suggestion_accept" :
      action === "reject" ?
        "suggestion_reject" :
        action;

  await logEvent({
    userId: uid,
    eventType: canonicalType,
    placeId,
    placeNameSnapshot: input.place?.name ?? null,
    suggestionId: input.suggestionId ?? null,
    sessionId: input.sessionId ?? null,
    mood: input.mood ?? null,
    sourceMode: originMode ?? undefined,
    resultSource: input.source ?? null,
    radiusMeters: input.radiusMeters ?? null,
    matchScore: input.place?.matchScore ?? null,
    metadata: {
      ...(input.metadata ?? {}),
      ...(input.reason ? {reason: input.reason} : {}),
      ...(input.source ? {source: input.source} : {}),
      ...(input.negativeSignals && input.negativeSignals.length > 0 ?
        {negativeSignals: input.negativeSignals} :
        {}),
    },
  });

  return {status: "OK"};
});
