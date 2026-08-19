import {db, FieldValue} from "../config/firebase";
import {OpeningPeriod, PlaceCandidate} from "../types/place";
import {malaysiaNow} from "../utils/timeSlot";

/**
 * Google Places API (New) Nearby Search dengan cache jangka panjang.
 *
 * Strategi kos (Milestone 4):
 * - Senarai kedai satu kawasan di-cache 7 HARI (kedai jarang berubah).
 * - Jadual operasi (regularOpeningHours) disimpan sekali dalam cache;
 *   status buka/tutup DIKIRA SEMULA setiap permintaan ikut waktu Malaysia —
 *   tiada panggilan API tambahan langsung untuk kawasan yang sama.
 * - Google tidak menyediakan isyarat perubahan kedai; TTL 7 hari ialah
 *   kompromi paling jimat yang masih segar.
 */

const CACHE_TTL_DAYS = 7;
const PLACES_ENDPOINT =
  "https://places.googleapis.com/v1/places:searchNearby";
const PLACES_TEXT_ENDPOINT =
  "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.location",
  "places.regularOpeningHours",
  "places.shortFormattedAddress",
  "places.primaryTypeDisplayName",
  "places.types",
  "places.googleMapsUri",
  "places.photos",
].join(",");

interface SearchOptions {
  lat: number;
  lng: number;
  radiusMeters: number;
  languageCode: string;
  apiKey: string;
}

export interface CheckinTextPlace {
  providerPlaceId: string;
  name: string;
  address: string;
  areaLabel: string;
  lat: number | null;
  lng: number | null;
}

interface RawPeriodPoint {
  day?: number;
  hour?: number;
  minute?: number;
}

interface RawPlace {
  id?: string;
  displayName?: {text?: string};
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  location?: {latitude?: number; longitude?: number};
  regularOpeningHours?: {
    periods?: Array<{open?: RawPeriodPoint; close?: RawPeriodPoint}>;
  };
  shortFormattedAddress?: string;
  primaryTypeDisplayName?: {text?: string};
  types?: string[];
  googleMapsUri?: string;
  photos?: Array<{name?: string}>;
}

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const PRICE_ESTIMATE_BY_LEVEL: Record<number, string> = {
  1: "RM5 - RM15",
  2: "RM12 - RM30",
  3: "RM25 - RM60",
  4: "RM60+",
};

const EMOJI_BY_TYPE: Array<[string, string]> = [
  ["cafe", "☕"],
  ["coffee", "☕"],
  ["bakery", "🥐"],
  ["chinese", "🥢"],
  ["indian", "🍛"],
  ["japanese", "🍣"],
  ["korean", "🍜"],
  ["thai", "🍲"],
  ["indonesian", "🍗"],
  ["malay", "🍛"],
  ["seafood", "🦐"],
  ["pizza", "🍕"],
  ["hamburger", "🍔"],
  ["fast_food", "🍟"],
  ["vegetarian", "🥗"],
  ["vegan", "🥗"],
  ["dessert", "🍰"],
  ["ice_cream", "🍨"],
  ["steak", "🥩"],
  ["barbecue", "🍖"],
];

const MINUTES_PER_WEEK = 7 * 24 * 60;

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function emojiFor(types: string[]): string {
  for (const t of types) {
    for (const [needle, emoji] of EMOJI_BY_TYPE) {
      if (t.includes(needle)) return emoji;
    }
  }
  return "🍽️";
}

function toMinuteOfWeek(p?: RawPeriodPoint): number | null {
  if (p?.day == null) return null;
  return p.day * 1440 + (p.hour ?? 0) * 60 + (p.minute ?? 0);
}

function toPeriods(raw: RawPlace): OpeningPeriod[] | null {
  const periods = raw.regularOpeningHours?.periods;
  if (!periods || periods.length === 0) return null;
  const out: OpeningPeriod[] = [];
  for (const p of periods) {
    const open = toMinuteOfWeek(p.open);
    if (open == null) continue;
    let close = toMinuteOfWeek(p.close);
    // Tiada waktu tutup = buka 24 jam.
    if (close == null) return [];
    // Lingkar minggu (cth. buka Ahad malam tutup Isnin pagi).
    if (close <= open) close += MINUTES_PER_WEEK;
    out.push({openMinuteOfWeek: open, closeMinuteOfWeek: close});
  }
  return out;
}

/** Kira status buka ikut waktu Malaysia semasa (tanpa API). */
export function isOpenNow(
  periods: OpeningPeriod[] | null | undefined,
  at: Date = malaysiaNow(),
): boolean {
  if (periods == null) return true; // jadual tak diketahui: anggap buka
  if (periods.length === 0) return true; // 24 jam
  const nowMin = at.getDay() * 1440 + at.getHours() * 60 + at.getMinutes();
  for (const p of periods) {
    if (
      (nowMin >= p.openMinuteOfWeek && nowMin < p.closeMinuteOfWeek) ||
      (nowMin + MINUTES_PER_WEEK >= p.openMinuteOfWeek &&
        nowMin + MINUTES_PER_WEEK < p.closeMinuteOfWeek)
    ) {
      return true;
    }
  }
  return false;
}

/** Segarkan isOpen semua calon ikut waktu semasa. */
export function applyOpenStatus(
  candidates: PlaceCandidate[],
): PlaceCandidate[] {
  return candidates.map((c) => ({
    ...c,
    isOpen: isOpenNow(c.openingPeriods),
  }));
}

function toCandidate(raw: RawPlace, lat: number, lng: number): PlaceCandidate {
  const priceLevel = PRICE_LEVEL_MAP[raw.priceLevel ?? ""] ?? 1;
  const types = raw.types ?? [];
  const distanceKm = haversineKm(
    lat,
    lng,
    raw.location?.latitude ?? lat,
    raw.location?.longitude ?? lng,
  );
  const openingPeriods = toPeriods(raw);
  return {
    placeId: raw.id ?? "",
    name: raw.displayName?.text ?? "Tempat Makan",
    cuisine: raw.primaryTypeDisplayName?.text ?? "Restoran",
    emoji: emojiFor(types),
    rating: raw.rating ?? 0,
    userRatingCount: raw.userRatingCount ?? 0,
    priceLevel,
    distanceKm: Math.round(distanceKm * 10) / 10,
    isOpen: isOpenNow(openingPeriods),
    address: raw.shortFormattedAddress ?? "",
    matchScore: 0,
    matchReasonKeys: [],
    priceEstimate: PRICE_ESTIMATE_BY_LEVEL[priceLevel] ?? "RM10 - RM25",
    openingPeriods,
    photoUrl: null,
    // FULL RADIUS COVERAGE — koordinat mentah untuk indeks geo/penyimpanan.
    lat: raw.location?.latitude,
    lng: raw.location?.longitude,
  };
}

/**
 * Tukar rujukan foto Places kepada URL googleusercontent kekal
 * (skipHttpRedirect) - diselesaikan SEKALI semasa isi cache, jadi
 * kos Photo API hanya ~20 panggilan seminggu per kawasan.
 */
async function resolvePhotoUrl(
  photoName: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media` +
        `?maxWidthPx=800&skipHttpRedirect=true&key=${apiKey}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {photoUri?: string};
    return data.photoUri ?? null;
  } catch (e) {
    console.error("resolvePhotoUrl gagal:", e);
    return null;
  }
}

function cacheId(lat: number, lng: number, radiusMeters: number): string {
  // v2: skema cache dengan photoUrl - id baharu supaya cache lama
  // (tanpa foto) tidak dipakai sementara menunggu luput.
  return `v2_${lat.toFixed(3)}_${lng.toFixed(3)}_${radiusMeters}`;
}

/** Cari tempat makan berdekatan: cache 7 hari dahulu, API jika perlu. */
export async function searchNearby(
  opts: SearchOptions,
): Promise<PlaceCandidate[]> {
  const id = cacheId(opts.lat, opts.lng, opts.radiusMeters);
  const cacheRef = db.collection("places_cache").doc(id);

  const cached = await cacheRef.get();
  if (cached.exists) {
    const data = cached.data();
    const expiresAt = data?.expiresAt?.toDate?.() as Date | undefined;
    if (expiresAt && expiresAt.getTime() > Date.now()) {
      // Kawasan pernah dilawati: 0 panggilan API, kira buka/tutup semula.
      return applyOpenStatus((data?.places as PlaceCandidate[]) ?? []);
    }
  }

  const res = await fetch(PLACES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": opts.apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: ["restaurant"],
      maxResultCount: 20,
      rankPreference: "POPULARITY",
      languageCode: opts.languageCode,
      locationRestriction: {
        circle: {
          center: {latitude: opts.lat, longitude: opts.lng},
          radius: opts.radiusMeters,
        },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Places API ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {places?: RawPlace[]};
  const rawPlaces = (body.places ?? []).filter((p) => (p.id ?? "") !== "");
  const candidates = rawPlaces.map((p) =>
    toCandidate(p, opts.lat, opts.lng),
  );

  // Selesaikan foto secara selari - sekali sahaja per isi cache.
  await Promise.all(
    rawPlaces.map(async (raw, i) => {
      const photoName = raw.photos?.[0]?.name;
      if (photoName) {
        candidates[i].photoUrl = await resolvePhotoUrl(
          photoName,
          opts.apiKey,
        );
      }
    }),
  );

  // Simpan cache 7 hari + snapshot place_details.
  const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 86400000);
  const batch = db.batch();
  batch.set(cacheRef, {
    center: {lat: opts.lat, lng: opts.lng},
    radiusMeters: opts.radiusMeters,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    places: candidates,
  });
  for (const c of candidates) {
    batch.set(
      db.collection("place_details").doc(c.placeId),
      {
        displayName: c.name,
        rating: c.rating,
        userRatingCount: c.userRatingCount,
        priceLevel: c.priceLevel,
        keywords: [c.cuisine],
        photoUrl: c.photoUrl ?? null,
        lastFetchedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  }
  await batch.commit();

  return candidates;
}

/**
 * Carian teks Google Places untuk composer check-in. Hanya dipanggil selepas
 * DB tempat MakanMana tidak menemui padanan. Keputusan disimpan sebagai
 * `place_details` supaya pilihan berikutnya menjadi data bersama, bukannya
 * data peranti atau tempat kanonikal yang direka oleh klien.
 */
export async function searchCheckinText(
  query: string,
  languageCode: string,
  apiKey: string,
): Promise<CheckinTextPlace[]> {
  const clean = query.trim().slice(0, 120);
  if (clean.length < 2 || !apiKey) return [];
  const res = await fetch(PLACES_TEXT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: clean,
      includedType: "restaurant",
      strictTypeFiltering: false,
      languageCode,
      maxResultCount: 8,
    }),
  });
  if (!res.ok) throw new Error(`Places text search ${res.status}`);
  const raw = ((await res.json()) as {places?: RawPlace[]}).places ?? [];
  const places = raw
    .filter((p) => typeof p.id === "string" && p.id.length > 0)
    .slice(0, 8)
    .map((p) => {
      const address = p.shortFormattedAddress ?? "";
      return {
        providerPlaceId: p.id!,
        name: p.displayName?.text?.trim() || "Tempat makan",
        address,
        // Google memberi alamat ringkas yang sesuai sebagai kawasan kasar;
        // ia bukan lokasi semasa pengguna.
        areaLabel: address,
        lat: typeof p.location?.latitude === "number" ? p.location.latitude : null,
        lng: typeof p.location?.longitude === "number" ? p.location.longitude : null,
      };
    });

  const batch = db.batch();
  for (const place of places) {
    batch.set(db.collection("place_details").doc(place.providerPlaceId), {
      displayName: place.name,
      formattedAddress: place.address || null,
      address: place.address || null,
      location: place.lat != null && place.lng != null
        ? {latitude: place.lat, longitude: place.lng}
        : null,
      locationSource: "google_places_text_search",
      lastFetchedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  }
  if (places.length > 0) await batch.commit();
  return places;
}
