import {db} from "../config/firebase";
import {
  projectPublicRestaurantProfileV2,
  PublicRestaurantProfileV2,
} from "../domain/merchant/publicRestaurantProfile";

const C_ALIAS = "place_migration_aliases";
const C_HEAD = "place_publication_heads";
const C_PUB = "place_publications";
const MAX_ALIAS_HOPS = 8;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function directHeadExists(placeId: string): Promise<boolean> {
  const snapshot = await db.collection(C_HEAD).doc(placeId).get();
  return snapshot.exists;
}

async function resolveCanonicalPlaceId(placeId: string): Promise<string | null> {
  if (await directHeadExists(placeId)) return placeId;

  let current = placeId;
  const seen = new Set<string>([current]);
  let canonicalId: string | null = null;

  for (let hop = 0; hop < MAX_ALIAS_HOPS; hop++) {
    const aliasDoc = await db.collection(C_ALIAS).doc(current).get();
    if (!aliasDoc.exists) break;
    const data = aliasDoc.data() ?? {};
    if (data.status === "blocked") return null;
    const next = text(data.canonicalPlaceId);
    if (!next || seen.has(next)) return null;
    canonicalId = next;
    seen.add(next);
    current = next;
    if (await directHeadExists(next)) return next;
  }

  return canonicalId;
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
  if (!clean || clean.length > 300) return null;

  const canonicalPlaceId = await resolveCanonicalPlaceId(clean);
  if (!canonicalPlaceId) return null;

  const head = await db.collection(C_HEAD).doc(canonicalPlaceId).get();
  if (!head.exists) return null;
  const activePublicationId = text(head.data()?.activePublicationId);
  if (!activePublicationId) return null;

  const publication = await db.collection(C_PUB).doc(activePublicationId).get();
  if (!publication.exists) return null;

  return projectPublicRestaurantProfileV2(publication.data(), canonicalPlaceId);
}
