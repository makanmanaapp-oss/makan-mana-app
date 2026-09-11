import {HttpsError, onCall} from "firebase-functions/v2/https";

import {searchPublishedMakanManaPlaces} from "../services/publishedCanonicalCandidateService";

type Input = {
  query?: unknown;
  lat?: unknown;
  lng?: unknown;
  limit?: unknown;
};

function queryText(value: unknown): string {
  if (typeof value !== "string") throw new HttpsError("invalid-argument", "query_required");
  const clean = value.trim();
  if (!clean) return "";
  if (clean.length > 160) throw new HttpsError("invalid-argument", "query_too_long");
  return clean;
}

function finiteCoordinate(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined;
}

/**
 * Server-mediated search for active first-party MakanMana publications.
 * This complements Explore's local loaded-page filtering, so a newly published
 * place is discoverable by exact name without waiting for pagination/provider.
 */
export const searchCanonicalPlaces = onCall(
  {maxInstances: 10},
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
    }

    const input = (request.data ?? {}) as Input;
    const query = queryText(input.query);
    if (!query) return {status: "OK", places: []};

    const lat = finiteCoordinate(input.lat, -90, 90);
    const lng = finiteCoordinate(input.lng, -180, 180);
    const requestedLimit = typeof input.limit === "number" && Number.isFinite(input.limit)
      ? Math.trunc(input.limit)
      : 20;
    const limit = Math.max(1, Math.min(20, requestedLimit));

    const places = await searchPublishedMakanManaPlaces({
      query,
      limit,
      centerLat: lat,
      centerLng: lng,
      nowMs: Date.now(),
    });

    return {status: "OK", places};
  },
);
