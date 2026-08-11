// HOTFIX 4.6A — deterministic search normalization (shared by updateProfile,
// searchPeopleV2, and the backfill tool). Normalized fields are search support
// ONLY — the original displayName/username are never mutated.

/** Lowercase, trim, collapse internal whitespace. Deterministic + unicode-safe. */
export function normalizeLower(s?: string | null): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Username has no spaces; a leading @ is not part of the stored handle. */
export function normalizeUsernameLower(s?: string | null): string {
  return (s ?? "").trim().replace(/^@+/, "").toLowerCase();
}

export interface LowerUpdate {
  usernameLower?: string;
  displayNameLower?: string;
}

/**
 * Compute the minimal lower-field update for a public_profiles doc, or null when
 * already current (idempotent — repeated runs are no-ops). Never copies private
 * fields; only derives from the public username/displayName already present.
 */
export function computeLowerUpdate(
  username: string | undefined | null,
  displayName: string | undefined | null,
  existing: {usernameLower?: unknown; displayNameLower?: unknown}
): LowerUpdate | null {
  const upd: LowerUpdate = {};
  const ul = normalizeUsernameLower(username);
  if (ul && existing.usernameLower !== ul) upd.usernameLower = ul;
  const dl = normalizeLower(displayName);
  if (dl && existing.displayNameLower !== dl) upd.displayNameLower = dl;
  return Object.keys(upd).length ? upd : null;
}
