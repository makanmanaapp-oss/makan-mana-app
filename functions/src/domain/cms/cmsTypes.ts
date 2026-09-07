/**
 * WAVE 5 — CMS & Discovery vocabulary.
 *
 * Reuses the Wave 4 promotion lifecycle shape on purpose: stored status is
 * intent, effective status is derived from the schedule. Two content systems
 * with two different definitions of "live" would be a bug waiting to happen.
 *
 * A CMS banner is EDITORIAL content authored by MakanMana. It is not a
 * merchant promotion (Wave 4, authored by the restaurant and addressed by
 * canonicalPlaceId) and not a coupon (billing). All three can coexist on a
 * screen; none of them is the others.
 */

export const CMS_COLLECTION = "cms_content";
export const CMS_COLLECTIONS_COLLECTION = "cms_collections";

// ── PLACEMENT ──────────────────────────────────────────────────────────────

/**
 * Surfaces the app can ACTUALLY render today. Adding a value here without a
 * renderer would let an operator schedule content that silently never appears,
 * so this list is the app's capability, not a wishlist.
 *
 *  home_top          — above the mood picker, under the local hero
 *  home_mid          — between the recommendation and the nearby list
 *  explore_top       — under the Explore search field
 *  restaurant_detail — inside the Profil tab of canonical Restaurant Detail
 */
export const PLACEMENT_HOME_TOP = "home_top";
export const PLACEMENT_HOME_MID = "home_mid";
export const PLACEMENT_EXPLORE_TOP = "explore_top";
export const PLACEMENT_RESTAURANT_DETAIL = "restaurant_detail";

export const CMS_PLACEMENTS = [
  PLACEMENT_HOME_TOP,
  PLACEMENT_HOME_MID,
  PLACEMENT_EXPLORE_TOP,
  PLACEMENT_RESTAURANT_DETAIL,
] as const;

export type CmsPlacement = (typeof CMS_PLACEMENTS)[number];

export function isCmsPlacement(value: unknown): value is CmsPlacement {
  return typeof value === "string" && (CMS_PLACEMENTS as readonly string[]).includes(value);
}

// ── STATUS ─────────────────────────────────────────────────────────────────

export const CMS_STATUS_DRAFT = "draft";
export const CMS_STATUS_SCHEDULED = "scheduled";
export const CMS_STATUS_ACTIVE = "active";
export const CMS_STATUS_PAUSED = "paused";
export const CMS_STATUS_EXPIRED = "expired";
export const CMS_STATUS_ARCHIVED = "archived";

export const CMS_STATUSES = [
  CMS_STATUS_DRAFT,
  CMS_STATUS_SCHEDULED,
  CMS_STATUS_ACTIVE,
  CMS_STATUS_PAUSED,
  CMS_STATUS_EXPIRED,
  CMS_STATUS_ARCHIVED,
] as const;

export type CmsStatus = (typeof CMS_STATUSES)[number];

export function isCmsStatus(value: unknown): value is CmsStatus {
  return typeof value === "string" && (CMS_STATUSES as readonly string[]).includes(value);
}

/** Statuses an operator may command. Expiry is derived, never written. */
export const CMS_SETTABLE_STATUSES: CmsStatus[] = [
  CMS_STATUS_DRAFT,
  CMS_STATUS_SCHEDULED,
  CMS_STATUS_ACTIVE,
  CMS_STATUS_PAUSED,
  CMS_STATUS_ARCHIVED,
];

// ── TARGETING ──────────────────────────────────────────────────────────────

/**
 * Targeting is an EXPLICIT allowlist of non-sensitive attributes the app
 * already resolves for other reasons. There is no free-form rule engine, so
 * a sensitive trait cannot be expressed even by accident.
 *
 *  all       — everyone
 *  language  — the app language the user chose
 *  region    — Malaysian state, already resolved for the Home local hero
 *  plan      — the existing entitlement vocabulary
 */
export const TARGET_ALL = "all";
export const TARGET_LANGUAGE = "language";
export const TARGET_REGION = "region";
export const TARGET_PLAN = "plan";

export const CMS_TARGET_KINDS = [
  TARGET_ALL, TARGET_LANGUAGE, TARGET_REGION, TARGET_PLAN,
] as const;
export type CmsTargetKind = (typeof CMS_TARGET_KINDS)[number];

export const SUPPORTED_LANGUAGES = ["ms", "en", "zh", "ta"] as const;
export const SUPPORTED_PLANS = ["free", "plus", "pro"] as const;

/**
 * The states the app can resolve. Same list the Home local hero uses, so
 * targeting can never name a region the client cannot report.
 */
export const SUPPORTED_REGIONS = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
  "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Selangor",
  "Terengganu", "Kuala Lumpur", "Labuan", "Putrajaya",
] as const;

export interface CmsTargeting {
  kind: CmsTargetKind;
  /** Allowlisted values for the chosen kind. Empty for `all`. */
  values: string[];
}

export const DEFAULT_TARGETING: CmsTargeting = {kind: TARGET_ALL, values: []};

// ── CTA ────────────────────────────────────────────────────────────────────

/**
 * A CTA destination is either an internal app route or an https URL. Anything
 * that could execute, read local files or hand off to another app is refused:
 * a CMS row is operator-authored content, not a place to smuggle behaviour.
 */
export const FORBIDDEN_URL_SCHEMES = [
  "javascript:", "data:", "file:", "intent:", "content:", "blob:",
  "vbscript:", "about:", "tel:", "sms:", "market:", "app:",
] as const;

/** Internal routes a CTA may open. Matches RoutePaths the app really has. */
export const ALLOWED_INTERNAL_ROUTE_PREFIXES = [
  "/home", "/explore", "/history", "/profile", "/social", "/groups",
  "/restaurant/", "/paywall", "/pro", "/fit/", "/favorites", "/taste",
  "/meal-wallet", "/settings", "/coupon",
] as const;

// ── MEDIA ──────────────────────────────────────────────────────────────────

export const ALLOWED_MEDIA_CONTENT_TYPES = [
  "image/jpeg", "image/png", "image/webp",
] as const;

export const MEDIA_MAX_BYTES = 2 * 1024 * 1024;
export const MEDIA_MIN_WIDTH = 320;
export const MEDIA_MAX_WIDTH = 4096;
export const MEDIA_MIN_HEIGHT = 120;
export const MEDIA_MAX_HEIGHT = 4096;

/**
 * Media must live under the storage prefix this domain owns, so a CMS row can
 * never point at another feature's private object by path alone.
 */
export const MEDIA_STORAGE_PREFIX = "cms/";

// ── FIELD LIMITS ───────────────────────────────────────────────────────────

export const CMS_TITLE_MAX = 80;
export const CMS_SUBTITLE_MAX = 160;
export const CMS_BODY_MAX = 400;
export const CMS_CTA_LABEL_MAX = 40;
export const CMS_ALT_TEXT_MAX = 160;
export const CMS_DESTINATION_MAX = 500;

/** Most banners one placement may render at once. */
export const PLACEMENT_RENDER_LIMIT = 3;

/** Hard ceiling on how far ahead content may be scheduled (2 years). */
export const CMS_MAX_WINDOW_MS = 2 * 365 * 24 * 60 * 60 * 1000;

// ── COLLECTIONS ────────────────────────────────────────────────────────────

export const COLLECTION_TITLE_MAX = 80;
export const COLLECTION_DESCRIPTION_MAX = 240;
export const COLLECTION_MAX_RESTAURANTS = 30;
