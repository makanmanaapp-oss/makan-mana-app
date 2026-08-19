import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db} from "../config/firebase";
import {readCanonicalForProvider} from "../services/canonicalReadService";
import {searchCheckinText} from "../services/placesService";

const mapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");
const MAX_SHARED_SCAN = 80;

interface SearchInput { query?: string; languageCode?: string }

function str(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function location(data: FirebaseFirestore.DocumentData): {lat: number | null; lng: number | null} {
  const raw = data.location as Record<string, unknown> | undefined;
  return {lat: num(raw?.latitude), lng: num(raw?.longitude)};
}

/**
 * DB tempat MakanMana didahulukan. Koleksi kanonikal sendiri kekal server-only;
 * callable mendedahkan snapshot kecil yang diperlukan untuk picker sahaja.
 */
export const searchCheckinPlaces = onCall(
  {secrets: [mapsApiKey]},
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
    const input = (request.data ?? {}) as SearchInput;
    const query = str(input.query);
    if (query.length < 2) return {places: []};
    if (query.length > 120) throw new HttpsError("invalid-argument", "Carian terlalu panjang.");
    const needle = query.toLocaleLowerCase();
    const sharedSnap = await db.collection("place_details")
      .orderBy("displayName").limit(MAX_SHARED_SCAN).get();
    const sharedMatches = sharedSnap.docs.filter((doc) => {
      const d = doc.data();
      return str(d.displayName).toLocaleLowerCase().includes(needle) ||
        str(d.address).toLocaleLowerCase().includes(needle) ||
        str(d.formattedAddress).toLocaleLowerCase().includes(needle);
    }).slice(0, 8);

    const shared = await Promise.all(sharedMatches.map(async (doc) => {
      const d = doc.data();
      const providerPlaceId = doc.id;
      const canonical = await readCanonicalForProvider(providerPlaceId);
      const point = location(d);
      const address = str(d.formattedAddress) || str(d.address);
      return {
        placeId: canonical.view?.canonicalPlaceId ?? providerPlaceId,
        providerPlaceId,
        provider: canonical.view ? "makanmana" : "google",
        name: canonical.view?.title || str(d.displayName),
        areaLabel: canonical.view?.address || address,
        address: canonical.view?.address || address,
        lat: canonical.view?.lat ?? point.lat,
        lng: canonical.view?.lng ?? point.lng,
        source: "makanmana_shared",
        verified: true,
        isManual: false,
      };
    }));
    if (shared.length > 0) return {places: shared};

    const google = await searchCheckinText(
      query, str(input.languageCode) || "ms", mapsApiKey.value(),
    );
    return {places: google.map((place) => ({
      placeId: place.providerPlaceId,
      providerPlaceId: place.providerPlaceId,
      provider: "google",
      name: place.name,
      areaLabel: place.areaLabel,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      source: "google_places",
      verified: true,
      isManual: false,
    }))};
  },
);
