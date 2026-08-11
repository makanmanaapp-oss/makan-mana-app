import {HttpsError, onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";

import {db, FieldValue} from "../config/firebase";
import {
  BrainEvent, BrainMeal, computeBrain,
} from "../domain/aiBrain/brainCalculator";

/**
 * Phase 2.4 — Kira-semula AI Brain / Food Memory.
 * Pengiraan TULEN dipindahkan ke domain/aiBrain/brainCalculator.ts. Callable ini
 * mengendali I/O + KUNCI per-pengguna + throttle + idempotensi + observability.
 * BrainVersion bertambah SEKALI setiap kiraan berjaya. TIDAK auto-tune berat global.
 */

const EVENT_WINDOW_DAYS = 30;
const MEAL_WINDOW_DAYS = 60;
const THROTTLE_MS = 30_000; // elak kira-semula terlalu kerap (bukan force)
const LOCK_MS = 60_000; // tetingkap kunci recompute selari

function toMs(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof (v as {toMillis?: () => number}).toMillis === "function") {
    return (v as {toMillis: () => number}).toMillis();
  }
  if (typeof v === "string") { const p = Date.parse(v); if (!Number.isNaN(p)) return p; }
  return fallback;
}

export const recalculateUserBrain = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  const force = (request.data as {force?: boolean} | undefined)?.force === true;
  const now = Date.now();
  const brainRef = db.collection("user_brain_profiles").doc(uid);

  // ---- KUNCI + throttle (transaksi) ----
  const gate = await db.runTransaction(async (tx) => {
    const snap = await tx.get(brainRef);
    const d = (snap.data() ?? {}) as Record<string, unknown>;
    const lockUntil = (d.recalcLockUntil as number | undefined) ?? 0;
    const lastCalc = (d.lastCalculatedAtMs as number | undefined) ?? 0;
    if (!force && now - lastCalc < THROTTLE_MS) return {skip: "throttled" as const};
    if (now < lockUntil) return {skip: "locked" as const};
    tx.set(brainRef, {recalcLockUntil: now + LOCK_MS}, {merge: true});
    return {skip: null};
  });
  if (gate.skip) {
    logger.info("recalculateUserBrain.skipped", {reason: gate.skip});
    return {status: "OK", skipped: gate.skip};
  }

  try {
    const [eventsSnap, mealsSnap, profileSnap, brainSnap] = await Promise.all([
      db.collection("events").where("userId", "==", uid).limit(1000).get(),
      db.collection("users").doc(uid).collection("meals").orderBy("mealTime", "desc").limit(150).get(),
      db.collection("user_profiles").doc(uid).get(),
      brainRef.get(),
    ]);
    const profile = (profileSnap.data() ?? {}) as Record<string, unknown>;
    const oldBrain = (brainSnap.data() ?? {}) as Record<string, unknown>;
    const resetBoundaryMs = (oldBrain.resetBoundaryMs as number | undefined) ?? null;

    const events: BrainEvent[] = eventsSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        eventType: d.eventType as string,
        placeId: (d.placeId as string | undefined) ?? null,
        timeSlot: (d.timeSlot as string | undefined) ?? null,
        mood: (d.mood as string | undefined) ?? null,
        timestampMs: toMs(d.timestamp ?? d.clientTimestampMs, now),
        metadata: (d.metadata as Record<string, unknown> | undefined) ?? null,
        isSample: d.isSample === true,
        sourceMode: (d.sourceMode as string | undefined) ?? null,
        resultSource: (d.resultSource as string | undefined) ?? null,
      };
    });
    const meals: BrainMeal[] = mealsSnap.docs.map((doc) => {
      const m = doc.data();
      return {
        cuisine: (m.cuisine as string | undefined) ?? null,
        cuisineTags: (m.cuisineTags as string[] | undefined) ?? null,
        mealTimeMs: toMs(m.mealTime, now),
        source: (m.source as string | undefined) ?? null,
        satisfactionRating: (m.satisfactionRating as number | undefined) ?? null,
        wouldRepeat: (m.wouldRepeat as boolean | undefined) ?? null,
        priceLevel: (m.priceLevel as number | undefined) ?? null,
        placeId: (m.placeId as string | undefined) ?? null,
        tags: (m.tags as string[] | undefined) ?? null,
        healthTags: (m.healthTags as string[] | undefined) ?? null,
      };
    });

    const result = computeBrain({uid, events, meals, profile, oldBrain, now, resetBoundaryMs});

    await brainRef.set({
      ...result.brainDoc,
      lastCalculatedAt: FieldValue.serverTimestamp(),
      lastCalculatedAtMs: now,
      recalcLockUntil: 0, // buka kunci
      eventWindowDays: EVENT_WINDOW_DAYS,
      mealWindowDays: MEAL_WINDOW_DAYS,
    }, {merge: true});

    // Observability (owner-only; TIADA data sensitif mentah).
    logger.info("recalculateUserBrain.done", {
      insufficientData: result.insufficientData,
      ...result.diagnostics,
    });

    return {
      status: "OK",
      insufficientData: result.insufficientData,
      brainVersion: result.diagnostics.newBrainVersion,
      confidence: result.diagnostics.confidenceAfter,
      signals: result.diagnostics.totalRealSignals,
      excludedEvents: result.diagnostics.excludedEvents,
    };
  } catch (e) {
    // Buka kunci walau gagal supaya tidak tersekat.
    await brainRef.set({recalcLockUntil: 0}, {merge: true});
    logger.error("recalculateUserBrain.error", {message: (e as Error).message});
    throw new HttpsError("internal", "Kira-semula brain gagal.");
  }
});
