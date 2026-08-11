import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";

import {algorithm2FlagActive, scoringSubFlags, unifiedScoringActive} from "../config/algorithm2Flags";
import {buildRecCtxFromHydration} from "../services/recommendationContextBuilder";
import {maskForLog} from "../domain/algorithm2/recommendationContext";
import {resolveRolloutForRequest} from "../services/rolloutService";
import {algorithm2LiveEligible as isAlgorithm2LiveEligible} from "../domain/rollout/liveEligibility";
import {ADMIN_UIDS} from "../config/constants";
import {db, FieldValue} from "../config/firebase";
import {DUMMY_PLACES} from "../data/dummyPlaces";
import {computeContextHash, computeSafetyKey} from "../domain/algorithm2/sessionEngine";
import {resolveCohortAuthorization} from "../domain/places/canonical/canonicalReadResolver";
import {applyCanonicalOverlay} from "../services/canonicalReadService";
import {consumeStoredAlternative, rankWithAlgorithm2} from "../services/algorithm2SessionService";
import {getExpandedPool} from "../services/expandedPoolService";
import {logEvent} from "../services/eventService";
import {searchNearby} from "../services/placesService";
import {ScoringContext, scoreAndRank} from "../services/scoringService";
import {runAlgorithm2ShadowComparison, permissionsForMode} from "../domain/algorithm2/shadowComparison";
import {
  incrementPaywallShown,
  reserveSpin,
  spinLimitForPlan,
} from "../services/usageService";
import {PlaceCandidate} from "../types/place";
import {currentTimeSlot} from "../utils/timeSlot";

const mapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");

// Lalai: pusat Kuala Lumpur (jika lokasi peranti tidak diberikan).
const DEFAULT_LAT = 3.1478;
const DEFAULT_LNG = 101.6953;
const DEFAULT_RADIUS_M = 3000;

// Master pre-launch fix — saiz kolam sesi AUTHORITATIF maksimum yang selamat.
// Kolam diperluas menyediakan hingga ~40 calon unik; kita simpan sehingga 30
// (primary + 29 alternatif) — jauh melebihi had lama 8. 30 × ~2KB ≈ 60KB,
// SELAMAT di bawah had dokumen Firestore 1MB & respons callable. Ini memisahkan
// saiz kolam sesi daripada prefetch UI (kad pertama tetap pantas).
const SESSION_POOL_MAX = 30;

/**
 * 16.1 blocker fix: user_brain_profiles menyimpan topCuisines /
 * avoidedCuisines / commonRejectReasons sebagai MAP {nama: kiraan}
 * (Prompt 9). Kod lama anggap array -> ".map is not a function" ->
 * fungsi crash & klien jatuh ke fallback tempatan. Normalkan kedua-dua
 * bentuk kepada senarai kunci diisih kiraan menurun (sama seperti klien).
 */
function keysByValueDesc(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .sort((a, b) => ((b[1] as number) ?? 0) - ((a[1] as number) ?? 0))
      .map(([k]) => k);
  }
  return [];
}

interface GetSuggestionsInput {
  lat?: number;
  lng?: number;
  radius?: number;
  radiusMeters?: number;
  mood?: string;
  selectedMood?: string;
  languageCode?: string;
  /** spin = kira had & tulis sesi; preview = pratonton Home (tiada had). */
  mode?: string;
  /** Phase 1.14G — override kecemasan: paksa legasi (hanya turun, tidak naik). */
  forceLegacy?: boolean;
}

/**
 * Spin utama MakanMana (Milestone 4):
 * Google Places API (New) + cache + skor pemberat penuh.
 * Fallback ke senarai dummy jika API key tiada / API gagal.
 */
export const getSuggestions = onCall(
  {secrets: [mapsApiKey]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
    }
    const input = (request.data ?? {}) as GetSuggestionsInput;
    // Prompt 6: mode preview (Home) tidak mengira/menghadkan spin.
    const mode = input.mode === "preview" ? "preview" : "spin";
    const mood = input.selectedMood ?? input.mood ?? null;
    const languageCode = input.languageCode ?? "ms";
    const hasClientCoords = typeof input.lat === "number" && typeof input.lng === "number";
    const lat = input.lat ?? DEFAULT_LAT;
    const lng = input.lng ?? DEFAULT_LNG;
    const radiusM = input.radiusMeters ?? input.radius ?? DEFAULT_RADIUS_M;
    // LOCATION CONSISTENCY — echo lokasi yang PELAYAN guna (silang-sah dgn
    // Home/Explore) + telemetri bila klien tak hantar koordinat (fallback KL).
    const requestLocation = {
      latGrid: Number(lat.toFixed(3)),
      lngGrid: Number(lng.toFixed(3)),
      radiusM,
      hasClientCoords,
      usedDefaultKL: !hasClientCoords,
    };
    if (!hasClientCoords) {
      logger.warn("getSuggestions.noClientCoords", {mode: input.mode ?? "spin", radiusM});
    }

    // Pelan dari users/{uid}; JANGAN percaya pelan dari client.
    const userSnap = await db.collection("users").doc(uid).get();
    const plan = (userSnap.data()?.plan as string | undefined) ?? "free";

    // Phase 2.4 — versi brain dibaca AWAL supaya contextHash (sesi) berubah bila
    // brain berubah → sesi BAHARU guna brain terkini; sesi aktif lama kekal.
    // Master Mood/Diet/Fit fix — profil + fitness juga dibaca AWAL supaya
    // safetyKey (allergy/halal/diet/fitGoal/sport/training) masuk contextHash.
    // Perubahan mana-mana isyarat keselamatan → contextHash BAHARU → sesi di-rank
    // semula (penapis keras terkini) → tiada calon LAMA bercanggah disajikan.
    const [brainVersionSnap, profileSnapEarly, fitnessSnapEarly] = await Promise.all([
      db.collection("user_brain_profiles").doc(uid).get(),
      db.collection("user_profiles").doc(uid).get(),
      db.collection("fitness_profiles").doc(uid).get(),
    ]);
    const brainVersion = (brainVersionSnap.data()?.brainVersion as number | undefined) ?? 0;
    const profileEarly = profileSnapEarly.data() ?? {};
    const fitnessEarly = fitnessSnapEarly.data() ?? {};
    const safetyKey = computeSafetyKey({
      allergies: profileEarly.allergies as string[] | undefined,
      halalPreference: profileEarly.halalPreference as boolean | undefined,
      dietTypes: profileEarly.dietTypes as string[] | undefined,
      dietType: profileEarly.dietType as string | undefined,
      fitGoal: fitnessEarly.mainGoal as string | undefined,
      sportMood: (fitnessEarly.sportMood as string | undefined) ?? (profileEarly.sportMood as string | undefined),
      trainingDay: fitnessEarly.trainingDay as boolean | undefined,
    });

    const base = {userId: uid, mood, languageCode, plan};

    // QUOTA-01: had spin harian — HANYA mod spin (pelayan = penguat kuasa).
    // Tempahan atomik (transaction) SEBELUM kerja: kalis race/double-tap,
    // tiada panggilan Places, tiada sesi, tiada suggestion_shown bila blok.
    // Mod preview (Home AI Pick / preview mood terkunci) TIDAK dikira.
    let spinUsedNow = 0;
    let spinLimitNow = spinLimitForPlan(plan);
    if (mode === "spin") {
      await logEvent({...base, eventType: "spin_started"});
      const reserved = await reserveSpin(uid, plan);
      spinUsedNow = reserved.spinUsed;
      spinLimitNow = reserved.spinLimit;
      if (!reserved.allowed) {
        await logEvent({
          ...base,
          eventType: "paywall_viewed",
          metadata: {
            trigger: "spin_limit",
            featureId: "unlimited_spin",
            requiredPlan: "plus",
          },
        });
        await incrementPaywallShown(uid);
        return {
          status: "PAYWALL_REQUIRED",
          requiredPlan: "plus",
          featureId: "unlimited_spin",
          currentUsage: reserved.spinUsed,
          limit: reserved.spinLimit,
          spinUsed: reserved.spinUsed,
          spinLimit: reserved.spinLimit,
        };
      }
    }

    // Phase 2.6B — kohort + keputusan rollout AUTHORITATIF dikira AWAL supaya SEMUA
    // modul Algorithm 2 (expanded pool, early alt-reuse, scoring, overlay) guna
    // kelayakan LIVE yang SAMA (owner_internal + beta_allowlist + percentage_live).
    // Diagnostik & debug kekal owner-only (rollout.diagnosticsAllowed).
    const cohort = resolveCohortAuthorization(
      {uid, token: request.auth?.token as Record<string, unknown> | undefined},
      {ownerAllowlist: ADMIN_UIDS},
    );
    const {decision: rollout} = await resolveRolloutForRequest(
      uid, request.auth?.token as Record<string, unknown> | undefined,
    );
    // Kelayakan LIVE tunggal & server-authoritative. BUKAN shadow, BUKAN kecemasan,
    // BUKAN legasi. Klien TIDAK boleh mempengaruhi (isOwner/keahlian dari server).
    const algorithm2LiveEligible = isAlgorithm2LiveEligible(rollout);
    const eligible = algorithm2LiveEligible;
    // Phase 2.5 — telemetri kohort per-permintaan (privasi-selamat). cohortId anon.
    logger.info("getSuggestions.rollout", {
      mode: rollout.mode, cohortId: rollout.cohortId, enabled: eligible,
      emergencyLegacy: rollout.emergencyLegacy, rolloutVersion: rollout.rolloutVersion,
    });

    // Phase 2.2A/2.6B — TRUE alternative queue: pulangkan alternatif tersimpan
    // LANGSUNG (TIADA searchNearby / scoreAndRank / panggilan provider) bila
    // sesi aktif masih ada alternatif sah. Guna kelayakan LIVE (owner + beta).
    {
      if (input.forceLegacy !== true &&
          algorithm2FlagActive("alternativeReuse", algorithm2LiveEligible) &&
          algorithm2FlagActive("sessionSuppression", algorithm2LiveEligible)) {
        const ctxHashEarly = computeContextHash({
          uid, lat, lng, radiusMeters: radiusM, mood, timeSegment: currentTimeSlot(), plan, brainVersion, safetyKey,
        });
        const consumed = await consumeStoredAlternative(uid, ctxHashEarly, Date.now(), {
          sessionSuppression: true,
          rejectMemory: algorithm2FlagActive("rejectMemory", algorithm2LiveEligible),
          sessionRotation: algorithm2FlagActive("sessionRotation", algorithm2LiveEligible),
        });
        if (consumed) {
          const ovC = await applyCanonicalOverlay([consumed.candidate], {
            cohortEligible: true, forceLegacy: false, includeDebug: rollout.diagnosticsAllowed,
          });
          const primaryOut = ovC.results[0].candidate;
          return {
            status: "OK",
            mode,
            source: "google_places",
            selectedMood: mood,
            radiusMeters: radiusM,
            primary: primaryOut,
            alternatives: [],
            candidates: [primaryOut],
            ...(mode === "spin" ? {spinUsed: spinUsedNow, spinLimit: spinLimitNow} : {}),
            algorithmVersion: "algo2_session_alternative",
            canonicalDiagnostics: {
              cohort: cohort.maskedIdentity,
              algorithm2: consumed.diagnostics,
              // Phase 2.2D FIX — laluan reuse-awal MESTI pulangkan contextHash
              // (opaque) supaya klien boleh guna Reject/Next AUTHORITATIF. Tanpa
              // ini, spin ke-2+ (yang consume alternatif tersimpan) hantar
              // contextHash NULL → klien jatuh ke alternatif tempatan (defek).
              contextHash: ctxHashEarly,
              requestLocation,
            },
          };
        }
      }
    }

    // Konteks skor: profil + sejarah makan + food memory + fit + wallet (hidrat
    // server). Part E — wallet DIBACA DARI REKOD PELAYAN DIPERCAYAI sahaja
    // (users/{uid}/meal_wallet/current); TIDAK PERNAH dari payload klien.
    // Master fix — guna semula snap AWAL (profile/fitness/brain) untuk elak baca
    // berganda; hanya meals + wallet perlu dibaca di sini.
    const [mealsSnap, walletSnap] =
      await Promise.all([
        db
          .collection("users")
          .doc(uid)
          .collection("meals")
          .orderBy("mealTime", "desc")
          .limit(5)
          .get(),
        db.collection("users").doc(uid).collection("meal_wallet").doc("current").get(),
      ]);
    const profile = profileEarly;
    const brain = brainVersionSnap.data() ?? {};
    const fitness = fitnessEarly;
    const wallet = walletSnap.exists ? (walletSnap.data() ?? {}) : {};
    const lastCuisines: string[] = [];
    const recentPlaceIds: string[] = [];
    for (const doc of mealsSnap.docs) {
      const d = doc.data();
      recentPlaceIds.push((d.placeId as string) ?? "");
      const singular = d.cuisine as string | undefined;
      if (singular) lastCuisines.push(singular);
      for (const c of (d.cuisineTags as string[] | undefined) ?? []) {
        lastCuisines.push(c);
      }
    }

    // Calon: Google Places (cache-first) atau dummy fallback.
    let candidatesSource: PlaceCandidate[];
    let algorithmVersion: string;
    const apiKey = mapsApiKey.value();
    // Phase 2.2A/2.6B — pool DIPERLUAS untuk kohort LIVE (owner + beta) — cache-first,
    // ≤3 kueri. Guna kelayakan rollout server-authoritative (bukan owner-only).
    const useExpandedPool = input.forceLegacy !== true &&
      algorithm2FlagActive("expandedPool", algorithm2LiveEligible);
    if (apiKey) {
      try {
        if (useExpandedPool) {
          const pool = await getExpandedPool({
            lat, lng, radiusMeters: radiusM, languageCode, apiKey, now: Date.now(),
          });
          candidatesSource = pool.candidates.length > 0 ? pool.candidates : await searchNearby({lat, lng, radiusMeters: radiusM, languageCode, apiKey});
        } else {
          candidatesSource = await searchNearby({
            lat,
            lng,
            radiusMeters: radiusM,
            languageCode,
            apiKey,
          });
        }
        algorithmVersion = "places_v1";
        if (candidatesSource.length === 0) {
          candidatesSource = DUMMY_PLACES;
          algorithmVersion = "dummy_server_v1";
        }
      } catch (e) {
        console.error("Places API gagal, guna dummy:", e);
        candidatesSource = DUMMY_PLACES;
        algorithmVersion = "dummy_server_v1";
      }
    } else {
      candidatesSource = DUMMY_PLACES;
      algorithmVersion = "dummy_server_v1";
    }

    const ctx: ScoringContext = {
      budgetMax: (profile.budgetMax as number | undefined) ?? null,
      favoriteCuisines:
        (profile.favoriteCuisines as string[] | undefined) ??
        (profile.favouriteCuisines as string[] | undefined) ??
        [],
      lastCuisines,
      recentPlaceIds,
      mood,
      radiusKm: radiusM / 1000,
      // Diet Goal (Pro): pengaruh berterusan pada semua cadangan.
      dietGoal: plan === "pro" ?
        ((profile.dietGoal as string | undefined) ?? null) :
        null,
      // Prompt 6: isyarat keselamatan + peribadi (dihidrat dari Firestore).
      allergies: (profile.allergies as string[] | undefined) ?? [],
      dietType: (profile.dietType as string | undefined) ?? null,
      halalPreference:
        (profile.halalPreference as boolean | undefined) ?? false,
      spicyPreference: (profile.spicyPreference as number | undefined) ?? null,
      topCuisines: keysByValueDesc(brain.topCuisines),
      avoidedCuisines: keysByValueDesc(brain.avoidedCuisines),
      commonRejectReasons: keysByValueDesc(brain.commonRejectReasons),
      fitGoal: (fitness.mainGoal as string | undefined) ?? null,
    };
    const forceLegacy = input.forceLegacy === true;
    const algo2 = {
      sessionSuppression: algorithm2FlagActive("sessionSuppression", eligible),
      rejectMemory: algorithm2FlagActive("rejectMemory", eligible),
      sessionRotation: algorithm2FlagActive("sessionRotation", eligible),
    };
    // Master pre-launch fix — kolam sesi AUTHORITATIF BESAR (bukan lagi terhad 8).
    // Simpan sebanyak calon sebenar yang selamat (dari kolam diperluas ~40) supaya
    // Reject boleh melangkah jauh melebihi 8 tanpa carian provider baharu. Terbatas
    // oleh SESSION_POOL_MAX (had saiz dokumen Firestore + respons callable). Legasi
    // kekal 5 (tidak berubah). UI prefetch = subset; kolam sesi = penuh.
    const storeCount = algo2.sessionSuppression && !forceLegacy ? SESSION_POOL_MAX : 5;
    // Phase 2.2D — contextHash dikira sekali; dipulangkan (opaque) supaya klien
    // boleh menghantarnya semula pada Reject/Next (nextSuggestion authoritative).
    const contextHash = computeContextHash({
      uid, lat, lng, radiusMeters: radiusM, mood, timeSegment: currentTimeSlot(), plan, brainVersion, safetyKey,
    });

    // Phase 2.3 — konteks pengesyoran ternormal (Home AI Pick + Spin sama) +
    // bendera pemarkahan bersatu (owner cohort ON, awam OFF).
    const localHour = (new Date().getUTCHours() + 8) % 24; // MYT
    const recCtx = buildRecCtxFromHydration({
      uid, plan, language: languageCode, lat: input.lat ?? null, lng: input.lng ?? null,
      radiusMeters: radiusM, mood, localHour,
      profile, brain, fitness, wallet, meals: mealsSnap.docs.map((d) => d.data()),
    });
    const useUnified = !forceLegacy && unifiedScoringActive(eligible);
    const subFlags = scoringSubFlags(eligible);

    let ranked: PlaceCandidate[];
    let algo2Diagnostics: unknown;
    let scoringVersionOut = "legacy_scoreAndRank_v1";
    const legacyRankStart = Date.now();
    if (algo2.sessionSuppression && !forceLegacy) {
      // Penindasan (excludePlaceIds) + putaran + kepelbagaian SELEPAS skor.
      // Phase 2.3: bila unifiedScoring ON → markah V2 (keselamatan keras dahulu);
      // jika tidak → legasi scoreAndRank (rollback-capable).
      const res = await rankWithAlgorithm2(candidatesSource, ctx, {
        uid, contextHash, now: Date.now(), flags: algo2, storeCount,
        recCtx, subFlags, useUnified,
      });
      ranked = res.ranked;
      algo2Diagnostics = res.diagnostics;
      scoringVersionOut = res.diagnostics.scoringVersion;
    } else {
      ranked = scoreAndRank(candidatesSource, ctx);
    }
    const legacyRankLatencyMs = Date.now() - legacyRankStart;
    const candidates = ranked.slice(0, storeCount);
    const primary = candidates[0];
    if (!primary) {
      throw new HttpsError("not-found", "Tiada calon tersedia.");
    }

    // Phase 2.5C — SHADOW comparison (HANYA percentage_shadow). READ-ONLY:
    // guna semula pool legasi yang SUDAH diambil, kira Algorithm 2 dalam-memori
    // (rankUnified tulen), log metrik AGREGAT sahaja. TIDAK mengubah `outCandidates`
    // (output pengguna), TIADA panggilan provider/kuota/sesi/brain/Food Memory.
    // Kegagalan shadow DITANGKAP — tidak pernah menjejaskan respons legasi.
    if (rollout.shadowEnabled && !forceLegacy) {
      try {
        // mod shadow_read_only: SEMUA penulisan dilarang (guard masa-jalan).
        const shadowPerms = permissionsForMode("shadow_read_only");
        const shadow = runAlgorithm2ShadowComparison({
          candidatePool: candidatesSource,
          legacyRankedIds: ranked.map((p) => p.placeId),
          recCtx,
          subFlags: scoringSubFlags(true), // sub-bendera Algorithm 2 penuh
          poolIsFallback: algorithmVersion !== "places_v1",
          candidatePoolVersion: algorithmVersion,
          rolloutVersion: rollout.rolloutVersion,
          legacyLatencyMs: legacyRankLatencyMs,
          clock: () => Date.now(),
        });
        logger.info("getSuggestions.shadowComparison", {
          cohortId: rollout.cohortId,
          rolloutVersion: rollout.rolloutVersion,
          scoringVersion: shadow.scoringVersion,
          mode: rollout.mode,
          shadowSuccess: shadow.success,
          shadowSkipped: shadow.skipped,
          shadowSkippedReason: shadow.skipReason,
          shadowErrorCode: shadow.errorCode,
          shadowScoringLatencyMs: shadow.scoringLatencyMs,
          legacyLatencyMs: legacyRankLatencyMs,
          totalLatencyDeltaMs: shadow.totalLatencyDeltaMs,
          algorithm2TopScore: shadow.algorithm2TopScore,
          candidatePoolVersion: shadow.candidatePoolVersion,
          readOnly: shadowPerms.sessionWriteAllowed === false,
          ...(shadow.metrics ?? {}),
        });
      } catch (e) {
        // Invarian: shadow TIDAK BOLEH menjejaskan output pengguna.
        logger.warn("getSuggestions.shadowComparison.error", {
          cohortId: rollout.cohortId, code: "shadow_uncaught",
        });
      }
    }

    // Phase 1.14G — overlay kanonikal HANYA untuk payload DIPULANGKAN kepada kohort.
    const overlay = await applyCanonicalOverlay(candidates, {
      cohortEligible: eligible,
      forceLegacy,
      includeDebug: rollout.diagnosticsAllowed,
    });
    const outCandidates = overlay.results.map((r) => r.candidate);
    const outPrimary = outCandidates[0];
    const outAlternatives = outCandidates.slice(1);
    const canonicalDiagnostics = eligible
      ? {
        cohort: cohort.maskedIdentity,
        source: cohort.source,
        canonicalCount: overlay.canonicalCount,
        legacyCount: overlay.legacyCount,
        forceLegacy,
        algorithm2: algo2Diagnostics ?? {enabled: false},
        flags: algo2,
        contextHash, // opaque — untuk Reject/Next authoritative
        requestLocation,
        scoringVersion: scoringVersionOut,
        scoringSubFlags: subFlags,
        brainVersion,
        // Phase 2.5 — telemetri rollout (privasi-selamat: cohortId anon, BUKAN uid).
        rollout: {mode: rollout.mode, cohortId: rollout.cohortId, rolloutVersion: rollout.rolloutVersion, decisionHash: rollout.decisionHash},
      }
      : undefined;

    // Phase 2.3 — observability (TIADA data alahan/kesihatan mentah).
    if (eligible && useUnified) {
      logger.info("getSuggestions.unifiedScoring", {
        mode,
        scoringVersion: scoringVersionOut,
        rolloutMode: rollout.mode,
        cohortId: rollout.cohortId,
        context: maskForLog(recCtx),
        diagnostics: (algo2Diagnostics as {unified?: unknown})?.unified ?? null,
      });
    }

    // Sumber jujur: Places sebenar vs fallback dummy (untuk label sample UI).
    const source =
      algorithmVersion === "places_v1" ? "google_places" : "mock_fallback";

    // Mod PREVIEW (Home AI Pick): tiada had, tiada tulisan sesi/suggestion,
    // tiada increment. Hanya pulangkan hasil untuk paparan.
    if (mode === "preview") {
      return {
        status: "OK",
        mode: "preview",
        source,
        selectedMood: mood,
        radiusMeters: radiusM,
        primary: outPrimary,
        alternatives: outAlternatives,
        candidates: outCandidates,
        algorithmVersion,
        ...(canonicalDiagnostics ? {canonicalDiagnostics} : {}),
      };
    }

    // Sesi cadangan baharu.
    const sessionRef = db.collection("suggestion_sessions").doc();
    await sessionRef.set({
      userId: uid,
      startedAt: FieldValue.serverTimestamp(),
      lat,
      lng,
      radius: radiusM,
      mood,
      timeSlot: currentTimeSlot(),
      candidatePlaceIds: candidates.map((p) => p.placeId),
      shownPlaceIds: [primary.placeId],
      rejectedPlaceIds: [],
      finalAction: null,
      source: "cloud_function",
      algorithmVersion,
    });

    // Rekod cadangan utama.
    const suggestionRef = db
      .collection("users")
      .doc(uid)
      .collection("suggestions")
      .doc();
    await suggestionRef.set({
      placeId: primary.placeId,
      sessionId: sessionRef.id,
      status: "shown",
      matchScore: primary.matchScore,
      timeSlot: currentTimeSlot(),
      rankPosition: 1,
      algorithmVersion,
      distanceKm: primary.distanceKm,
      priceEstimate: primary.priceEstimate,
      matchReasons: primary.matchReasonKeys,
      createdAt: FieldValue.serverTimestamp(),
    });

    await logEvent({
      ...base,
      eventType: "suggestion_shown",
      placeId: primary.placeId,
      suggestionId: suggestionRef.id,
      sessionId: sessionRef.id,
      metadata: {source, mode, radiusMeters: radiusM},
    });
    // QUOTA-01: increment sudah berlaku secara atomik dalam reserveSpin.

    return {
      status: "OK",
      mode: "spin",
      source,
      selectedMood: mood,
      radiusMeters: radiusM,
      sessionId: sessionRef.id,
      suggestionId: suggestionRef.id,
      primary: outPrimary,
      alternatives: outAlternatives,
      candidates: outCandidates,
      spinUsed: spinUsedNow,
      spinLimit: spinLimitNow,
      algorithmVersion,
      ...(canonicalDiagnostics ? {canonicalDiagnostics} : {}),
    };
  },
);
