import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {DUMMY_PLACES} from "../data/dummyPlaces";
import {logEvent} from "../services/eventService";
import {searchNearby} from "../services/placesService";
import {ScoringContext, scoreAndRank} from "../services/scoringService";
import {
  getTodayUsage,
  incrementPaywallShown,
  incrementSpin,
  spinLimitForPlan,
} from "../services/usageService";
import {PlaceCandidate} from "../types/place";
import {currentTimeSlot} from "../utils/timeSlot";

const mapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");

// Lalai: pusat Kuala Lumpur (jika lokasi peranti tidak diberikan).
const DEFAULT_LAT = 3.1478;
const DEFAULT_LNG = 101.6953;
const DEFAULT_RADIUS_M = 3000;

interface GetSuggestionsInput {
  lat?: number;
  lng?: number;
  radius?: number;
  mood?: string;
  languageCode?: string;
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
    const mood = input.mood ?? null;
    const languageCode = input.languageCode ?? "ms";
    const lat = input.lat ?? DEFAULT_LAT;
    const lng = input.lng ?? DEFAULT_LNG;
    const radiusM = input.radius ?? DEFAULT_RADIUS_M;

    // Pelan dari users/{uid}; lalai free.
    const userSnap = await db.collection("users").doc(uid).get();
    const plan = (userSnap.data()?.plan as string | undefined) ?? "free";

    const base = {userId: uid, mood, languageCode, plan};
    await logEvent({...base, eventType: "spin_started"});

    // Had spin harian (pelayan ialah penguat kuasa sebenar).
    const usage = await getTodayUsage(uid, plan);
    if (usage.spinLimit >= 0 && usage.spinUsed >= usage.spinLimit) {
      await logEvent({...base, eventType: "paywall_viewed"});
      await incrementPaywallShown(uid);
      return {
        status: "PAYWALL_REQUIRED",
        spinUsed: usage.spinUsed,
        spinLimit: usage.spinLimit,
      };
    }

    // Konteks skor: profil + sejarah makan terkini (variety & penalti ulang).
    const [profileSnap, mealsSnap] = await Promise.all([
      db.collection("user_profiles").doc(uid).get(),
      db
        .collection("users")
        .doc(uid)
        .collection("meals")
        .orderBy("mealTime", "desc")
        .limit(5)
        .get(),
    ]);
    const profile = profileSnap.data() ?? {};
    const lastCuisines: string[] = [];
    const recentPlaceIds: string[] = [];
    for (const doc of mealsSnap.docs) {
      const d = doc.data();
      recentPlaceIds.push((d.placeId as string) ?? "");
      for (const c of (d.cuisineTags as string[] | undefined) ?? []) {
        lastCuisines.push(c);
      }
    }

    // Calon: Google Places (cache-first) atau dummy fallback.
    let candidatesSource: PlaceCandidate[];
    let algorithmVersion: string;
    const apiKey = mapsApiKey.value();
    if (apiKey) {
      try {
        candidatesSource = await searchNearby({
          lat,
          lng,
          radiusMeters: radiusM,
          languageCode,
          apiKey,
        });
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
        (profile.favoriteCuisines as string[] | undefined) ?? [],
      lastCuisines,
      recentPlaceIds,
      mood,
      radiusKm: radiusM / 1000,
      // Diet Goal (Pro): pengaruh berterusan pada semua cadangan.
      dietGoal: plan === "pro" ?
        ((profile.dietGoal as string | undefined) ?? null) :
        null,
    };
    const ranked = scoreAndRank(candidatesSource, ctx);
    const candidates = ranked.slice(0, 5);
    const primary = candidates[0];
    if (!primary) {
      throw new HttpsError("not-found", "Tiada calon tersedia.");
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
    });
    await incrementSpin(uid, plan);

    return {
      status: "OK",
      sessionId: sessionRef.id,
      suggestionId: suggestionRef.id,
      primary,
      candidates,
      spinUsed: usage.spinUsed + 1,
      spinLimit: spinLimitForPlan(plan),
      algorithmVersion,
    };
  },
);
