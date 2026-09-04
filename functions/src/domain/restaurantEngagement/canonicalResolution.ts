/**
 * Wave 3B — PURE canonical restaurant-identity resolution.
 *
 * Resolves a provider/alias identifier to the canonical place id WITHOUT
 * requiring an active publication, so server flows that must keep working for an
 * unpublished restaurant (e.g. unfollow) can still reach the identity a follow
 * was stored under. Alias-cycle and blocked-alias protections are retained.
 *
 * The Firestore lookups are injected, so this is unit-testable and contains no
 * client-reachable surface. The server-only wrapper lives in
 * services/restaurantProfileV2ReadService.ts.
 */

export const MAX_ALIAS_HOPS = 8;
export const MAX_PLACE_ID_LENGTH = 300;

export interface CanonicalAliasRecord {
  status?: unknown;
  canonicalPlaceId?: unknown;
}

export interface CanonicalResolutionDeps {
  /** True when a publication HEAD document exists for this id (proves canonical). */
  headExists(placeId: string): Promise<boolean>;
  /** The alias record for this id, or null when no alias mapping exists. */
  readAlias(placeId: string): Promise<CanonicalAliasRecord | null>;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Resolution order:
 *  1. a publication head under the id  → the id is already canonical
 *  2. walk the alias chain (bounded hops)
 *       - blocked alias           → null (fail closed)
 *       - missing target or cycle → null (fail closed)
 *       - head found on a hop     → that id
 *  3. followed ≥1 alias hop with no head → the last mapped id is still the
 *     canonical identity (restaurant simply has no active publication)
 *  4. no alias mapping at all → the id is itself a canonical identity that
 *     currently has no publication head
 *
 * Returns null ONLY for genuinely unresolvable input (empty/oversized, blocked
 * or cyclic alias chains) so callers can fail closed.
 */
export async function resolveCanonicalPlaceIdWith(
  placeId: string,
  deps: CanonicalResolutionDeps,
  maxHops: number = MAX_ALIAS_HOPS,
): Promise<string | null> {
  const clean = typeof placeId === "string" ? placeId.trim() : "";
  if (!clean || clean.length > MAX_PLACE_ID_LENGTH) return null;

  if (await deps.headExists(clean)) return clean;

  let current = clean;
  const seen = new Set<string>([current]);
  let canonicalId: string | null = null;

  for (let hop = 0; hop < maxHops; hop++) {
    const alias = await deps.readAlias(current);
    if (!alias) break;
    if (alias.status === "blocked") return null;
    const next = text(alias.canonicalPlaceId);
    if (!next || seen.has(next)) return null;
    canonicalId = next;
    seen.add(next);
    current = next;
    if (await deps.headExists(next)) return next;
  }

  return canonicalId ?? clean;
}
