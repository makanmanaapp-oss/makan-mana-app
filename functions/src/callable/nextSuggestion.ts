/**
 * Algorithm 2 / Phase 2.2D — callable Reject/Next AUTHORITATIF (server queue).
 *
 * Menggantikan pop-alternatif-tempatan klien. Pada Reject/Next: rekod reject
 * (memori 24h), kemudian GUNA alternatif tersimpan seterusnya secara LANGSUNG
 * (TIADA searchNearby / scoreAndRank / panggilan provider). Idempoten mengikut
 * (uid, actionId) — retry mengembalikan tempat yang SAMA; double-tap memajukan
 * baris SEKALI (kunci create()). TIDAK menggunakan kuota spin.
 *
 * Klien TIDAK menghantar shown/rejected/remaining/rotationSeed authoritative —
 * server menyimpannya. Klien hanya menghantar niat + contextHash opaque + actionId.
 *
 * KELAYAKAN (Master pre-launch fix): guna kontrak rollout BERSATU yang SAMA seperti
 * getSuggestions (`resolveAlgorithm2EligibilityForRequest` → `algorithm2LiveEligible`).
 * owner_internal + beta_allowlist + percentage_live LAYAK. Sebelum ini laluan ini
 * tersilap berpagar owner-sahaja (canonicalCohortEligible/isTrustedOwner) → beta
 * jatuh ke legacy_local (defek). Pagar owner-sahaja KEKAL untuk tulisan admin/kanonikal,
 * BUKAN untuk operasi sesi Algorithm 2 peringkat-pengguna ini.
 */
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";

import {algorithm2FlagActive} from "../config/algorithm2Flags";
import {db, FieldValue} from "../config/firebase";
import {applyCanonicalOverlay} from "../services/canonicalReadService";
import {resolveAlgorithm2EligibilityForRequest} from "../services/algorithm2EligibilityService";
import {consumeStoredAlternative, writeRejectMemory} from "../services/algorithm2SessionService";

interface NextInput {
  action?: string; // "reject" | "next"
  sessionId?: string;
  placeId?: string; // current place (for reject)
  contextHash?: string;
  actionId?: string;
  reason?: string;
}

export const nextSuggestion = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  const input = (request.data ?? {}) as NextInput;
  const action = input.action === "reject" ? "reject" : "next";
  const actionId = typeof input.actionId === "string" && input.actionId.trim() ? input.actionId : null;
  const contextHash = typeof input.contextHash === "string" && input.contextHash.trim() ? input.contextHash : null;
  if (!actionId || !contextHash) {
    throw new HttpsError("invalid-argument", "actionId dan contextHash diperlukan.");
  }

  // KELAYAKAN BERSATU — sama seperti getSuggestions (owner + beta + percentage_live).
  const {eligibility} = await resolveAlgorithm2EligibilityForRequest(
    uid, request.auth?.token as Record<string, unknown> | undefined,
  );
  logger.info("nextSuggestion.request", {action, contextHash});
  logger.info("nextSuggestion.eligibility", {
    eligible: eligibility.eligible, mode: eligibility.mode, cohortId: eligibility.cohortId,
    emergencyLegacy: eligibility.emergencyLegacy, reasonCode: eligibility.reasonCode,
  });

  if (!algorithm2FlagActive("alternativeReuse", eligibility.eligible)) {
    // Bukan kohort LIVE / bendera OFF / kecemasan → laluan legasi tempatan (offline-safe).
    logger.info("nextSuggestion.legacyExpected", {
      cohortId: eligibility.cohortId, mode: eligibility.mode, reasonCode: eligibility.reasonCode,
    });
    return {
      actionAccepted: false,
      responseSource: "legacy_local",
      reasonCode: eligibility.reasonCode,
      nextPlace: null,
    };
  }

  const now = Date.now();
  const flags = {
    sessionSuppression: true,
    rejectMemory: algorithm2FlagActive("rejectMemory", eligibility.eligible),
    sessionRotation: algorithm2FlagActive("sessionRotation", eligibility.eligible),
  };

  // Idempotensi + kunci double-tap: create() bertindak sebagai kunci.
  const actionRef = db.collection("users").doc(uid).collection("algo2_actions").doc(actionId);
  try {
    await actionRef.create({actionId, action, status: "processing", createdAt: now});
  } catch {
    // Loser (retry / double-tap): kembalikan hasil pemenang jika sedia.
    const snap = await actionRef.get();
    const d = snap.data() ?? {};
    if (d.result) {
      logger.info("nextSuggestion.idempotentReplay", {actionId, contextHash, replayed: true});
      return d.result;
    }
    logger.info("nextSuggestion.idempotentPending", {actionId, contextHash});
    return {actionId, actionAccepted: true, responseSource: "idempotent_pending", nextPlace: null};
  }

  // Pemenang: rekod reject (memori 24h + sesi) SEBELUM memilih calon seterusnya.
  if (action === "reject" && input.placeId) {
    if (flags.rejectMemory) await writeRejectMemory(uid, input.placeId, now, {reason: input.reason ?? null});
    if (input.sessionId) {
      await db.collection("suggestion_sessions").doc(input.sessionId)
        .set({rejectedPlaceIds: FieldValue.arrayUnion(input.placeId)}, {merge: true});
    }
    // Tandakan juga dalam sesi algo2 (supaya buildExcludeIds menindasnya).
    await db.collection("users").doc(uid).collection("algo2_sessions").doc(contextHash)
      .set({rejectedPlaceIds: FieldValue.arrayUnion(input.placeId)}, {merge: true});
    logger.info("nextSuggestion.suppressionWritten", {
      cohortId: eligibility.cohortId, rejectMemory: flags.rejectMemory, hasSessionId: !!input.sessionId,
    });
  }

  const consumed = await consumeStoredAlternative(uid, contextHash, now, flags);
  let nextPlace = consumed?.candidate ?? null;
  if (nextPlace) {
    const ov = await applyCanonicalOverlay([nextPlace], {cohortEligible: true, forceLegacy: false, includeDebug: true});
    nextPlace = ov.results[0].candidate;
  }

  const result = {
    actionId,
    actionAccepted: true,
    nextPlace,
    responseSource: consumed ? consumed.diagnostics.responseSource : "alternatives_exhausted",
    reasonCode: consumed ? "authoritative" : "alternatives_exhausted",
    providerQueryCount: consumed ? consumed.diagnostics.providerQueryCount : 0,
    rankingExecuted: consumed ? consumed.diagnostics.rankingExecuted : false,
    alternativesRemaining: consumed ? consumed.diagnostics.alternativesAfter : 0,
    sessionStatus: "active",
    poolExhausted: !consumed,
  };
  await actionRef.set({status: "done", result, doneAt: now}, {merge: true});
  // Observability (Phase 2.2D + Master fix) — jejak authoritative Reject/Next untuk
  // bukti peranti sebenar. TIADA data peribadi penuh: hanya diagnostik queue + hash.
  if (consumed) {
    logger.info("nextSuggestion.authoritative", {
      action, actionId, contextHash,
      cohortId: eligibility.cohortId,
      responseSource: result.responseSource,
      providerQueryCount: result.providerQueryCount,
      nearbySearchCalled: false,
      rankingExecuted: result.rankingExecuted,
      alternativesRemaining: result.alternativesRemaining,
      poolExhausted: result.poolExhausted,
      hasNextPlace: !!nextPlace,
      dummy: false,
      legacyLocal: false,
    });
  } else {
    logger.info("nextSuggestion.exhausted", {
      action, actionId, contextHash, cohortId: eligibility.cohortId, alternativesRemaining: 0,
    });
  }
  return result;
});
