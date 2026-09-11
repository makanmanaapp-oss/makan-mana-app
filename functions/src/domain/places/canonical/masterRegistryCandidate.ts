import {OpeningPeriod, PlaceCandidate} from "../../../types/place";

type Plain = Record<string, unknown>;

const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function object(value: unknown): Plain {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Plain
    : {};
}

function stringList(value: unknown, max = 100): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(text)
    .filter((item): item is string => item !== null)
    .slice(0, max);
}

function clockMinutes(value: unknown): number | null {
  const clean = text(value);
  if (!clean || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clean)) return null;
  const [hour, minute] = clean.split(":").map(Number);
  return hour * 60 + minute;
}

/** Convert Control Center weekly hours into the same minute-of-week contract used by Places. */
export function openingPeriodsFromRegistryHours(value: unknown): OpeningPeriod[] | null {
  const hours = object(value);
  if (Object.keys(hours).length === 0) return null;
  const periods: OpeningPeriod[] = [];

  for (const [day, dayIndex] of Object.entries(DAY_INDEX)) {
    const entry = object(hours[day]);
    if (Object.keys(entry).length === 0 || entry.closed === true) continue;
    const base = dayIndex * MINUTES_PER_DAY;
    if (entry.all_day === true || entry.allDay === true) {
      periods.push({openMinuteOfWeek: base, closeMinuteOfWeek: base + MINUTES_PER_DAY});
      continue;
    }
    if (!Array.isArray(entry.sessions)) continue;
    for (const raw of entry.sessions.slice(0, 2)) {
      const session = object(raw);
      const open = clockMinutes(session.open);
      const close = clockMinutes(session.close);
      if (open === null || close === null || open === close) continue;
      const openMinuteOfWeek = base + open;
      let closeMinuteOfWeek = base + close;
      if (closeMinuteOfWeek <= openMinuteOfWeek) closeMinuteOfWeek += MINUTES_PER_DAY;
      periods.push({openMinuteOfWeek, closeMinuteOfWeek});
    }
  }

  return periods.length > 0 ? periods : null;
}

export function isOpenAtMalaysia(
  periods: OpeningPeriod[] | null,
  nowMs: number = Date.now(),
): boolean {
  if (periods == null) return true; // unknown hours stay unknown, never fabricated closed/open detail
  const myt = new Date(nowMs + 8 * 60 * 60 * 1000);
  const nowMinute = myt.getUTCDay() * MINUTES_PER_DAY +
    myt.getUTCHours() * 60 + myt.getUTCMinutes();
  return periods.some((period) =>
    (nowMinute >= period.openMinuteOfWeek && nowMinute < period.closeMinuteOfWeek) ||
    (nowMinute + MINUTES_PER_WEEK >= period.openMinuteOfWeek &&
      nowMinute + MINUTES_PER_WEEK < period.closeMinuteOfWeek));
}

function priceLevelFromRange(value: unknown): number {
  switch (text(value)) {
    case "budget": return 1;
    case "mid": return 2;
    case "premium": return 3;
    case "luxury": return 4;
    default: return 0; // explicitly unknown — never pretend it is cheap
  }
}

export interface MasterRegistryCandidateInput {
  canonicalPlaceId: string;
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  primaryCategory?: unknown;
  cuisineTags?: unknown;
  priceRange?: unknown;
  businessStatus?: unknown;
  openingHours?: unknown;
  coverImageUrl?: unknown;
  nowMs?: number;
}

/** Build a public-safe, provider-independent candidate from an active master publication. */
export function buildMasterRegistryCandidate(input: MasterRegistryCandidateInput): PlaceCandidate {
  const periods = openingPeriodsFromRegistryHours(input.openingHours);
  const businessStatus = text(input.businessStatus) ?? "active";
  const cuisineTags = stringList(input.cuisineTags);
  const cuisine = cuisineTags[0] ?? text(input.primaryCategory) ?? "Restoran";
  const businessOpen = businessStatus === "active";

  return {
    placeId: input.canonicalPlaceId,
    canonicalPlaceId: input.canonicalPlaceId,
    dataSource: "canonical",
    name: input.name,
    cuisine,
    emoji: "🍽️",
    rating: 0,
    userRatingCount: 0,
    priceLevel: priceLevelFromRange(input.priceRange),
    distanceKm: 0,
    isOpen: businessOpen && isOpenAtMalaysia(periods, input.nowMs),
    address: input.address ?? "",
    matchScore: 0,
    matchReasonKeys: [],
    priceEstimate: "",
    photoUrl: text(input.coverImageUrl),
    openingPeriods: periods,
    lat: input.latitude,
    lng: input.longitude,
  };
}

/** Preserve old area knowledge while upserting the authoritative canonical row. */
export function upsertMasterRegistryCandidate(
  existingValue: unknown,
  candidate: PlaceCandidate,
  equivalentPlaceIds: readonly string[] = [],
  max = 400,
): PlaceCandidate[] {
  const existing = Array.isArray(existingValue) ? existingValue as PlaceCandidate[] : [];
  const equivalent = new Set([candidate.placeId, candidate.canonicalPlaceId ?? "", ...equivalentPlaceIds].filter(Boolean));
  const kept = existing.filter((row) => {
    if (!row || typeof row.placeId !== "string") return false;
    if (equivalent.has(row.placeId)) return false;
    if (row.canonicalPlaceId && equivalent.has(row.canonicalPlaceId)) return false;
    return true;
  });
  return [candidate, ...kept].slice(0, max);
}
