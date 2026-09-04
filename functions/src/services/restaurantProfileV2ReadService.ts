import {db} from "../config/firebase";
import {
  projectPublicRestaurantProfileV2,
  PublicRestaurantProfileV2,
} from "../domain/merchant/publicRestaurantProfile";
import {
  MAX_PLACE_ID_LENGTH,
  resolveCanonicalPlaceIdWith,
  type CanonicalResolutionDeps,
} from "../domain/restaurantEngagement/canonicalResolution";

const C_ALIAS = "place_migration_aliases";
const C_HEAD = "place_publication_heads";
const C_PUB = "place_publications";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const resolutionDeps: CanonicalResolutionDeps = {
  headExists: async (placeId) => (await db.collection(C_HEAD).doc(placeId).get()).exists,
  readAlias: async (placeId) => {
    const snapshot = await db.collection(C_ALIAS).doc(placeId).get();
    return snapshot.exists ? (snapshot.data() ?? {}) : null;
  },
};

/**
 * SERVER-ONLY canonical restaurant identity resolver.
 *
 * Resolves direct canonical ids and supported alias chains (retaining
 * cycle/blocked protection) and — unlike readPublishedRestaurantProfileV2 —
 * does NOT require an active publication. Server flows that must remain correct
 * for an unpublished restaurant (unfollow) use this so they always target the
 * identity a follow was stored under, never an alias-scoped id.
 *
 * This is never exported to Flutter/clients; only server callables import it.
 */
export async function resolveCanonicalRestaurantPlaceId(placeId: string): Promise<string | null> {
  const clean = typeof placeId === "string" ? placeId.trim() : "";
  if (!clean || clean.length > MAX_PLACE_ID_LENGTH) return null;
  return resolveCanonicalPlaceIdWith(clean, resolutionDeps);
}

/**
 * Server-only Restaurant Profile V2 reader.
 *
 * The mobile client never reads canonical publication collections directly.
 * This service resolves a provider/canonical identifier, follows only the
 * active publication head and returns a strict public-safe projection.
 */
export async function readPublishedRestaurantProfileV2(
  placeId: string,
): Promise<PublicRestaurantProfileV2 | null> {
  const clean = placeId.trim();
  if (!clean || clean.length > MAX_PLACE_ID_LENGTH) return null;

  const canonicalPlaceId = await resolveCanonicalRestaurantPlaceId(clean);
  if (!canonicalPlaceId) return null;

  // UNCHANGED public contract: an ACTIVE, published publication is still
  // mandatory here. Canonical resolution alone never yields a public profile.
  const head = await db.collection(C_HEAD).doc(canonicalPlaceId).get();
  if (!head.exists) return null;
  const activePublicationId = text(head.data()?.activePublicationId);
  if (!activePublicationId) return null;

  const publication = await db.collection(C_PUB).doc(activePublicationId).get();
  if (!publication.exists) return null;

  return projectPublicRestaurantProfileV2(publication.data(), canonicalPlaceId);
}
