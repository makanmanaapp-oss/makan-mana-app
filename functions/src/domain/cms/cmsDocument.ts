/**
 * WAVE 5 — PURE CMS document shaping.
 *
 * Same discipline as Wave 4: the public projection is an ALLOWLIST, so a field
 * added to storage later cannot reach mobile by being forgotten. The stored
 * document keeps the admin audit block; the public one cannot express it.
 */
import {
  CMS_STATUS_DRAFT,
  DEFAULT_TARGETING,
  PLACEMENT_RESTAURANT_DETAIL,
  type CmsPlacement,
  type CmsStatus,
  type CmsTargeting,
} from "./cmsTypes";
import {effectiveCmsStatus, type CmsMedia} from "./cmsLifecycle";

export interface CmsContentInput {
  placement: CmsPlacement;
  title: string;
  subtitle: string;
  body: string;
  ctaLabel: string;
  ctaDestination: string;
  media: CmsMedia | null;
  targeting: CmsTargeting;
  priority: number;
  startsAtMs: number;
  endsAtMs: number;
  status: CmsStatus;
  /** Only meaningful for the restaurant_detail placement. */
  canonicalPlaceId: string | null;
  /** Internal audit only — NEVER in the public projection. */
  actorAdminId: string;
  requestId: string;
}

export function buildCmsDocument(input: CmsContentInput): Record<string, unknown> {
  return {
    schemaVersion: 1,
    placement: input.placement,
    title: input.title,
    subtitle: input.subtitle,
    body: input.body,
    ctaLabel: input.ctaLabel,
    ctaDestination: input.ctaDestination,
    media: input.media ? {...input.media} : null,
    targeting: {kind: input.targeting.kind, values: input.targeting.values},
    priority: input.priority,
    startsAtMs: input.startsAtMs,
    endsAtMs: input.endsAtMs,
    status: input.status,
    canonicalPlaceId: input.canonicalPlaceId,
    // Audit block — internal plane only.
    createdByAdminId: input.actorAdminId,
    updatedByAdminId: input.actorAdminId,
    createdByRequestId: input.requestId,
    updatedByRequestId: input.requestId,
    publishedAtMs: input.status === CMS_STATUS_DRAFT ? null : input.startsAtMs,
    archivedAtMs: null,
  };
}

/** Fields an admin edit may change. Identity, status and audit are excluded. */
export const CMS_EDITABLE_FIELDS = [
  "title", "subtitle", "body", "ctaLabel", "ctaDestination", "media",
  "targeting", "priority", "startsAtMs", "endsAtMs", "canonicalPlaceId",
] as const;

// ── PUBLIC PROJECTION ──────────────────────────────────────────────────────

export interface PublicCmsMedia {
  storagePath: string;
  contentType: string;
  width: number;
  height: number;
  altText: string;
}

export interface PublicCmsContent {
  contentId: string;
  placement: string;
  title: string;
  subtitle: string;
  body: string;
  ctaLabel: string;
  ctaDestination: string;
  media: PublicCmsMedia | null;
  priority: number;
  canonicalPlaceId: string | null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function publicMedia(value: unknown): PublicCmsMedia | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const storagePath = str(raw.storagePath).trim();
  if (!storagePath) return null;
  const width = num(raw.width);
  const height = num(raw.height);
  if (width === null || height === null) return null;
  // byteSize is an operational fact, not something the app needs — it is
  // deliberately absent rather than stripped.
  return {
    storagePath,
    contentType: str(raw.contentType),
    width,
    height,
    altText: str(raw.altText),
  };
}

export function targetingOf(value: unknown): CmsTargeting {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_TARGETING;
  const raw = value as Record<string, unknown>;
  const kind = str(raw.kind);
  const values = Array.isArray(raw.values)
    ? raw.values.filter((v): v is string => typeof v === "string")
    : [];
  if (kind === "all" || !kind || values.length === 0) return DEFAULT_TARGETING;
  return {kind: kind as CmsTargeting["kind"], values};
}

/**
 * Build the mobile-facing projection by ALLOWLIST. Returns null when the row
 * cannot be rendered honestly, so a caller never has to remember to check.
 */
export function toPublicCmsContent(
  contentId: string,
  data: Record<string, unknown> | null | undefined,
): PublicCmsContent | null {
  if (!data) return null;
  const id = contentId.trim();
  if (!id) return null;
  const placement = str(data.placement).trim();
  if (!placement) return null;
  const title = str(data.title).trim();
  if (!title) return null;

  const canonicalPlaceId = str(data.canonicalPlaceId).trim();
  // A restaurant-detail banner without a restaurant has no place to render.
  if (placement === PLACEMENT_RESTAURANT_DETAIL && !canonicalPlaceId) return null;

  return {
    contentId: id,
    placement,
    title,
    subtitle: str(data.subtitle),
    body: str(data.body),
    ctaLabel: str(data.ctaLabel),
    ctaDestination: str(data.ctaDestination),
    media: publicMedia(data.media),
    priority: num(data.priority) ?? 100,
    canonicalPlaceId: canonicalPlaceId || null,
  };
}

/** Admin projection: everything public PLUS truthful status. Still no admin id. */
export interface AdminCmsContent extends PublicCmsContent {
  status: CmsStatus;
  storedStatus: CmsStatus;
  targeting: CmsTargeting;
  startsAtMs: number | null;
  endsAtMs: number | null;
}

export function toAdminCmsContent(
  contentId: string,
  data: Record<string, unknown> | null | undefined,
  nowMs: number,
): AdminCmsContent | null {
  const base = toPublicCmsContent(contentId, data);
  if (!base || !data) return null;
  const stored = (str(data.status) || CMS_STATUS_DRAFT) as CmsStatus;
  const startsAtMs = num(data.startsAtMs);
  const endsAtMs = num(data.endsAtMs);
  return {
    ...base,
    storedStatus: stored,
    status: effectiveCmsStatus(stored, startsAtMs, endsAtMs, nowMs),
    targeting: targetingOf(data.targeting),
    startsAtMs,
    endsAtMs,
  };
}

// ── MIRROR ─────────────────────────────────────────────────────────────────

export const CMS_MIRROR_ENTITY_TYPE = "cms_content";

export interface CmsMirrorRecord {
  content_id: string;
  placement: string;
  title: string;
  subtitle: string | null;
  cta_label: string | null;
  cta_destination: string | null;
  media_path: string | null;
  media_content_type: string | null;
  targeting_kind: string;
  targeting_values: string[];
  priority: number;
  status: CmsStatus;
  effective_status: CmsStatus;
  canonical_place_id: string | null;
  starts_at_ms: number | null;
  ends_at_ms: number | null;
  published_at_ms: number | null;
  archived_at_ms: number | null;
  last_request_id: string | null;
}

function nullable(value: unknown): string | null {
  const t = str(value).trim();
  return t ? t : null;
}

/**
 * Mirror record. Like Wave 4, the builder never READS an admin identifier, so
 * none can leak by being forgotten. `last_request_id` correlates a console
 * command with its Firebase event without naming a person.
 */
export function toCmsMirrorRecord(
  contentId: string,
  data: Record<string, unknown> | null | undefined,
  nowMs: number,
): CmsMirrorRecord | null {
  if (!data) return null;
  const id = contentId.trim();
  const placement = str(data.placement).trim();
  const title = str(data.title).trim();
  const stored = str(data.status).trim() as CmsStatus;
  if (!id || !placement || !title || !stored) return null;

  const startsAtMs = num(data.startsAtMs);
  const endsAtMs = num(data.endsAtMs);
  const targeting = targetingOf(data.targeting);
  const media = data.media && typeof data.media === "object" && !Array.isArray(data.media)
    ? data.media as Record<string, unknown>
    : null;

  return {
    content_id: id,
    placement,
    title,
    subtitle: nullable(data.subtitle),
    cta_label: nullable(data.ctaLabel),
    cta_destination: nullable(data.ctaDestination),
    media_path: media ? nullable(media.storagePath) : null,
    media_content_type: media ? nullable(media.contentType) : null,
    targeting_kind: targeting.kind,
    targeting_values: targeting.values,
    priority: num(data.priority) ?? 100,
    status: stored,
    effective_status: effectiveCmsStatus(stored, startsAtMs, endsAtMs, nowMs),
    canonical_place_id: nullable(data.canonicalPlaceId),
    starts_at_ms: startsAtMs,
    ends_at_ms: endsAtMs,
    published_at_ms: num(data.publishedAtMs),
    archived_at_ms: num(data.archivedAtMs),
    last_request_id: nullable(data.updatedByRequestId),
  };
}

export function cmsMirrorEventId(contentId: string, updatedAtMs: unknown): string | null {
  const id = contentId.trim();
  if (!id) return null;
  const stamp = typeof updatedAtMs === "number" && Number.isFinite(updatedAtMs)
    ? Math.trunc(updatedAtMs) : null;
  if (stamp === null) return null;
  return `cms:${id}:${stamp}`;
}
