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
