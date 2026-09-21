/**
 * FEATURED SHOP BANNER — shop identity for CMS banners. PURE.
 *
 * A CMS banner is operator-authored text. A FEATURED SHOP banner additionally
 * claims to be about a specific, real restaurant, so the parts a customer uses
 * to recognise that restaurant — its name, its picture, where it is, what it is
 * rated — must come from the registry, never from the operator's keyboard.
 *
 * WHY THIS IS NOT JUST "SHOW THE TITLE FIELD". An operator can type anything
 * into `title`. Typing "Warung Pak Din" does not make the banner about Warung
 * Pak Din: it makes it a banner that SAYS "Warung Pak Din" while linking
 * wherever the destination field happens to point. The owner's rule is
 * explicit — never invent a restaurant name, rating, distance, opening status
 * or image — and the only durable way to honour it is to make the invented
 * version unrepresentable. Hence this projection: the operator supplies the
 * PITCH (headline, promo copy, CTA label); the registry supplies the IDENTITY.
 *
 * Deliberately absent: `isOpen`, `distanceKm`, `priceLevel`, opening hours.
 * `place_details` does not carry opening hours or business status at all
 * (verified against the production schema in trustedSourceMapping.ts), and
 * distance is meaningless here because a CMS read has no location context.
 * They are not nullable fields — there is nowhere to put them, so a later edit
 * cannot quietly start filling them in.
 */

import {
  PLACEMENT_EXPLORE_TOP,
  PLACEMENT_HOME_MID,
  PLACEMENT_HOME_TOP,
} from "./cmsTypes";

/** Longest shop name a banner will carry. Longer names are cut, never dropped. */
export const FEATURED_SHOP_NAME_MAX = 80;

/** Longest address a banner will carry. */
export const FEATURED_SHOP_ADDRESS_MAX = 160;

/**
 * The registry-owned identity of a featured shop.
 *
 * Every field is either proven or null. There is no "unknown" that renders as
 * something plausible.
 */
export interface FeaturedShop {
  canonicalPlaceId: string;
  /** From the registry. Never the id, never operator text. */
  name: string;
  /** A real https photo, or null — the card then draws a monogram. */
  photoUrl: string | null;
  address: string | null;
  /** Non-null ONLY when a rating and a review count both exist. */
  rating: number | null;
  ratingCount: number | null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Whether a placement may carry a featured shop.
 *
 * `restaurant_detail` is excluded ON PURPOSE. There, `canonicalPlaceId` already
 * means "only show this banner on that restaurant's page" — it is a SCOPE. If
 * it also meant "feature this shop", every banner already stored would change
 * meaning the moment this shipped, and a scoped banner would start rendering a
 * shop card on the very page that shop already owns.
 */
export function isFeaturedShopPlacement(placement: unknown): boolean {
  return placement === PLACEMENT_HOME_TOP ||
    placement === PLACEMENT_HOME_MID ||
    placement === PLACEMENT_EXPLORE_TOP;
}

/**
 * A photo is rendered directly as an image, so only a well-formed https URL is
 * accepted. Everything else becomes null and the card falls back to a monogram
 * — the same fallback the Explore list already uses for photo-less places.
 */
function photoUrlOf(value: unknown): string | null {
  const raw = str(value);
  if (!raw || /\s/.test(raw)) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (!parsed.hostname) return null;
  return raw;
}

/**
 * Project a `place_details` document into a featured shop.
 *
 * Returns null when the place cannot be presented honestly — no document, no
 * id, or no name. A caller that gets null must drop the banner rather than
 * render a nameless one.
 *
 * Field names follow the PRODUCTION schema, verified in
 * `places/corrections/trustedSourceMapping.ts`:
 *   { displayName, photoUrl, formattedAddress, rating, userRatingCount, ... }
 * The legacy `name` / `title` / `formatted_address` spellings are accepted for
 * older rows, exactly as that resolver does.
 */
export function toFeaturedShop(
  canonicalPlaceId: string,
  data: Record<string, unknown> | null | undefined,
): FeaturedShop | null {
  const id = str(canonicalPlaceId);
  if (!id || !data) return null;

  // No fallback to the id. A `PLC-…` on a customer's Home screen dressed up as
  // a restaurant name is precisely the dishonesty this whole module prevents.
  const name = str(data.displayName) || str(data.name) || str(data.title);
  if (!name) return null;

  const rating = num(data.rating);
  const ratingCount = num(data.userRatingCount);
  // Same rule as the trusted-snapshot resolver: a score with nothing behind it
  // is not a rating, and a review count with no score is not one either.
  const ratingShown = rating !== null && rating > 0 &&
    ratingCount !== null && ratingCount > 0;

  const address = str(data.formattedAddress) ||
    str(data.formatted_address) ||
    str(data.address);

  return {
    canonicalPlaceId: id,
    name: clip(name, FEATURED_SHOP_NAME_MAX),
    photoUrl: photoUrlOf(data.photoUrl),
    address: address ? clip(address, FEATURED_SHOP_ADDRESS_MAX) : null,
    rating: ratingShown ? rating : null,
    ratingCount: ratingShown ? ratingCount : null,
  };
}

/**
 * The in-app destination for a featured shop.
 *
 * Derived from the PROVEN canonical id, never from the operator's destination
 * field, so a banner can never name one shop and open another. Returns null for
 * an id that cannot sit in a path segment — such an id would silently produce a
 * route that matches nothing, and a CTA that goes nowhere is worse than no CTA.
 */
export function shopDestinationFor(canonicalPlaceId: string): string | null {
  const id = str(canonicalPlaceId);
  if (!id) return null;
  // The router matches `/restaurant/:placeId`, one segment. Anything that ends
  // the segment early, starts a query or a fragment, or is simply not safe to
  // interpolate is refused rather than escaped.
  if (!/^[A-Za-z0-9_.:~-]+$/.test(id)) return null;
  return `/restaurant/${id}`;
}
