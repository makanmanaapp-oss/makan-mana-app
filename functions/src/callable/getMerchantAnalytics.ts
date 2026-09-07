/**
 * WAVE 6 — Merchant Analytics read plane.
 *
 * Reuses the Wave 1/Wave 4 authority chain unchanged rather than inventing a
 * second one: resolve the alias to a canonical identity, authorize membership
 * against the RESOLVED id, and read only that restaurant's aggregates. The id
 * the caller sent is never the id we read.
 *
 * What comes back is counts, rates and a daily series. No uid, no name, no
 * email, no follower list, no location trail, no individual history — a
 * merchant learns how many people did something, never who.
 */
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db} from "../config/firebase";
import {
  MERCHANT_BRIDGE_SECRET,
  MERCHANT_ENFORCE_APP_CHECK,
  authorizeMerchantPlace,
  merchantClientRequestId,
} from "../services/merchantBridge";
import {readPublishedRestaurantProfileV2} from "../services/restaurantProfileV2ReadService";
import {normalizeCanonicalPlaceId} from "../domain/restaurantEngagement/identity";
import {
  BUSINESS_TIMEZONE,
  businessDayKey,
  dayKeysBetween,
  isDayKey,
  previousPeriod,
} from "../domain/analytics/analyticsAggregation";
import {
  ANALYTICS_DAILY_COLLECTION,
  analyticsDailyDocId,
  buildMerchantSummary,
  readCounters,
} from "../domain/analytics/analyticsDocument";
import {emptyCounters, type DailyAnalyticsCounters} from "../domain/analytics/analyticsTypes";

function input(request: {data?: unknown}): Record<string, unknown> {
  return (request.data ?? {}) as Record<string, unknown>;
}

function requireUid(request: {auth?: {uid?: string}}): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "unauthenticated");
  return uid;
}

/** Validate the requested window. An unbounded range is refused, not clamped
 * silently — a merchant should know they asked for more than we will serve. */
function resolveRange(data: Record<string, unknown>, nowMs: number) {
  const today = businessDayKey(nowMs);
  const toDay = isDayKey(data.toDay) ? data.toDay as string : today;
  let fromDay: string;
  if (isDayKey(data.fromDay)) {
    fromDay = data.fromDay as string;
  } else {
    const days = typeof data.days === "number" && Number.isFinite(data.days)
      ? Math.floor(data.days) : 30;
    if (days < 1) throw new HttpsError("invalid-argument", "range_invalid");
    fromDay = businessDayKey(nowMs - (days - 1) * 86_400_000);
  }
  try {
    const keys = dayKeysBetween(fromDay, toDay);
    return {fromDay, toDay, dayKeys: keys};
  } catch (error) {
    const code = error instanceof Error ? error.message : "range_invalid";
    throw new HttpsError("invalid-argument", code);
  }
}

/** Read the daily rows for a window. Bounded by construction: the day keys are
 * enumerated first, so this can never devolve into scanning raw events. */
async function readDays(canonicalPlaceId: string, dayKeys: string[]) {
  if (dayKeys.length === 0) return [];
  const refs = dayKeys.map((dayKey) =>
    db.collection(ANALYTICS_DAILY_COLLECTION).doc(analyticsDailyDocId(canonicalPlaceId, dayKey)));
  const snaps = await db.getAll(...refs);
  return snaps.map((snap, index) => {
    const data = snap.exists ? snap.data() ?? {} : {};
    return {
      dayKey: dayKeys[index],
      counters: snap.exists ? readCounters(data.counters) : emptyCounters(),
      distinctUserCount: typeof data.distinctUserCount === "number" ? data.distinctUserCount : 0,
      exists: snap.exists,
    };
  });
}

export const getMerchantAnalytics = onCall(
  {secrets: [MERCHANT_BRIDGE_SECRET], enforceAppCheck: MERCHANT_ENFORCE_APP_CHECK, maxInstances: 5},
  async (request) => {
    const uid = requireUid(request);
    const data = input(request);
    const requestId = merchantClientRequestId(data.requestId);

    const requested = normalizeCanonicalPlaceId(data.canonicalPlaceId);
    if (!requested) throw new HttpsError("invalid-argument", "canonical_place_id_required");

    const profile = await readPublishedRestaurantProfileV2(requested);
    if (!profile) throw new HttpsError("not-found", "restaurant_not_published");

    const auth = await authorizeMerchantPlace(uid, profile.canonicalPlaceId, requestId);
    if (!auth.authorized) {
      throw new HttpsError("permission-denied", "merchant_place_access_required");
    }
    const canonicalPlaceId = auth.canonicalPlaceId;

    const nowMs = Date.now();
    const range = resolveRange(data, nowMs);
    const days = await readDays(canonicalPlaceId, range.dayKeys);
    const hasAnyHistory = days.some((d) => d.exists);

    // The comparison window is only fetched when the caller wants it, so the
    // common case stays one bounded read.
    let previous: {
      fromDay: string;
      toDay: string;
      days: Array<{counters: DailyAnalyticsCounters}>;
    } | null = null;
    if (data.compare !== false) {
      const prev = previousPeriod(range.fromDay, range.toDay);
      try {
        const prevDays = await readDays(canonicalPlaceId, dayKeysBetween(prev.fromDay, prev.toDay));
        if (prevDays.some((d) => d.exists)) {
          previous = {fromDay: prev.fromDay, toDay: prev.toDay, days: prevDays};
        }
      } catch {
        previous = null;
      }
    }

    const summary = buildMerchantSummary({
      canonicalPlaceId,
      fromDay: range.fromDay,
      toDay: range.toDay,
      timezone: BUSINESS_TIMEZONE,
      days,
      previous,
      hasAnyHistory,
    });

    return {
      status: "OK",
      // The display name comes from the published profile, which is already a
      // public projection. No merchant/user identifier is echoed.
      restaurantName: profile.name,
      ...summary,
    };
  },
);
