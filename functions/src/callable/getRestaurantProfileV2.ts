import {HttpsError, onCall} from "firebase-functions/v2/https";

import {readPublishedRestaurantProfileV2} from "../services/restaurantProfileV2ReadService";

type Input = {
  placeId?: unknown;
};

function requirePlaceId(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "place_id_required");
  }
  const clean = value.trim();
  if (!clean) throw new HttpsError("invalid-argument", "place_id_required");
  if (clean.length > 300) throw new HttpsError("invalid-argument", "place_id_too_long");
  return clean;
}

/**
 * Read-only Restaurant Profile V2 boundary.
 *
 * Returns only an ACTIVE, published, public-safe canonical projection. Raw
 * publication documents remain server-only under Firestore rules. A missing,
 * unpublished, blocked or incompatible publication returns `profile: null` so
 * Flutter can preserve the existing legacy detail fallback.
 */
export const getRestaurantProfileV2 = onCall(
  {maxInstances: 10},
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
    }

    const data = (request.data ?? {}) as Input;
    const placeId = requirePlaceId(data.placeId);

    try {
      const profile = await readPublishedRestaurantProfileV2(placeId);
      return {
        ok: true,
        profile,
        dataSource: profile ? "canonical_publication" : "legacy_fallback",
      };
    } catch (error) {
      console.error("getRestaurantProfileV2 failed", {
        placeId: placeId.slice(0, 120),
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });
      // Canonical read failures must not make the existing restaurant detail
      // unusable. No internal error or collection state is returned to client.
      return {
        ok: true,
        profile: null,
        dataSource: "legacy_fallback",
      };
    }
  },
);
