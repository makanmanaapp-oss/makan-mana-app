/**
 * WAVE 5 — PURE curated discovery collection shaping.
 *
 * A collection is an ordered, editorially chosen list of restaurants. It reuses
 * the CMS lifecycle wholesale (stored intent vs derived effective status), so
 * banners and collections cannot disagree about what "live" means.
 *
 * The ORDER is the product: an operator arranges restaurants deliberately, so
 * the stored array order is authoritative and is never re-sorted anywhere.
 */
import {
  COLLECTION_DESCRIPTION_MAX,
  COLLECTION_MAX_RESTAURANTS,
  COLLECTION_TITLE_MAX,
  CMS_STATUS_DRAFT,
  MEDIA_STORAGE_PREFIX,
  type CmsPlacement,
  type CmsStatus,
  type CmsTargeting,
} from "./cmsTypes";
import {effectiveCmsStatus, type Validated} from "./cmsLifecycle";
import {targetingOf} from "./cmsDocument";

export const COLLECTION_MIRROR_ENTITY_TYPE = "cms_collection";

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
  if (/[<>]/.test(clean)) return fail(`${field}_markup_not_allowed`);
  return {ok: true, value: clean, error: ""};
}

export function validateCollectionTitle(value: unknown) {
  return text(value, COLLECTION_TITLE_MAX, "title", true);
}

export function validateCollectionDescription(value: unknown) {
  return text(value, COLLECTION_DESCRIPTION_MAX, "description", false);
}

/**
 * The cover image is a storage PATH under the prefix this domain owns, exactly
 * like banner media — a collection must not be able to point at another
 * feature's object, and traversal is refused.
 */
export function validateCollectionImagePath(value: unknown): Validated<string> {
  if (value === undefined || value === null) return {ok: true, value: "", error: ""};
  if (typeof value !== "string") return fail("image_path_invalid");
  const clean = value.trim();
  if (!clean) return {ok: true, value: "", error: ""};
  if (!clean.startsWith(MEDIA_STORAGE_PREFIX)) return fail("image_path_not_allowed");
  if (clean.includes("..") || clean.includes("//")) return fail("image_path_not_allowed");
  return {ok: true, value: clean, error: ""};
}

export interface RestaurantListResult {
  /** Deduped, order preserved. */
  ids: string[];
  /** Ids that appeared more than once, for an honest operator message. */
  duplicates: string[];
}

/**
 * Normalise the restaurant list.
 *
 * Duplicates are DEDUPED rather than rejected — an operator dragging the same
 * restaurant twice made a slip, not an attack — but they are reported so the
 * console can say what it did. Order is preserved because the order is the
 * editorial decision.
 *
 * These are CANDIDATE ids only. Proving each one resolves to a real canonical
 * restaurant is an I/O question, answered by the receiver before it writes.
 */
export function normalizeRestaurantIds(value: unknown): Validated<RestaurantListResult> {
  if (!Array.isArray(value)) return fail("restaurants_invalid");
  if (value.length === 0) return fail("restaurants_required");
  if (value.length > COLLECTION_MAX_RESTAURANTS) return fail("restaurants_too_many");

  const ids: string[] = [];
  const duplicates: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return fail("restaurants_invalid");
    const clean = entry.trim();
    if (!clean) return fail("restaurants_invalid");
    if (clean.length > 300) return fail("restaurants_invalid");
    if (ids.includes(clean)) {
      if (!duplicates.includes(clean)) duplicates.push(clean);
      continue;
    }
    ids.push(clean);
  }
  return {ok: true, value: {ids, duplicates}, error: ""};
}

// ── DOCUMENT ───────────────────────────────────────────────────────────────

export interface CollectionInput {
  placement: CmsPlacement;
  title: string;
  description: string;
  imagePath: string;
  canonicalPlaceIds: string[];
  targeting: CmsTargeting;
  priority: number;
  startsAtMs: number;
  endsAtMs: number;
  status: CmsStatus;
  requestId: string;
}

export function buildCollectionDocument(input: CollectionInput): Record<string, unknown> {
  return {
    schemaVersion: 1,
    placement: input.placement,
    title: input.title,
    description: input.description,
    imagePath: input.imagePath,
    // Stored in the operator's order. Nothing re-sorts this.
    canonicalPlaceIds: input.canonicalPlaceIds,
    targeting: {kind: input.targeting.kind, values: input.targeting.values},
    priority: input.priority,
    startsAtMs: input.startsAtMs,
    endsAtMs: input.endsAtMs,
    status: input.status,
    createdByRequestId: input.requestId,
    updatedByRequestId: input.requestId,
    publishedAtMs: input.status === CMS_STATUS_DRAFT ? null : input.startsAtMs,
    archivedAtMs: null,
  };
}

/** Fields an admin edit may change. Status and audit are excluded. */
export const COLLECTION_EDITABLE_FIELDS = [
  "title", "description", "imagePath", "canonicalPlaceIds",
  "targeting", "priority", "startsAtMs", "endsAtMs", "placement",
] as const;

// ── PROJECTIONS ────────────────────────────────────────────────────────────

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function idsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim())
    : [];
}

export interface AdminCmsCollection {
  collectionId: string;
  placement: string;
  title: string;
  description: string;
  imagePath: string | null;
  canonicalPlaceIds: string[];
  restaurantCount: number;
  targeting: CmsTargeting;
  priority: number;
  storedStatus: CmsStatus;
  status: CmsStatus;
  startsAtMs: number | null;
  endsAtMs: number | null;
}

/**
 * Admin projection. Carries no actor identity — a collection document never
 * stores one, so this shape could not surface it even if asked.
 */
export function toAdminCollection(
  collectionId: string,
  data: Record<string, unknown> | null | undefined,
  nowMs: number,
): AdminCmsCollection | null {
  if (!data) return null;
  const id = collectionId.trim();
  const placement = str(data.placement).trim();
  const title = str(data.title).trim();
  if (!id || !placement || !title) return null;

  const stored = (str(data.status) || CMS_STATUS_DRAFT) as CmsStatus;
  const startsAtMs = num(data.startsAtMs);
  const endsAtMs = num(data.endsAtMs);
  const ids = idsOf(data.canonicalPlaceIds);

  return {
    collectionId: id,
    placement,
    title,
    description: str(data.description),
    imagePath: str(data.imagePath).trim() || null,
    canonicalPlaceIds: ids,
    restaurantCount: ids.length,
    targeting: targetingOf(data.targeting),
    priority: num(data.priority) ?? 100,
    storedStatus: stored,
    status: effectiveCmsStatus(stored, startsAtMs, endsAtMs, nowMs),
    startsAtMs,
    endsAtMs,
  };
}

// ── MIRROR ─────────────────────────────────────────────────────────────────

export interface CollectionMirrorRecord {
  collection_id: string;
  title: string;
  placement: string;
  status: CmsStatus;
  effective_status: CmsStatus;
  starts_at_ms: number | null;
  ends_at_ms: number | null;
  priority: number;
  restaurant_count: number;
  targeting_kind: string;
  last_request_id: string | null;
}

/**
 * Mirror record: what an operator searches and oversees, and nothing more.
 *
 * The restaurant LIST is deliberately not mirrored — only its count. The list
 * is runtime content whose authority is Firestore; duplicating it into an
 * operational read model would create a second copy to drift, for no oversight
 * value the count does not already give.
 */
export function toCollectionMirrorRecord(
  collectionId: string,
  data: Record<string, unknown> | null | undefined,
  nowMs: number,
): CollectionMirrorRecord | null {
  if (!data) return null;
  const id = collectionId.trim();
  const title = str(data.title).trim();
  const placement = str(data.placement).trim();
  const stored = str(data.status).trim() as CmsStatus;
  if (!id || !title || !placement || !stored) return null;

  const startsAtMs = num(data.startsAtMs);
  const endsAtMs = num(data.endsAtMs);

  return {
    collection_id: id,
    title,
    placement,
    status: stored,
    effective_status: effectiveCmsStatus(stored, startsAtMs, endsAtMs, nowMs),
    starts_at_ms: startsAtMs,
    ends_at_ms: endsAtMs,
    priority: num(data.priority) ?? 100,
    restaurant_count: idsOf(data.canonicalPlaceIds).length,
    targeting_kind: targetingOf(data.targeting).kind,
    last_request_id: str(data.updatedByRequestId).trim() || null,
  };
}

export function collectionMirrorEventId(
  collectionId: string,
  updatedAtMs: unknown,
): string | null {
  const id = collectionId.trim();
  if (!id) return null;
  const stamp = typeof updatedAtMs === "number" && Number.isFinite(updatedAtMs)
    ? Math.trunc(updatedAtMs) : null;
  if (stamp === null) return null;
  return `cms-collection:${id}:${stamp}`;
}
