/**
 * WAVE 5 — PURE CMS lifecycle, targeting, CTA safety and media governance.
 *
 * No I/O and no ambient clock: `now` is always passed in. That is what lets the
 * server be the only authority on whether a banner is live, and what keeps a
 * device with a wrong clock from revealing scheduled content.
 *
 * The lifecycle intentionally matches Wave 4 promotions: stored status is
 * intent, effective status is derived from the schedule. One definition of
 * "live" across both content systems.
 */
import {
  ALLOWED_INTERNAL_ROUTE_PREFIXES,
  ALLOWED_MEDIA_CONTENT_TYPES,
  CMS_ALT_TEXT_MAX,
  CMS_BODY_MAX,
  CMS_CTA_LABEL_MAX,
  CMS_DESTINATION_MAX,
  CMS_MAX_WINDOW_MS,
  CMS_SETTABLE_STATUSES,
  CMS_STATUS_ACTIVE,
  CMS_STATUS_ARCHIVED,
  CMS_STATUS_DRAFT,
  CMS_STATUS_EXPIRED,
  CMS_STATUS_PAUSED,
  CMS_STATUS_SCHEDULED,
  CMS_SUBTITLE_MAX,
  CMS_TITLE_MAX,
  DEFAULT_TARGETING,
  FORBIDDEN_URL_SCHEMES,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_HEIGHT,
  MEDIA_MAX_WIDTH,
  MEDIA_MIN_HEIGHT,
  MEDIA_MIN_WIDTH,
  MEDIA_STORAGE_PREFIX,
  SUPPORTED_LANGUAGES,
  SUPPORTED_PLANS,
  SUPPORTED_REGIONS,
  TARGET_ALL,
  TARGET_LANGUAGE,
  TARGET_PLAN,
  TARGET_REGION,
  isCmsPlacement,
  isCmsStatus,
  type CmsPlacement,
  type CmsStatus,
  type CmsTargeting,
} from "./cmsTypes";

// ── EFFECTIVE STATUS ───────────────────────────────────────────────────────

export function effectiveCmsStatus(
  stored: CmsStatus,
  startsAtMs: number | null,
  endsAtMs: number | null,
  nowMs: number,
): CmsStatus {
  if (stored === CMS_STATUS_DRAFT) return CMS_STATUS_DRAFT;
  if (stored === CMS_STATUS_ARCHIVED) return CMS_STATUS_ARCHIVED;
  if (stored === CMS_STATUS_EXPIRED) return CMS_STATUS_EXPIRED;
  if (endsAtMs !== null && nowMs >= endsAtMs) return CMS_STATUS_EXPIRED;
  if (stored === CMS_STATUS_PAUSED) return CMS_STATUS_PAUSED;
  if (startsAtMs !== null && nowMs < startsAtMs) return CMS_STATUS_SCHEDULED;
  return CMS_STATUS_ACTIVE;
}

/** Public visibility is exactly one effective status. Nothing else renders. */
export function isCmsPubliclyVisible(
  stored: CmsStatus,
  startsAtMs: number | null,
  endsAtMs: number | null,
  nowMs: number,
): boolean {
  return effectiveCmsStatus(stored, startsAtMs, endsAtMs, nowMs) === CMS_STATUS_ACTIVE;
}

// ── TRANSITIONS ────────────────────────────────────────────────────────────

const TRANSITIONS: Record<CmsStatus, readonly CmsStatus[]> = {
  [CMS_STATUS_DRAFT]: [CMS_STATUS_SCHEDULED, CMS_STATUS_ACTIVE, CMS_STATUS_ARCHIVED],
  [CMS_STATUS_SCHEDULED]: [CMS_STATUS_ACTIVE, CMS_STATUS_PAUSED, CMS_STATUS_DRAFT, CMS_STATUS_ARCHIVED],
  [CMS_STATUS_ACTIVE]: [CMS_STATUS_PAUSED, CMS_STATUS_ARCHIVED],
  [CMS_STATUS_PAUSED]: [CMS_STATUS_ACTIVE, CMS_STATUS_ARCHIVED],
  [CMS_STATUS_EXPIRED]: [CMS_STATUS_ARCHIVED],
  [CMS_STATUS_ARCHIVED]: [],
};

export interface CmsTransitionDecision {
  ok: boolean;
  next: CmsStatus | null;
  reason: string;
}

export function decideCmsTransition(input: {
  stored: CmsStatus;
  startsAtMs: number | null;
  endsAtMs: number | null;
  requested: unknown;
  nowMs: number;
}): CmsTransitionDecision {
  if (!isCmsStatus(input.requested)) return {ok: false, next: null, reason: "status_invalid"};
  if (!CMS_SETTABLE_STATUSES.includes(input.requested)) {
    return {ok: false, next: null, reason: "status_not_settable"};
  }
  const current = effectiveCmsStatus(input.stored, input.startsAtMs, input.endsAtMs, input.nowMs);
  if (current === input.requested) return {ok: false, next: null, reason: "status_unchanged"};
  if (!TRANSITIONS[current].includes(input.requested)) {
    return {ok: false, next: null, reason: `transition_not_allowed_${current}_to_${input.requested}`};
  }
  if (input.requested === CMS_STATUS_ACTIVE && input.endsAtMs !== null && input.nowMs >= input.endsAtMs) {
    return {ok: false, next: null, reason: "window_already_closed"};
  }
  return {ok: true, next: input.requested, reason: "ok"};
}

// ── VALIDATION ─────────────────────────────────────────────────────────────

export interface Validated<T> {
  ok: boolean;
  value: T | null;
  error: string;
}

function fail<T>(error: string): Validated<T> {
  return {ok: false, value: null, error};
}

function text(value: unknown, max: number, field: string, required: boolean): Validated<string> {
  if (value === undefined || value === null) {
    return required ? fail(`${field}_required`) : {ok: true, value: "", error: ""};
  }
  if (typeof value !== "string") return fail(`${field}_invalid`);
  const clean = value.trim();
  if (!clean) return required ? fail(`${field}_required`) : {ok: true, value: "", error: ""};
  if (clean.length > max) return fail(`${field}_too_long`);
  // Raw markup is refused outright: a CMS field is text, never a document.
  if (/[<>]/.test(clean)) return fail(`${field}_markup_not_allowed`);
  return {ok: true, value: clean, error: ""};
}

export function validateCmsTitle(value: unknown) {
  return text(value, CMS_TITLE_MAX, "title", true);
}
export function validateCmsSubtitle(value: unknown) {
  return text(value, CMS_SUBTITLE_MAX, "subtitle", false);
}
export function validateCmsBody(value: unknown) {
  return text(value, CMS_BODY_MAX, "body", false);
}
export function validateCtaLabel(value: unknown) {
  return text(value, CMS_CTA_LABEL_MAX, "cta_label", false);
}
export function validateAltText(value: unknown) {
  return text(value, CMS_ALT_TEXT_MAX, "alt_text", false);
}

export function validateCmsPlacement(value: unknown): Validated<CmsPlacement> {
  if (!isCmsPlacement(value)) return fail("placement_invalid");
  return {ok: true, value, error: ""};
}

export function validatePriority(value: unknown): Validated<number> {
  if (value === undefined || value === null) return {ok: true, value: 100, error: ""};
  if (typeof value !== "number" || !Number.isInteger(value)) return fail("priority_invalid");
  if (value < 0 || value > 10_000) return fail("priority_out_of_range");
  return {ok: true, value, error: ""};
}

export function toMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export interface CmsWindow {
  startsAtMs: number;
  endsAtMs: number;
}

export function validateCmsWindow(
  startsAt: unknown, endsAt: unknown, nowMs: number,
): Validated<CmsWindow> {
  const start = toMillis(startsAt);
  const end = toMillis(endsAt);
  if (start === null) return fail("starts_at_required");
  if (end === null) return fail("ends_at_required");
  if (end <= start) return fail("window_invalid");
  if (end - start > CMS_MAX_WINDOW_MS) return fail("window_too_long");
  if (end <= nowMs) return fail("window_already_closed");
  return {ok: true, value: {startsAtMs: start, endsAtMs: end}, error: ""};
}

// ── CTA SAFETY ─────────────────────────────────────────────────────────────

/**
 * A destination is an internal route OR a plain https URL, and nothing else.
 *
 * The scheme check runs on the LOWERCASED, whitespace-stripped value, because
 * "Java\nscript:alert(1)" and "JAVASCRIPT:" are the same attack wearing a hat.
 */
export function validateCtaDestination(value: unknown): Validated<string> {
  if (value === undefined || value === null) return {ok: true, value: "", error: ""};
  if (typeof value !== "string") return fail("cta_destination_invalid");
  const clean = value.trim();
  if (!clean) return {ok: true, value: "", error: ""};
  if (clean.length > CMS_DESTINATION_MAX) return fail("cta_destination_too_long");

  const collapsed = clean.replace(/[\s -]/g, "").toLowerCase();
  for (const scheme of FORBIDDEN_URL_SCHEMES) {
    if (collapsed.startsWith(scheme)) return fail("cta_scheme_not_allowed");
  }
  // Anything with a scheme separator that is not https is refused, so an
  // unknown custom scheme fails closed instead of being passed to the OS.
  if (collapsed.includes(":") && !collapsed.startsWith("https://")) {
    return fail("cta_scheme_not_allowed");
  }

  if (clean.startsWith("/")) {
    const allowed = ALLOWED_INTERNAL_ROUTE_PREFIXES.some((prefix) => clean.startsWith(prefix));
    if (!allowed) return fail("cta_route_not_allowed");
    return {ok: true, value: clean, error: ""};
  }

  if (!clean.toLowerCase().startsWith("https://")) return fail("cta_scheme_not_allowed");
  return {ok: true, value: clean, error: ""};
}

// ── MEDIA GOVERNANCE ───────────────────────────────────────────────────────

export interface CmsMedia {
  storagePath: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  altText: string;
}

/**
 * Media is described by metadata the uploader already had to produce. The path
 * must sit under the prefix this domain owns, so a CMS row cannot point at
 * another feature's object, and traversal is refused outright.
 */
export function validateCmsMedia(value: unknown): Validated<CmsMedia | null> {
  if (value === undefined || value === null) return {ok: true, value: null, error: ""};
  if (typeof value !== "object" || Array.isArray(value)) return fail("media_invalid");
  const raw = value as Record<string, unknown>;

  const path = typeof raw.storagePath === "string" ? raw.storagePath.trim() : "";
  if (!path) return fail("media_path_required");
  if (!path.startsWith(MEDIA_STORAGE_PREFIX)) return fail("media_path_not_allowed");
  if (path.includes("..") || path.includes("//")) return fail("media_path_not_allowed");

  const contentType = typeof raw.contentType === "string" ? raw.contentType.trim().toLowerCase() : "";
  if (!(ALLOWED_MEDIA_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    return fail("media_type_not_allowed");
  }

  const byteSize = typeof raw.byteSize === "number" ? raw.byteSize : NaN;
  if (!Number.isInteger(byteSize) || byteSize <= 0) return fail("media_size_invalid");
  if (byteSize > MEDIA_MAX_BYTES) return fail("media_too_large");

  const width = typeof raw.width === "number" ? raw.width : NaN;
  const height = typeof raw.height === "number" ? raw.height : NaN;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return fail("media_dimensions_invalid");
  if (width < MEDIA_MIN_WIDTH || width > MEDIA_MAX_WIDTH) return fail("media_dimensions_invalid");
  if (height < MEDIA_MIN_HEIGHT || height > MEDIA_MAX_HEIGHT) return fail("media_dimensions_invalid");

  const alt = validateAltText(raw.altText);
  if (!alt.ok) return fail(alt.error);

  return {
    ok: true,
    value: {storagePath: path, contentType, byteSize, width, height, altText: alt.value!},
    error: "",
  };
}

// ── TARGETING ──────────────────────────────────────────────────────────────

export function validateTargeting(value: unknown): Validated<CmsTargeting> {
  if (value === undefined || value === null) return {ok: true, value: DEFAULT_TARGETING, error: ""};
  if (typeof value !== "object" || Array.isArray(value)) return fail("targeting_invalid");
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;

  if (kind === TARGET_ALL || kind === undefined) {
    return {ok: true, value: DEFAULT_TARGETING, error: ""};
  }

  const allowedValues =
    kind === TARGET_LANGUAGE ? (SUPPORTED_LANGUAGES as readonly string[])
      : kind === TARGET_REGION ? (SUPPORTED_REGIONS as readonly string[])
        : kind === TARGET_PLAN ? (SUPPORTED_PLANS as readonly string[])
          : null;
  if (!allowedValues) return fail("targeting_kind_invalid");

  const values = raw.values;
  if (!Array.isArray(values) || values.length === 0) return fail("targeting_values_required");
  const clean: string[] = [];
  for (const entry of values) {
    if (typeof entry !== "string") return fail("targeting_values_invalid");
    if (!allowedValues.includes(entry)) return fail("targeting_values_invalid");
    if (!clean.includes(entry)) clean.push(entry);
  }
  clean.sort();
  // Targeting every possible value IS "all"; one meaning, one representation.
  if (clean.length === allowedValues.length) {
    return {ok: true, value: DEFAULT_TARGETING, error: ""};
  }
  return {ok: true, value: {kind: kind as CmsTargeting["kind"], values: clean}, error: ""};
}

export interface ViewerContext {
  language?: string | null;
  region?: string | null;
  plan?: string | null;
}

/**
 * Viewer eligibility. An unknown viewer attribute never satisfies a gate, so
 * a client that omits its region cannot unlock region-targeted content.
 */
export function viewerMatchesTargeting(
  targeting: CmsTargeting | null | undefined,
  viewer: ViewerContext,
): boolean {
  if (!targeting || targeting.kind === TARGET_ALL) return true;
  const attribute =
    targeting.kind === TARGET_LANGUAGE ? viewer.language
      : targeting.kind === TARGET_REGION ? viewer.region
        : targeting.kind === TARGET_PLAN ? (viewer.plan || "free")
          : null;
  if (typeof attribute !== "string" || !attribute) return false;
  return targeting.values.includes(attribute);
}

// ── ORDERING ───────────────────────────────────────────────────────────────

/**
 * Deterministic order: lower priority first, then the earlier schedule, then
 * the id. Ties must never depend on Firestore's iteration order, or two
 * devices could see the same placement in a different sequence.
 */
export function compareCmsOrder(
  a: {priority: number; startsAtMs: number; contentId: string},
  b: {priority: number; startsAtMs: number; contentId: string},
): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.startsAtMs !== b.startsAtMs) return a.startsAtMs - b.startsAtMs;
  return a.contentId < b.contentId ? -1 : a.contentId > b.contentId ? 1 : 0;
}
