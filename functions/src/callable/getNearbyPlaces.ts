import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db} from "../config/firebase";
import {DUMMY_PLACES} from "../data/dummyPlaces";
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
    const lat = input.lat ?? DEFAULT_LAT;
    const lng = input.lng ?? DEFAULT_LNG;
    const radiusM = input.radius ?? DEFAULT_RADIUS_M;
    const languageCode = input.languageCode ?? "ms";

    let candidates: PlaceCandidate[];
    let source = "places_v1";
    const apiKey = mapsApiKey.value();
    if (apiKey) {
      try {
        candidates = await searchNearby({
          lat,
          lng,
          radiusMeters: radiusM,
          languageCode,
          apiKey,
        });
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
    const ranked = scoreAndRank(candidates, {
      budgetMax: (profile.budgetMax as number | undefined) ?? null,
      favoriteCuisines:
        (profile.favoriteCuisines as string[] | undefined) ?? [],
      radiusKm: radiusM / 1000,
    });

    return {status: "OK", source, places: ranked.slice(0, 12)};
  },
);
