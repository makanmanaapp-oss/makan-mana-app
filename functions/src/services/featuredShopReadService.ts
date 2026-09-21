/**
 * FEATURED SHOP BANNER — resolving shop identity at READ time.
 *
 * WHY READ TIME AND NOT ONLY WRITE TIME. The admin bridge already proves a
 * canonical id when an operator saves a banner. That proof is about the moment
 * of saving. A restaurant can be merged, blocked or taken down WEEKS after a
 * banner goes live, and a banner scheduled for next month is validated today.
 * If identity were resolved only on write, the app would keep promoting a shop
 * that no longer exists — which is exactly the "unavailable, hidden or deleted
 * shops cannot be promoted as active destinations" rule. So the proof runs
 * again on every read, and a shop that cannot be proven right now simply does
 * not appear.
 *
 * Fail-closed is the whole design: every failure path here yields "no shop",
 * and the caller drops the banner. A featured-shop banner with no shop is not
 * a degraded banner, it is a false one.
 */

import {db} from "../config/firebase";
import {
  toFeaturedShop,
  type FeaturedShop,
} from "../domain/cms/featuredShop";
import {resolveProvenCanonicalRestaurantPlaceId} from "./restaurantProfileV2ReadService";

const C_DETAILS = "place_details";

/**
 * Most shops resolved for one request.
 *
 * A collection may hold up to 30 restaurants, but a carousel that a person
 * actually swipes through is far shorter, and every extra shop costs two reads
 * (identity proof + details). The cap is therefore a real product limit, not a
 * hidden truncation: callers are told how many were dropped so the number can
 * be reported rather than silently lost.
 */
export const FEATURED_SHOP_RESOLVE_LIMIT = 12;

export interface FeaturedShopResolution {
  /** Keyed by the id as STORED on the banner, so a caller can map back. */
  shops: Map<string, FeaturedShop>;
  /** Ids that could not be proven or presented. Never silently ignored. */
  unresolved: string[];
  /** How many ids were not attempted because of the cap. */
  skippedOverLimit: number;
}

/**
 * Prove and project a batch of canonical ids.
 *
 * Order is preserved for the caller's benefit, duplicates are collapsed, and
 * the whole thing degrades to "no shops" rather than throwing: a CMS failure
 * must never break the screen it sits on.
 */
export async function readFeaturedShops(
  canonicalPlaceIds: readonly string[],
  limit: number = FEATURED_SHOP_RESOLVE_LIMIT,
): Promise<FeaturedShopResolution> {
  const empty: FeaturedShopResolution = {
    shops: new Map(), unresolved: [], skippedOverLimit: 0,
  };

  const wanted: string[] = [];
  for (const raw of canonicalPlaceIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || wanted.includes(id)) continue;
    wanted.push(id);
  }
  if (wanted.length === 0) return empty;

  const attempted = wanted.slice(0, Math.max(0, limit));
  const skippedOverLimit = wanted.length - attempted.length;

  try {
    // 1. Prove identity. An id that cannot be proven right now is dropped here
    //    and never reaches a details read.
    const proven = await Promise.all(
      attempted.map(async (storedId) => ({
        storedId,
        provenId: await resolveProvenCanonicalRestaurantPlaceId(storedId),
      })),
    );

    const resolvable = proven.filter(
      (p): p is {storedId: string; provenId: string} => !!p.provenId,
    );
    const unresolved = proven.filter((p) => !p.provenId).map((p) => p.storedId);

    if (resolvable.length === 0) {
      return {shops: new Map(), unresolved, skippedOverLimit};
    }

    // 2. One batched read for the details, not one per shop.
    const refs = resolvable.map((p) => db.collection(C_DETAILS).doc(p.provenId));
    const snaps = await db.getAll(...refs);

    const shops = new Map<string, FeaturedShop>();
    snaps.forEach((snap, i) => {
      const {storedId, provenId} = resolvable[i];
      const shop = snap.exists
        ? toFeaturedShop(provenId, snap.data() as Record<string, unknown>)
        : null;
      // A proven identity with no presentable details is still not showable:
      // a card needs a name. It joins the unresolved list rather than
      // rendering as a blank.
      if (shop) shops.set(storedId, shop);
      else unresolved.push(storedId);
    });

    return {shops, unresolved, skippedOverLimit};
  } catch (error) {
    console.error("readFeaturedShops failed", {
      count: attempted.length,
      message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    // Degrade to "no shops today", never to a half-true card.
    return {shops: new Map(), unresolved: attempted, skippedOverLimit};
  }
}
