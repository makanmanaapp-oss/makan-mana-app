/**
 * PROMPT 4 — pure validator for a client notification-preference write.
 *
 * SECURITY: the client may set ONLY its own preference toggles + quiet hours.
 * Unknown categories, unexpected fields, admin/critical injection, and invalid
 * quiet-hour ranges are rejected. No `isCritical`/`critical`/admin keys can ever
 * be written — critical status is server-derived from CRITICAL_TYPES, never from
 * a preference document (Part 8/26). Returns a sanitized patch to merge under
 * users/{uid}.notificationPreferences.
 */
import {USER_PREFERENCE_CATEGORIES} from "./notificationContract";

const CATEGORY_KEYS = new Set<string>(USER_PREFERENCE_CATEGORIES as readonly string[]);
const TOGGLE_KEYS = new Set(["inAppEnabled", "pushEnabled"]);
const QUIET_KEYS = new Set([
  "quietHoursEnabled", "quietHoursStart", "quietHoursEnd", "timezone",
]);

export interface PreferenceValidationResult {
  ok: boolean;
  error?: string;
  update?: Record<string, unknown>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * PROMPT 4A — the stored timezone MUST be one the server quiet-hours evaluator
 * can actually use. `localMinuteOfDay` feeds it to `Intl.DateTimeFormat`, which
 * accepts IANA ids ("Asia/Kuala_Lumpur", "UTC") and rejects abbreviations
 * ("MYT", "+08", "GMT+8"). We reject anything Intl can't consume so an
 * abbreviation can never masquerade as an IANA zone.
 */
export function isServerUsableTimezone(tz: string): boolean {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  // Require a NAMED IANA zone ("Area/Location" or "UTC"). Intl also accepts bare
  // offsets like "+08" / "GMT+8", but those are NOT DST-aware, so we reject them
  // (Part 21). Symmetric with the Dart client's platformTimezone() guard.
  if (tz !== "UTC" && !tz.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en-US", {timeZone: tz}); // throws for unknown zones
    return true;
  } catch {
    return false;
  }
}

/** {inAppEnabled?,pushEnabled?} with strictly boolean values, no extra keys. */
function validateToggleMap(v: unknown): Record<string, boolean> | null {
  if (!isPlainObject(v)) return null;
  const out: Record<string, boolean> = {};
  for (const [k, val] of Object.entries(v)) {
    if (!TOGGLE_KEYS.has(k)) return null; // unexpected field / admin injection
    if (typeof val !== "boolean") return null;
    out[k] = val;
  }
  return out;
}

function validateQuietHours(
  v: unknown,
): {ok: boolean; error?: string; value?: Record<string, unknown>} {
  if (!isPlainObject(v)) return {ok: false, error: "invalid_quiet_hours"};
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    if (!QUIET_KEYS.has(k)) return {ok: false, error: `invalid_quiet_key:${k}`};
    if (k === "quietHoursEnabled") {
      if (typeof val !== "boolean") return {ok: false, error: "invalid_quiet_enabled"};
      out[k] = val;
    } else if (k === "quietHoursStart" || k === "quietHoursEnd") {
      if (typeof val !== "number" || !Number.isInteger(val) || val < 0 || val > 1439) {
        return {ok: false, error: "invalid_quiet_minutes"};
      }
      out[k] = val;
    } else { // timezone — must be a server-usable IANA id, not an abbreviation
      if (typeof val !== "string" || !isServerUsableTimezone(val)) {
        return {ok: false, error: "invalid_timezone"};
      }
      out[k] = val;
    }
  }
  return {ok: true, value: out};
}

export function validatePreferenceUpdate(input: unknown): PreferenceValidationResult {
  if (!isPlainObject(input)) return {ok: false, error: "invalid_payload"};
  const update: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input)) {
    if (key === "schemaVersion" || key === "updatedAt") continue; // server-owned
    if (key === "master") {
      const m = validateToggleMap(val);
      if (!m) return {ok: false, error: "invalid_master"};
      update.master = m;
    } else if (key === "quietHours") {
      const q = validateQuietHours(val);
      if (!q.ok) return {ok: false, error: q.error};
      update.quietHours = q.value;
    } else if (CATEGORY_KEYS.has(key)) {
      const c = validateToggleMap(val);
      if (!c) return {ok: false, error: `invalid_category:${key}`};
      update[key] = c;
    } else {
      // unknown category, unexpected field, or admin/critical injection attempt.
      return {ok: false, error: `unknown_key:${key}`};
    }
  }
  if (Object.keys(update).length === 0) return {ok: false, error: "empty_update"};
  return {ok: true, update};
}
