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
import {
  dedupeCanonicalCandidates,
  searchCanonicalCandidates,
} from "../domain/places/canonical/canonicalCandidatePool";
import {resolveRolloutForRequest} from "../services/rolloutService";
import {algorithm2LiveEligible as isAlgorithm2LiveEligible, ownerDiagnosticsAllowed} from "../domain/rollout/liveEligibility";
import {applyCanonicalOverlay} from "../services/canonicalReadService";
import {getAreaCandidatePool} from "../services/areaCandidatePoolService";
import {getExpandedPool} from "../services/expandedPoolService";
import {searchNearby} from "../services/placesService";
import {scoreAndRank} from "../services/scoringService";
import {PlaceCandidate} from "../types/place";

const mapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");

const DEFAULT_LAT = 3.1478;
const DEFAULT_LNG = 101.6953;
const DEFAULT_RADIUS_M = 3000;
const MAX_SEARCH_QUERY = 160;

interface GetNearbyInput {
  lat?: number;
  lng?: number;
  radius?: number;
  languageCode?: string;
  /** Explore Search — server searches the FULL area pool, not only loaded cards. */
  query?: string;
  /** Phase 1.14G — klien boleh MEMAKSA legasi (override kecemasan). Hanya
   * boleh MENURUNKAN ke legasi; tidak pernah menaik-taraf keistimewaan. */
  forceLegacy?: boolean;
  /** Phase 2.2 — kursor pagination Explore (kohort + bendera sahaja). */
  cursor?: number;
}

/**
 * Senarai tempat berdekatan untuk Home (hero pick + grid) dan Explore.
 * Live Algorithm 2 cohorts use the same database-first AreaCandidatePool as
 * Suggestions when AREA_COVERAGE_POOL_ENABLED=true, so Control Center-published
 * restaurants participate BEFORE safety/ranking instead of as a late overlay.
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
    const query = typeof input.query === "string"
      ? input.query.trim().slice(0, MAX_SEARCH_QUERY)
      : "";
    // LOCATION CONSISTENCY — echo lokasi yang PELAYAN benar-benar guna (untuk
    // silang-sah Home/Explore) + telemetri bila klien TIDAK hantar koordinat.
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
    // Phase 2.2A/2.6B — kohort + keputusan rollout AUTHORITATIF. Explore + Home
    // use the same live eligibility as Suggestions. Debug remains owner-only.
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
    const areaCoverageOn = process.env.AREA_COVERAGE_POOL_ENABLED === "true" &&
      !forceLegacy && algorithm2LiveEligible;

    if (apiKey) {
      try {
        if (areaCoverageOn) {
          const area = await getAreaCandidatePool({
            lat,
            lng,
            radiusMeters: radiusM,
            languageCode,
            apiKey,
            now: Date.now(),
          });
          candidates = area.pool.candidates.length > 0
            ? area.pool.candidates
            : await searchNearby({lat, lng, radiusMeters: radiusM, languageCode, apiKey});
          source = area.usedFallback ? "area_pool_fallback" : "area_pool";
          logger.info("getNearbyPlaces.areaCoverage", {
            cohortId: rollout.cohortId,
            areaPoolTotal: area.pool.candidates.length,
            knownCanonicalCount: area.pool.knownCanonicalCount,
            exactRadiusCount: area.pool.exactRadiusCount,
            activePlaceCount: area.pool.activePlaceCount,
            newlyDiscoveredCount: area.pool.newlyDiscoveredCount,
            discoveryPerformed: area.pool.discoveryPerformed,
            discoveryReason: area.pool.discoveryReason,
            providerQueryCount: area.providerQueryCount,
            usedFallback: area.usedFallback,
          });
        } else if (useExpandedPool) {
          const pool = await getExpandedPool({lat, lng, radiusMeters: radiusM, languageCode, apiKey, now: Date.now()});
          candidates = pool.candidates.length > 0
            ? pool.candidates
            : await searchNearby({lat, lng, radiusMeters: radiusM, languageCode, apiKey});
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

    // Skor ikut profil supaya hero pick Home konsisten dengan Spin.
    const profileSnap = await db
      .collection("user_profiles")
      .doc(uid)
      .get();
    const profile = profileSnap.data() ?? {};

    // Phase 2.3 — pemarkahan BERSATU (v2) untuk kohort supaya Home Nearby +
    // Explore konsisten dengan Home MakanMana Pilih + Spin.
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
        mood: null, localHour,
        profile, brain: brainSnap.data() ?? {}, fitness: fitnessSnap.data() ?? {},
        meals: mealsSnap.docs.map((d) => d.data()),
      });
      // Explore/Home-Nearby ialah permukaan browse, bukan "makan sekarang".
      // Closed restaurants remain visible and labelled; Spin keeps excludeClosed.
      const res = rankUnified(candidates, recCtx, {
        excludeClosed: false, subFlags: scoringSubFlags(algorithm2LiveEligible),
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

    // Explore Search MUST run over the full ranked pool before slicing to 12.
    // Exact canonical-name matches are deterministic and come first, but every
    // candidate has already passed the normal retrieval/radius/ranking pipeline.
    if (query) {
      ranked = searchCanonicalCandidates(ranked, query);
    }

    const paginate =
      input.cursor !== undefined &&
      !forceLegacy &&
      algorithm2FlagActive("explorePagination", algorithm2LiveEligible);

    if (paginate) {
      const page = paginateRanked(ranked, Math.max(0, input.cursor ?? 0), 12);
      const ovP = await applyCanonicalOverlay(page.pageItems, {
        cohortEligible: algorithm2LiveEligible, forceLegacy, includeDebug: diagnosticsAllowed,
      });
      const places = dedupeCanonicalCandidates(ovP.results.map((r) => r.candidate));
      return {
        status: "OK", source,
        places,
        nextCursor: page.nextCursor,
        endOfResults: page.endOfResults,
        poolSize: ranked.length,
        ...(diagnosticsAllowed ? {
          canonicalDiagnostics: {
            cohort: cohort.maskedIdentity, source: cohort.source,
            canonicalCount: ovP.canonicalCount, legacyCount: ovP.legacyCount,
            paginated: true, cursor: input.cursor,
            searchActive: Boolean(query),
            flags: algorithm2FlagSummary(algorithm2LiveEligible),
            requestLocation,
            scoringVersion,
            unifiedScoring: unifiedDiag,
          },
        } : {}),
      };
    }

    const top = ranked.slice(0, 12);
    const overlay = await applyCanonicalOverlay(top, {
      cohortEligible: algorithm2LiveEligible,
      forceLegacy,
      includeDebug: diagnosticsAllowed,
    });
    const places = dedupeCanonicalCandidates(overlay.results.map((r) => r.candidate));

    if (!diagnosticsAllowed) {
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
        searchActive: Boolean(query),
        requestLocation,
        scoringVersion,
        unifiedScoring: unifiedDiag,
      },
    };
  },
);
