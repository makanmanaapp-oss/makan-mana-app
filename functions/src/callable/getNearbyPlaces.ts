import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";

import {algorithm2FlagActive, algorithm2FlagSummary, scoringSubFlags, unifiedScoringActive} from "../config/algorithm2Flags";
import {rankUnified} from "../domain/algorithm2/unifiedRanking";
import {buildRecCtxFromHydration} from "../services/recommendationContextBuilder";
import {ADMIN_UIDS} from "../config/constants";
import {db} from "../config/firebase";
import {DUMMY_PLACES} from "../data/dummyPlaces";
import {paginateRanked} from "../domain/algorithm2/sessionEngine";
import {resolveCohortAuthorization} from "../domain/places/canonical/canonicalReadResolver";
import {resolveRolloutForRequest} from "../services/rolloutService";
import {algorithm2LiveEligible as isAlgorithm2LiveEligible, ownerDiagnosticsAllowed} from "../domain/rollout/liveEligibility";
import {applyCanonicalOverlay} from "../services/canonicalReadService";
import {getExpandedPool} from "../services/expandedPoolService";
import {searchNearby} from "../services/placesService";
import {scoreAndRank} from "../services/scoringService";
import {PlaceCandidate} from "../types/place";

const mapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");

const DEFAULT_LAT = 3.1478;
const DEFAULT_LNG = 101.6953;
const DEFAULT_RADIUS_M = 3000;

interface GetNearbyInput {
  lat?: number;
  lng?: number;
  radius?: number;
  languageCode?: string;
  /** Phase 1.14G — klien boleh MEMAKSA legasi (override kecemasan). Hanya
   * boleh MENURUNKAN ke legasi; tidak pernah menaik-taraf keistimewaan. */
  forceLegacy?: boolean;
  /** Phase 2.2 — kursor pagination Explore (kohort + bendera sahaja). */
  cursor?: number;
}

/**
 * Senarai tempat berdekatan untuk Home (hero pick + grid).
 * Ringan: tiada kiraan spin, tiada sesi — hampir selalu hit cache 7 hari.
 */
export const getNearbyPlaces = onCall(
  {secrets: [mapsApiKey]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
    }
    const input = (request.data ?? {}) as GetNearbyInput;
    const hasClientCoords = typeof input.lat === "number" && typeof input.lng === "number";
    const lat = input.lat ?? DEFAULT_LAT;
    const lng = input.lng ?? DEFAULT_LNG;
    const radiusM = input.radius ?? DEFAULT_RADIUS_M;
    const languageCode = input.languageCode ?? "ms";
    // LOCATION CONSISTENCY — echo lokasi yang PELAYAN benar-benar guna (untuk
    // silang-sah Home/Explore) + telemetri bila klien TIDAK hantar koordinat
    // (fallback KL — kes pepijat yang perlu dikesan).
    const requestLocation = {
      latGrid: Number(lat.toFixed(3)),
      lngGrid: Number(lng.toFixed(3)),
      radiusM,
      hasClientCoords,
      usedDefaultKL: !hasClientCoords,
    };
    if (!hasClientCoords) {
      logger.warn("getNearbyPlaces.noClientCoords", {radiusM, cursor: input.cursor ?? null});
    }

    let candidates: PlaceCandidate[];
    let source = "places_v1";
    const apiKey = mapsApiKey.value();
    // Phase 2.2A/2.6B — kohort + keputusan rollout AUTHORITATIF. Explore expanded pool
    // + pagination + unified scoring guna kelayakan LIVE (owner + beta_allowlist),
    // BUKAN owner-only. Diagnostik/debug kekal owner-only (diagnosticsAllowed).
    const cohort = resolveCohortAuthorization(
      {uid, token: request.auth?.token as Record<string, unknown> | undefined},
      {ownerAllowlist: ADMIN_UIDS},
    );
    const {decision: rollout} = await resolveRolloutForRequest(
      uid, request.auth?.token as Record<string, unknown> | undefined,
    );
    const algorithm2LiveEligible = isAlgorithm2LiveEligible(rollout);
    const diagnosticsAllowed = ownerDiagnosticsAllowed(rollout);
    const forceLegacy = input.forceLegacy === true;
    const useExpandedPool = !forceLegacy &&
      algorithm2FlagActive("expandedPool", algorithm2LiveEligible);
    if (apiKey) {
      try {
        if (useExpandedPool) {
          const pool = await getExpandedPool({lat, lng, radiusMeters: radiusM, languageCode, apiKey, now: Date.now()});
          candidates = pool.candidates.length > 0 ? pool.candidates : await searchNearby({lat, lng, radiusMeters: radiusM, languageCode, apiKey});
        } else {
          candidates = await searchNearby({
            lat,
            lng,
            radiusMeters: radiusM,
            languageCode,
            apiKey,
          });
        }
        if (candidates.length === 0) {
          candidates = DUMMY_PLACES;
          source = "dummy";
        }
      } catch (e) {
        console.error("getNearbyPlaces: Places gagal, guna dummy:", e);
        candidates = DUMMY_PLACES;
        source = "dummy";
      }
    } else {
      candidates = DUMMY_PLACES;
      source = "dummy";
    }

    // Skor ikut profil supaya hero pick Home konsisten dengan spin.
    const profileSnap = await db
      .collection("user_profiles")
      .doc(uid)
      .get();
    const profile = profileSnap.data() ?? {};

    // Phase 2.3 — pemarkahan BERSATU (v2) untuk kohort supaya Home Nearby +
    // Explore konsisten dengan Home AI Pick + Spin (versi pemarkahan sama).
    // Awam / bukan kohort → legasi scoreAndRank (tidak berubah).
    const useUnified = !forceLegacy && unifiedScoringActive(algorithm2LiveEligible);
    let ranked: PlaceCandidate[];
    let scoringVersion = "legacy_scoreAndRank_v1";
    let unifiedDiag: unknown = null;
    if (useUnified) {
      const [brainSnap, fitnessSnap, mealsSnap] = await Promise.all([
        db.collection("user_brain_profiles").doc(uid).get(),
        db.collection("fitness_profiles").doc(uid).get(),
        db.collection("users").doc(uid).collection("meals")
          .orderBy("mealTime", "desc").limit(5).get(),
      ]);
      const localHour = (new Date().getUTCHours() + 8) % 24; // MYT
      const recCtx = buildRecCtxFromHydration({
        uid, plan: "free", language: languageCode,
        lat: input.lat ?? null, lng: input.lng ?? null, radiusMeters: radiusM,
        mood: null, localHour, // Home Nearby/Explore bukan dipacu mood
        profile, brain: brainSnap.data() ?? {}, fitness: fitnessSnap.data() ?? {},
        meals: mealsSnap.docs.map((d) => d.data()),
      });
      const res = rankUnified(candidates, recCtx, {
        excludeClosed: true, subFlags: scoringSubFlags(algorithm2LiveEligible),
      });
      ranked = res.ranked;
      scoringVersion = res.diagnostics.scoringVersion;
      unifiedDiag = res.diagnostics;
    } else {
      ranked = scoreAndRank(candidates, {
        budgetMax: (profile.budgetMax as number | undefined) ?? null,
        favoriteCuisines:
          (profile.favoriteCuisines as string[] | undefined) ?? [],
        radiusKm: radiusM / 1000,
      });
    }

    // Phase 1.14G — susunan + kiraan (12) DIKEKALKAN. Overlay kanonikal HANYA
    // untuk kohort dalaman; awam mendapat laluan legasi tepat sama (tiada bacaan
    // server-only, tiada medan diagnostik).
    // Phase 2.2 — Explore pagination (kohort + bendera + cursor DIBERI sahaja).
    // Halaman deterministik dari pool ter-rank sedia ada (TIADA kueri provider
    // baharu; cache-first). Awam / tiada cursor = tingkah laku 12 kad asal.
    const paginate =
      input.cursor !== undefined &&
      !forceLegacy &&
      algorithm2FlagActive("explorePagination", algorithm2LiveEligible);

    if (paginate) {
      const page = paginateRanked(ranked, Math.max(0, input.cursor ?? 0), 12);
      const ovP = await applyCanonicalOverlay(page.pageItems, {
        cohortEligible: algorithm2LiveEligible, forceLegacy, includeDebug: diagnosticsAllowed,
      });
      // Medan pagination (nextCursor/endOfResults/poolSize) untuk SEMUA pengguna
      // LIVE (owner + beta). canonicalDiagnostics (debug owner) HANYA diagnosticsAllowed.
      return {
        status: "OK", source,
        places: ovP.results.map((r) => r.candidate),
        nextCursor: page.nextCursor,
        endOfResults: page.endOfResults,
        poolSize: ranked.length,
        ...(diagnosticsAllowed ? {
          canonicalDiagnostics: {
            cohort: cohort.maskedIdentity, source: cohort.source,
            canonicalCount: ovP.canonicalCount, legacyCount: ovP.legacyCount,
            paginated: true, cursor: input.cursor,
            flags: algorithm2FlagSummary(algorithm2LiveEligible),
            requestLocation,
            scoringVersion,
            unifiedScoring: unifiedDiag,
          },
        } : {}),
      };
    }

    // Phase 1.14G/2.6B — susunan + kiraan (12) DIKEKALKAN. Overlay kanonikal untuk
    // pengguna LIVE (owner + beta); awam legasi. Debug/diagnostik owner-only.
    const top = ranked.slice(0, 12);
    const overlay = await applyCanonicalOverlay(top, {
      cohortEligible: algorithm2LiveEligible,
      forceLegacy,
      includeDebug: diagnosticsAllowed,
    });
    const places = overlay.results.map((r) => r.candidate);

    if (!diagnosticsAllowed) {
      // Awam + beta: bentuk respons (places sahaja) — TIADA diagnostik owner.
      return {status: "OK", source, places};
    }
    return {
      status: "OK",
      source,
      places,
      canonicalDiagnostics: {
        cohort: cohort.maskedIdentity,
        source: cohort.source,
        canonicalCount: overlay.canonicalCount,
        legacyCount: overlay.legacyCount,
        forceLegacy,
        requestLocation,
        scoringVersion,
        unifiedScoring: unifiedDiag,
      },
    };
  },
);
