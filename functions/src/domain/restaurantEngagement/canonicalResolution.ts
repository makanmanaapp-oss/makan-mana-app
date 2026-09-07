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

/**
 * GATE 3F — STRICT identity resolution for PUBLIC surfaces (the Follow button).
 *
 * Same walk as [resolveCanonicalPlaceIdWith], with ONE deliberate difference:
 * it never falls back to returning the caller's own id. Step 4 of that function
 * ("no alias mapping at all -> the id is itself canonical") is correct for
 * server flows such as unfollow, which must reach whatever id a follow was
 * stored under. It is NOT acceptable for mounting a public restaurant identity:
 * it would hand back a raw Google/provider place id and let a Follow button
 * key on it.
 *
 * Returns an id ONLY when the identity is PROVEN by authoritative data:
 *   - a publication head exists under the id (it is already canonical), or
 *   - an alias chain reaches an id that has a head, or
 *   - an alias record explicitly maps the id to a canonical id (registry
 *     mapping is proof even when that canonical has no active publication).
 *
 * Everything else — unknown id, blocked alias, cyclic or dangling chain — is
 * null, so callers fail closed and no Follow button is offered.
 */
export async function resolveProvenCanonicalPlaceIdWith(
  placeId: string,
  deps: CanonicalResolutionDeps,
  maxHops: number = MAX_ALIAS_HOPS,
): Promise<string | null> {
  const clean = typeof placeId === "string" ? placeId.trim() : "";
  if (!clean || clean.length > MAX_PLACE_ID_LENGTH) return null;

  if (await deps.headExists(clean)) return clean;

  let current = clean;
  const seen = new Set<string>([current]);
  let mapped: string | null = null;

  for (let hop = 0; hop < maxHops; hop++) {
    const alias = await deps.readAlias(current);
    if (!alias) break;
    if (alias.status === "blocked") return null;
    const next = text(alias.canonicalPlaceId);
    if (!next || seen.has(next)) return null;
    mapped = next;
    seen.add(next);
    current = next;
    if (await deps.headExists(next)) return next;
  }

  // A registry alias mapping is proof; the caller's own id never is.
  return mapped;
}
