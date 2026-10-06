import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";

import {algorithm2FlagActive, algorithm2FlagSummary, scoringSubFlags, unifiedScoringActive} from "../config/algorithm2Flags";
import {rankUnified} from "../domain/algorithm2/unifiedRanking";
import {buildRecCtxFromHydration} from "../services/recommendationContextBuilder";
import {ADMIN_UIDS} from "../config/constants";
import {db} from "../config/firebase";
import {applyCuisineDiversity, paginateRanked} from "../domain/algorithm2/sessionEngine";
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
import {searchNearby, searchTextRestaurants} from "../services/placesService";
import {
  PLACES_STATUS_OK,
  PLACES_STATUS_UNAVAILABLE,
  placesOutcomeWireFields,
  truthfulPlacesOutcome,
} from "../domain/places/truthfulPlacesOutcome";
import {scoreAndRank} from "../services/scoringService";
import {PlaceCandidate} from "../types/place";
import {buildSyntheticPlaces, decideSyntheticPlaces} from "../domain/security/qaSurfaces";

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
    const isExploreRequest = input.cursor !== undefined;
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
      logger.warn("getNearbyPlaces.noClientCoords", {
        radiusM,
        cursor: input.cursor ?? null,
        searchActive: Boolean(query),
      });
    }

    // RELEASE FIX: jangan lagi memaparkan restoran KL seolah-olah ia fallback
    // yang berguna bila lokasi pengguna gagal. Tanpa koordinat, browse biasa
    // mesti berhenti secara jujur. Carian teks masih dibenarkan kerana query
    // eksplisit seperti "Puncak Alam" boleh menentukan kawasan sendiri.
    if (!hasClientCoords && !query) {
      return {
        status: "PLACES_UNAVAILABLE",
        reason: "location_unavailable",
        retryable: true,
        source: "location_unavailable",
        nextCursor: null,
        endOfResults: true,
        poolSize: 0,
      };
    }

    let candidates: PlaceCandidate[] = [];
    let source = "places_v1";
    // WAVE 4A — hasil JUJUR: tiada restoran rekaan. Kosong bermakna kosong,
    // gagal bermakna gagal. Ditetapkan oleh setiap cabang di bawah.
    let providerError = false;
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
    // Explore ialah permukaan browse teras, bukan eksperimen cohort. Ia perlu
    // pool besar + pagination untuk SEMUA pengguna. Algorithm 2 masih mengawal
    // scoring/session khusus, tetapi retrieval Explore tidak lagi dikunci 12.
    const useExpandedPool = !forceLegacy &&
      (isExploreRequest ||
        algorithm2FlagActive("expandedPool", algorithm2LiveEligible));
    const areaCoverageOn = process.env.AREA_COVERAGE_POOL_ENABLED === "true" &&
      !forceLegacy && (isExploreRequest || algorithm2LiveEligible);

    // WAVE 3E — data tempat SINTETIK untuk QA Explore. Aktif HANYA dengan
    // MM_QA_SYNTHETIC_PLACES=enabled DAN runtime QA; produksi tidak pernah
    // diaktifkan walaupun bendera ditetapkan. Tiada panggilan Places.
    const synthetic = decideSyntheticPlaces({env: process.env});
    if (!hasClientCoords && query && apiKey) {
      // Carian kawasan/nama global. Jangan bias kepada KL apabila GPS tiada.
      try {
        candidates = await searchTextRestaurants({
          query,
          languageCode,
          apiKey,
          radiusMeters: radiusM,
        });
        source = "places_text_search";
      } catch (e) {
        logger.error("getNearbyPlaces.textSearchError", {
          error: e instanceof Error ? e.message : "unknown",
          queryLength: query.length,
        });
        providerError = true;
        candidates = [];
      }
    } else if (synthetic.active) {
      candidates = buildSyntheticPlaces({lat, lng});
      source = "qa_synthetic";
      logger.info("getNearbyPlaces.qaSynthetic", {reason: synthetic.reason});
    } else if (apiKey) {
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
      } catch (e) {
        // Gangguan pembekal (termasuk had masa) BUKAN "tiada hasil".
        logger.error("getNearbyPlaces.providerError", {
          error: e instanceof Error ? e.message : "unknown",
        });
        providerError = true;
        candidates = [];
      }
    }

    // Explore Search: jika full retrieval pool semasa tidak mempunyai padanan,
    // naik taraf kepada Places Text Search. Ini menjadikan query seperti nama
    // restoran ATAU kawasan ("Puncak Alam") benar-benar mencari di provider,
    // bukan sekadar menapis kad yang kebetulan telah dimuatkan.
    if (query && hasClientCoords && apiKey && !providerError &&
        searchCanonicalCandidates(candidates, query).length === 0) {
      try {
        const textMatches = await searchTextRestaurants({
          query,
          lat,
          lng,
          radiusMeters: radiusM,
          languageCode,
          apiKey,
        });
        if (textMatches.length > 0) {
          candidates = textMatches;
          source = "places_text_search";
        }
      } catch (e) {
        logger.warn("getNearbyPlaces.textSearchFallbackFailed", {
          error: e instanceof Error ? e.message : "unknown",
          queryLength: query.length,
        });
      }
    }

    // WAVE 4A — keluar AWAL dengan hasil jujur. Tiada tempat rekaan, tiada
    // pemarkahan atas senarai kosong, tiada sesi dibina daripada ketiadaan.
    // Data sintetik QA memintas semakan ini: ia bukan hasil pembekal, dan
    // `decideSyntheticPlaces` sudah mengehadkannya kepada runtime QA sahaja.
    if (!synthetic.active) {
      const outcome = truthfulPlacesOutcome({
        apiKeyPresent: Boolean(apiKey),
        providerError,
        candidates,
      });
      if (outcome.status !== PLACES_STATUS_OK) {
        const wire = placesOutcomeWireFields(outcome);
        logger.info("getNearbyPlaces.noPlaces", {
          status: wire.status,
          reason: wire.reason ?? null,
          retryable: wire.retryable ?? null,
        });
        return {
          ...wire,
          source: outcome.status === PLACES_STATUS_UNAVAILABLE ? "unavailable" : source,
          // Pagination Explore: hentikan gelung muat-lagi dengan jujur.
          nextCursor: null,
          endOfResults: true,
          poolSize: 0,
          ...(diagnosticsAllowed ? {
            canonicalDiagnostics: {
              cohort: cohort.maskedIdentity,
              source: cohort.source,
              requestLocation,
              flags: algorithm2FlagSummary(algorithm2LiveEligible),
            },
          } : {}),
        };
      }
      candidates = outcome.places;
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

    // Browse mesti pelbagai walaupun pengguna bukan dalam cohort Algorithm 2.
    // Max dua cuisine yang sama dalam 24 kedudukan pertama; lebihan ditolak ke
    // belakang, bukan dibuang.
    ranked = applyCuisineDiversity(ranked, {cuisineCap: 2, window: 24});

    // Explore Search MUST run over the full ranked pool before pagination.
    if (query) {
      ranked = searchCanonicalCandidates(ranked, query);
    }

    // Klien Explore sentiasa menghantar cursor. Pagination ialah kontrak browse
    // asas dan tidak lagi bergantung pada rollout Algorithm 2.
    const paginate = input.cursor !== undefined;

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
