import {PublicRestaurantProfileV2} from "../../merchant/publicRestaurantProfile";
import {PlaceCandidate} from "../../../types/place";
import {haversineMeters} from "../dedup/geo";

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;
const WEEK_MINUTES = 7 * 24 * 60;
const GEO_DEDUPE_METERS = 120;

export type AliasToCanonical = Readonly<Record<string, string>>;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizePlaceSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function priceLevel(profile: PublicRestaurantProfileV2): number {
  const raw = normalizePlaceSearchText(profile.priceBandId ?? "");
  if (/^[1-4]$/.test(raw)) return Number(raw);
  if (["budget", "cheap", "jimat", "low", "rm"].includes(raw)) return 1;
  if (["moderate", "mid", "medium", "rm rm"].includes(raw)) return 2;
  if (["premium", "high", "rm rm rm"].includes(raw)) return 3;
  if (["luxury", "fine dining", "rm rm rm rm"].includes(raw)) return 4;
  const spend = profile.averageSpend;
  if (!finite(spend) || spend <= 0) return 0;
  if (spend <= 15) return 1;
  if (spend <= 35) return 2;
  if (spend <= 80) return 3;
  return 4;
}

function currentMinuteOfWeekMYT(nowMs: number): number {
  const local = new Date(nowMs + MYT_OFFSET_MS);
  const mondayZero = (local.getUTCDay() + 6) % 7;
  return mondayZero * 24 * 60 + local.getUTCHours() * 60 + local.getUTCMinutes();
}

export function isOpenFromPeriods(
  periods: readonly {openMinuteOfWeek: number; closeMinuteOfWeek: number}[],
  nowMs: number,
): boolean | null {
  if (periods.length === 0) return null;
  const minute = currentMinuteOfWeekMYT(nowMs);
  for (const period of periods) {
    if (!finite(period.openMinuteOfWeek) || !finite(period.closeMinuteOfWeek)) continue;
    if (period.openMinuteOfWeek <= minute && minute < period.closeMinuteOfWeek) return true;
    // A period may cross Sunday into the following Monday and be represented
    // beyond 7 days. Compare the same local minute shifted by one week.
    if (period.closeMinuteOfWeek > WEEK_MINUTES) {
      const shifted = minute + WEEK_MINUTES;
      if (period.openMinuteOfWeek <= shifted && shifted < period.closeMinuteOfWeek) return true;
    }
  }
  return false;
}

function businessAllowsRecommendation(state: string): boolean {
  const normalized = normalizePlaceSearchText(state);
  return ![
    "permanently closed",
    "permanently_closed",
    "closed permanently",
    "inactive",
    "blocked",
  ].includes(normalized);
}

export function canonicalCandidateFromProfile(
  profile: PublicRestaurantProfileV2,
  opts: {centerLat?: number; centerLng?: number; nowMs?: number} = {},
): PlaceCandidate | null {
  if (!finite(profile.latitude) || !finite(profile.longitude)) return null;
  if (!businessAllowsRecommendation(profile.businessState)) return null;

  const hasCenter = finite(opts.centerLat) && finite(opts.centerLng);
  const distanceMeters = hasCenter
    ? haversineMeters(opts.centerLat!, opts.centerLng!, profile.latitude, profile.longitude)
    : 0;
  const openBySchedule = isOpenFromPeriods(profile.openingPeriods, opts.nowMs ?? Date.now());
  const cuisine = profile.cuisineTags.filter(Boolean).slice(0, 3).join(", ") ||
    profile.primaryCategory || "MakanMana";
  const level = priceLevel(profile);
  const averageSpend = finite(profile.averageSpend) && profile.averageSpend! > 0
    ? `~RM${Math.round(profile.averageSpend! * 100) / 100}`
    : "";

  return {
    placeId: profile.canonicalPlaceId,
    canonicalPlaceId: profile.canonicalPlaceId,
    name: profile.name,
    cuisine,
    emoji: "🍽️",
    rating: finite(profile.rating) ? profile.rating! : 0,
    userRatingCount: finite(profile.reviewCount) ? Math.max(0, Math.trunc(profile.reviewCount!)) : 0,
    priceLevel: level,
    distanceKm: distanceMeters / 1000,
    isOpen: openBySchedule ?? true,
    address: profile.address ?? "",
    matchScore: 50,
    matchReasonKeys: ["makanmanaCurated"],
    negativeSignals: [
      ...(level === 0 ? ["price_unknown"] : []),
      ...(openBySchedule === null ? ["hours_unknown"] : []),
    ],
    priceEstimate: averageSpend,
    photoUrl: profile.media.find((item) => item.url)?.url ?? null,
    openingPeriods: profile.openingPeriods.length > 0 ? [...profile.openingPeriods] : null,
    dataSource: "canonical",
    lat: profile.latitude,
    lng: profile.longitude,
  };
}

function canonicalIdentity(candidate: PlaceCandidate): string {
  return candidate.canonicalPlaceId?.trim() || candidate.placeId;
}

function samePhysicalPlace(left: PlaceCandidate, right: PlaceCandidate): boolean {
  if (normalizePlaceSearchText(left.name) !== normalizePlaceSearchText(right.name)) return false;
  if (!finite(left.lat) || !finite(left.lng) || !finite(right.lat) || !finite(right.lng)) return false;
  return haversineMeters(left.lat, left.lng, right.lat, right.lng) <= GEO_DEDUPE_METERS;
}

/**
 * Merge provider/area candidates with first-party published candidates BEFORE
 * ranking. A proven alias (or conservative exact-name + <=120m fallback) is
 * replaced by the first-party canonical candidate, never returned twice.
 */
export function mergeCanonicalPreferred(
  providerCandidates: readonly PlaceCandidate[],
  canonicalCandidates: readonly PlaceCandidate[],
  aliasToCanonical: AliasToCanonical = {},
): PlaceCandidate[] {
  const canonicalById = new Map<string, PlaceCandidate>();
  for (const candidate of canonicalCandidates) {
    canonicalById.set(canonicalIdentity(candidate), candidate);
  }

  const out: PlaceCandidate[] = [];
  const emittedProvider = new Set<string>();
  for (const provider of providerCandidates) {
    const mapped = aliasToCanonical[provider.placeId] ?? provider.canonicalPlaceId;
    if (mapped && canonicalById.has(mapped)) continue;
    if (canonicalById.has(provider.placeId)) continue;
    if ([...canonicalById.values()].some((canonical) => samePhysicalPlace(provider, canonical))) continue;
    if (emittedProvider.add(provider.placeId)) out.push(provider);
  }

  for (const canonical of canonicalById.values()) out.push(canonical);
  return out;
}

function searchScore(candidate: PlaceCandidate, normalizedQuery: string): number {
  const name = normalizePlaceSearchText(candidate.name);
  const cuisine = normalizePlaceSearchText(candidate.cuisine);
  const address = normalizePlaceSearchText(candidate.address);
  if (name === normalizedQuery) return 500;
  if (name.startsWith(normalizedQuery)) return 400;
  if (name.includes(normalizedQuery)) return 300;
  if (cuisine === normalizedQuery) return 220;
  if (cuisine.includes(normalizedQuery)) return 180;
  if (address.includes(normalizedQuery)) return 120;
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => `${name} ${cuisine} ${address}`.includes(token))) return 100;
  return 0;
}

export function rankCanonicalSearch(
  candidates: readonly PlaceCandidate[],
  query: string,
  limit = 20,
): PlaceCandidate[] {
  const normalized = normalizePlaceSearchText(query);
  if (!normalized) return [];
  return candidates
    .map((candidate) => ({candidate, score: searchScore(candidate, normalized)}))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.distanceKm - b.candidate.distanceKm ||
      a.candidate.name.localeCompare(b.candidate.name))
    .slice(0, Math.max(1, Math.min(50, Math.trunc(limit))))
    .map((entry) => entry.candidate);
}
