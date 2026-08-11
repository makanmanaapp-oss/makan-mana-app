import {HttpsError, onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";

import {db, FieldValue} from "../config/firebase";
import {BRAIN_SCHEMA_VERSION, PRIVACY_VERSION} from "../domain/aiBrain/brainCalculator";

/**
 * Phase 2.4 — Reset Food Memory / AI Brain (Part K).
 *
 * Memadam TINGKAH LAKU DIPELAJARI sahaja. Profil pengguna (alahan, halal, diet,
 * bajet, cuisine kegemaran diisytihar) di `user_profiles` TIDAK DISENTUH — jadi
 * keselamatan kekal. Menetapkan sempadan reset supaya kiraan akan datang
 * mengabaikan event sebelum reset. brainVersion bertambah SEKALI. Idempoten
 * mengikut actionId; dihadkan kadar; diaudit.
 */
export const resetUserBrain = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  const data = (request.data ?? {}) as {actionId?: string};
  const actionId = typeof data.actionId === "string" && data.actionId.trim()
    ? data.actionId.trim() : `reset_${Date.now()}`;
  const now = Date.now();
  const brainRef = db.collection("user_brain_profiles").doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(brainRef);
    const old = (snap.data() ?? {}) as Record<string, unknown>;
    const oldVersion = (old.brainVersion as number | undefined) ?? 0;

    // Idempotensi: actionId sama → tiada reset kedua.
    if (old.lastResetActionId === actionId) {
      return {idempotent: true, brainVersion: oldVersion};
    }
    // Had kadar: reset < 30s lalu → tolak lembut (elak spam).
    const lastResetMs = (old.resetAtMs as number | undefined) ?? 0;
    if (now - lastResetMs < 30_000) {
      return {rateLimited: true, brainVersion: oldVersion};
    }

    const newVersion = oldVersion + 1;
    // Brain BERSIH keyakinan-rendah (TIADA data sensitif; profil keselamatan
    // kekal di user_profiles — tidak disentuh di sini).
    tx.set(brainRef, {
      userId: uid,
      schemaVersion: BRAIN_SCHEMA_VERSION,
      brainVersion: newVersion,
      supersededBrainVersion: oldVersion,
      privacyVersion: PRIVACY_VERSION,
      insufficientData: true,
      confidence: {overall: 0, cuisine: 0, distance: 0, budget: 0, timeSlot: 0},
      resetBoundaryMs: now, // kiraan akan datang abaikan event sebelum ini
      resetAt: FieldValue.serverTimestamp(),
      resetAtMs: now,
      lastResetActionId: actionId,
      // Padam tingkah laku dipelajari.
      learnedTopCuisines: {}, learnedAvoidedCuisines: {},
      topCuisines: {}, avoidedCuisines: {},
      preferredPriceLevel: null, preferredDistanceKm: null, preferredTimeSlots: {},
      repeatTolerance: null, explorationLevel: null,
      acceptRate: 0, rejectRate: 0, skipRate: 0,
      commonRejectReasons: {}, skipReasons: {},
      recentAcceptedPlaceIds: [], recentRejectedPlaceIds: [], recentSkippedPlaceIds: [],
      recentCuisineTags: [], recentMoodTags: [],
      sourceEventCount: 0, sourceMealCount: 0,
      recalcLockUntil: 0, lastCalculatedAtMs: 0,
      privacy: {personalizationEnabled: true, excludedSensitiveFields: ["allergies", "gps", "health", "receipt", "tokens"]},
    }, {merge: true});

    // Audit (owner-only koleksi).
    tx.set(brainRef.collection("brain_audit").doc(actionId), {
      type: "reset", at: FieldValue.serverTimestamp(), atMs: now,
      fromBrainVersion: oldVersion, toBrainVersion: newVersion, actionId,
    });
    return {idempotent: false, brainVersion: newVersion};
  });

  logger.info("resetUserBrain.done", {
    idempotent: !!result.idempotent,
    rateLimited: !!(result as {rateLimited?: boolean}).rateLimited,
    brainVersion: result.brainVersion,
  });
  return {
    status: "OK",
    reset: !result.idempotent && !(result as {rateLimited?: boolean}).rateLimited,
    idempotent: !!result.idempotent,
    brainVersion: result.brainVersion,
  };
});
